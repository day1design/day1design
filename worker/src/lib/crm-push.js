import { fcmConfig, sendFcmMessage } from './crm-fcm.js';

const PAGE_SIZE = 20;
const nowIso = (value = Date.now()) => new Date(value).toISOString();
const pushId = () => `crm_push_${crypto.randomUUID()}`;

function requireDb(db) { if (!db?.prepare) throw new TypeError('push_db_required'); return db; }
function size(value) { return Math.max(1, Math.min(PAGE_SIZE, Number(value) || PAGE_SIZE)); }

async function ensureCursor(db, tenantId, at) {
  const current = await db.prepare('SELECT * FROM CrmPushCursors WHERE tenant_id=?').bind(tenantId).first();
  if (current) return { current, initialized: false };
  const latest = await db.prepare(`SELECT r.created_at,r.notification_id,r.recipient_id
    FROM CrmNotificationRecipients r JOIN CrmNotifications n ON n.id=r.notification_id
    WHERE r.tenant_id=? ORDER BY r.created_at DESC,r.notification_id DESC,r.recipient_id DESC LIMIT 1`).bind(tenantId).first();
  const baselineCreatedAt = latest?.created_at || at;
  const baselineNotificationId = latest?.notification_id || '';
  const baselineRecipientId = latest?.recipient_id || '';
  await db.prepare(`INSERT OR IGNORE INTO CrmPushCursors
    (tenant_id,baseline_created_at,baseline_notification_id,baseline_recipient_id,cursor_created_at,cursor_notification_id,cursor_recipient_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(tenantId, baselineCreatedAt, baselineNotificationId, baselineRecipientId, baselineCreatedAt, baselineNotificationId, baselineRecipientId, at).run();
  return { current: await db.prepare('SELECT * FROM CrmPushCursors WHERE tenant_id=?').bind(tenantId).first(), initialized: true };
}

async function liveCandidate(db, row, at) {
  return db.prepare(`SELECT r.notification_id,r.recipient_id,r.created_at,n.payload_json,d.id device_id,d.push_token
    FROM CrmNotificationRecipients r
    JOIN CrmNotifications n ON n.id=r.notification_id AND n.tenant_id=r.tenant_id
    JOIN CrmDevices d ON d.tenant_id=r.tenant_id AND d.user_id=r.recipient_id AND d.notifications_enabled=1
    JOIN CrmSessions s ON s.id=d.session_id AND s.user_id=d.user_id AND s.revoked_at IS NULL
      AND (s.persistent=1 OR s.expires_at>?)
    JOIN CrmUsers u ON u.id=r.recipient_id AND u.id=d.user_id AND u.tenant_id=r.tenant_id AND u.active=1
    JOIN CrmTenants t ON t.id=r.tenant_id AND t.suspended=0
    WHERE r.tenant_id=? AND r.notification_id=? AND r.recipient_id=? AND r.created_at=?
    ORDER BY d.id LIMIT 5`).bind(at, row.tenant_id, row.notification_id, row.recipient_id, row.created_at).all();
}

export async function processPushBatch(db, { env, tenantId, cursor = null, limit = PAGE_SIZE, now = new Date(), fetchImpl, send = sendFcmMessage } = {}) {
  requireDb(db); if (!tenantId) throw new TypeError('push_tenant_required');
  const at = nowIso(now);
  if (env?.CRM_PUSH_ENABLED !== 'true') return { enabled: false, processed: 0, next_cursor: cursor };
  try { fcmConfig(env, tenantId); } catch (error) {
    return { enabled: false, configured: false, processed: 0, reason: error?.message || 'push_configuration_unavailable', next_cursor: cursor };
  }
  const { current, initialized } = await ensureCursor(db, tenantId, at);
  if (initialized && !cursor) return { enabled: true, baseline_initialized: true, processed: 0, next_cursor: `${current.cursor_created_at}|${current.cursor_notification_id}|${current.cursor_recipient_id}` };
  const currentCursor = cursor || `${current.cursor_created_at}|${current.cursor_notification_id}|${current.cursor_recipient_id}`;
  const [cursorCreated, cursorId, cursorRecipient] = String(currentCursor).split('|');
  if (!cursorCreated || cursorId === undefined || cursorRecipient === undefined) throw new TypeError('push_cursor_invalid');
  const rows = (await db.prepare(`SELECT r.tenant_id,r.notification_id,r.recipient_id,r.created_at
    FROM CrmNotificationRecipients r JOIN CrmNotifications n ON n.id=r.notification_id AND n.tenant_id=r.tenant_id
    WHERE r.tenant_id=? AND (r.created_at>? OR (r.created_at=? AND r.notification_id>?) OR (r.created_at=? AND r.notification_id=? AND r.recipient_id>?))
    ORDER BY r.created_at,r.notification_id,r.recipient_id LIMIT ?`).bind(tenantId, cursorCreated, cursorCreated, cursorId, cursorCreated, cursorId, cursorRecipient, size(limit) + 1).all()).results || [];
  const page = rows.slice(0, size(limit));
  const summary = { enabled: true, baseline_initialized: false, processed: 0, accepted: 0, failed: 0, unknown: 0, skipped: 0 };
  for (const row of page) {
    const live = await liveCandidate(db, row, at);
    for (const device of live.results || []) {
      const idempotencyKey = `${row.notification_id}:${row.recipient_id}:${device.device_id}`;
      const receiptId = pushId();
      const inserted = await db.prepare(`INSERT OR IGNORE INTO CrmPushReceipts
        (id,tenant_id,notification_id,recipient_id,device_id,idempotency_key,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?, 'sending',?,?)`).bind(receiptId, tenantId, row.notification_id, row.recipient_id, device.device_id, idempotencyKey, at, at).run();
      if (!inserted.meta?.changes) { summary.skipped += 1; continue; }
      summary.processed += 1;
      let result;
      try {
        result = await send(env, {
          tenantId, token: device.push_token, notificationId: row.notification_id, fetchImpl, now: new Date(now).getTime(),
          beforeSend: async () => (await liveCandidate(db, row, at)).results.some((candidate) => candidate.device_id === device.device_id && candidate.push_token === device.push_token),
        });
      } catch { result = { accepted: false, unknown: true, errorCode: 'delivery_unknown' }; }
      const status = result?.accepted === true ? 'accepted' : (result?.unknown ? 'unknown' : 'failed');
      if (status === 'accepted') summary.accepted += 1;
      else if (status === 'unknown') summary.unknown += 1;
      else summary.failed += 1;
      const errorCode = status === 'unknown' ? 'delivery_unknown' : (result?.errorCode === 'push_authorization_changed' ? 'push_authorization_changed' : status === 'failed' ? 'provider_rejected' : null);
      await db.prepare("UPDATE CrmPushReceipts SET status=?,provider_message_name=?,error_code=?,updated_at=? WHERE id=? AND status='sending'")
        .bind(status, result?.messageName || null, errorCode, at, receiptId).run();
    }
  }
  const last = page.at(-1);
  const next = last ? `${last.created_at}|${last.notification_id}|${last.recipient_id}` : currentCursor;
  await db.prepare(`UPDATE CrmPushCursors SET cursor_created_at=?,cursor_notification_id=?,cursor_recipient_id=?,updated_at=? WHERE tenant_id=?`)
    .bind(last?.created_at || cursorCreated, last?.notification_id || cursorId, last?.recipient_id || cursorRecipient, at, tenantId).run();
  return { ...summary, next_cursor: rows.length > page.length ? next : null };
}

export async function pushCursor(db, tenantId) {
  requireDb(db); return db.prepare('SELECT * FROM CrmPushCursors WHERE tenant_id=?').bind(tenantId).first();
}
