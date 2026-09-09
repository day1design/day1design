import { readCrmJson } from '../lib/crm-request.js';
import { jsonError as baseJsonError, jsonOk as baseJsonOk } from "../lib/response.js";
import { decryptCredentials, deliveryMissingFields, encryptCredentials } from '../lib/crm-delivery.js';
import { renderCustomerReminder } from '../lib/crm-sens.js';

const TENANT_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_MAX = 500;

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function ok(data) { return noStore(baseJsonOk(data)); }
function error(status, message) { return noStore(baseJsonError(status, message)); }

async function jsonBody(request) { try { return await readCrmJson(request); } catch { return null; } }

function text(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function platformAllowed(env, auth) {
  if (auth?.role !== "owner" || auth?.tenant_id !== "platform") return false;
  const allowlist = String(env.CRM_PLATFORM_EMAILS || "").split(",")
    .map((item) => item.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(String(auth.email || "").trim().toLowerCase());
}

function ownerOf(auth, tenantId) {
  return auth?.role === "owner" && auth?.tenant_id === tenantId;
}

function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

async function audit(db, tenantId, actorId, action) {
  await db.prepare("INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) VALUES(?,?,?,?,?)")
    .bind(tenantId, actorId, null, action, now()).run();
}

function guard(id, tenantId, actorId) {
  return `INSERT INTO CrmMutationGuard(id,allowed) SELECT ?,1 WHERE EXISTS (
    SELECT 1 FROM CrmUsers u JOIN CrmTenants t ON t.id=u.tenant_id
    WHERE u.id=? AND u.tenant_id=? AND u.role='owner' AND u.active=1 AND t.suspended=0
  )`;
}

function guardDelete(id) {
  return "DELETE FROM CrmMutationGuard WHERE id=?";
}

const DELIVERY_FIELDS = ['enabled', 'channel', 'access_key', 'secret_key', 'sms_service_id', 'from_number', 'contact_phone', 'alimtalk_service_id', 'channel_id', 'visit_template_code', 'measurement_template_code', 'visit_body', 'measurement_body'];
const DELIVERY_TEXT_MAX = 2000;
const PLATFORM_OVERVIEW_TTL_MS = 30_000;
const platformOverviewCaches = new WeakMap();

function masked(value) { const s = text(value, 320); return s ? `${s.slice(0, 2)}***${s.slice(-2)}` : ''; }

async function deliverySettings(request, env, auth, tenantId) {
  if (!platformAllowed(env, auth)) return error(403, 'platform access required');
  if (tenantId === 'platform' || !(await env.DB.prepare('SELECT id FROM CrmTenants WHERE id=?').bind(tenantId).first())) return error(404, 'tenant not found');
  const row = await env.DB.prepare('SELECT * FROM CrmTenantDeliverySettings WHERE tenant_id=?').bind(tenantId).first();
  if (request.method === 'GET') {
    let credentials = {};
    try { credentials = await decryptCredentials(env, row?.credentials_ciphertext || '', tenantId); } catch {}
    const source = row || { enabled: 0, channel: 'sms', sms_service_id: '', from_number: '', contact_phone: '', alimtalk_service_id: '', channel_id: '', visit_template_code: '', measurement_template_code: '', visit_body: '', measurement_body: '' };
    const missing = deliveryMissingFields(source, credentials);
    return ok({ settings: {
      enabled: Boolean(source.enabled), channel: source.channel,
      has_credentials: Boolean(credentials.accessKey && credentials.secretKey),
      configured: missing.length === 0,
      missing_fields: missing,
      sms_service_id: source.sms_service_id, from_number: source.from_number, contact_phone: source.contact_phone,
      alimtalk_service_id: source.alimtalk_service_id, channel_id: source.channel_id,
      visit_template_code: source.visit_template_code, measurement_template_code: source.measurement_template_code,
      visit_body: source.visit_body, measurement_body: source.measurement_body,
    }});
  }
  if (request.method !== 'PUT') return null;
  const value = await jsonBody(request);
  if (!value || typeof value.enabled !== 'boolean' || !['sms', 'alimtalk'].includes(value.channel)) return error(400, 'invalid delivery settings');
  if (Object.keys(value).some((key) => !DELIVERY_FIELDS.includes(key))) return error(400, 'invalid delivery settings');
  for (const field of DELIVERY_FIELDS.filter((key) => key !== 'enabled')) if (field in value && typeof value[field] !== 'string') return error(400, 'invalid delivery field');
  if (Object.entries(value).some(([field, item]) => typeof item === 'string' && item.length > (field === 'access_key' || field === 'secret_key' ? 320 : DELIVERY_TEXT_MAX))) return error(400, 'delivery field too long');
  const current = row || { enabled: 0, channel: 'sms', activation_at: null, sms_service_id: '', from_number: '', contact_phone: '', alimtalk_service_id: '', channel_id: '', visit_template_code: '', measurement_template_code: '', visit_body: '', measurement_body: '', credentials_ciphertext: '' };
  let credentials = {};
  try { credentials = await decryptCredentials(env, current.credentials_ciphertext || '', tenantId); } catch { return error(503, 'delivery configuration unavailable'); }
  if (text(value.access_key)) credentials.accessKey = text(value.access_key, 320);
  if (text(value.secret_key)) credentials.secretKey = text(value.secret_key, 320);
  const next = Object.fromEntries(['sms_service_id','from_number','contact_phone','alimtalk_service_id','channel_id','visit_template_code','measurement_template_code','visit_body','measurement_body'].map((key) => [key, text(value[key] ?? current[key], DELIVERY_TEXT_MAX)]));
  const nextRow = { ...current, ...next, channel: value.channel };
  const missing = deliveryMissingFields(nextRow, credentials);
  if (value.enabled && missing.length) return error(400, 'delivery configuration incomplete', { missing_fields: missing });
  const sample = { name: '고객', phone: '01000000000', email: 'customer@example.com', contact_phone: next.contact_phone || '01000000000', starts_at: '2026-01-01T00:00:00Z', location: '사무실', address: '서울시', map: 'https://map.naver.com/p/search/%EC%84%9C%EC%9A%B8%EC%8B%9C' };
  if (next.visit_body && !renderCustomerReminder(next.visit_body, sample).ok) return error(400, 'invalid visit template');
  if (next.measurement_body && !renderCustomerReminder(next.measurement_body, sample).ok) return error(400, 'invalid measurement template');
  if (!env.CRM_INTEGRATION_ENCRYPTION_KEY) return error(503, 'delivery encryption unavailable');
  const ciphertext = await encryptCredentials(env, credentials, tenantId);
  const at = now(), actor = auth.user_id || auth.id, guardId = id();
  const activationAt = value.enabled ? (current.enabled ? (current.activation_at || at) : at) : null;
  const statements = [
    env.DB.prepare(guard(guardId, 'platform', actor)).bind(guardId, actor, 'platform'),
    env.DB.prepare(`INSERT INTO CrmTenantDeliverySettings(tenant_id,enabled,activation_at,channel,credentials_ciphertext,sms_service_id,from_number,contact_phone,alimtalk_service_id,channel_id,visit_template_code,measurement_template_code,visit_body,measurement_body,updated_by,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1) ON CONFLICT(tenant_id) DO UPDATE SET enabled=excluded.enabled,activation_at=excluded.activation_at,channel=excluded.channel,credentials_ciphertext=excluded.credentials_ciphertext,sms_service_id=excluded.sms_service_id,from_number=excluded.from_number,contact_phone=excluded.contact_phone,alimtalk_service_id=excluded.alimtalk_service_id,channel_id=excluded.channel_id,visit_template_code=excluded.visit_template_code,measurement_template_code=excluded.measurement_template_code,visit_body=excluded.visit_body,measurement_body=excluded.measurement_body,updated_by=excluded.updated_by,updated_at=excluded.updated_at
      WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)`).bind(tenantId, value.enabled ? 1 : 0, activationAt, value.channel, ciphertext, next.sms_service_id, next.from_number, next.contact_phone, next.alimtalk_service_id, next.channel_id, next.visit_template_code, next.measurement_template_code, next.visit_body, next.measurement_body, actor, at, guardId, guardId),
    env.DB.prepare(`INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)`).bind(tenantId, actor, null, 'tenant.delivery_settings.update', at, guardId),
    env.DB.prepare(guardDelete(guardId)).bind(guardId),
  ];
  if (next.visit_body) statements.splice(2, 0, env.DB.prepare(`INSERT INTO CrmNotificationTemplates(tenant_id,kind,state,body,enabled,updated_by,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1) ON CONFLICT(tenant_id,kind,state) DO UPDATE SET body=excluded.body,enabled=1,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(tenantId, 'visit', 'approved', next.visit_body, 1, actor, at, guardId));
  if (next.measurement_body) statements.splice(2, 0, env.DB.prepare(`INSERT INTO CrmNotificationTemplates(tenant_id,kind,state,body,enabled,updated_by,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1) ON CONFLICT(tenant_id,kind,state) DO UPDATE SET body=excluded.body,enabled=1,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(tenantId, 'measurement', 'approved', next.measurement_body, 1, actor, at, guardId));
  try { const results = await env.DB.batch(statements); if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) return error(403, 'platform access required'); } catch { return error(409, 'delivery settings update failed'); }
  return deliverySettings(new Request(new URL(request.url), { method: 'GET' }), env, auth, tenantId);
}

async function platformTenants(request, env, auth) {
  if (!platformAllowed(env, auth)) return error(403, "platform access required");
  const cursor = text(new URL(request.url).searchParams.get("cursor"), 80);
  const result = await env.DB.prepare(
    "SELECT id,name,brand,logo_url,suspended,created_at FROM CrmTenants WHERE id <> 'platform' AND (? = '' OR id > ?) ORDER BY id LIMIT 101",
  ).bind(cursor, cursor).all();
  const rows = result.results || [];
  return ok({ tenants: rows.slice(0, 100).map((row) => ({
    id: row.id, name: row.name, brand: row.brand, logo_url: row.logo_url,
    suspended: Boolean(row.suspended), created_at: row.created_at,
  })), next_cursor: rows.length > 100 ? rows[99].id : null });
}

async function optionalFirst(db, sql, ...args) {
  try { return { available: true, row: await db.prepare(sql).bind(...args).first() }; } catch { return { available: false, row: null }; }
}

async function optionalAll(db, sql, ...args) {
  try { return { available: true, rows: (await db.prepare(sql).bind(...args).all()).results || [] }; } catch { return { available: false, rows: [] }; }
}

function platformOverviewCacheFor(db) {
  let cache = platformOverviewCaches.get(db);
  if (!cache) {
    cache = { entries: new Map(), pending: new Map() };
    platformOverviewCaches.set(db, cache);
  }
  return cache;
}

async function readPlatformOverview(env) {
  const [countsResult, outboxResult, auditsResult] = await Promise.all([
    optionalFirst(env.DB, "SELECT COUNT(*) AS registered, SUM(CASE WHEN suspended=1 THEN 1 ELSE 0 END) AS suspended, SUM(CASE WHEN suspended=0 THEN 1 ELSE 0 END) AS active FROM CrmTenants WHERE id <> 'platform'"),
    optionalFirst(env.DB, "SELECT COUNT(*) AS pending, SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued, SUM(CASE WHEN status='reserved' THEN 1 ELSE 0 END) AS reserved FROM CrmNotificationOutbox WHERE status IN ('queued','reserved')"),
    optionalAll(env.DB, "SELECT a.id,a.tenant_id,a.action,a.created_at,u.email AS actor_email FROM (SELECT id,tenant_id,actor_id,action,created_at FROM CrmAuditLogs ORDER BY id DESC LIMIT 100) a LEFT JOIN CrmUsers u ON u.id=a.actor_id WHERE a.tenant_id='platform' OR a.actor_id IN (SELECT id FROM CrmUsers WHERE tenant_id='platform') ORDER BY a.id DESC LIMIT 21"),
  ]);
  const counts = countsResult.row;
  const outbox = outboxResult.row;
  const auditRows = auditsResult.rows.slice(0, 20).map((row) => ({ id: row.id, tenant_id: row.tenant_id, action: row.action, actor_email: row.actor_email || null, created_at: row.created_at }));
  return {
    tenants: countsResult.available ? { status: "observed", registered: Number(counts?.registered || 0), active: Number(counts?.active || 0), suspended: Number(counts?.suspended || 0) } : { status: "unknown", registered: null, active: null, suspended: null, reason: "tenant_schema_unavailable" },
    integration: { status: "unknown", reason: "tenant_integration_source_not_available" },
    dispatch: outboxResult.available ? { status: "schema_observed", pending: Number(outbox?.pending || 0), queued: Number(outbox?.queued || 0), reserved: Number(outbox?.reserved || 0), retry: { status: "unknown", count: null, reason: "retry_state_not_in_schema" } } : { status: "unknown", pending: null, queued: null, reserved: null, retry: { status: "unknown", count: null, reason: "outbox_schema_unavailable" } },
    security_audit: { status: auditsResult.available ? "available" : "unknown", records: auditRows, has_more: auditsResult.available && auditsResult.rows.length > 20, window_size: 100, reason: auditsResult.available ? null : "audit_schema_unavailable" },
  };
}

async function platformOverview(request, env, auth) {
  if (!platformAllowed(env, auth)) return error(403, "platform access required");
  const cache = platformOverviewCacheFor(env.DB);
  const key = String(auth.user_id || auth.id || auth.email || "platform");
  const cached = cache.entries.get(key);
  if (cached && cached.expiresAt > Date.now()) return ok(cached.data);
  if (cached) cache.entries.delete(key);
  let pending = cache.pending.get(key);
  if (!pending) {
    pending = readPlatformOverview(env);
    cache.pending.set(key, pending);
    pending.then((data) => {
      cache.pending.delete(key);
      cache.entries.delete(key);
      cache.entries.set(key, { data, expiresAt: Date.now() + PLATFORM_OVERVIEW_TTL_MS });
      while (cache.entries.size > 100) cache.entries.delete(cache.entries.keys().next().value);
    }, () => cache.pending.delete(key));
  }
  return ok(await pending);
}

async function registerTenant(request, env, auth) {
  if (!platformAllowed(env, auth)) return error(403, "platform access required");
  const value = await jsonBody(request);
  const tenantId = text(value?.id, 80);
  const name = text(value?.name, 160);
  const brand = text(value?.brand, 80);
  const logoUrl = text(value?.logo_url, LOGO_MAX);
  const email = text(value?.owner_email, 320).toLowerCase();
  if (!TENANT_ID.test(tenantId) || tenantId === "platform" || !name || !EMAIL.test(email)) return error(400, "invalid tenant");
  const created = now();
  const ownerId = id();
  const guardId = id();
  try {
    const statements = [
      env.DB.prepare(guard(guardId, "platform", auth.user_id || auth.id)).bind(guardId, auth.user_id || auth.id, "platform"),
      env.DB.prepare("INSERT INTO CrmTenants(id,name,brand,logo_url,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(tenantId, name, brand, logoUrl, created, guardId),
      env.DB.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role,active,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(ownerId, tenantId, email, "owner", 1, created, guardId),
      env.DB.prepare("INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(tenantId, auth.user_id || auth.id, null, "tenant.register", created, guardId),
      env.DB.prepare(guardDelete(guardId)).bind(guardId),
    ];
    if (typeof env.DB.batch !== "function") return error(503, "transaction unavailable");
    const results = await env.DB.batch(statements);
    if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) return error(403, "platform access required");
  } catch { return error(409, "tenant registration failed"); }
  return ok({ id: tenantId, owner_id: ownerId });
}

async function setTenantSuspended(request, env, auth, tenantId) {
  if (!platformAllowed(env, auth)) return error(403, "platform access required");
  if (tenantId === "platform") return error(400, "invalid tenant");
  const value = await jsonBody(request);
  if (typeof value?.suspended !== "boolean") return error(400, "suspended required");
  const suspended = value.suspended ? 1 : 0;
  const tenant = await env.DB.prepare("SELECT id FROM CrmTenants WHERE id=?").bind(tenantId).first();
  if (!tenant) return error(404, "tenant not found");
  try {
    if (typeof env.DB.batch !== "function") return error(503, "transaction unavailable");
    const guardId = id();
    const statements = [
      env.DB.prepare(guard(guardId, "platform", auth.user_id || auth.id)).bind(guardId, auth.user_id || auth.id, "platform"),
      env.DB.prepare("UPDATE CrmTenants SET suspended=? WHERE id=? AND EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(suspended, tenantId, guardId),
      env.DB.prepare("INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(tenantId, auth.user_id || auth.id, null, suspended ? "tenant.suspend" : "tenant.reactivate", now(), guardId),
    ];
    if (suspended) statements.push(env.DB.prepare("UPDATE CrmSessions SET revoked_at=? WHERE user_id IN (SELECT id FROM CrmUsers WHERE tenant_id=?) AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(now(), tenantId, guardId));
    statements.push(env.DB.prepare(guardDelete(guardId)).bind(guardId));
    const results = await env.DB.batch(statements);
    if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) return error(403, "platform access required");
  } catch { return error(409, "tenant update failed"); }
  return ok({ id: tenantId, suspended: Boolean(suspended) });
}

async function addMember(request, env, auth, tenantId) {
  if (!ownerOf(auth, tenantId)) return error(403, "tenant owner required");
  const value = await jsonBody(request);
  const email = text(value?.email, 320).toLowerCase();
  if (!EMAIL.test(email) || value?.role !== "staff") return error(400, "staff member required");
  const memberId = id();
  try {
    if (typeof env.DB.batch !== "function") return error(503, "transaction unavailable");
    const created = now();
    const guardId = id();
    const results = await env.DB.batch([
      env.DB.prepare(guard(guardId, tenantId, auth.user_id || auth.id)).bind(guardId, auth.user_id || auth.id, tenantId),
      env.DB.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role,active,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(memberId, tenantId, email, "staff", 1, created, guardId),
      env.DB.prepare("INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(tenantId, auth.user_id || auth.id, null, "member.create", created, guardId),
      env.DB.prepare(guardDelete(guardId)).bind(guardId),
    ]);
    if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) return error(403, "tenant owner required");
  } catch { return error(409, "member already exists"); }
  return ok({ id: memberId, email, role: "staff", active: true });
}

async function setMemberActive(request, env, auth, tenantId, memberId) {
  if (!ownerOf(auth, tenantId)) return error(403, "tenant owner required");
  const member = await env.DB.prepare("SELECT id,role FROM CrmUsers WHERE id=? AND tenant_id=?").bind(memberId, tenantId).first();
  if (!member) return error(404, "member not found");
  if (member.role !== "staff") return error(400, "owner cannot be modified");
  const value = await jsonBody(request);
  if (typeof value?.active !== "boolean") return error(400, "active required");
  if (typeof env.DB.batch !== "function") return error(503, "transaction unavailable");
  const action = `member.${value.active ? "activate" : "deactivate"}`;
  const guardId = id();
  const statements = [
    env.DB.prepare(guard(guardId, tenantId, auth.user_id || auth.id)).bind(guardId, auth.user_id || auth.id, tenantId),
    env.DB.prepare("UPDATE CrmUsers SET active=? WHERE id=? AND tenant_id=? AND role='staff' AND EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(value.active ? 1 : 0, memberId, tenantId, guardId),
    env.DB.prepare("INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(tenantId, auth.user_id || auth.id, null, action, now(), guardId),
  ];
  if (!value.active) statements.push(env.DB.prepare("UPDATE CrmSessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM CrmMutationGuard WHERE id=? AND allowed=1)").bind(now(), memberId, guardId));
  statements.push(env.DB.prepare(guardDelete(guardId)).bind(guardId));
  const results = await env.DB.batch(statements);
  if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) return error(403, "tenant owner required");
  return ok({ id: memberId, active: value.active });
}

async function appointments(request, env, auth) {
  const url=new URL(request.url), tenantId=url.searchParams.get('tenant_id') || '';
  if(tenantId && tenantId!==auth.tenant_id && !platformAllowed(env,auth))return error(403,'tenant access required');
  const scope=tenantId || auth.tenant_id, limit=Number(url.searchParams.get('limit') || 50);
  if(!Number.isInteger(limit) || limit<1 || limit>100)return error(400,'invalid limit');
  let from=url.searchParams.get('from'),to=url.searchParams.get('to');
  const month=url.searchParams.get('month');
  if(Boolean(from)!==Boolean(to))return error(400,'both date bounds required');
  if(!from){
    const selected=month || new Date(Date.now()+9*3600000).toISOString().slice(0,7);
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected))return error(400,'invalid month');
    const [year,m]=selected.split('-').map(Number);
    if(year<2000 || year>2100)return error(400,'invalid year');
    from=new Date(Date.UTC(year,m-1,1)-9*3600000).toISOString();
    to=new Date(Date.UTC(year,m,1)-9*3600000).toISOString();
  }
  const valid=v=>typeof v==='string' && /(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
  if(!valid(from) || !valid(to) || Date.parse(to)<=Date.parse(from) || Date.parse(to)-Date.parse(from)>366*86400000)return error(400,'invalid range');
  from=new Date(from).toISOString();to=new Date(to).toISOString();
  const cursor=url.searchParams.get('cursor') || '';
  let cursorAt=from,cursorId='';
  if(cursor){const parts=cursor.split('|');if(parts.length!==2 || !valid(parts[0]) || !/^[A-Za-z0-9_-]{1,120}$/.test(parts[1]))return error(400,'invalid cursor');cursorAt=parts[0];cursorId=parts[1];}
  const args=[scope,from,to,cursorAt,cursorAt,cursorId,limit+1];
  const [mobile,legacy]=await Promise.all([
    env.DB.prepare(`SELECT a.id,a.tenant_id,a.estimate_id AS customer_id,a.kind,a.starts_at,a.location,a.address,
      CASE WHEN a.kind='visit' AND (COALESCE(e.ConsultAt,'')='' OR julianday(a.starts_at)<>julianday(e.ConsultAt) OR COALESCE(e.ConsultCancelledAt,'')<>'') THEN 'cancelled' ELSE a.status END AS status,
      a.created_by,a.created_at,e.Name AS customer_name
      FROM CrmAppointments a JOIN Estimates e ON e.id=a.estimate_id AND e.CrmTenantId=a.tenant_id
      WHERE a.tenant_id=? AND a.starts_at>=? AND a.starts_at<? AND (a.starts_at>? OR (a.starts_at=? AND a.id>?))
      ORDER BY a.starts_at,a.id LIMIT ?`).bind(...args).all(),
    env.DB.prepare(`SELECT 'legacy-visit-'||e.id AS id,e.CrmTenantId AS tenant_id,e.id AS customer_id,'visit' AS kind,e.ConsultAt AS starts_at,e.ConsultBranch AS location,'' AS address,
      CASE WHEN COALESCE(e.ConsultCancelledAt,'')<>'' THEN 'cancelled' ELSE 'scheduled' END AS status,'' AS created_by,e.SubmittedAt AS created_at,e.Name AS customer_name
      FROM Estimates e WHERE e.CrmTenantId=? AND e.ConsultAt>=? AND e.ConsultAt<?
      AND (e.ConsultAt>? OR (e.ConsultAt=? AND 'legacy-visit-'||e.id>?))
      AND NOT EXISTS(SELECT 1 FROM CrmAppointments a WHERE a.tenant_id=e.CrmTenantId AND a.estimate_id=e.id AND a.kind='visit' AND julianday(a.starts_at)=julianday(e.ConsultAt))
      ORDER BY e.ConsultAt,e.id LIMIT ?`).bind(...args).all()
  ]);
  const rows=[...(mobile.results || []),...(legacy.results || [])].sort((a,b)=>a.starts_at<b.starts_at?-1:a.starts_at>b.starts_at?1:a.id<b.id?-1:a.id>b.id?1:0);
  return ok({appointments:rows.slice(0,limit),next_cursor:rows.length>limit?`${rows[limit-1].starts_at}|${rows[limit-1].id}`:null});
}

export async function handleMobileManagement(request, env, auth) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/mobile/, "") || "/";
    if (path === "/platform/overview" && request.method === "GET") return platformOverview(request, env, auth);
    if (path === "/platform/tenants" && request.method === "GET") return platformTenants(request, env, auth);
    if (path === "/platform/tenants" && request.method === "POST") return registerTenant(request, env, auth);
    const tenant = path.match(/^\/platform\/tenants\/([a-z0-9][a-z0-9_-]{1,79})$/);
    if (tenant && request.method === "PATCH") return setTenantSuspended(request, env, auth, tenant[1]);
    const delivery = path.match(/^\/platform\/tenants\/([a-z0-9][a-z0-9_-]{1,79})\/delivery-settings$/);
    if (delivery && ['GET', 'PUT'].includes(request.method)) return deliverySettings(request, env, auth, delivery[1]);
    const member = path.match(/^\/tenants\/([a-z0-9][a-z0-9_-]{1,79})\/members$/);
    if (member && request.method === "POST") return addMember(request, env, auth, member[1]);
    const memberUpdate = path.match(/^\/tenants\/([a-z0-9][a-z0-9_-]{1,79})\/members\/([A-Za-z0-9_-]+)$/);
    if (memberUpdate && request.method === "PATCH") return setMemberActive(request, env, auth, memberUpdate[1], memberUpdate[2]);
    if (path === "/members" && request.method === "POST") return addMember(request, env, auth, auth?.tenant_id);
    const bareMember = path.match(/^\/members\/([A-Za-z0-9_-]+)$/);
    if (bareMember && request.method === "PATCH") return setMemberActive(request, env, auth, auth?.tenant_id, bareMember[1]);
    if (path === "/appointments" && request.method === "GET") return appointments(request, env, auth);
    return null;
  } catch { return error(500, "request failed"); }
}
