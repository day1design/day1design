import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { createServices } from "../lib/services.js";
import { sendNcpSens } from "../lib/sens.js";
import { clientIP } from "../lib/security.js";
import { notifyTelegram } from "../lib/telegram.js";

const TEMPLATE_NAME_MAX = 60;
const TEMPLATE_SUBJECT_MAX = 40; // LMS subject 40자 제한
const TEMPLATE_CONTENT_MAX = 2000; // LMS 본문 안전 상한 (NCP 공식 2000byte)
const LOG_LIST_LIMIT = 200;

function nowIso() {
  return new Date().toISOString();
}

function sanitize(value, max) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .slice(0, max)
    .trim();
}

function normalizePhone(p) {
  return String(p || "").replace(/\D/g, "");
}

function validateTemplatePayload(body) {
  const errors = [];
  const name = sanitize(body?.Name, TEMPLATE_NAME_MAX);
  const subject = sanitize(body?.Subject, TEMPLATE_SUBJECT_MAX);
  const content = sanitize(body?.Content, TEMPLATE_CONTENT_MAX);
  if (!name) errors.push("Name");
  if (!subject) errors.push("Subject");
  if (!content) errors.push("Content");
  return { errors, fields: { Name: name, Subject: subject, Content: content } };
}

export async function handleSms(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/sms/, "") || "/";

  if (!(await verifyAdmin(request, env))) {
    return jsonError(401, "Unauthorized");
  }

  // ─── 템플릿 ───
  if (path === "/templates") {
    if (request.method === "GET") return listTemplates(env, services);
    if (request.method === "POST") return createTemplate(request, services);
    return jsonError(405, "Method Not Allowed");
  }
  const tplMatch = path.match(/^\/templates\/([a-zA-Z0-9_-]+)$/);
  if (tplMatch) {
    const id = tplMatch[1];
    if (request.method === "PATCH")
      return updateTemplate(request, services, id);
    if (request.method === "DELETE") return deleteTemplate(services, id);
    return jsonError(405, "Method Not Allowed");
  }

  // ─── 발송 이력 ───
  if (path === "/logs") {
    if (request.method !== "GET") return jsonError(405, "Method Not Allowed");
    return listLogs(env, services, url);
  }

  // ─── 발송 ───
  if (path === "/send") {
    if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
    return sendMessage(request, env, ctx, services);
  }

  return jsonError(404, "Not Found");
}

// ─── 템플릿 CRUD ──────────────────────────────────────────────────

async function listTemplates(env, services) {
  const records = await services.messageTemplates.listAll({
    sort: [{ field: "UpdatedAt", direction: "desc" }],
  });
  return jsonOk({
    records: records.map((r) => ({ id: r.id, ...r.fields })),
  });
}

async function createTemplate(request, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const { errors, fields } = validateTemplatePayload(body);
  if (errors.length) return jsonError(400, "Validation failed", { errors });
  const now = nowIso();
  const record = await services.messageTemplates.create({
    ...fields,
    CreatedAt: now,
    UpdatedAt: now,
  });
  return jsonOk({ id: record.id, ...record.fields });
}

async function updateTemplate(request, services, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const { errors, fields } = validateTemplatePayload(body);
  if (errors.length) return jsonError(400, "Validation failed", { errors });
  let record;
  try {
    record = await services.messageTemplates.update(id, {
      ...fields,
      UpdatedAt: nowIso(),
    });
  } catch (e) {
    if (e.notFound) return jsonError(404, "Template not found");
    throw e;
  }
  return jsonOk({ id: record.id, ...record.fields });
}

async function deleteTemplate(services, id) {
  try {
    await services.messageTemplates.delete(id);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Template not found");
    throw e;
  }
  return jsonOk({ deleted: true, id });
}

// ─── 발송 이력 ───────────────────────────────────────────────────

async function listLogs(env, services, url) {
  const estimateId = url.searchParams.get("estimateId");
  const where = estimateId ? { EstimateId: estimateId } : undefined;
  const records = await services.smsLogs.listAll({
    where,
    sort: [{ field: "SentAt", direction: "desc" }],
  });
  return jsonOk({
    records: records.slice(0, LOG_LIST_LIMIT).map((r) => ({
      id: r.id,
      ...r.fields,
    })),
  });
}

// ─── 발송 ───────────────────────────────────────────────────────

async function sendMessage(request, env, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const toPhone = normalizePhone(body?.to);
  const subject = sanitize(body?.subject, TEMPLATE_SUBJECT_MAX);
  const content = sanitize(body?.content, TEMPLATE_CONTENT_MAX);
  const estimateId = sanitize(body?.estimateId, 32);
  const templateId = sanitize(body?.templateId, 32);

  const errors = [];
  if (!/^010\d{7,8}$/.test(toPhone)) errors.push("to");
  if (!subject) errors.push("subject");
  if (!content) errors.push("content");
  if (errors.length) return jsonError(400, "Validation failed", { errors });

  // 항상 LMS 강제 (요구사항: 장문문자)
  const result = await sendNcpSens(env, {
    to: toPhone,
    subject,
    content,
    type: "LMS",
  });

  const sentAt = nowIso();
  const ip = clientIP(request);
  let status;
  let detail;
  if (result.ok) {
    status = "sent";
    detail = `status=${result.status || ""}`;
  } else if (result.skipped) {
    status = "skipped";
    detail = `reason=${result.reason || ""}`;
  } else {
    status = "failed";
    detail = `status=${result.status || ""} body=${(result.body || "").slice(0, 160)}`;
  }

  const log = await services.smsLogs.create({
    EstimateId: estimateId,
    TemplateId: templateId,
    ToPhone: toPhone,
    Subject: subject,
    Content: content,
    SmsType: "LMS",
    Status: status,
    Detail: detail.slice(0, 480),
    SentAt: sentAt,
    SentBy: ip,
  });

  // 영속 백업: D1 row 와 동일한 본문을 R2 에도 개별 객체로 저장.
  // D1 정리/한도 초과 시에도 발송 이력은 R2 에 영구 보존.
  if (env.IMAGES) {
    const d = new Date(sentAt);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const r2Key = `sms-logs/${yyyy}/${mm}/${dd}/${log.id}.json`;
    const archive = {
      id: log.id,
      estimateId,
      templateId,
      to: toPhone,
      subject,
      content,
      smsType: "LMS",
      status,
      detail,
      sentAt,
      sentBy: ip,
    };
    ctx.waitUntil(
      env.IMAGES.put(r2Key, JSON.stringify(archive, null, 2), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      }).catch(() => {}),
    );
  }

  if (status === "failed") {
    ctx.waitUntil(
      notifyTelegram(
        env,
        `[day1design/sms] 발송 실패\nto: ${toPhone}\n${detail.slice(0, 200)}`,
      ),
    );
  }

  return jsonOk({
    sent: status === "sent",
    status,
    detail,
    logId: log.id,
  });
}
