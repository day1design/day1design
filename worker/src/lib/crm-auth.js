import { readCrmJson } from './crm-request.js';
const encoder = new TextEncoder();
import { jsonError as baseJsonError, jsonOk as baseJsonOk } from "./response.js";
import { deliverCrmOtp, isCrmOtpDeliveryConfigured } from "./crm-otp-delivery.js";

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutes(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function bearer(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function hashToken(token) {
  return digest(token);
}

export async function hashOtp(email, code, env) {
  const secret = env.CRM_OTP_SECRET || env.CRM_SESSION_SECRET;
  if (!secret) throw new Error("CRM_OTP_SECRET not configured");
  return hmac(`${String(email).trim().toLowerCase()}:${code}`, secret);
}

export async function issueOtp(db, email, ip, env) {
  const normalized = String(email || "").trim().toLowerCase();
  const code = String(Math.floor(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const id = crypto.randomUUID();
  const created = nowIso();
  const hash = await hashOtp(normalized, code, env);
  await db.batch([
    db.prepare("UPDATE CrmOtpRequests SET used_at = ? WHERE email = ? AND used_at IS NULL").bind(created, normalized),
    db.prepare("INSERT INTO CrmOtpRequests(id,email,code_hash,expires_at,created_at,request_ip) VALUES(?,?,?,?,?,?)").bind(id, normalized, hash, addMinutes(5), created, ip || "")
  ]);
  return { id, email: normalized, code, expiresAt: addMinutes(5) };
}

export async function deliverOtp(env, payload, ctx) {
  if (typeof env.CRM_OTP_DELIVER === "function") await env.CRM_OTP_DELIVER(payload);
  else await deliverCrmOtp(env, payload);
  if (ctx?.waitUntil && env.CRM_OTP_DELIVER_PROMISE) ctx.waitUntil(env.CRM_OTP_DELIVER_PROMISE);
}

async function onboardingStatus(db, tenantId) {
  try {
    const row = await db.prepare("SELECT onboarding_status FROM CrmTenants WHERE id=?").bind(tenantId).first();
    return row?.onboarding_status || "active";
  } catch {
    return "active";
  }
}

export async function authenticate(db, request) {
  const token = bearer(request);
  if (!token) return null;
  const row = await db.prepare(`
    SELECT s.id session_id, s.user_id, s.expires_at, s.persistent, u.email, u.role, u.tenant_id,
           u.active user_active, t.name tenant_name, t.brand, t.logo_url, t.suspended
    FROM CrmSessions s
    JOIN CrmUsers u ON u.id = s.user_id
    JOIN CrmTenants t ON t.id = u.tenant_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL
      AND (s.persistent = 1 OR s.expires_at > ?)
  `).bind(await hashToken(token), nowIso()).first();
  const status = row ? await onboardingStatus(db, row.tenant_id) : "active";
  if (!row || !row.user_active || (row.suspended && !(status === "pending" && row.role === "owner"))) return null;
  if (status === "pending" && row.role !== "owner") return null;
  return { ...row, onboarding_status: status, id: row.user_id, token };
}

export async function findTenantSuspendedSession(db, request) {
  const token = bearer(request);
  if (!token) return false;
  try {
    const row = await db.prepare(`
      SELECT 1
      FROM CrmSessions s
      JOIN CrmUsers u ON u.id = s.user_id
      JOIN CrmTenants t ON t.id = u.tenant_id
      WHERE s.token_hash = ?
        AND s.revoked_reason = 'tenant_suspended'
        AND t.suspended = 1
        AND s.expires_at > ?
      LIMIT 1
    `).bind(await hashToken(token), nowIso()).first();
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function createSession(db, userId) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  const created = nowIso();
  await db.prepare("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,persistent,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), await hashToken(token), userId, new Date(Date.now() + 86_400_000).toISOString(), 1, created).run();
  return token;
}

export async function revokeSession(db, request) {
  const token = bearer(request);
  if (!token) return;
  await db.prepare("UPDATE CrmSessions SET revoked_at = ? WHERE token_hash = ?").bind(nowIso(), await hashToken(token)).run();
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function safeJson(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function error(status, message) {
  return safeJson(baseJsonError(status, message));
}

function ok(data) {
  return safeJson(baseJsonOk(data));
}

async function requestBody(request) {
  try { return await readCrmJson(request); } catch { return null; }
}

function normalizedEmail(value) {
  return typeof value === "string" && value.trim().length <= 320 ? value.trim().toLowerCase() : "";
}

async function incrementLimit(db, scope, bucket) {
  const now = Date.now();
  const start = new Date(Math.floor(now / 900_000) * 900_000).toISOString();
  await db.prepare(`INSERT INTO CrmAuthRateLimits(scope,bucket,window_start,request_count)
    VALUES(?,?,?,1)
    ON CONFLICT(scope,bucket) DO UPDATE SET
      request_count=CASE WHEN window_start=? THEN request_count+1 ELSE 1 END,
      window_start=?`).bind(scope, bucket, start, start, start).run();
  const row = await db.prepare("SELECT request_count,window_start FROM CrmAuthRateLimits WHERE scope=? AND bucket=?").bind(scope, bucket).first();
  return row?.window_start === start ? Number(row.request_count || 0) : 0;
}

export async function requestMobileOtp(request, env, ctx) {
  if (!(typeof env.CRM_OTP_DELIVER === "function" || isCrmOtpDeliveryConfigured(env)) || !(env.CRM_OTP_SECRET || env.CRM_SESSION_SECRET)) return error(503, "OTP delivery unavailable");
  const value = await requestBody(request);
  const email = normalizedEmail(value?.email);
  if (!email || !email.includes("@")) return error(400, "email required");
  const ip = clientIp(request);
  const emailCount = await incrementLimit(env.DB, "email", email);
  const ipCount = await incrementLimit(env.DB, "ip", ip);
  const timestamp=nowIso(), cutoff=new Date(Date.now()-60000).toISOString();
  const claim=await env.DB.prepare('INSERT INTO CrmOtpCooldown(email,requested_at) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET requested_at=excluded.requested_at WHERE CrmOtpCooldown.requested_at<=? RETURNING email').bind(email,timestamp,cutoff).all();
  const limited=emailCount>5 || ipCount>5 || !(claim.results || []).length;
  const user = await env.DB.prepare(`SELECT u.id,u.email,u.active,t.suspended
    FROM CrmUsers u JOIN CrmTenants t ON t.id=u.tenant_id
    WHERE u.email=? COLLATE NOCASE`).bind(email).first();
  if (!user || user.active !== 1 || user.suspended || limited) return ok({ requested: true });
  let otp;
  try { otp = await issueOtp(env.DB, email, ip, env); }
  catch { return ok({ requested: true }); }
  try {
    await deliverOtp(env, { email, code: otp.code, expires_at: otp.expiresAt, user_id: user.id, otp_id: otp.id }, ctx);
  } catch (deliveryError) {
    const message = String(deliveryError?.message || '');
    const safeReason = /^CRM OTP (?:relay HTTP \d{3}|relay receipt invalid|relay did not accept message|payload invalid|relay configuration unavailable)$/.test(message)
      ? message : `relay_transport_failed:${deliveryError?.name || 'Error'}`;
    console.warn('crm_otp_delivery_failed', safeReason);
    await env.DB.prepare("UPDATE CrmOtpRequests SET used_at=? WHERE id=? AND used_at IS NULL").bind(nowIso(), otp.id).run();
    return error(503, "OTP delivery unavailable");
  }
  return ok({ requested: true });
}

export async function verifyMobileOtp(request, env) {
  const value = await requestBody(request);
  const email = normalizedEmail(value?.email);
  const code = typeof value?.code === "string" ? value.code : "";
  if (!email || !/^\d{6}$/.test(code)) return error(401, "invalid or expired code");
  const row = await env.DB.prepare(`SELECT o.id,o.code_hash,o.expires_at,o.attempts,u.id user_id,u.active,t.suspended
    FROM CrmOtpRequests o JOIN CrmUsers u ON u.email=o.email COLLATE NOCASE
    JOIN CrmTenants t ON t.id=u.tenant_id
    WHERE o.email=? COLLATE NOCASE AND o.used_at IS NULL ORDER BY o.created_at DESC LIMIT 1`).bind(email).first();
  if (!row || row.active !== 1 || row.suspended || row.attempts >= 5 || Date.parse(row.expires_at) <= Date.now()) return error(401, "invalid or expired code");
  const expected = await hashOtp(email, code, env);
  if (expected !== row.code_hash) {
    await env.DB.prepare("UPDATE CrmOtpRequests SET attempts=attempts+1 WHERE id=? AND used_at IS NULL AND attempts<5").bind(row.id).run();
    return error(401, "invalid or expired code");
  }
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  const created = nowIso();
  const sessionId = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE CrmOtpRequests SET used_at=? WHERE id=? AND used_at IS NULL AND attempts<5 AND expires_at>? AND EXISTS(SELECT 1 FROM CrmUsers u JOIN CrmTenants t ON t.id=u.tenant_id WHERE u.id=? AND u.active=1 AND t.suspended=0)").bind(created, row.id, created, row.user_id),
    env.DB.prepare("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,persistent,created_at) SELECT ?,?,?,?,?,? WHERE changes() = 1")
      .bind(sessionId, await hashToken(token), row.user_id, new Date(Date.now() + 86_400_000).toISOString(), 1, created),
  ]);
  if (!results?.[0]?.meta?.changes || !results?.[1]?.meta?.changes) return error(401, "invalid or expired code");
  return ok({ token, expires_in: null });
}
