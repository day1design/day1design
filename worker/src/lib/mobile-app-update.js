import { jsonError } from "./response.js";

export const MAX_APK_BYTES = 150 * 1024 * 1024;
export const PACKAGE_NAME = "kr.polarad.crm";
export const MANIFEST_KEY = "mobile-crm/app-updates/android/kr.polarad.crm/latest.json";
const DOWNLOAD_PREFIX = "/api/mobile/app-update/";
const MANIFEST_TTL_MS = 30_000;
const manifestStates = new WeakMap();
const requestBudgets = new Map();
const encoder = new TextEncoder();

function consumeBudget(auth, download) {
  const key = `${auth.tenant_id}:${auth.id}:${download ? 'download' : 'check'}`;
  const now = Date.now();
  let budget = requestBudgets.get(key);
  if (!budget || now >= budget.expiresAt) {
    if (requestBudgets.size >= 2048) requestBudgets.delete(requestBudgets.keys().next().value);
    budget = { count: 0, expiresAt: now + (download ? 300_000 : 60_000) };
    requestBudgets.set(key, budget);
  }
  return ++budget.count <= (download ? 5 : 60);
}

function integer(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function text(value, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function digest(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function validSignature(value, expected, secret) {
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual = await sign(value, secret);
  let different = actual.length === expected.length ? 0 : 1;
  for (let index = 0; index < Math.min(actual.length, expected.length); index += 1) different |= actual.charCodeAt(index) ^ expected.toLowerCase().charCodeAt(index);
  return different === 0;
}

function error(status, message) {
  const response = jsonError(status, message);
  response.headers.set("cache-control", "no-store");
  return response;
}

function normalizedPath(path) {
  const value = String(path || "");
  return value.startsWith("/api/mobile") ? value.slice("/api/mobile".length) || "/" : value;
}

function identity(auth) {
  const session = auth?.preview_session_id || auth?.support_session_id || auth?.session_id;
  if (!auth || !text(auth.id, 160) || !text(auth.tenant_id, 160) || !text(session, 160)) return null;
  const kind = auth.preview_session_id ? 'preview' : auth.support_session_id ? 'support' : 'user';
  return `${kind}:${auth.tenant_id}:${auth.id}:${session}`;
}

export function validateMobileAppUpdateManifest(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("app_update_manifest_invalid");
  const packageName = text(row.packageName ?? row.package_name, 80);
  const versionCode = integer(row.versionCode ?? row.version_code);
  const sizeBytes = integer(row.sizeBytes ?? row.size_bytes);
  const sha256 = text(row.sha256, 80).toLowerCase();
  const versionName = text(row.versionName ?? row.version_name, 80);
  const objectKey = text(row.objectKey ?? row.object_key, 240);
  if (packageName !== PACKAGE_NAME) throw new Error("app_update_package_mismatch");
  if (versionCode === null || versionCode < 1) throw new Error("app_update_version_invalid");
  if (!versionName) throw new Error("app_update_version_name_invalid");
  if (sizeBytes === null || sizeBytes <= 0 || sizeBytes > MAX_APK_BYTES) throw new Error("app_update_size_invalid");
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("app_update_sha256_invalid");
  const expectedKey = `mobile-crm/releases/android/${PACKAGE_NAME}/v${versionCode}/${sha256}.apk`;
  if (objectKey !== expectedKey) throw new Error("app_update_object_key_invalid");
  return {
    packageName, versionCode, versionName, sizeBytes, sha256, objectKey,
    mandatory: Boolean(row.mandatory), releaseNote: text(row.releaseNote ?? row.release_note, 1000),
  };
}

async function readManifest(bucket) {
  if (!bucket || typeof bucket.get !== "function") throw new Error("app_update_manifest_unavailable");
  let state = manifestStates.get(bucket);
  const now = Date.now();
  if (state?.value && state.expiresAt > now) return state.value;
  if (state?.inflight) return state.inflight;
  const inflight = (async () => {
    const object = await bucket.get(MANIFEST_KEY);
    if (!object) throw new Error("app_update_manifest_unavailable");
    if (!Number.isSafeInteger(object.size) || object.size <= 0 || object.size > 32 * 1024) throw new Error("app_update_manifest_too_large");
    const raw = await object.text();
    if (typeof raw !== "string" || encoder.encode(raw).byteLength > object.size || encoder.encode(raw).byteLength > 32 * 1024) throw new Error("app_update_manifest_too_large");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("app_update_manifest_invalid"); }
    const value = validateMobileAppUpdateManifest(parsed);
    manifestStates.set(bucket, { value, expiresAt: Date.now() + MANIFEST_TTL_MS });
    return value;
  })();
  manifestStates.set(bucket, { inflight });
  try { return await inflight; } catch (cause) { manifestStates.delete(bucket); throw cause; }
}

async function signedPath(manifest, auth, secret, now = Math.floor(Date.now() / 1000)) {
  const id = await digest(identity(auth));
  const path = `/api/mobile/app-update/artifacts/v${manifest.versionCode}-${manifest.sha256}.apk`;
  const payload = `GET|${path}|${now}|${id}`;
  return `${path}?expires=${now}&sid=${id}&sig=${await sign(payload, secret)}`;
}

function responseBody(response) {
  return response?.body ?? response;
}

async function serveApk(request, env, auth, path) {
  const secret = text(env?.CRM_SESSION_SECRET || env?.CRM_OTP_SECRET, 400);
  if (!secret) return error(503, "app_update_signing_unavailable");
  const match = normalizedPath(path).match(/^\/app-update\/artifacts\/v([1-9][0-9]*)-([a-f0-9]{64})\.apk$/);
  if (!match) return error(404, "app_update_not_found");
  const url = new URL(request.url);
  const expires = integer(url.searchParams.get("expires"));
  const sid = text(url.searchParams.get("sid"), 80);
  const signature = text(url.searchParams.get("sig"), 80).toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  if (expires === null || expires < now || expires > now + 300) return error(401, "app_update_url_expired");
  const expectedSid = await digest(identity(auth));
  if (sid !== expectedSid) return error(403, "app_update_session_mismatch");
  const canonicalPath = `/api/mobile/app-update/artifacts/v${match[1]}-${match[2]}.apk`;
  if (!(await validSignature(`GET|${canonicalPath}|${expires}|${sid}`, signature, secret))) return error(403, "app_update_signature_invalid");
  const manifest = await readManifest(env.CRM_CACHE).catch(() => null);
  if (!manifest || String(manifest.versionCode) !== match[1] || manifest.sha256 !== match[2]) return error(404, "app_update_not_found");
  const object = await env.CRM_CACHE.get(manifest.objectKey);
  if (!object) return error(404, "app_update_file_unavailable");
  if (!Number.isFinite(object.size) || object.size !== manifest.sizeBytes || object.size <= 0 || object.size > MAX_APK_BYTES) return error(503, "app_update_file_invalid");
  const response = new Response(responseBody(object), { status: 200, headers: {
    "content-type": "application/vnd.android.package-archive", "content-length": String(object.size),
    "cache-control": "private, no-store", "content-disposition": `attachment; filename="crm-${manifest.versionCode}.apk"`,
  }});
  return response;
}

export async function buildMobileAppUpdateResponse(row, { currentVersionCode = 0, packageName = PACKAGE_NAME, auth, signingSecret, now = Math.floor(Date.now() / 1000) } = {}) {
  if (String(packageName) !== PACKAGE_NAME) throw new Error("app_update_package_not_allowed");
  const current = integer(currentVersionCode);
  if (current === null || current < 0) throw new Error("app_update_current_version_invalid");
  const manifest = validateMobileAppUpdateManifest(row);
  if (manifest.versionCode <= current) return { available: false, latest: true };
  const secret = text(signingSecret, 400);
  const who = identity(auth);
  if (!secret || !who) throw new Error("app_update_auth_required");
  const expires = now + 300;
  return { available: true, packageName: PACKAGE_NAME, versionCode: manifest.versionCode, versionName: manifest.versionName, sizeBytes: manifest.sizeBytes, sha256: manifest.sha256, downloadPath: await signedPath(manifest, auth, secret, expires), mandatory: manifest.mandatory, releaseNote: manifest.releaseNote, expiresAt: new Date(expires * 1000).toISOString() };
}

export async function handleMobileAppUpdate(request, env, auth, path) {
  const route = normalizedPath(path || new URL(request.url).pathname);
  if (route !== "/app-update/latest" && !route.startsWith("/app-update/artifacts/")) return null;
  if (!identity(auth)) return error(401, "authentication required");
  if (request.method !== "GET") return error(405, "method not allowed");
  if (!consumeBudget(auth, route.startsWith('/app-update/artifacts/'))) return error(429, "app_update_request_limit");
  if (route === "/app-update/latest") {
    const url = new URL(request.url);
    if (url.searchParams.get("platform") !== "android" || url.searchParams.get("package") !== PACKAGE_NAME) return error(400, "app_update_platform_invalid");
    const current = integer(url.searchParams.get("version_code"));
    if (current === null || current < 0) return error(400, "app_update_version_invalid");
    const secret = text(env?.CRM_SESSION_SECRET || env?.CRM_OTP_SECRET, 400);
    if (!secret) return error(503, "app_update_signing_unavailable");
    let manifest;
    try { manifest = await readManifest(env.CRM_CACHE); } catch (cause) { return error(503, cause.message === "app_update_manifest_too_large" ? cause.message : "app_update_manifest_unavailable"); }
    try { return new Response(JSON.stringify({ ok: true, ...(await buildMobileAppUpdateResponse(manifest, { currentVersionCode: current, auth, signingSecret: secret })) }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } }); }
    catch (cause) { return error(503, cause.message); }
  }
  if (route.startsWith("/app-update/artifacts/")) return serveApk(request, env, auth, route);
  return error(404, "app_update_not_found");
}

export const MOBILE_APP_UPDATE_CONTRACT = Object.freeze({ packageName: PACKAGE_NAME, maxApkBytes: MAX_APK_BYTES, manifestKey: MANIFEST_KEY, downloadPathPrefix: DOWNLOAD_PREFIX, latestEndpoint: "/api/mobile/app-update/latest", signedUrlTtlSeconds: 300 });
