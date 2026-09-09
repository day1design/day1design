const TTL_MS = 30_000;
const MAX_ENTRIES = 16;
const MAX_BYTES = 1 * 1024 * 1024;
const MAX_INFLIGHT = 8;

const states = new WeakMap();
const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;

function bytes(value) {
  return encoder ? encoder.encode(value).byteLength : value.length;
}

function requireScope(scope) {
  if (!scope || (typeof scope !== "object" && typeof scope !== "function")) {
    throw new TypeError("crm_home_cache_scope_required");
  }
  let state = states.get(scope);
  if (!state) {
    state = { entries: new Map(), inflight: new Map(), generation: 0 };
    states.set(scope, state);
  }
  return state;
}

function required(value, code) {
  if (value === undefined || value === null || value === "") throw new Error(code);
  return String(value);
}

function keyFor({ tenantId, role, userId, revision }) {
  return [
    required(tenantId, "crm_home_cache_tenant_required"),
    required(role, "crm_home_cache_role_required"),
    required(userId, "crm_home_cache_user_required"),
    required(revision, "crm_home_cache_revision_required"),
  ].join("\u0000");
}

function touch(state, key, entry) {
  state.entries.delete(key);
  state.entries.set(key, entry);
}

function trim(state) {
  while (state.entries.size > MAX_ENTRIES) state.entries.delete(state.entries.keys().next().value);
  let total = 0;
  for (const entry of state.entries.values()) total += entry.bytes;
  while (total > MAX_BYTES && state.entries.size) {
    const key = state.entries.keys().next().value;
    total -= state.entries.get(key).bytes;
    state.entries.delete(key);
  }
}

export async function readThroughCrmHome(scope, { tenantId, role, userId, revision, load, now = Date.now() } = {}) {
  if (typeof load !== "function") throw new TypeError("crm_home_cache_loader_required");
  const state = requireScope(scope);
  const key = keyFor({ tenantId, role, userId, revision });
  const hit = state.entries.get(key);
  if (hit && now - hit.createdAt < TTL_MS) {
    touch(state, key, hit);
    return JSON.parse(hit.serialized);
  }
  if (hit) state.entries.delete(key);
  const pending = state.inflight.get(key);
  if (pending) return pending;
  if (state.inflight.size >= MAX_INFLIGHT) throw new Error("crm_home_cache_busy");

  const generation = state.generation;
  const task = (async () => {
    const value = await load();
    const serialized = JSON.stringify(value);
    const size = bytes(serialized);
    if (size <= MAX_BYTES && state.generation === generation) {
      touch(state, key, { serialized, bytes: size, createdAt: now });
      trim(state);
    }
    return value;
  })().finally(() => state.inflight.delete(key));
  state.inflight.set(key, task);
  return task;
}

export function invalidateCrmHomeCache(scope, tenantId = null) {
  const state = requireScope(scope);
  state.generation += 1;
  if (tenantId === null || tenantId === undefined || tenantId === "") {
    state.entries.clear();
    return;
  }
  const prefix = `${String(tenantId)}\u0000`;
  for (const key of state.entries.keys()) if (key.startsWith(prefix)) state.entries.delete(key);
}

export const crmHomeCacheLimits = Object.freeze({
  ttlMs: TTL_MS,
  maxEntries: MAX_ENTRIES,
  maxBytes: MAX_BYTES,
  maxInflight: MAX_INFLIGHT,
});
