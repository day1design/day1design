import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { authenticateSupport, endSupportSession, startSupportSession } from '../src/lib/crm-support.js';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_init.sql', '0045_mobile_crm.sql', '0070_crm_support_sessions.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  sqlite.exec("INSERT INTO CrmTenants(id,name) VALUES('tenant-b','B'); UPDATE CrmUsers SET id='platform-owner' WHERE email='mkt@polarad.co.kr';");
  const stmt = (sql) => ({ bind(...values) { return { first: async () => sqlite.prepare(sql).get(...values) || null, run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }) }; } });
  return { sqlite, DB: { prepare: stmt, async batch(items) { sqlite.exec('BEGIN'); try { const out = []; for (const item of items) out.push(await item.run()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } };
}

function request(path, method, body, token) {
  return new Request(`https://test.local${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('support session requires allowlisted platform actor without a reason, expires separately, and audits start/end', async () => {
  const env = setup();
  const platform = { user_id: 'platform-owner', id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform' };
  const runtime = { DB: env.DB, CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' };
  const started = await startSupportSession(request('/api/mobile/platform/tenants/tenant-b/support-sessions', 'POST', {}), runtime, platform, 'tenant-b');
  assert.equal(started.status, 200);
  const payload = await started.json();
  assert.equal(payload.support_session.mode, 'readonly');
  assert.equal(env.sqlite.prepare('SELECT reason FROM CrmSupportSessions').get().reason, '');
  const support = await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, payload.token));
  assert.equal(support.tenant_id, 'tenant-b');
  const ended = await endSupportSession(request('/api/mobile/support/end', 'POST', undefined, payload.token), runtime, support);
  assert.equal(ended.status, 200);
  assert.equal((await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, payload.token))), null);
  assert.deepEqual(env.sqlite.prepare("SELECT action,tenant_id FROM CrmAuditLogs WHERE tenant_id='tenant-b' ORDER BY id").all().map((row) => ({ action: row.action, tenant_id: row.tenant_id })), [
    { action: 'tenant.support.read_start', tenant_id: 'tenant-b' }, { action: 'tenant.support.read_end', tenant_id: 'tenant-b' },
  ]);
  env.sqlite.close();
});

test('support start denies other actor and unknown tenant, accepts no reason, and expiry is rejected', async () => {
  const env = setup();
  const path = '/api/mobile/platform/tenants/tenant-b/support-sessions';
  const base = { DB: env.DB, CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' };
  assert.equal((await startSupportSession(request(path, 'POST', { reason: 'x' }), base, { user_id: 'platform-owner', email: 'other@example.com', role: 'owner', tenant_id: 'platform' }, 'tenant-b')).status, 403);
  assert.equal((await startSupportSession(request(path, 'POST', {},), base, { user_id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform' }, 'tenant-b')).status, 200);
  assert.equal((await startSupportSession(request('/api/mobile/platform/tenants/missing/support-sessions', 'POST', { reason: 'x' }), base, { user_id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform' }, 'missing')).status, 404);
  env.sqlite.exec("INSERT INTO CrmSupportSessions(id,token_hash,tenant_id,actor_id,reason,expires_at,created_at) VALUES('expired','expiredhash','tenant-b','platform-owner','x','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z')");
  const expired = await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, 'expired-token'));
  assert.equal(expired, null);
  env.sqlite.close();
});
