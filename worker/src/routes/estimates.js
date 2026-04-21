import { jsonOk, jsonError } from "../lib/response.js";
import {
  checkBotTrap,
  clientIP,
  escapeHtml,
  hasUrl,
  isValidEmail,
  isValidPhone,
  rateLimit,
} from "../lib/security.js";
import { verifyAdmin } from "../lib/auth.js";
import { r2Upload, safeFileName, datePrefix, randomId } from "../lib/r2.js";
import { atCreate, atListAll, atUpdate } from "../lib/airtable.js";
import { notifyTelegram } from "../lib/telegram.js";

const TABLE = "Estimates";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

export async function handleEstimates(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/estimates/, "") || "/";

  if (path === "/" && request.method === "POST") {
    return submitEstimate(request, env, ctx);
  }
  if (path === "/" && request.method === "GET") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return listEstimates(request, env);
  }
  const idMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (idMatch) {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    const id = idMatch[1];
    if (request.method === "PATCH") return patchEstimate(request, env, id);
  }
  return jsonError(404, "Not Found");
}

async function submitEstimate(request, env, ctx) {
  const ip = clientIP(request);

  const rl = await rateLimit(ip);
  if (!rl.allowed) {
    ctx.waitUntil(
      notifyTelegram(
        env,
        `[day1design/estimates] rate-limit 초과\nIP: ${ip} (${rl.count}회)`,
      ),
    );
    return jsonError(429, "Too many requests");
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return jsonError(400, "Invalid form data");
  }

  const fields = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") fields[k] = v;
  }

  const trap = checkBotTrap(fields);
  if (!trap.valid) {
    if (trap.fakeOk) return jsonOk({ queued: true }); // 봇 기만
    return jsonError(429, "Please try again");
  }

  // 기본 검증
  const errors = [];
  if (!fields.name || fields.name.length > 50) errors.push("name");
  if (!isValidPhone(fields.phone || "")) errors.push("phone");
  if (!isValidEmail(fields.email || "")) errors.push("email");
  if (fields.privacy_agreed !== "true") errors.push("privacy_agreed");
  if ((fields.detail || "").length > 2000) errors.push("detail-too-long");
  if (hasUrl(fields.detail) || hasUrl(fields.name)) errors.push("url-detected");
  if (errors.length) return jsonError(400, "Validation failed", { errors });

  // 파일 업로드 (R2)
  const folder = `estimates/${datePrefix()}-${randomId()}`;
  const conceptUrls = await uploadField(
    form,
    "concept_files",
    folder,
    "concept",
    env,
  );
  const planUrls = await uploadField(form, "floor_plans", folder, "plan", env);

  // Airtable 레코드 생성
  const record = await atCreate(env, TABLE, {
    Name: fields.name,
    Phone: fields.phone,
    Email: fields.email,
    SpaceType: fields.space_type || "",
    SpaceSize: fields.space_size || "",
    Postcode: fields.postcode || "",
    Address: fields.address || "",
    AddressDetail: fields.address_detail || "",
    Schedule: fields.schedule || "",
    Referral: fields.referral || "",
    Branch: fields.branch || "",
    Detail: fields.detail || "",
    PrivacyAgreed: true,
    ConceptFiles: JSON.stringify(conceptUrls),
    FloorPlans: JSON.stringify(planUrls),
    SubmittedAt: fields.submittedAt || new Date().toISOString(),
    Status: "접수대기",
    IP: ip,
  });

  // 텔레그램 알림
  ctx.waitUntil(
    notifyTelegram(
      env,
      `[day1design/estimates] 새 상담신청\n` +
        `이름: ${escapeHtml(fields.name)}\n` +
        `연락처: ${escapeHtml(fields.phone)}\n` +
        `유형/평수: ${escapeHtml(fields.space_type)} / ${escapeHtml(fields.space_size)}\n` +
        `지점: ${escapeHtml(fields.branch)}\n` +
        `파일: 컨셉 ${conceptUrls.length} / 평면도 ${planUrls.length}`,
    ),
  );

  return jsonOk({ id: record.id, received: true });
}

async function uploadField(form, fieldName, folder, prefix, env) {
  const files = form.getAll(fieldName).filter((f) => typeof f !== "string");
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f || !f.size) continue;
    if (f.size > MAX_FILE_BYTES) continue;
    const ct = f.type || "application/octet-stream";
    if (!ALLOWED_FILE_TYPES.includes(ct) && !ct.startsWith("image/")) continue;
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
    const key = `${folder}/${prefix}-${String(i + 1).padStart(3, "0")}-${safeFileName(f.name.replace(/\.[^.]+$/, ""))}.${ext}`;
    const url = await r2Upload(env.IMAGES, key, await f.arrayBuffer(), {
      contentType: ct,
      publicBase: env.R2_PUBLIC_BASE,
    });
    urls.push(url);
  }
  return urls;
}

async function listEstimates(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const filter = status
    ? `{Status}='${status.replace(/'/g, "\\'")}'`
    : undefined;
  const records = await atListAll(env, TABLE, {
    filter,
    sort: [{ field: "SubmittedAt", direction: "desc" }],
  });
  return jsonOk({
    records: records.map((r) => ({
      id: r.id,
      ...r.fields,
      ConceptFiles: safeJsonParse(r.fields.ConceptFiles),
      FloorPlans: safeJsonParse(r.fields.FloorPlans),
    })),
  });
}

async function patchEstimate(request, env, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const allowed = [
    "Status",
    "Assignee",
    "ContactedAt",
    "Memo",
    "EstimateAmount",
  ];
  const fields = {};
  for (const k of allowed) if (k in body) fields[k] = body[k];
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");
  const record = await atUpdate(env, TABLE, id, fields);
  return jsonOk({ id: record.id, updated: record.fields });
}

function safeJsonParse(s, fallback = []) {
  if (!s) return fallback;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
