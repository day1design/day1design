import { fcmConfig, sendFcmMessage } from './crm-fcm.js';

const SOURCE_TENANT = 'day1design';
const TYPE = 'new_customer';
const MAX_SUBSCRIPTIONS = 20;
const MAX_SENDS = 20;

function requireDb(db) { if (!db?.prepare || typeof db.batch !== 'function') throw new TypeError('subscription_db_required'); return db; }
function nowIso(value = Date.now()) { return new Date(value).toISOString(); }
function validPlatformActor(actor) { return actor?.tenant_id === 'platform' && actor?.role === 'owner' && typeof (actor.user_id || actor.id) === 'string'; }
function json(value) { return JSON.stringify(value && typeof value === 'object' ? value : {}); }
function allowlisted(env, email) {
  return String(env?.CRM_PLATFORM_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
    .includes(String(email || '').trim().toLowerCase());
}

export const PLATFORM_SUBSCRIPTION = Object.freeze({ sourceTenantId: SOURCE_TENANT, notificationType: TYPE });

async function activePlatformActor(db, actor) {
  if (!validPlatformActor(actor)) throw new Error('platform_owner_required');
  const id = actor.user_id || actor.id;
  const row = await db.prepare(`SELECT u.id,u.email,u.active,t.suspended
    FROM CrmUsers u JOIN CrmTenants t ON t.id=u.tenant_id
    WHERE u.id=? AND u.tenant_id='platform' AND u.role='owner' AND u.active=1 AND t.suspended=0`).bind(id).first();
  if (!row) throw new Error('platform_owner_inactive');
  return row;
}

async function sourceReady(db) {
  return db.prepare("SELECT id FROM CrmTenants WHERE id='day1design' AND suspended=0").bind().first();
}

export async function listPlatformNotificationSubscriptions(db, { actor, env } = {}) {
  requireDb(db); const platform = await activePlatformActor(db, actor);
  if (!allowlisted(env, platform.email)) throw new Error('platform_access_required');
  const rows = (await db.prepare(`SELECT id,source_tenant_id,notification_type,enabled,created_at,updated_at
    FROM CrmPlatformNotificationSubscriptions WHERE platform_user_id=? ORDER BY source_tenant_id,notification_type LIMIT ?`).bind(platform.id, MAX_SUBSCRIPTIONS).all()).results || [];
  return rows.map((row) => ({ ...row, enabled: row.enabled === 1 }));
}

export async function upsertPlatformNotificationSubscription(db, { actor, env, sourceTenantId = SOURCE_TENANT, notificationType = TYPE, enabled = true, createdAt = new Date() } = {}) {
  requireDb(db); const platform = await activePlatformActor(db, actor);
  if (!allowlisted(env, platform.email)) throw new Error('platform_access_required');
  if (sourceTenantId !== SOURCE_TENANT || notificationType !== TYPE || typeof enabled !== 'boolean') throw new Error('subscription_scope_denied');
  if (enabled && !(await sourceReady(db))) throw new Error('source_tenant_inactive');
  const at = nowIso(createdAt);
  const existing = await db.prepare('SELECT id,cursor_created_at,cursor_relay_id FROM CrmPlatformNotificationSubscriptions WHERE platform_user_id=? AND source_tenant_id=? AND notification_type=?').bind(platform.id, sourceTenantId, notificationType).first();
  const id = existing?.id || `crm_psub_${crypto.randomUUID()}`;
  const cursorCreatedAt = enabled ? at : (existing?.cursor_created_at || at);
  const cursorRelayId = enabled ? '' : (existing?.cursor_relay_id || '');
  const result = await db.batch([db.prepare(`INSERT INTO CrmPlatformNotificationSubscriptions
    (id,platform_user_id,source_tenant_id,notification_type,enabled,cursor_created_at,cursor_relay_id,source_cursor_created_at,source_cursor_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(platform_user_id,source_tenant_id,notification_type) DO UPDATE SET enabled=excluded.enabled,cursor_created_at=excluded.cursor_created_at,cursor_relay_id=excluded.cursor_relay_id,source_cursor_created_at=excluded.source_cursor_created_at,source_cursor_id=excluded.source_cursor_id,updated_at=excluded.updated_at`).bind(id, platform.id, sourceTenantId, notificationType, enabled ? 1 : 0, cursorCreatedAt, cursorRelayId, at, '', at, at),
    db.prepare("INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) VALUES(?,?,?,?,?)").bind(sourceTenantId, platform.id, null, enabled ? 'platform.notification_subscription.enable' : 'platform.notification_subscription.disable', at)]);
  if (!result?.[0]?.meta?.changes && !existing) throw new Error('subscription_write_failed');
  return db.prepare('SELECT id,source_tenant_id,notification_type,enabled,created_at,updated_at FROM CrmPlatformNotificationSubscriptions WHERE id=?').bind(id).first();
}

export async function disablePlatformNotificationSubscription(db, { actor, env, sourceTenantId = SOURCE_TENANT, notificationType = TYPE, updatedAt = new Date() } = {}) {
  return upsertPlatformNotificationSubscription(db, { actor, env, sourceTenantId, notificationType, enabled: false, createdAt: updatedAt });
}

export async function relayPlatformNotification(db, { env, sourceTenantId = SOURCE_TENANT, sourceNotificationId, createdAt = new Date() } = {}) {
  requireDb(db); if (sourceTenantId !== SOURCE_TENANT || !sourceNotificationId) return { relayed: 0 };
  const source = await db.prepare("SELECT id,type,tenant_id,payload_json,created_at FROM CrmNotifications WHERE id=? AND tenant_id='day1design' AND type='new_customer'").bind(sourceNotificationId).first();
  if (!source || !(await sourceReady(db))) return { relayed: 0, reason: 'source_notification_not_found' };
  const subs = (await db.prepare(`SELECT s.id,s.platform_user_id,u.email FROM CrmPlatformNotificationSubscriptions s
    JOIN CrmNotifications source ON source.id=? AND source.tenant_id='day1design' AND source.type='new_customer'
    JOIN CrmUsers u ON u.id=s.platform_user_id AND u.tenant_id='platform' AND u.role='owner' AND u.active=1
    JOIN CrmTenants t ON t.id='platform' AND t.suspended=0
    WHERE s.source_tenant_id='day1design' AND s.notification_type='new_customer' AND s.enabled=1 AND (source.created_at>s.source_cursor_created_at OR (source.created_at=s.source_cursor_created_at AND source.id>s.source_cursor_id)) LIMIT ?`).bind(sourceNotificationId, MAX_SUBSCRIPTIONS).all()).results || [];
  const eligible = env ? subs.filter((sub) => allowlisted(env, sub.email)) : [];
  let relayed = 0; const at = nowIso(createdAt);
  for (const sub of eligible) {
    const suffix = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sub.id}:${source.id}`)))).map(byte => byte.toString(16).padStart(2,'0')).join('');
    const relayId = `crm_prelay_${suffix}`;
    const notificationId = `crm_pntf_${suffix}`;
    let payload = {}; try { payload = JSON.parse(source.payload_json || '{}'); } catch {}
    payload = { ...payload, source_tenant_id: SOURCE_TENANT, source_notification_id: source.id, kind: 'platform_subscription' };
    const result = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key)
        VALUES(?,?,?,?,?,?,?)`).bind(notificationId, 'platform', source.type, sub.platform_user_id, json(payload), source.created_at || at, `platform_subscription:${sub.id}:${source.id}`),
      db.prepare(`INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at)
        SELECT ?, 'platform', ?, ? WHERE EXISTS (SELECT 1 FROM CrmNotifications WHERE id=? AND tenant_id='platform')`).bind(notificationId, sub.platform_user_id, at, notificationId),
      db.prepare(`INSERT OR IGNORE INTO CrmPlatformNotificationRelays(id,subscription_id,source_tenant_id,source_notification_id,relay_notification_id,platform_user_id,created_at)
        VALUES(?,?,?,?,?,?,?)`).bind(relayId, sub.id, SOURCE_TENANT, source.id, notificationId, sub.platform_user_id, at),
    ]);
    if (result?.[2]?.meta?.changes) relayed += 1;
  }
  return { relayed };
}

export async function relayNewCustomerNotification(db, { estimateId, createdAt } = {}) {
  if (!estimateId) return { relayed: 0 };
  const source = await db.prepare("SELECT id FROM CrmNotifications WHERE tenant_id='day1design' AND type='new_customer' AND (event_key=? OR event_key=?) ORDER BY created_at DESC,id DESC LIMIT 1").bind(`new_customer:day1design:${estimateId}`, `new_customer:day1design:${estimateId}`).first();
  return source ? relayPlatformNotification(db, { sourceNotificationId: source.id, createdAt }) : { relayed: 0, reason: 'source_notification_not_found' };
}

export async function processPlatformSubscriptionPushBatch(db, { env, now = new Date(), fetchImpl, send = sendFcmMessage } = {}) {
  requireDb(db); if (env?.CRM_PUSH_ENABLED !== 'true') return { enabled: false, processed: 0 };
  try { fcmConfig(env, SOURCE_TENANT); } catch (error) { return { enabled: false, configured: false, reason: error?.message || 'push_configuration_unavailable', processed: 0 }; }
  let subs;
  try { subs = (await db.prepare(`SELECT s.*,u.email,u.active platform_active,t.suspended platform_suspended
    FROM CrmPlatformNotificationSubscriptions s JOIN CrmUsers u ON u.id=s.platform_user_id AND u.tenant_id='platform'
    JOIN CrmTenants t ON t.id='platform' WHERE s.enabled=1 AND s.source_tenant_id='day1design' AND s.notification_type='new_customer' LIMIT ?`).bind(MAX_SUBSCRIPTIONS).all()).results || []; } catch { return { enabled: true, configured: true, processed: 0, accepted: 0, failed: 0, skipped: 0, unavailable: true }; }
  const at = nowIso(now), summary = { enabled: true, processed: 0, accepted: 0, failed: 0, skipped: 0 };
  for (const sub of subs) {
    if (sub.platform_active !== 1 || sub.platform_suspended === 1 || !allowlisted(env,sub.email) || !(await sourceReady(db))) continue;
    const sources = (await db.prepare("SELECT id,created_at FROM CrmNotifications WHERE tenant_id='day1design' AND type='new_customer' AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT 21").bind(sub.source_cursor_created_at || sub.created_at, sub.source_cursor_created_at || sub.created_at, sub.source_cursor_id || '').all()).results || [];
    for (const source of sources.slice(0, 20)) {
      await relayPlatformNotification(db, { env, sourceNotificationId: source.id, createdAt: at });
      await db.prepare('UPDATE CrmPlatformNotificationSubscriptions SET source_cursor_created_at=?,source_cursor_id=?,updated_at=? WHERE id=? AND enabled=1').bind(source.created_at, source.id, at, sub.id).run();
    }
    const rows = (await db.prepare(`SELECT r.id,r.relay_notification_id,r.source_notification_id,r.created_at relay_created_at,n.type,n.payload_json,n.created_at
      FROM CrmPlatformNotificationRelays r JOIN CrmNotifications n ON n.id=r.relay_notification_id AND n.tenant_id='platform'
      JOIN CrmTenants st ON st.id=r.source_tenant_id AND st.suspended=0
      WHERE r.subscription_id=? AND (r.created_at>? OR (r.created_at=? AND r.id>?)) ORDER BY r.created_at,r.id LIMIT 21`).bind(sub.id, sub.cursor_created_at, sub.cursor_created_at, sub.cursor_relay_id).all()).results || [];
    const page = rows.slice(0, 20);
    const devices = (await db.prepare(`SELECT d.id,d.push_token,d.preview_mode FROM CrmDevices d JOIN CrmSessions s ON s.id=d.session_id AND s.user_id=d.user_id AND s.revoked_at IS NULL AND (s.persistent=1 OR s.expires_at>?) JOIN CrmUsers u ON u.id=d.user_id AND u.tenant_id='platform' AND u.role='owner' AND u.active=1 WHERE d.tenant_id='platform' AND d.user_id=? AND d.notifications_enabled=1 ORDER BY d.id LIMIT 5`).bind(at, sub.platform_user_id).all()).results || [];
    for (const row of page) {
      let rowComplete = true;
      for (const device of devices) {
      if (summary.processed >= MAX_SENDS) { rowComplete = false; break; }
      const authorize = async () => { const candidate = await db.prepare(`SELECT d.push_token,u.email FROM CrmPlatformNotificationSubscriptions s
        JOIN CrmUsers u ON u.id=s.platform_user_id AND u.tenant_id='platform' AND u.role='owner' AND u.active=1
        JOIN CrmTenants pt ON pt.id='platform' AND pt.suspended=0
        JOIN CrmDevices d ON d.id=? AND d.user_id=s.platform_user_id AND d.tenant_id='platform' AND d.notifications_enabled=1
        JOIN CrmSessions ss ON ss.id=d.session_id AND ss.user_id=d.user_id AND ss.revoked_at IS NULL AND (ss.persistent=1 OR ss.expires_at>?)
        JOIN CrmTenants st ON st.id=s.source_tenant_id AND st.suspended=0
        WHERE s.id=? AND s.enabled=1 AND s.source_tenant_id='day1design' AND s.notification_type='new_customer'`).bind(device.id, at, sub.id).first(); return candidate && allowlisted(env,candidate.email) ? candidate : null; };
      const fresh = await authorize();
      if (!fresh || !allowlisted(env, sub.email)) { summary.skipped += 1; continue; }
      const receiptId = `crm_push_${crypto.randomUUID()}`;
      const inserted = await db.prepare(`INSERT OR IGNORE INTO CrmPushReceipts(id,tenant_id,notification_id,recipient_id,device_id,idempotency_key,status,created_at,updated_at) VALUES(?,?,?,?,?,?, 'sending',?,?)`).bind(receiptId, 'platform', row.relay_notification_id, sub.platform_user_id, device.id, `${row.relay_notification_id}:${sub.platform_user_id}:${device.id}`, at, at).run();
      if (!inserted.meta?.changes) { summary.skipped += 1; continue; }
      summary.processed += 1; let result;
      try { result = await send(env, { tenantId: SOURCE_TENANT, token: fresh.push_token, notificationId: row.relay_notification_id, notificationType: row.type, payload: JSON.parse(row.payload_json || '{}'), previewMode: device.preview_mode, fetchImpl, now: new Date(now).getTime(), beforeSend: async () => (await authorize())?.push_token === fresh.push_token }); } catch { result = { accepted: false }; }
      const status = result?.accepted === true ? 'accepted' : 'failed'; if (status === 'accepted') summary.accepted += 1; else summary.failed += 1;
      await db.prepare('UPDATE CrmPushReceipts SET status=?,provider_message_name=?,error_code=?,updated_at=? WHERE id=?').bind(status, result?.messageName || null, status === 'failed' ? 'provider_rejected' : null, at, receiptId).run();
    }
      if (!rowComplete) break;
      await db.prepare('UPDATE CrmPlatformNotificationSubscriptions SET cursor_created_at=?,cursor_relay_id=?,updated_at=? WHERE id=? AND enabled=1').bind(row.relay_created_at, row.id, at, sub.id).run();
    }
  }
  return summary;
}
