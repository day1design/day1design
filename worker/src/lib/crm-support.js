import { hashToken, nowIso } from './crm-auth.js';
import { jsonError, jsonOk } from './response.js';

const TTL_MS = 15 * 60_000;

function noStore(response) { response.headers.set('cache-control', 'no-store'); return response; }
function error(status, message) { return noStore(jsonError(status, message)); }
function ok(data) { return noStore(jsonOk(data)); }
function bearer(request) { const value = request.headers.get('authorization') || ''; return value.startsWith('Bearer ') ? value.slice(7).trim() : ''; }
function platformAllowed(env, auth) {
  if (auth?.role !== 'owner' || auth?.tenant_id !== 'platform') return false;
  return String(env.CRM_PLATFORM_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
    .includes(String(auth.email || '').trim().toLowerCase());
}
function audit(db, tenantId, actorId, action) {
  return db.prepare('INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) VALUES(?,?,?,?,?)')
    .bind(tenantId, actorId, null, action, nowIso()).run();
}

export function isSupportSession(auth) { return Boolean(auth?.support_session_id && auth?.support_mode === 'admin'); }
export function isSupportAdmin(auth) { return isSupportSession(auth); }
export function isSupportReadonly(auth) { return auth?.support_readonly === true; }
export function supportBlocksExternalSend(auth) { return isSupportSession(auth); }

export async function startSupportSession(request, env, auth, tenantId) {
  if (!platformAllowed(env, auth)) return error(403, 'platform access required');
  const actor = await env.DB.prepare("SELECT id FROM CrmUsers WHERE id=? AND active=1 AND tenant_id='platform' AND role='owner' AND email=? COLLATE NOCASE")
    .bind(auth.user_id || auth.id, auth.email).first();
  if (!actor) return error(403, 'platform access required');
  const reason = '';
  const tenant = await env.DB.prepare("SELECT id FROM CrmTenants WHERE id=? AND id<>'platform'").bind(tenantId).first();
  if (!tenant) return error(404, 'tenant not found');
  const token = 'crm_support_' + `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const sessionId = crypto.randomUUID();
  const expires = new Date(Date.now() + TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO CrmSupportSessions(id,token_hash,tenant_id,actor_id,reason,expires_at,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(sessionId, await hashToken(token), tenantId, actor.id, reason, expires, nowIso()),
    env.DB.prepare('INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) VALUES(?,?,?,?,?)')
      .bind(tenantId, actor.id, null, 'tenant.support.read_start', nowIso()),
  ]);
  return ok({ support_session: { id: sessionId, tenant_id: tenantId, mode: 'admin', expires_at: expires }, token });
}

export async function authenticateSupport(db, request) {
  const token = bearer(request);
  if (!token.startsWith('crm_support_')) return null;
  const row = await db.prepare(`SELECT s.id session_id,s.tenant_id,s.actor_id,s.reason,s.expires_at,
      t.name tenant_name,t.brand,t.logo_url,t.suspended,u.email actor_email
    FROM CrmSupportSessions s JOIN CrmTenants t ON t.id=s.tenant_id
    JOIN CrmUsers u ON u.id=s.actor_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
      AND u.active=1 AND u.tenant_id='platform' AND u.role='owner'`).bind(await hashToken(token), nowIso()).first();
  if (!row || row.suspended || Date.parse(row.expires_at) <= Date.now()) return null;
  return { id: row.actor_id, user_id: row.actor_id, email: row.actor_email, role: 'owner', tenant_id: row.tenant_id,
    tenant_name: row.tenant_name, brand: row.brand, logo_url: row.logo_url, onboarding_status: 'active',
    support_readonly: true, support_mode: 'admin', support_session_id: row.session_id, support_reason: row.reason, token };
}

export async function endSupportSession(request, env, auth) {
  if (!isSupportReadonly(auth)) return error(403, 'support session required');
  const changed = await env.DB.prepare('UPDATE CrmSupportSessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
    .bind(nowIso(), auth.support_session_id).run();
  await audit(env.DB, auth.tenant_id, auth.user_id, 'tenant.support.read_end');
  return ok({ ended: Boolean(changed?.meta?.changes) });
}

export function supportReadAllowed(method,path) {
  return method === "GET" && (["/me","/home","/customers","/appointments","/analytics","/members"].includes(path) || /^\/customers\/[A-Za-z0-9_-]+$/.test(path));
}
