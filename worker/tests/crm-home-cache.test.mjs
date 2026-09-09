import test from "node:test";
import assert from "node:assert/strict";
import { crmHomeCacheLimits, invalidateCrmHomeCache, readThroughCrmHome } from "../src/lib/crm-home-cache.js";

test("deduplicates HOME reads and isolates tenant, role, user, and revision", async () => {
  const scope = {};
  let calls = 0;
  const load = async () => ({ calls: ++calls });
  const options = { tenantId: "t1", role: "owner", userId: "u1", revision: "7", load };
  const [first, second] = await Promise.all([readThroughCrmHome(scope, options), readThroughCrmHome(scope, options)]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  await readThroughCrmHome(scope, { ...options, role: "staff" });
  await readThroughCrmHome(scope, { ...options, userId: "u2" });
  await readThroughCrmHome(scope, { ...options, revision: "8" });
  assert.equal(calls, 4);
});

test("expires at 30 seconds, bounds entries and prevents stale publication after invalidation", async () => {
  const scope = {};
  let now = 1000;
  let calls = 0;
  const options = { tenantId: "t1", role: "owner", userId: "u1", revision: "1" };
  await readThroughCrmHome(scope, { ...options, now, load: async () => ({ calls: ++calls }) });
  await readThroughCrmHome(scope, { ...options, now: now + 29_999, load: async () => ({ calls: ++calls }) });
  await readThroughCrmHome(scope, { ...options, now: now + 30_000, load: async () => ({ calls: ++calls }) });
  assert.equal(calls, 2);
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const pending = readThroughCrmHome(scope, { ...options, revision: "2", load: async () => { await blocked; return { stale: true }; } });
  invalidateCrmHomeCache(scope, "t1");
  release();
  await pending;
  const fresh = await readThroughCrmHome(scope, { ...options, revision: "2", load: async () => ({ stale: false }) });
  assert.deepEqual(fresh, { stale: false });
  assert.deepEqual(crmHomeCacheLimits, { ttlMs: 30_000, maxEntries: 16, maxBytes: 1_048_576, maxInflight: 8 });
});

test("does not retain oversized HOME payloads", async () => {
  const scope = {};
  let calls = 0;
  const options = { tenantId: "t1", role: "owner", userId: "u1", revision: "1" };
  const load = async () => ({ value: "x".repeat(crmHomeCacheLimits.maxBytes) , calls: ++calls });
  await readThroughCrmHome(scope, { ...options, load });
  await readThroughCrmHome(scope, { ...options, load });
  assert.equal(calls, 2);
});
