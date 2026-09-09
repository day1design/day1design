import test from "node:test";
import assert from "node:assert/strict";
import { invalidateCrmReadCache, readThroughCrmAnalytics } from "../src/lib/crm-read-cache.js";

test("deduplicates same tenant and date window, while isolating tenants and DB bindings", async () => {
  const db = {};
  const otherDb = {};
  let calls = 0;
  const load = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 2)); return { calls }; };
  const [a, b] = await Promise.all([
    readThroughCrmAnalytics(db, { tenantId: "a", startDate: "2026-01-01", endDate: "2026-01-01", load }),
    readThroughCrmAnalytics(db, { tenantId: "a", startDate: "2026-01-01", endDate: "2026-01-01", load }),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  await readThroughCrmAnalytics(db, { tenantId: "b", startDate: "2026-01-01", endDate: "2026-01-01", load });
  await readThroughCrmAnalytics(otherDb, { tenantId: "a", startDate: "2026-01-01", endDate: "2026-01-01", load });
  assert.equal(calls, 3);
});

test("expires entries after 30 seconds and never caches failures", async () => {
  const db = {};
  let now = 1000;
  let calls = 0;
  const load = async () => { calls += 1; return { calls }; };
  await readThroughCrmAnalytics(db, { tenantId: "a", startDate: "2026-01-01", endDate: "2026-01-01", load, now });
  now += 30_000;
  await readThroughCrmAnalytics(db, { tenantId: "a", startDate: "2026-01-01", endDate: "2026-01-01", load, now });
  assert.equal(calls, 2);
  await assert.rejects(() => readThroughCrmAnalytics(db, { tenantId: "f", startDate: "2026-01-01", endDate: "2026-01-01", load: async () => { throw new Error("db down"); } }));
  await assert.rejects(() => readThroughCrmAnalytics(db, { tenantId: "f", startDate: "2026-01-01", endDate: "2026-01-01", load: async () => { throw new Error("db down"); } }));
});

test("bounds entries and invalidation prevents a stale flight from repopulating cache", async () => {
  const db = {};
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const first = readThroughCrmAnalytics(db, { tenantId: "a", startDate: "2026-02-01", endDate: "2026-02-01", load: async () => { started(); await blocked; return { version: 1 }; } });
  await startedPromise;
  invalidateCrmReadCache(db, "a");
  release();
  await first;
  let calls = 0;
  const load = async () => { calls += 1; return { version: 2 }; };
  await readThroughCrmAnalytics(db, { tenantId: "a", startDate: "2026-02-01", endDate: "2026-02-01", load });
  assert.equal(calls, 1);
  for (let i = 0; i < 20; i++) await readThroughCrmAnalytics(db, { tenantId: "t", startDate: `2026-03-${String(i + 1).padStart(2, "0")}`, endDate: `2026-03-${String(i + 1).padStart(2, "0")}`, load: async () => ({ i }) });
  assert.equal(calls, 1);
});

test("uses optional private R2 snapshot with D1 metadata and falls back without the binding", async () => {
  let row = null;
  const db = {
    prepare(sql) {
      return { bind(...args) {
        return {
          first: async () => sql.startsWith("SELECT") ? row : null,
          run: async () => {
            if (sql.startsWith("DELETE")) return { meta: { changes: 0 } };
            if (sql.includes("lease_until=?")) return { meta: { changes: 1 } };
            if (sql.startsWith("UPDATE")) {
              row = { cache_key: args[4], object_key: args[0], payload_json: args[1], expires_at: args[2] };
              return { meta: { changes: 1 } };
            }
            row = { cache_key: args[0], object_key: args[4], payload_json: args[5], expires_at: args[6] };
            return { meta: { changes: 1 } };
          },
        };
      } };
    },
  };
  let puts = 0;
  const bucket = { async put() { puts += 1; }, async get() { return { text: async () => JSON.stringify({ persisted: true }) }; } };
  const options = { tenantId: "a", startDate: "2026-04-01", endDate: "2026-04-01", cacheBucket: bucket };
  await readThroughCrmAnalytics(db, { ...options, load: async () => ({ persisted: true, text: "x".repeat(140_000) }) });
  assert.equal(puts, 1);
  const hit = await readThroughCrmAnalytics({ prepare: db.prepare.bind(db) }, { ...options, load: async () => ({ persisted: false }) });
  assert.deepEqual(hit, { persisted: true });
});
