const TTL_MS = 30_000;
const MAX_ENTRIES = 16;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_INFLIGHT = 8;
const PERSIST_TTL_MS = 300_000;
const MAX_PERSIST_BYTES = 512 * 1024;
const R2_INLINE_THRESHOLD = 128 * 1024;
const LEASE_MS = 15_000;

const states = new WeakMap();
const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;

function byteLength(value) {
  return encoder ? encoder.encode(value).byteLength : value.length;
}

async function digestKey(value) {
  if (!globalThis.crypto?.subtle) return value;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

async function currentRevision(db, tenantId) {
  if (!db?.prepare) return "0";
  const row = await db.prepare("SELECT version FROM CrmDataRevisions WHERE tenant_id=?").bind(tenantId).first();
  return String(row?.version ?? 0);
}

async function persistentRead(db, bucket, tenantId, startDate, endDate, revision, now) {
  if (!db?.prepare) return null;
  const rawKey = cacheKey(tenantId, startDate, endDate, revision);
  const key = await digestKey(rawKey);
  let row = null;
  try {
    row = await db.prepare("SELECT cache_key,object_key,payload_json,expires_at FROM CrmAnalyticsCache WHERE cache_key=? AND tenant_id=?").bind(key, tenantId).first();
    if (!row || Number(row.expires_at) <= now) {
      if (row?.object_key && bucket?.delete) await bucket.delete(row.object_key).catch(() => {});
      return { key, row: null };
    }
    if (row.payload_json) return { key, value: JSON.parse(row.payload_json) };
    if (bucket && row.object_key) {
      const object = await bucket.get(row.object_key);
      if (object) return { key, value: JSON.parse(await object.text()) };
    }
  } catch {
    return null;
  }
  return { key, row };
}

async function persistentWrite(db, bucket, key, leaseToken, tenantId, startDate, endDate, revision, value, now, generation, state) {
  if (!db?.prepare || state.nextGeneration !== generation) return false;
  if (await currentRevision(db, tenantId) !== revision) return false;
  const serialized = JSON.stringify(value);
  if (byteLength(serialized) > MAX_PERSIST_BYTES) return false;
  let objectKey = null;
  let inline = serialized;
  if (bucket && byteLength(serialized) > R2_INLINE_THRESHOLD) {
    objectKey = `crm-analytics/${key}-${leaseToken}.json`;
    try {
      await bucket.put(objectKey, serialized, { httpMetadata: { contentType: "application/json", cacheControl: "private, max-age=300" } });
      inline = null;
    } catch {
      objectKey = null;
    }
  }
  if (state.nextGeneration !== generation) {
    if (objectKey && bucket?.delete) await bucket.delete(objectKey).catch(() => {});
    return false;
  }
  if (await currentRevision(db, tenantId) !== revision) {
    if (objectKey && bucket?.delete) await bucket.delete(objectKey).catch(() => {});
    return false;
  }
  try {
    const previous = await db.prepare("SELECT object_key FROM CrmAnalyticsCache WHERE cache_key=? AND tenant_id=? AND lease_token=?").bind(key, tenantId, leaseToken).first();
    const result = await db.prepare("UPDATE CrmAnalyticsCache SET object_key=?,payload_json=?,expires_at=?,lease_until=0,lease_token=NULL,updated_at=? WHERE cache_key=? AND tenant_id=? AND lease_token=? AND lease_until>=? AND (SELECT version FROM CrmDataRevisions WHERE tenant_id=?)=?").bind(objectKey, inline, now + PERSIST_TTL_MS, new Date(now).toISOString(), key, tenantId, leaseToken, now, tenantId, revision).run();
    const saved = Number(result?.meta?.changes || result?.changes || 0) > 0;
    if (!saved) {
      if (objectKey && bucket?.delete) await bucket.delete(objectKey).catch(() => {});
      return false;
    }
    if (previous?.object_key && previous.object_key !== objectKey && bucket?.delete) await bucket.delete(previous.object_key).catch(() => {});

    return true;
  } catch {
    return false;
  }
}

async function persistentLease(db, bucket, key, tenantId, startDate, endDate, now) {
  try {
    const cleanupQuery = db.prepare("SELECT cache_key,object_key FROM CrmAnalyticsCache WHERE tenant_id=? AND start_date=? AND end_date=? AND cache_key<>? AND lease_until<=? LIMIT 64").bind(tenantId, startDate, endDate, key, now);
    const superseded = cleanupQuery.all ? await cleanupQuery.all() : { results: [] };
    for (const row of superseded?.results || []) {
      const removed = await db.prepare("DELETE FROM CrmAnalyticsCache WHERE cache_key=? AND tenant_id=? AND lease_until<=?").bind(row.cache_key, tenantId, now).run();
      if (Number(removed?.meta?.changes || removed?.changes || 0) && row.object_key && bucket?.delete) await bucket.delete(row.object_key).catch(() => {});
    }
    const oldest = await db.prepare("SELECT cache_key,object_key FROM CrmAnalyticsCache WHERE tenant_id=? AND expires_at<=? AND lease_until<? AND cache_key<>? ORDER BY expires_at LIMIT 1").bind(tenantId, now, now, key).first();
    if (oldest) {
      const removed = await db.prepare("DELETE FROM CrmAnalyticsCache WHERE cache_key=? AND tenant_id=? AND expires_at<=? AND lease_until<?").bind(oldest.cache_key, tenantId, now, now).run();
      if (Number(removed?.meta?.changes || removed?.changes || 0) && oldest.object_key && bucket?.delete) await bucket.delete(oldest.object_key).catch(() => {});
    }
    await db.prepare("INSERT OR IGNORE INTO CrmAnalyticsCache(cache_key,tenant_id,start_date,end_date,expires_at,lease_until,lease_token,updated_at) SELECT ?,?,?,?,0,0,NULL,? WHERE (SELECT COUNT(*) FROM (SELECT 1 FROM CrmAnalyticsCache WHERE tenant_id=? LIMIT 64))<64").bind(key, tenantId, startDate, endDate, new Date(now).toISOString(), tenantId).run();
    const token = crypto.randomUUID();
    const result = await db.prepare("UPDATE CrmAnalyticsCache SET lease_until=?,lease_token=? WHERE cache_key=? AND (lease_until IS NULL OR lease_until<?)").bind(now + LEASE_MS, token, key, now).run();
    return Number(result?.meta?.changes || result?.changes || 0) > 0 ? token : null;
  } catch {
    return false;
  }
}

function stateFor(db) {
  if (!db || (typeof db !== "object" && typeof db !== "function")) throw new TypeError("crm_cache_db_required");
  let state = states.get(db);
  if (!state) {
    state = { entries: new Map(), inflight: new Map(), nextGeneration: 0 };
    states.set(db, state);
  }
  return state;
}

function cacheKey(tenantId, startDate, endDate, revision = "0") {
  return `${String(tenantId)}\u0000${String(startDate)}\u0000${String(endDate)}\u0000${String(revision)}`;
}

function touch(state, key, entry) {
  state.entries.delete(key);
  state.entries.set(key, entry);
}

function trim(state) {
  while (state.entries.size > MAX_ENTRIES) state.entries.delete(state.entries.keys().next().value);
  let bytes = 0;
  for (const entry of state.entries.values()) bytes += entry.bytes;
  while (bytes > MAX_BYTES && state.entries.size) {
    const key = state.entries.keys().next().value;
    bytes -= state.entries.get(key).bytes;
    state.entries.delete(key);
  }
}

export async function readThroughCrmAnalytics(db, { tenantId, startDate, endDate, load, cacheBucket = null, now = Date.now() } = {}) {
  if (!tenantId) throw new Error("crm_cache_tenant_required");
  if (typeof load !== "function") throw new TypeError("crm_cache_loader_required");
  const state = stateFor(db);
  const revision = await currentRevision(db, tenantId);
  const key = cacheKey(tenantId, startDate, endDate, revision);
  const hit = state.entries.get(key);
  if (hit && now - hit.createdAt < TTL_MS) {
    touch(state, key, hit);
    return JSON.parse(hit.serialized);
  }
  if (hit) state.entries.delete(key);
  const pending = state.inflight.get(key);
  if (pending) return pending;
  if (state.inflight.size >= MAX_INFLIGHT) throw new Error("crm_cache_busy");

  const generation = state.nextGeneration;
  const task = (async () => {
    const persistent = await persistentRead(db, cacheBucket, tenantId, startDate, endDate, revision, now);
    if (persistent?.value !== undefined) {
      const serialized = JSON.stringify(persistent.value);
      const bytes = byteLength(serialized);
      if (bytes <= MAX_BYTES) { touch(state, key, { serialized, bytes, createdAt: now }); trim(state); }
      return persistent.value;
    }
    const persistentKey = persistent?.key;
    const leaseToken = persistentKey ? await persistentLease(db, cacheBucket, persistentKey, tenantId, startDate, endDate, now) : null;
    if (persistentKey && !leaseToken) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const retryRevision = await currentRevision(db, tenantId);
      const retry = await persistentRead(db, cacheBucket, tenantId, startDate, endDate, retryRevision, Date.now());
      if (retry?.value !== undefined) return retry.value;
      throw new Error("crm_cache_busy");
    }
    const value = await load();
    const serialized = JSON.stringify(value);
    const bytes = byteLength(serialized);
    const loadedRevision = await currentRevision(db, tenantId);
    if (bytes <= MAX_BYTES && state.nextGeneration === generation && loadedRevision === revision) {
      touch(state, key, { serialized, bytes, createdAt: now });
      trim(state);
    }
    if (persistentKey && leaseToken) await persistentWrite(db, cacheBucket, persistentKey, leaseToken, tenantId, startDate, endDate, revision, value, now, generation, state);
    return value;
  })().finally(() => state.inflight.delete(key));
  state.inflight.set(key, task);
  return task;
}

export function invalidateCrmReadCache(db, tenantId) {
  const state = stateFor(db);
  const tenant = String(tenantId || "");
  if (!tenant) return;
  state.nextGeneration++;
  for (const key of state.entries.keys()) if (key.startsWith(`${tenant}\u0000`)) state.entries.delete(key);
}

export const crmReadCacheLimits = Object.freeze({ ttlMs: TTL_MS, maxEntries: MAX_ENTRIES, maxBytes: MAX_BYTES, maxInflight: MAX_INFLIGHT });
