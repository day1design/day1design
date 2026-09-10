import { jsonError, jsonOk } from "./response.js";
import { verifyAdmin } from "./auth.js";

const SETTINGS_ID = "day1design";
const DEFAULT_TYPES = [
  { id: "initial", name: "이니셜미팅", durationMinutes: 120, bufferMinutes: 60, colorKey: "blue", active: 1 },
  { id: "design", name: "디자인미팅", durationMinutes: 180, bufferMinutes: 60, colorKey: "green", active: 1 },
];
const DEFAULT_NOTIFICATIONS = { created: { enabled: true, template: "" }, day: { enabled: true, template: "" }, hour: { enabled: true, template: "" } };

function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function cleanTypes(value) {
  if (!Array.isArray(value) || value.length > 50) return null;
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const id = String(item?.id || "").trim().slice(0, 60);
    const name = String(item?.name || "").trim().slice(0, 80);
    const durationMinutes = Number(item?.durationMinutes);
    const bufferMinutes = Number(item?.bufferMinutes ?? 60);
    const colorKey = String(item?.colorKey || "blue").trim().slice(0, 40) || "blue";
    if (!id || !name || seen.has(id) || ![60, 120, 180, 240].includes(durationMinutes) || bufferMinutes !== 60 || !["blue", "green", "purple", "orange", "red", "teal"].includes(colorKey)) return null;
    seen.add(id);
    out.push({ id, name, durationMinutes, bufferMinutes, colorKey, active: item?.active === false || item?.active === 0 ? 0 : 1 });
  }
  return out;
}
function cleanNotifications(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalize = (item) => { const value = item && typeof item === "object" ? item : {}; return { enabled: value.enabled !== false, template: String(value.template || "").slice(0, 2000) }; };
  return { created: normalize(source.created), day: normalize(source.day), hour: normalize(source.hour) };
}
export function defaultMeetingSettings() { return { types: DEFAULT_TYPES, notifications: DEFAULT_NOTIFICATIONS }; }
export function validateMeetingBuffer(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && (minutes === 0 || minutes === 60) ? minutes : null;
}
export function normalizeMeetingSettings(row) {
  return { types: cleanTypes(parseJson(row?.types_json, DEFAULT_TYPES)) || DEFAULT_TYPES, notifications: cleanNotifications(parseJson(row?.notifications_json, DEFAULT_NOTIFICATIONS)), version: Number(row?.version || 1), updatedAt: row?.updated_at || "" };
}
export async function getMeetingSettings(env) {
  const row = await env.DB.prepare("SELECT types_json, notifications_json, version, updated_at FROM AdminMeetingSettings WHERE id=?").bind(SETTINGS_ID).first();
  return row ? normalizeMeetingSettings(row) : defaultMeetingSettings();
}
export async function handleMeetingSettings(request, env) {
  if (!env.DB) return jsonError(503, "Database unavailable");
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");
  if (request.method === "GET") return jsonOk(await getMeetingSettings(env));
  if (request.method !== "PUT") return jsonError(405, "Method Not Allowed");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 128 * 1024) return jsonError(413, "Request too large");
  let raw; try { raw = await request.text(); } catch { return jsonError(400, "Invalid JSON"); }
  if (raw.length > 128 * 1024) return jsonError(413, "Request too large");
  let body; try { body = JSON.parse(raw); } catch { return jsonError(400, "Invalid JSON"); }
  if (!body || typeof body !== "object" || Object.keys(body).length > 2) return jsonError(400, "Invalid settings");
  const types = cleanTypes(body?.types);
  if (!types) return jsonError(400, "Invalid meeting types");
  const notifications = cleanNotifications(body?.notifications);
  const expectedVersion = Number(body.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return jsonError(400, "expectedVersion is required");
  const now = new Date().toISOString();
  const changed = await env.DB.prepare("UPDATE AdminMeetingSettings SET types_json=?,notifications_json=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(JSON.stringify(types), JSON.stringify(notifications), now, SETTINGS_ID, expectedVersion).run();
  if (!changed?.meta?.changes) return jsonError(409, "Settings changed; reload latest settings");
  return jsonOk({ types, notifications, version: expectedVersion + 1, updatedAt: now });
}
function idValue() { return `${Date.now().toString(36)}-${crypto.randomUUID()}`; }
export function regionFromAddress(address) { const parts = String(address || "").trim().split(/\s+/).filter(Boolean); if (parts.length < 2) return parts.join(" "); return parts[0] + " " + parts[1] + (parts[1].endsWith("시") && parts[2]?.endsWith("구") ? " " + parts[2] : ""); }
function formatKst(value) { try { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium" }).format(new Date(value)) + " KST"; } catch { return String(value || ""); } }
function toContractJson(row) { return { id: row.id, estimateId: row.estimate_id, amount: Number(row.amount || 0), previousAmount: Number(row.previous_amount || 0), reason: row.reason || "", stage: row.stage || "", contractDate: row.contract_date || "", address: row.address || "", addressDetail: row.address_detail || "", region: row.region || "", savedAt: row.saved_at || "", savedAtKst: formatKst(row.saved_at), savedBy: row.saved_by || "" }; }
export async function listContracts(env, estimateId, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 20);
  const rawCursor = String(url.searchParams.get("cursor") || "");
  const [cursorAt, cursorId] = rawCursor ? rawCursor.split("|", 2) : [];
  if (rawCursor && (!cursorAt || !cursorId)) return jsonError(400, "Invalid cursor");
  const sql = `SELECT h.id,h.estimate_id,h.amount,h.previous_amount,h.reason,h.stage,h.contract_date,h.address,h.address_detail,h.region,h.saved_at,h.saved_by FROM EstimateContractHistory h JOIN Estimates e ON e.id=h.estimate_id WHERE h.estimate_id=? AND e.CrmTenantId='day1design' ${rawCursor ? "AND (h.saved_at<? OR (h.saved_at=? AND h.id<?))" : ""} ORDER BY h.saved_at DESC,h.id DESC LIMIT ?`;
  const params = rawCursor ? [estimateId, cursorAt, cursorAt, cursorId, limit + 1] : [estimateId, limit + 1];
  const rows = (await env.DB.prepare(sql).bind(...params).all()).results || [];
  const page = rows.slice(0, limit);
  return jsonOk({ records: page.map(toContractJson), nextCursor: page.length && rows.length > limit ? `${page[page.length - 1].saved_at}|${page[page.length - 1].id}` : "", hasMore: rows.length > limit });
}
export async function createContract(env, estimateId, body, actor = "") {
  const amount = Number(body?.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { response: jsonError(400, "Invalid amount") };
  const requestKey = String(body?.idempotencyKey || "").trim().slice(0, 120);
  if (!requestKey) return { response: jsonError(400, "Idempotency-Key is required") };
  const existingRequest = await env.DB.prepare("SELECT id,estimate_id,amount,previous_amount,reason,stage,contract_date,address,address_detail,region,saved_at,saved_by FROM EstimateContractHistory WHERE estimate_id=? AND idempotency_key=?").bind(estimateId, requestKey).first();
  if (existingRequest) return { contract: toContractJson(existingRequest), idempotent: true };
  const estimate = await env.DB.prepare("SELECT ContractAmount,Address,AddressDetail,ContractVersion FROM Estimates WHERE id=? AND CrmTenantId='day1design'").bind(estimateId).first();
  if (!estimate) return { response: jsonError(404, "Estimate not found") };
  const latest = await env.DB.prepare("SELECT address,address_detail,region FROM EstimateContractHistory WHERE estimate_id=? ORDER BY saved_at DESC,id DESC LIMIT 1").bind(estimateId).first();
  const address = String(body.address ?? latest?.address ?? estimate.Address ?? "").trim().slice(0, 500);
  const addressDetail = String(body.addressDetail ?? latest?.address_detail ?? estimate.AddressDetail ?? "").trim().slice(0, 300);
  const region = String(body.region ?? (latest?.region || regionFromAddress(address))).trim().slice(0, 120);
  const previous = Number(estimate.ContractAmount || 0);
  const expectedVersion = Number.isInteger(Number(body.expectedVersion)) ? Number(body.expectedVersion) : Number(estimate.ContractVersion || 0);
  const id = idValue(); const savedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE Estimates SET ContractAmount=?,ContractAt=?,ContractVersion=ContractVersion+1,ContractLastRequestKey=? WHERE id=? AND CrmTenantId='day1design' AND ContractVersion=?").bind(amount, savedAt, requestKey, estimateId, expectedVersion),
    env.DB.prepare("INSERT INTO EstimateContractHistory(id,estimate_id,amount,previous_amount,reason,stage,contract_date,address,address_detail,region,saved_at,saved_by,idempotency_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM Estimates WHERE id=? AND CrmTenantId='day1design' AND ContractVersion=? AND ContractLastRequestKey=?)").bind(id, estimateId, amount, previous, String(body.reason || "").trim().slice(0, 500), String(body.stage || "").trim().slice(0, 80), String(body.contractDate || "").trim().slice(0, 20), address, addressDetail, region, savedAt, actor, requestKey, estimateId, expectedVersion + 1, requestKey),
  ]);
  const saved = await env.DB.prepare("SELECT id,estimate_id,amount,previous_amount,reason,stage,contract_date,address,address_detail,region,saved_at,saved_by FROM EstimateContractHistory WHERE estimate_id=? AND idempotency_key=?").bind(estimateId, requestKey).first();
  if (!saved) return { response: jsonError(409, "Contract changed; reload latest contract history") };
  return { contract: toContractJson(saved) };
}
