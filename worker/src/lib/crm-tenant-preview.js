import { hashToken, nowIso } from './crm-auth.js';
import { jsonError as baseJsonError, jsonOk as baseJsonOk } from './response.js';

const TTL_MS = 15 * 60_000;

function noStore(response) { response.headers.set('cache-control', 'no-store'); return response; }
function error(status, message) { return noStore(baseJsonError(status, message)); }
function ok(data) { return noStore(baseJsonOk(data)); }
function bearer(request) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function platformAllowed(env, auth) {
  if (auth?.role !== 'owner' || auth?.tenant_id !== 'platform' || !auth?.session_id) return false;
  return String(env.CRM_PLATFORM_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
    .includes(String(auth.email || '').trim().toLowerCase());
}

async function audit(db, tenantId, actorId, action) {
  await db.prepare('INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) VALUES(?,?,?,?,?)')
    .bind(tenantId, actorId, null, action, nowIso()).run();
}

export function isTenantPreview(auth) { return auth?.preview_readonly === true && auth?.preview_mode === 'admin' && Boolean(auth.preview_session_id); }
export function previewBlocksWrite(auth) { return isTenantPreview(auth); }

export function previewReadAllowed(method, path) {
  return method === 'GET' && (
    ['/me', '/home', '/customers', '/appointments', '/analytics', '/members', '/sync', '/notifications', '/message-templates', '/meta/ads', '/app-update/latest'].includes(path)
    || /^\/customers\/[A-Za-z0-9_-]+$/.test(path)
    || /^\/customers\/[A-Za-z0-9_-]{1,120}\/visit-history$/.test(path)
    || path === '/briefings/latest'
    || /^\/briefings\/[A-Za-z0-9_-]{1,120}\/image$/.test(path)
    || /^\/meta\/ads\/[0-9]{1,30}\/image$/.test(path)
    || /^\/app-update\/artifacts\/[A-Za-z0-9_-]{1,120}\.apk$/.test(path)
  );
}

export async function startTenantPreview(request, env, auth, tenantId) {
  if (!platformAllowed(env, auth)) return error(403, 'platform access required');
  const parent = await env.DB.prepare(`SELECT s.id
    FROM CrmSessions s JOIN CrmUsers u ON u.id=s.user_id
    WHERE s.id=? AND s.user_id=? AND s.revoked_at IS NULL AND (s.persistent=1 OR s.expires_at>?)
      AND u.active=1 AND u.tenant_id='platform' AND u.role='owner'`).bind(auth.session_id, auth.user_id || auth.id, nowIso()).first();
  if (!parent) return error(403, 'platform session required');
  const target = await env.DB.prepare(`SELECT t.id tenant_id,t.name tenant_name,t.brand,t.logo_url,t.suspended,
      u.id target_user_id,u.email target_email,u.active target_active,u.role target_role
    FROM CrmTenants t JOIN CrmUsers u ON u.tenant_id=t.id AND u.role='owner'
    WHERE t.id=? AND t.id<>'platform' ORDER BY u.active DESC,u.id LIMIT 1`).bind(tenantId).first();
  if (!target || target.suspended || target.target_active !== 1 || target.target_role !== 'owner') return error(404, 'active tenant owner not found');
  const token = 'crm_preview_' + `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const sessionId = crypto.randomUUID();
  const expires = new Date(Date.now() + TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO CrmTenantPreviewSessions(id,token_hash,parent_session_id,parent_actor_id,tenant_id,target_user_id,expires_at,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(sessionId, await hashToken(token), parent.id, auth.user_id || auth.id, target.tenant_id, target.target_user_id, expires, nowIso()),
    env.DB.prepare('INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) VALUES(?,?,?,?,?)')
      .bind(target.tenant_id, auth.user_id || auth.id, null, 'tenant.preview.read_start', nowIso()),
  ]);
  return ok({
    preview_session: { id: sessionId, tenant_id: target.tenant_id, mode: 'admin', readonly: true, expires_at: expires },
    token,
    preview_token: token,
    target: { user_id: target.target_user_id, email: target.target_email, role: target.target_role,
      tenant: { id: target.tenant_id, name: target.tenant_name }, branding: { brand: target.brand || 'tenant', logo: target.logo_url || '' } },
  });
}

export async function authenticateTenantPreview(db, request) {
  const token = bearer(request);
  if (!token.startsWith('crm_preview_')) return null;
  const row = await db.prepare(`SELECT p.id preview_session_id,p.parent_session_id,p.parent_actor_id,p.tenant_id,p.target_user_id,p.expires_at,
      t.name tenant_name,t.brand,t.logo_url,t.suspended,u.email,u.role,u.active user_active,
      ps.revoked_at parent_revoked,ps.expires_at parent_expires,pu.active parent_active,pu.role parent_role,pu.tenant_id parent_tenant
    FROM CrmTenantPreviewSessions p JOIN CrmTenants t ON t.id=p.tenant_id JOIN CrmUsers u ON u.id=p.target_user_id AND u.tenant_id=p.tenant_id
    JOIN CrmSessions ps ON ps.id=p.parent_session_id AND ps.user_id=p.parent_actor_id JOIN CrmUsers pu ON pu.id=p.parent_actor_id AND pu.tenant_id='platform'
    WHERE p.token_hash=? AND p.revoked_at IS NULL AND p.expires_at>? AND u.id=p.target_user_id
      AND u.active=1 AND u.role='owner' AND t.suspended=0
      AND ps.revoked_at IS NULL AND (ps.persistent=1 OR ps.expires_at>?)
      AND pu.active=1 AND pu.role='owner' AND pu.tenant_id='platform'`).bind(await hashToken(token), nowIso(), nowIso()).first();
  if (!row || row.parent_revoked || row.parent_active !== 1 || row.parent_role !== 'owner' || row.parent_tenant !== 'platform') return null;
  return { id: row.target_user_id, user_id: row.target_user_id, email: row.email, role: row.role, tenant_id: row.tenant_id,
    tenant_name: row.tenant_name, brand: row.brand, logo_url: row.logo_url, onboarding_status: 'active', token,
    preview_readonly: true, preview_mode: 'admin', preview_session_id: row.preview_session_id,
    preview_parent_session_id: row.parent_session_id, preview_parent_actor_id: row.parent_actor_id };
}

export async function endTenantPreview(request, env, auth) {
  if (!isTenantPreview(auth)) return error(403, 'preview session required');
  const changed = await env.DB.prepare('UPDATE CrmTenantPreviewSessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
    .bind(nowIso(), auth.preview_session_id).run();
  await audit(env.DB, auth.tenant_id, auth.preview_parent_actor_id, 'tenant.preview.read_end');
  return ok({ ended: Boolean(changed?.meta?.changes), parent_session_id: auth.preview_parent_session_id });
}
