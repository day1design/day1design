import { verifyAdmin } from "../lib/auth.js";
import { jsonError, jsonOk } from "../lib/response.js";

export const MAX_BODY_BYTES = 300 * 1024;
export const MAX_MARKDOWN_BYTES = 256 * 1024;
export const ACTOR_COOLDOWN_MS = 60_000;
export const GLOBAL_COOLDOWN_MS = 10_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLE = "WorkflowDeliveries";

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function actorId() {
  return "admin";
}

function dbError(message) {
  return jsonError(503, message);
}

async function readBoundedText(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    const error = new Error("payload too large");
    error.status = 413;
    throw error;
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        const error = new Error("payload too large");
        error.status = 413;
        throw error;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readRequest(request) {
  let raw;
  try {
    raw = await readBoundedText(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error?.status === 413) return { error: jsonError(413, "Payload Too Large") };
    return { error: jsonError(400, "Invalid request body") };
  }
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return { error: jsonError(400, "Invalid JSON") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: jsonError(400, "Request body must be an object") };
  const allowed = new Set(["markdown", "revision", "requestId"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return { error: jsonError(400, "Unknown workflow field") };
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  const revision = typeof body.revision === "string" ? body.revision.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!markdown || byteLength(markdown) > MAX_MARKDOWN_BYTES) {
    return { error: jsonError(400, "Markdown is required and must be 256KB or smaller") };
  }
  if (!/^r?[0-9]{1,10}$/.test(revision)) {
    return { error: jsonError(400, "Invalid revision") };
  }
  if (!UUID_RE.test(requestId)) return { error: jsonError(400, "Invalid requestId") };
  return { value: { markdown, revision, requestId, markdownHash: await sha256(markdown) } };
}

async function findDelivery(db, requestId) {
  return db.prepare(
    `SELECT request_id, revision, actor_id, status, message_id, markdown_hash FROM ${TABLE} WHERE request_id=?`,
  ).bind(requestId).first();
}

async function claim(db, value, actor, now) {
  const timestamp = nowIso(now);
  const actorSince = nowIso(now - ACTOR_COOLDOWN_MS);
  const globalSince = nowIso(now - GLOBAL_COOLDOWN_MS);
  const result = await db.prepare(
    `INSERT OR IGNORE INTO ${TABLE}
      (request_id, revision, actor_id, status, markdown, markdown_hash, created_at, updated_at)
      SELECT ?, ?, ?, 'sending', ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM ${TABLE} WHERE actor_id=? AND created_at>? LIMIT 1
      ) AND NOT EXISTS (
        SELECT 1 FROM ${TABLE} WHERE created_at>? LIMIT 1
      )`,
  ).bind(value.requestId, value.revision, actor, value.markdown, value.markdownHash, timestamp, timestamp, actor, actorSince, globalSince).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function mark(db, requestId, status, now, details = {}) {
  await db.prepare(
    `UPDATE ${TABLE} SET status=?, message_id=?, last_error=?, updated_at=? WHERE request_id=? AND status='sending'`,
  ).bind(status, details.messageId ?? null, details.error ?? null, nowIso(now), requestId).run();
}

export async function sendWorkflowDocument(env, markdown, revision, fetchImpl = globalThis.fetch) {
  const token = String(env.INFRA_BOT_TOKEN || "").trim();
  const chatId = String(env.INFRA_CHAT_ID || "").trim();
  if (!token || !chatId) throw new Error("workflow_delivery_not_configured");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", new Blob([markdown], { type: "text/markdown; charset=utf-8" }), `day1workflow-${revision}.md`);
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form, signal: AbortSignal.timeout(15_000) });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload?.ok !== true || !Number.isInteger(payload?.result?.message_id)) {
    const error = new Error("workflow_delivery_failed");
    error.definite = response.status >= 400 && response.status < 500 && payload?.ok === false;
    throw error;
  }
  return { messageId: payload.result.message_id };
}

export async function handleWorkflow(request, env, options = {}) {
  if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
  let authorized = false;
  try { authorized = await verifyAdmin(request, env); } catch {}
  if (!authorized) return jsonError(401, "Unauthorized");
  if (!env.DB) return dbError("Workflow delivery database unavailable");
  const parsed = await readRequest(request);
  if (parsed.error) return parsed.error;
  const value = parsed.value;
  const actor = actorId();
  let existing;
  try {
    existing = await findDelivery(env.DB, value.requestId);
    if (existing) {
      if (existing.revision !== value.revision || existing.markdown_hash !== value.markdownHash) return jsonError(409, "requestId payload mismatch");
      if (existing.status === "sent") return jsonOk({ status: "sent", duplicate: true, messageId: existing.message_id ?? null });
      return jsonError(409, "This request is already claimed and will not be resent", { status: existing.status });
    }
    if (!String(env.INFRA_BOT_TOKEN || "").trim() || !String(env.INFRA_CHAT_ID || "").trim()) return dbError("Workflow delivery is not configured");
    const now = options.now ?? Date.now();
    if (!(await claim(env.DB, value, actor, now))) {
      existing = await findDelivery(env.DB, value.requestId);
      if (existing && (existing.revision !== value.revision || existing.markdown_hash !== value.markdownHash)) return jsonError(409, "requestId payload mismatch");
      if (existing?.status === "sent") return jsonOk({ status: "sent", duplicate: true, messageId: existing.message_id ?? null });
      if (!existing) return jsonError(429, "Workflow delivery rate limit exceeded");
      return jsonError(409, "This request is already claimed and will not be resent", { status: existing?.status || "unknown" });
    }
    const transport = options.sendDocument || sendWorkflowDocument;
    const receipt = await transport(env, value.markdown, value.revision, options.fetchImpl || globalThis.fetch);
    await mark(env.DB, value.requestId, "sent", now, { messageId: receipt.messageId });
    return jsonOk({ status: "sent", messageId: receipt.messageId });
  } catch (error) {
    try { await mark(env.DB, value.requestId, error?.definite ? "failed" : "unknown", options.now ?? Date.now(), { error: "delivery_failed" }); } catch {}
    if (error?.message === "workflow_delivery_not_configured") return dbError("Workflow delivery is not configured");
    return dbError("Workflow delivery failed; it will not be resent automatically");
  }
}
