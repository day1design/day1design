import { readCrmAnalytics, composeBriefing } from './crm-analytics.js';
import { buildInternalNotification, dailyBriefingDueAt, revalidateReminderExecution } from './crm-notifications.js';

export const AUTOMATION_PAGE_SIZE = 50;
export const DELIVERY_BLOCKED = 'delivery_adapter_missing';
const ACTIVE_STATUSES = new Set(['scheduled', 'confirmed', 'booked']);
const iso = (value = Date.now()) => new Date(value).toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const json = (value) => JSON.stringify(value && typeof value === 'object' ? value : {});

function requireDb(db) { if (!db?.prepare) throw new TypeError('automation_db_required'); return db; }
function dateOnly(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`))) throw new TypeError('automation_date_required');
  return text;
}
export function appointmentReminderType(kind) {
  if (kind === 'visit') return 'visit_reminder';
  if (kind === 'measurement') return 'measurement_reminder';
  throw new TypeError('appointment_kind_required');
}
export function appointmentAutomationKey({ tenantId, appointmentId, version, kind }) {
  if (!tenantId || !appointmentId || !Number.isInteger(version) || version < 1) throw new TypeError('appointment_automation_key_required');
  return `${tenantId}:${appointmentId}:${version}:${appointmentReminderType(kind)}:customer:customer`;
}
export async function enqueueAppointmentReminder(db, { tenantId, appointmentId, version, kind, startsAt, createdAt = new Date(), payload = {} } = {}) {
  requireDb(db); const starts = new Date(startsAt);
  if (!tenantId || !appointmentId || !Number.isInteger(version) || version < 1 || !Number.isFinite(starts.getTime())) throw new TypeError('appointment_reminder_input_required');
  const type = appointmentReminderType(kind); const key = appointmentAutomationKey({ tenantId, appointmentId, version, kind });
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime())) throw new TypeError('appointment_created_at_required');
  const dueDate = new Date(starts.getTime() - 10800000);
  const shortNotice = created.getTime() >= dueDate.getTime();
  await db.prepare(`INSERT OR IGNORE INTO CrmNotificationOutbox
    (id,tenant_id,appointment_id,appointment_version,notification_type,recipient_id,channel,idempotency_key,due_at,status,payload_json,created_at,delivery_status,blocked_reason)
    VALUES(?,?,?,?,?,?,?,?,?,'queued',?,?,?,?)`).bind(id('crm_auto'), tenantId, appointmentId, version, type, 'customer', 'customer', key, dueDate.toISOString(), json(payload), iso(created), shortNotice ? 'blocked' : 'pending', shortNotice ? 'short_notice_manual_review' : null).run();
  return db.prepare('SELECT * FROM CrmNotificationOutbox WHERE idempotency_key=?').bind(key).first();
}
export async function invalidateAppointmentAutomation(db, { tenantId, appointmentId, currentVersion, reason = 'appointment_version_changed', at = new Date() } = {}) {
  requireDb(db); if (!tenantId || !appointmentId || !Number.isInteger(currentVersion) || currentVersion < 1) throw new TypeError('appointment_invalidation_input_required');
  const result = await db.prepare(`UPDATE CrmNotificationOutbox SET status='cancelled',invalidated_at=?,blocked_reason=? WHERE tenant_id=? AND appointment_id=? AND appointment_version<>? AND status IN ('queued','reserved')`).bind(iso(at), reason, tenantId, appointmentId, currentVersion).run();
  return { cancelled: result.meta?.changes ?? 0 };
}
async function liveReminder(db, row, now) {
  const live = await db.prepare(`SELECT t.id AS tenant_id,t.suspended,a.id,a.kind,a.starts_at,a.status,a.CrmVersion AS version,
      CASE WHEN a.kind='measurement' THEN mt.enabled ELSE vt.enabled END AS template_enabled
    FROM CrmAppointments a JOIN CrmTenants t ON t.id=a.tenant_id
    LEFT JOIN CrmNotificationTemplates vt ON vt.tenant_id=a.tenant_id AND vt.kind='visit' AND vt.state='approved'
    LEFT JOIN CrmNotificationTemplates mt ON mt.tenant_id=a.tenant_id AND mt.kind='measurement' AND mt.state='approved'
    WHERE a.id=? AND a.tenant_id=?`).bind(row.appointment_id, row.tenant_id).first();
  if (!live || live.suspended === 1) return { ok: false, reason: 'tenant_suspended' };
  if (row.blocked_reason === 'short_notice_manual_review' || row.blocked_reason === 'delivery_unknown') return { ok: false, reason: row.blocked_reason };
  if (!ACTIVE_STATUSES.has(live.status)) return { ok: false, reason: 'appointment_inactive' };
  if (live.version !== row.appointment_version) return { ok: false, reason: 'appointment_version_changed' };
  if (live.template_enabled !== 1) return { ok: false, reason: 'template_disabled' };
  return revalidateReminderExecution({ tenant: { id: live.tenant_id }, appointment: { tenantId: live.tenant_id, status: live.status, version: live.version, startsAt: live.starts_at }, expectedVersion: row.appointment_version, channelEnabled: true, now });
}
async function block(db, row, reason) {
  await db.prepare(`UPDATE CrmNotificationOutbox SET delivery_status='blocked',blocked_reason=? WHERE id=? AND tenant_id=? AND status='queued' AND delivery_status<>'sent'`).bind(reason, row.id, row.tenant_id).run();
  return { id: row.id, status: 'blocked', reason };
}
export async function runAppointmentAutomation(db, { now = new Date(), deliveryAdapter = null, limit = AUTOMATION_PAGE_SIZE, tenantId = null, cursor = null, minimumDueAt = null } = {}) {
  requireDb(db); const at = iso(now); const size = Math.max(1, Math.min(AUTOMATION_PAGE_SIZE, Number(limit) || AUTOMATION_PAGE_SIZE)); const args = [at];
  if (!tenantId) throw new TypeError('automation_tenant_required');
  let where = `o.status='queued' AND o.due_at<=? AND (o.delivery_status='pending' OR (o.delivery_status='blocked' AND o.blocked_reason='delivery_adapter_missing')) AND o.tenant_id=?`;
  args.push(tenantId);
  if (minimumDueAt) { where += ' AND o.due_at>=?'; args.push(iso(minimumDueAt)); }
  if (cursor) { const [cursorDue, cursorId] = String(cursor).split('|'); if (!cursorDue || !cursorId) throw new TypeError('automation_cursor_required'); where += ' AND (o.due_at>? OR (o.due_at=? AND o.id>?))'; args.push(cursorDue, cursorDue, cursorId); }
  const rows = (await db.prepare(`SELECT o.* FROM CrmNotificationOutbox o WHERE ${where} ORDER BY o.due_at,o.id LIMIT ?`).bind(...args, size + 1).all()).results || [];
  const results = [];
  for (const row of rows.slice(0, size)) {
    const check = await liveReminder(db, row, now);
    if (!check.ok) { await db.prepare(`UPDATE CrmNotificationOutbox SET status='cancelled',invalidated_at=?,blocked_reason=? WHERE id=? AND tenant_id=? AND status='queued'`).bind(at, check.reason, row.id, row.tenant_id).run(); results.push({ id: row.id, status: 'cancelled', reason: check.reason }); continue; }
    if (!deliveryAdapter || typeof deliveryAdapter.send !== 'function') { results.push(await block(db, row, DELIVERY_BLOCKED)); continue; }
    const reserved = await db.prepare(`UPDATE CrmNotificationOutbox SET status='reserved',reserved_at=?,delivery_status='pending' WHERE id=? AND tenant_id=? AND status='queued' AND appointment_version=? AND due_at<=?`).bind(at, row.id, row.tenant_id, row.appointment_version, at).run();
    if (!reserved.meta?.changes) continue;
    const finalCheck = await liveReminder(db, row, now);
    if (!finalCheck.ok) { await db.prepare(`UPDATE CrmNotificationOutbox SET status='cancelled',invalidated_at=?,blocked_reason=? WHERE id=? AND tenant_id=? AND status='reserved'`).bind(at, finalCheck.reason, row.id, row.tenant_id).run(); results.push({ id: row.id, status: 'cancelled', reason: finalCheck.reason }); continue; }
    const current = await db.prepare(`SELECT a.starts_at,a.location,a.address,e.Name AS name,e.Phone AS phone,e.Email AS email,CASE WHEN a.kind='measurement' THEN mt.body ELSE vt.body END AS template_body FROM CrmAppointments a JOIN Estimates e ON e.id=a.estimate_id AND e.CrmTenantId=a.tenant_id LEFT JOIN CrmNotificationTemplates vt ON vt.tenant_id=a.tenant_id AND vt.kind='visit' AND vt.state='approved' LEFT JOIN CrmNotificationTemplates mt ON mt.tenant_id=a.tenant_id AND mt.kind='measurement' AND mt.state='approved' WHERE a.id=? AND a.tenant_id=?`).bind(row.appointment_id, row.tenant_id).first();
    const basePayload = JSON.parse(row.payload_json || '{}');
    const sendPayload = { ...basePayload, name: current?.name || '', phone: current?.phone || '', email: current?.email || '', starts_at: current?.starts_at || '', location: current?.location || '', address: current?.address || '', map: basePayload.map || basePayload.map_url || '', template_body: current?.template_body || '' };
    let receipt; try { receipt = await deliveryAdapter.send({ ...row, idempotency_key: row.idempotency_key, payload: sendPayload }); } catch { receipt = null; }
    if (receipt?.accepted !== true) { const reason = receipt?.reason || 'delivery_unknown'; await db.prepare(`UPDATE CrmNotificationOutbox SET status='queued',delivery_status='blocked',blocked_reason=? WHERE id=? AND tenant_id=? AND status='reserved'`).bind(reason, row.id, row.tenant_id).run(); results.push({ id: row.id, status: 'blocked', reason }); continue; }
    const receiptPayload = receipt?.requestId ? { provider: receipt.provider || 'customer-delivery', request_id: receipt.requestId, status_code: receipt.statusCode || null, accepted_at: at } : null;
    const persistedPayload = receiptPayload ? JSON.stringify({ ...sendPayload, delivery_receipt: receiptPayload }) : row.payload_json;
    await db.prepare(`UPDATE CrmNotificationOutbox SET status='sent',sent_at=?,delivery_status='sent',blocked_reason=NULL,payload_json=? WHERE id=? AND tenant_id=? AND status='reserved'`).bind(at, persistedPayload, row.id, row.tenant_id).run(); results.push({ id: row.id, status: 'sent', receipt: receiptPayload });
  }
  return { processed: results.length, results, next_cursor: rows.length > size ? `${rows[size - 1].due_at}|${rows[size - 1].id}` : null };
}
export async function createNewCustomerNotification(db, { tenantId, actorId, estimateId, payload = {}, createdAt = new Date() } = {}) {
  requireDb(db); if (!tenantId || !actorId || !estimateId) throw new TypeError('new_customer_input_required');
  const source = await db.prepare('SELECT id,Name,Phone,Email,Address,EstimateAmount,CrmTenantId FROM Estimates WHERE id=? AND CrmTenantId=?').bind(estimateId, tenantId).first();
  if (!source) return { created: false, reason: 'estimate_not_found' };
  const actor = await db.prepare("SELECT id FROM CrmUsers WHERE id=? AND tenant_id=? AND role='owner' AND active=1").bind(actorId, tenantId).first();
  const tenant = await db.prepare('SELECT id FROM CrmTenants WHERE id=? AND suspended=0').bind(tenantId).first();
  if (!actor || !tenant) return { created: false, reason: 'tenant_or_actor_inactive' };
  const eventKey = `new_customer:${tenantId}:${estimateId}`;
  const existing = await db.prepare('SELECT id FROM CrmNotifications WHERE event_key=?').bind(eventKey).first();
  if (existing) return { created: false, reason: 'already_created', id: existing.id };
  const members = (await db.prepare(`SELECT id,tenant_id,email,role,active FROM CrmUsers WHERE tenant_id=? AND active=1 AND role IN ('owner','staff') ORDER BY id LIMIT 101`).bind(tenantId).all()).results || [];
  const audience = members.slice(0, 100); if (!audience.length) return { created: false, reason: 'no_active_recipients' };
  const notificationId = id('crm_ntf'); const at = iso(createdAt); const notification = buildInternalNotification({ tenantId, type: 'new_customer', actorId, audience, payload: { estimate_id: estimateId, name: source.Name || '', phone: source.Phone || '', email: source.Email || '', address: source.Address || '', budget: source.EstimateAmount || 0, ...payload }, createdAt: at });
  const statements = [db.prepare('INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key) VALUES(?,?,?,?,?,?,?)').bind(notificationId, tenantId, notification.type, actorId, json(notification.payload), at, eventKey)];
  for (const member of audience) statements.push(db.prepare('INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmNotifications WHERE id=?)').bind(notificationId, tenantId, member.id, at, notificationId)); await db.batch(statements);
  return { created: true, id: notificationId, recipients: audience.length };
}
export async function createDailyBriefing(db, { tenantId, recipientId, date, startDate = date, endDate = date, createdAt, now = new Date() } = {}) {
  requireDb(db); const briefingDate = dateOnly(date); if (!tenantId || !recipientId) throw new TypeError('daily_briefing_input_required');
  const recipient = await db.prepare('SELECT u.id FROM CrmUsers u JOIN CrmTenants t ON t.id=u.tenant_id WHERE u.id=? AND u.tenant_id=? AND u.active=1 AND t.suspended=0').bind(recipientId, tenantId).first();
  if (!recipient) throw new Error('briefing_recipient_inactive');
  const due = dailyBriefingDueAt(briefingDate); const atDate = new Date(createdAt ?? now); const nowDate = new Date(now);
  if (!Number.isFinite(atDate.getTime()) || !Number.isFinite(nowDate.getTime()) || nowDate < due) throw new Error('briefing_not_due');
  const facts = await readCrmAnalytics(db, { tenantId, startDate: dateOnly(startDate), endDate: dateOnly(endDate) }); const content = composeBriefing(facts, { runDate: briefingDate }); const notificationId = id('crm_ntf'); const at = iso(atDate);
  const notification = buildInternalNotification({ tenantId, type: 'staff_message', actorId: recipientId, audience: [{ id: recipientId, tenantId }], payload: { kind: 'daily_briefing', date: briefingDate, content }, createdAt: at });
  const existing = await db.prepare('SELECT * FROM CrmDailyBriefings WHERE tenant_id=? AND recipient_id=? AND briefing_date=?').bind(tenantId, recipientId, briefingDate).first();
  if (existing) return existing;
  const markerId = `crm_brief_${tenantId}_${recipientId}_${briefingDate}`;
  const eventKey = `daily_briefing:${tenantId}:${recipientId}:${briefingDate}`;
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key) VALUES(?,?,?,?,?,?,?)').bind(notificationId,tenantId,notification.type,recipientId,json(notification.payload),at,eventKey),
    db.prepare('INSERT OR IGNORE INTO CrmDailyBriefings(id,tenant_id,recipient_id,briefing_date,notification_id,created_at) SELECT ?,?,?,?,id,? FROM CrmNotifications WHERE event_key=?').bind(markerId,tenantId,recipientId,briefingDate,at,eventKey),
    db.prepare('INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) SELECT id,?,?,? FROM CrmNotifications WHERE event_key=?').bind(tenantId,recipientId,at,eventKey)
  ]);
  return db.prepare('SELECT * FROM CrmDailyBriefings WHERE tenant_id=? AND recipient_id=? AND briefing_date=?').bind(tenantId,recipientId,briefingDate).first();
}
