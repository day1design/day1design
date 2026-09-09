import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openLocalD1 } from '../../mobile-crm/server/d1-local.mjs';
import { readThroughCrmAnalytics, invalidateCrmReadCache } from '../src/lib/crm-read-cache.js';

function fixture() {
  const db = openLocalD1(':memory:');
  db.sqlite.exec("CREATE TABLE CrmTenants(id TEXT PRIMARY KEY); INSERT INTO CrmTenants VALUES('test'); CREATE TABLE CrmDataRevisions(tenant_id TEXT PRIMARY KEY, version INTEGER NOT NULL, updated_at TEXT NOT NULL); INSERT INTO CrmDataRevisions VALUES('test',0,'');");
  db.sqlite.exec(readFileSync(new URL('../migrations/0061_crm_analytics_cache.sql', import.meta.url), 'utf8'));
  db.sqlite.exec(readFileSync(new URL('../migrations/0063_crm_analytics_cache_revision_window.sql', import.meta.url), 'utf8'));
  return db;
}
const query = { tenantId: 'test', startDate: '2026-09-01', endDate: '2026-09-09' };

test('SQLite lease excludes a competing isolate and persisted snapshot avoids aggregate reload', async () => {
  const db = fixture();
  try {
    let release, started;
    const wait = new Promise(resolve => { release = resolve; });
    const ready = new Promise(resolve => { started = resolve; });
    let calls = 0;
    const first = readThroughCrmAnalytics(db, { ...query, load: async () => { calls++; started(); await wait; return { count: 4 }; } });
    await ready;
    await assert.rejects(readThroughCrmAnalytics({ ...db }, { ...query, load: async () => { calls++; return {}; } }), /crm_cache_busy/);
    release();
    await first;
    const second = { ...db };
    const cached = await readThroughCrmAnalytics(second, { ...query, load: async () => { calls++; return {}; } });
    assert.deepEqual(cached, { count: 4 });
    const aggregateReads = db.metrics.analyticsReads;
    await readThroughCrmAnalytics(second, { ...query, load: async () => { throw new Error('unexpected'); } });
    assert.equal(db.metrics.analyticsReads, aggregateReads);
    assert.equal(calls, 1);
  } finally { db.sqlite.close(); }
});

test('SQLite metadata points to private R2 and invalidation during upload prevents publication', async () => {
  const db = fixture();
  try {
    const objects = new Map();
    const bucket = { async put(key, value) { objects.set(key, value); }, async get(key) { return objects.has(key) ? { text: async () => objects.get(key) } : null; }, async delete(key) { objects.delete(key); } };
    const value = { data: 'x'.repeat(140000) };
    await readThroughCrmAnalytics(db, { ...query, cacheBucket: bucket, load: async () => value });
    assert.equal(objects.size, 1);
    const row = db.sqlite.prepare('SELECT object_key,payload_json FROM CrmAnalyticsCache').get();
    assert.ok(row.object_key.startsWith('crm-analytics/'));
    assert.equal(row.payload_json, null);
    assert.deepEqual(await readThroughCrmAnalytics({ ...db }, { ...query, cacheBucket: bucket, load: async () => { throw new Error('unexpected'); } }), value);
    const alternate = { ...query, endDate: '2026-09-10' };
    const invalidating = { ...bucket, async put(key, body) { await bucket.put(key, body); invalidateCrmReadCache(db, 'test'); } };
    await readThroughCrmAnalytics(db, { ...alternate, cacheBucket: invalidating, load: async () => value });
    const unpublished = db.sqlite.prepare("SELECT expires_at FROM CrmAnalyticsCache WHERE end_date='2026-09-10'").get();
    assert.equal(unpublished.expires_at, 0);
  } finally { db.sqlite.close(); }
});

test('persistent cache capacity rejects extra windows before calculation and reclaims expired keys', async () => {
  const db = fixture();
  try {
    const now = Date.now();
    let calls = 0;
    for (let i = 0; i < 64; i++) {
      const day = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
      await readThroughCrmAnalytics(db, { ...query, startDate: day, now, load: async () => { calls++; return { i }; } });
    }
    await assert.rejects(readThroughCrmAnalytics(db, { ...query, startDate: '2025-01-01', now, load: async () => { calls++; return {}; } }), /crm_cache_busy/);
    assert.equal(calls, 64);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM CrmAnalyticsCache').get().n, 64);
    await readThroughCrmAnalytics(db, { ...query, startDate: '2025-01-01', now: now + 300001, load: async () => ({ reclaimed: true }) });
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM CrmAnalyticsCache').get().n, 64);
    const plan = db.sqlite.prepare('EXPLAIN QUERY PLAN SELECT cache_key,object_key FROM CrmAnalyticsCache WHERE tenant_id=? AND expires_at<=? AND lease_until<? AND cache_key<>? ORDER BY expires_at LIMIT 1').all('test', now, now, 'test');
    assert.ok(plan.some(row => row.detail.includes('idx_crm_analytics_cache_tenant_expiry')));
  } finally { db.sqlite.close(); }
});

test('revision-keyed snapshots miss after a tenant mutation across isolates', async () => {
  const db = fixture();
  try {
    let calls = 0;
    const first = await readThroughCrmAnalytics(db, { ...query, load: async () => { calls++; return { version: 1 }; } });
    assert.deepEqual(first, { version: 1 });
    db.sqlite.prepare("UPDATE CrmDataRevisions SET version=version+1 WHERE tenant_id='test'").run();
    const second = await readThroughCrmAnalytics({ ...db }, { ...query, load: async () => { calls++; return { version: 2 }; } });
    assert.deepEqual(second, { version: 2 });
    assert.equal(calls, 2);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM CrmAnalyticsCache').get().n, 1);
  } finally { db.sqlite.close(); }
});

test('a load that crosses a revision change cannot publish its stale persistent snapshot', async () => {
  const db = fixture();
  try {
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { db.sqlite.prepare("UPDATE CrmDataRevisions SET version=version+1 WHERE tenant_id='test'").run(); resolve(); });
    let calls = 0;
    const stale = readThroughCrmAnalytics(db, { ...query, load: async () => { calls++; await started; await blocked; return { version: 1 }; } });
    await new Promise(resolve => setTimeout(resolve, 0));
    db.sqlite.prepare("UPDATE CrmDataRevisions SET version=version+1 WHERE tenant_id='test'").run();
    release();
    await stale;
    const fresh = await readThroughCrmAnalytics({ ...db }, { ...query, load: async () => { calls++; return { version: 3 }; } });
    assert.deepEqual(fresh, { version: 3 });
    assert.equal(calls, 2);
  } finally { db.sqlite.close(); }
});

test('successive revisions of one window reclaim superseded rows before the 64-row cap', async () => {
  const db = fixture();
  try {
    let calls = 0;
    for (let version = 1; version <= 70; version += 1) {
      db.sqlite.prepare("UPDATE CrmDataRevisions SET version=? WHERE tenant_id='test'").run(version);
      const value = await readThroughCrmAnalytics({ ...db }, { ...query, load: async () => { calls += 1; return { version }; } });
      assert.deepEqual(value, { version });
    }
    assert.equal(calls, 70);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM CrmAnalyticsCache WHERE tenant_id=? AND start_date=? AND end_date=?').get('test', query.startDate, query.endDate).n, 1);
    const plan = db.sqlite.prepare('EXPLAIN QUERY PLAN SELECT cache_key,object_key FROM CrmAnalyticsCache WHERE tenant_id=? AND start_date=? AND end_date=? AND cache_key<>? AND lease_until<=? LIMIT 64').all('test', query.startDate, query.endDate, 'other', Date.now());
    assert.ok(plan.some(row => row.detail.includes('idx_crm_analytics_cache_tenant_window_lease')));
  } finally { db.sqlite.close(); }
});
