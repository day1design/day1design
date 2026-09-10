import {
  buildInternalNotification,
  buildAppointmentOutboxKey,
  dailyBriefingDueAt,
  previewReminderMessage,
  revalidateReminderExecution,
  snapshotStaffAudience,
} from "./crm-notifications.js";
import { hashToken } from "./crm-auth.js";

const MAX_PAGE = 100;
const TEMPLATE_KINDS = new Set(["visit", "measurement"]);
const TEMPLATE_STATES = new Set(["draft", "approved"]);
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const nowIso = (value) => new Date(value ?? Date.now()).toISOString();

function actorFor(actor) {
  if (!actor || typeof actor.id !== "string" || typeof actor.tenant_id !== "string") throw new TypeError("authenticated actor required");
  if (!["owner", "staff"].includes(actor.role)) throw new TypeError("authenticated actor role required");
  return actor;
}
function owner(actor) { if (actorFor(actor).role !== "owner") throw new Error("owner_required"); return actor; }
function isSupportActor(actor) {
  return actor?.role === "owner"
    && actor?.support_mode === "admin"
    && actor?.support_readonly === true
    && typeof actor?.support_session_id === "string"
    && typeof actor?.token === "string"
    && actor.token.startsWith("crm_support_");
}
async function liveActor(db, actor) {
  const a = actorFor(actor);
  if (isSupportActor(a)) {
    const row = await db.prepare(`SELECT s.id,s.tenant_id,s.actor_id
      FROM CrmSupportSessions s
      JOIN CrmTenants target ON target.id=s.tenant_id
      JOIN CrmUsers platform_actor ON platform_actor.id=s.actor_id
      WHERE s.id=? AND s.token_hash=? AND s.tenant_id=? AND s.actor_id=?
        AND s.revoked_at IS NULL AND s.expires_at>?
        AND target.suspended=0
        AND platform_actor.tenant_id='platform' AND platform_actor.role='owner' AND platform_actor.active=1`)
      .bind(a.support_session_id, await hashToken(a.token), a.tenant_id, a.id, nowIso()).first();
    if (!row) throw new Error("actor_inactive");
    return a;
  }
  const row = await db.prepare("SELECT u.id,u.tenant_id,u.role,u.active,t.suspended FROM CrmUsers u JOIN CrmTenants t ON t.id=u.tenant_id WHERE u.id=? AND u.tenant_id=?").bind(a.id, a.tenant_id).first();
  if (!row || row.active !== 1 || row.suspended === 1 || row.role !== a.role) throw new Error("actor_inactive");
  return a;
}
async function liveOwner(db, actor) { const a = await liveActor(db, actor); if (a.role !== "owner") throw new Error("owner_required"); return a; }
function pageSize(limit) { return Math.max(1, Math.min(MAX_PAGE, Number.isInteger(limit) ? limit : 50)); }
function json(value) { return JSON.stringify(value && typeof value === "object" ? value : {}); }

function allowlisted(env, email) { return String(env?.CRM_PLATFORM_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).includes(String(email || '').trim().toLowerCase()); }
async function requirePlatformAllowlist(db, actor, env) { if (actor.tenant_id !== 'platform') return; const row = await db.prepare("SELECT email FROM CrmUsers WHERE id=? AND tenant_id='platform' AND role='owner' AND active=1").bind(actor.id).first(); if (!row || !allowlisted(env, row.email)) throw new Error('platform_access_required'); }

export async function createInternalNotification(db, { actor, type, mode = "all", recipientIds = [], payload = {}, createdAt } = {}) {
  const a = await liveOwner(db, actor);
  const members = (await db.prepare("SELECT id, tenant_id AS tenantId, email, role, active FROM CrmUsers WHERE tenant_id = ? AND active = 1 ORDER BY id LIMIT 101").bind(a.tenant_id).all()).results ?? [];
  if (members.length > 100) throw new Error("notification_audience_too_large");
  const audience = snapshotStaffAudience({ tenantId: a.tenant_id, members, mode, recipientIds });
  if (audience.length === 0) throw new Error("notification_audience_empty");
  const notification = buildInternalNotification({ tenantId: a.tenant_id, type, actorId: a.id, audience, payload, createdAt });
  const notificationId = id("crm_ntf");
  const created = notification.createdAt;
  const stmts = [db.prepare("INSERT INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at) VALUES(?,?,?,?,?,?)").bind(notificationId, a.tenant_id, notification.type, a.id, json(notification.payload), created)];
  for (const recipient of audience) stmts.push(db.prepare("INSERT INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) VALUES(?,?,?,?)").bind(notificationId, a.tenant_id, recipient.id, created));
  await db.batch(stmts);
  return { id: notificationId, tenant_id: a.tenant_id, type: notification.type, actor_id: a.id, audience: audience.map((x) => x.id), payload: notification.payload, created_at: created };
}

export async function listMyNotifications(db, { actor, env, cursor = null, limit = 50 } = {}) {
  const a = await liveActor(db, actor); const size = pageSize(limit);
  await requirePlatformAllowlist(db, a, env);
  const relayAccess = a.tenant_id === 'platform' ? `AND (NOT EXISTS (SELECT 1 FROM CrmPlatformNotificationRelays pr WHERE pr.relay_notification_id=n.id) OR EXISTS (SELECT 1 FROM CrmPlatformNotificationRelays pr JOIN CrmPlatformNotificationSubscriptions ps ON ps.id=pr.subscription_id JOIN CrmTenants st ON st.id=pr.source_tenant_id WHERE pr.relay_notification_id=n.id AND ps.platform_user_id=? AND ps.enabled=1 AND st.suspended=0))` : '';
  const inbox = await db.prepare("SELECT i.last_read_notification_id,n.created_at AS last_read_created_at FROM CrmNotificationReadAll i LEFT JOIN CrmNotifications n ON n.id=i.last_read_notification_id AND n.tenant_id=i.tenant_id WHERE i.tenant_id=? AND i.user_id=?").bind(a.tenant_id, a.id).first();
  const args = [a.tenant_id, a.id]; if (a.tenant_id === 'platform') args.push(a.id); let where = `r.tenant_id = ? AND r.recipient_id = ? ${relayAccess}`;
  if (cursor) {
    const cursorArgs = [cursor, a.tenant_id, a.id]; if (a.tenant_id === 'platform') cursorArgs.push(a.id);
    const cursorRow = await db.prepare(`SELECT r.created_at FROM CrmNotifications n JOIN CrmNotificationRecipients r ON r.notification_id=n.id WHERE n.id=? AND r.tenant_id=? AND r.recipient_id=? ${relayAccess}`).bind(...cursorArgs).first();
    if (!cursorRow) throw new Error("notification_cursor_invalid");
    where += " AND (r.created_at < ? OR (r.created_at = ? AND r.notification_id < ?))"; args.push(cursorRow.created_at, cursorRow.created_at, cursor);
  }
  const result = await db.prepare(`SELECT n.id,n.type,n.actor_id,n.payload_json,n.created_at,r.read_at FROM CrmNotifications n JOIN CrmNotificationRecipients r ON r.notification_id=n.id WHERE ${where} ORDER BY r.created_at DESC,r.notification_id DESC LIMIT ?`).bind(...args, size + 1).all();
  const rows = result.results ?? []; const next = rows.length > size ? rows[size - 1].id : null;
  return { notifications: rows.slice(0, size).map((r) => ({ ...r, payload: JSON.parse(r.payload_json || "{}"), unread: r.read_at == null && !(inbox?.last_read_created_at && (r.created_at < inbox.last_read_created_at || (r.created_at === inbox.last_read_created_at && r.id <= inbox.last_read_notification_id))) })), next_cursor: next };
}

export async function getMyNotification(db, { actor, env, notificationId } = {}) {
  const a = await liveActor(db, actor);
  await requirePlatformAllowlist(db, a, env);
  if (typeof notificationId !== "string" || !notificationId) throw new TypeError("notificationId required");
  const relayAccess = a.tenant_id === 'platform' ? `AND (NOT EXISTS (SELECT 1 FROM CrmPlatformNotificationRelays pr WHERE pr.relay_notification_id=n.id) OR EXISTS (SELECT 1 FROM CrmPlatformNotificationRelays pr JOIN CrmPlatformNotificationSubscriptions ps ON ps.id=pr.subscription_id JOIN CrmTenants st ON st.id=pr.source_tenant_id WHERE pr.relay_notification_id=n.id AND ps.platform_user_id=? AND ps.enabled=1 AND st.suspended=0))` : '';
  const rowArgs = [notificationId, a.tenant_id, a.id]; if (a.tenant_id === 'platform') rowArgs.push(a.id);
  const row = await db.prepare(`SELECT n.id,n.type,n.actor_id,n.payload_json,n.created_at,r.read_at FROM CrmNotifications n JOIN CrmNotificationRecipients r ON r.notification_id=n.id WHERE n.id=? AND r.tenant_id=? AND r.recipient_id=? ${relayAccess}`).bind(...rowArgs).first();
  if (!row) throw new Error("notification_not_found");
  const inbox = await db.prepare("SELECT i.last_read_notification_id,n.created_at AS last_read_created_at FROM CrmNotificationReadAll i LEFT JOIN CrmNotifications n ON n.id=i.last_read_notification_id AND n.tenant_id=i.tenant_id WHERE i.tenant_id=? AND i.user_id=?").bind(a.tenant_id, a.id).first();
  const watermarked = inbox?.last_read_created_at && (row.created_at < inbox.last_read_created_at || (row.created_at === inbox.last_read_created_at && row.id <= inbox.last_read_notification_id));
  return { ...row, payload: JSON.parse(row.payload_json || "{}"), unread: row.read_at == null && !watermarked };
}

export async function markNotificationRead(db, { actor, env, notificationId, readAt } = {}) {
  const a = await liveActor(db, actor); await requirePlatformAllowlist(db, a, env); if (typeof notificationId !== "string" || !notificationId) throw new TypeError("notificationId required");
  const at = nowIso(readAt); const relayAccess = a.tenant_id === 'platform' ? `AND (NOT EXISTS (SELECT 1 FROM CrmPlatformNotificationRelays pr WHERE pr.relay_notification_id=CrmNotificationRecipients.notification_id) OR EXISTS (SELECT 1 FROM CrmPlatformNotificationRelays pr JOIN CrmPlatformNotificationSubscriptions ps ON ps.id=pr.subscription_id JOIN CrmTenants st ON st.id=pr.source_tenant_id WHERE pr.relay_notification_id=CrmNotificationRecipients.notification_id AND ps.platform_user_id=? AND ps.enabled=1 AND st.suspended=0))` : '';
  const readArgs = [at, notificationId, a.tenant_id, a.id]; if (a.tenant_id === 'platform') readArgs.push(a.id);
  const result = await db.prepare(`UPDATE CrmNotificationRecipients SET read_at = ? WHERE notification_id = ? AND tenant_id = ? AND recipient_id = ? ${relayAccess}`).bind(...readArgs).run();
  if (!result.meta?.changes) throw new Error("notification_not_found");
  return { notification_id: notificationId, read_at: at };
}

export async function markAllNotificationsRead(db, { actor, env, readAt } = {}) {
  const a = await liveActor(db, actor);
  await requirePlatformAllowlist(db,a,env);
  const at = nowIso(readAt);
  const latest = await db.prepare("SELECT n.id,n.created_at FROM CrmNotifications n JOIN CrmNotificationRecipients r ON r.notification_id=n.id AND r.tenant_id=n.tenant_id WHERE r.tenant_id=? AND r.recipient_id=? ORDER BY r.created_at DESC,r.notification_id DESC LIMIT 1").bind(a.tenant_id, a.id).first();
  const current = await db.prepare("SELECT i.last_read_notification_id,n.created_at FROM CrmNotificationReadAll i LEFT JOIN CrmNotifications n ON n.id=i.last_read_notification_id AND n.tenant_id=i.tenant_id WHERE i.tenant_id=? AND i.user_id=?").bind(a.tenant_id, a.id).first();
  const latestIsNewer = latest && (!current?.created_at || latest.created_at > current.created_at || (latest.created_at === current.created_at && latest.id > current.last_read_notification_id));
  const watermarkId = latestIsNewer ? latest.id : (current?.last_read_notification_id ?? null);
  await db.prepare("INSERT INTO CrmNotificationReadAll(tenant_id,user_id,last_read_notification_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET last_read_notification_id=excluded.last_read_notification_id,updated_at=excluded.updated_at").bind(a.tenant_id, a.id, watermarkId, at).run();
  return { notification_id: watermarkId, read_at: at };
}

export async function upsertNotificationTemplate(db, { actor, kind, state = "draft", body, enabled = false, updatedAt } = {}) {
  const a = await liveOwner(db, actor); if (!TEMPLATE_KINDS.has(kind) || state !== "draft") throw new TypeError("only draft templates are writable");
  if (typeof body !== "string" || !body.trim()) throw new TypeError("template body required"); const at = nowIso(updatedAt);
  await db.prepare("INSERT INTO CrmNotificationTemplates(tenant_id,kind,state,body,enabled,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant_id,kind,state) DO UPDATE SET body=excluded.body,enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(a.tenant_id, kind, state, body.trim(), enabled === true ? 1 : 0, a.id, at).run();
  return { tenant_id: a.tenant_id, kind, state, body: body.trim(), enabled: enabled === true, updated_by: a.id, updated_at: at };
}
export async function listNotificationTemplates(db, { actor } = {}) {
  const a = await liveActor(db, actor); const rows = (await db.prepare("SELECT kind,state,body,enabled,updated_by,updated_at FROM CrmNotificationTemplates WHERE tenant_id=? ORDER BY kind,state").bind(a.tenant_id).all()).results ?? [];
  return rows.map((r) => ({ ...r, enabled: r.enabled === 1 }));
}
export function previewNotificationTemplate(input) {
  const preview = previewReminderMessage(input);
  if (typeof input?.body !== "string" || !input.body.trim()) return preview;
  const values = preview.variables;
  return { ...preview, text: input.body.trim().replace(/\{\{(name|date|time|location|address|phone|map)\}\}/g, (_, key) => values[key] ?? "") };
}

export async function enqueueAppointmentReminder(db, { actor, appointment, notificationType, recipientId = "customer", channel = "customer", dueAt, payload = {}, createdAt } = {}) {
  const a = await liveOwner(db, actor);
  const live = await db.prepare("SELECT a.id,a.tenant_id,a.CrmVersion AS crm_version,a.status,a.starts_at FROM CrmAppointments a WHERE a.id=? AND a.tenant_id=?").bind(appointment?.id, a.tenant_id).first();
  if (!live) throw new Error("appointment_not_found");
  if (live.status !== "scheduled" && live.status !== "confirmed" && live.status !== "booked") throw new Error("reservation_inactive");
  const version = live.crm_version; if (!Number.isInteger(version) || version < 1) throw new TypeError("appointment version required");
  const key = buildAppointmentOutboxKey({ tenantId: a.tenant_id, appointmentId: appointment.id, appointmentVersion: version, notificationType, recipientId, channel }); const at = nowIso(createdAt); const due = nowIso(dueAt);
  const outboxId = id("crm_out");
  await db.prepare("INSERT OR IGNORE INTO CrmNotificationOutbox(id,tenant_id,appointment_id,appointment_version,notification_type,recipient_id,channel,idempotency_key,due_at,status,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?,?, 'queued', ?,?)").bind(outboxId,a.tenant_id,appointment.id,version,notificationType,recipientId,channel,key,due,json(payload),at).run();
  const row = await db.prepare("SELECT * FROM CrmNotificationOutbox WHERE idempotency_key=?").bind(key).first(); return { ...row, payload: JSON.parse(row.payload_json || "{}") };
}

export async function cancelStaleAppointmentReminders(db, { actor, appointmentId, currentVersion, cancelledAt } = {}) {
  const a = await liveOwner(db, actor); if (!Number.isInteger(currentVersion) || currentVersion < 1) throw new TypeError("current version required"); const at = nowIso(cancelledAt);
  const appointment = await db.prepare("SELECT CrmVersion AS crm_version FROM CrmAppointments WHERE id=? AND tenant_id=?").bind(appointmentId, a.tenant_id).first();
  if (!appointment || appointment.crm_version !== currentVersion) return { cancelled: 0 };
  const result = await db.prepare("UPDATE CrmNotificationOutbox SET status='cancelled',cancelled_at=? WHERE tenant_id=? AND appointment_id=? AND appointment_version<>? AND status IN ('queued','reserved')").bind(at,a.tenant_id,appointmentId,currentVersion).run(); return { cancelled: result.meta?.changes ?? 0 };
}
export async function reserveDueReminder(db, { actor, outboxId, expectedVersion, reservedAt } = {}) {
  const a = await liveOwner(db, actor); const at = nowIso(reservedAt); if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("expected version required");
  const appointment = await db.prepare("SELECT status,CrmVersion AS crm_version FROM CrmAppointments a WHERE a.id=(SELECT appointment_id FROM CrmNotificationOutbox WHERE id=? AND tenant_id=?) AND a.tenant_id=?").bind(outboxId,a.tenant_id,a.tenant_id).first();
  if (!appointment || !["scheduled", "confirmed", "booked"].includes(appointment.status) || appointment.crm_version !== expectedVersion) return null;
  const result = await db.prepare("UPDATE CrmNotificationOutbox SET status='reserved',reserved_at=? WHERE id=? AND tenant_id=? AND appointment_version=? AND status='queued' AND due_at<=?").bind(at,outboxId,a.tenant_id,expectedVersion,at).run(); if (!result.meta?.changes) return null; return db.prepare("SELECT * FROM CrmNotificationOutbox WHERE id=? AND tenant_id=?").bind(outboxId,a.tenant_id).first();
}
export async function revalidateReservedReminder(db, { actor, outboxId, appointment, channelEnabled, now } = {}) {
  const a = await liveOwner(db, actor); const row = await db.prepare("SELECT * FROM CrmNotificationOutbox WHERE id=? AND tenant_id=? AND status='reserved'").bind(outboxId,a.tenant_id).first(); if (!row) return { ok: false, reason: "outbox_not_reserved" };
  const live = await db.prepare("SELECT t.id AS tenant_id,t.suspended,u.active AS user_active,a.id AS appointment_id,a.starts_at,a.status,a.kind,a.tenant_id AS appointment_tenant_id,a.CrmVersion AS crm_version FROM CrmTenants t JOIN CrmUsers u ON u.tenant_id=t.id JOIN CrmAppointments a ON a.tenant_id=t.id WHERE t.id=? AND u.id=? AND a.id=?").bind(a.tenant_id, a.id, row.appointment_id).first();
  if (!live || live.user_active !== 1 || live.suspended === 1) return { ok: false, reason: "tenant_inactive" };
  const result = revalidateReminderExecution({ tenant: { id: live.tenant_id, suspended: live.suspended === 1 }, appointment: { tenantId: live.appointment_tenant_id, version: live.crm_version, startsAt: live.starts_at, status: live.status }, expectedVersion: row.appointment_version, channelEnabled, now });
  if (!result.ok) await db.prepare("UPDATE CrmNotificationOutbox SET status='cancelled',cancelled_at=? WHERE id=? AND tenant_id=? AND status='reserved'").bind(nowIso(now),outboxId,a.tenant_id).run(); return result;
}
export async function markReminderSent(db, { actor, outboxId, sentAt, dispatchResult } = {}) { const a = await liveOwner(db, actor); if (dispatchResult?.accepted !== true) throw new Error("dispatch_receipt_required"); const at = nowIso(sentAt); const r = await db.prepare("UPDATE CrmNotificationOutbox SET status='sent',sent_at=? WHERE id=? AND tenant_id=? AND status='reserved'").bind(at,outboxId,a.tenant_id).run(); if (!r.meta?.changes) throw new Error("outbox_not_reserved"); return { id: outboxId, status: "sent", sent_at: at }; }

export async function ensureDailyBriefing(db, { actor, date, notificationId = null, createdAt } = {}) {
  const a = await liveOwner(db, actor); const due = dailyBriefingDueAt(date); const at = nowIso(createdAt ?? due); const briefingId = id("crm_brief"); await db.prepare("INSERT OR IGNORE INTO CrmDailyBriefings(id,tenant_id,recipient_id,briefing_date,notification_id,created_at) VALUES(?,?,?,?,?,?)").bind(briefingId,a.tenant_id,a.id,date,notificationId,at).run(); return db.prepare("SELECT * FROM CrmDailyBriefings WHERE tenant_id=? AND recipient_id=? AND briefing_date=?").bind(a.tenant_id,a.id,date).first();
}
