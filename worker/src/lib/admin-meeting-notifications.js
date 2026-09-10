export const MEETING_NOTIFICATION_TYPES = Object.freeze(["created", "day", "hour"]);
export const ADMIN_MEETING_OUTBOX_TABLE = "AdminMeetingOutbox";
export const MEETING_TEMPLATE_VARIABLES = Object.freeze([
  "meeting_name", "type_marker", "date", "start_time", "end_time",
  "buffer_end", "customer_name", "assignee", "location", "calendar_url",
  "detail_url",
]);

const VARIABLE_SET = new Set(MEETING_TEMPLATE_VARIABLES);
const KST = "Asia/Seoul";
const ACTIVE_STATUSES = new Set(["scheduled", "confirmed", "booked", "예약", "예약확정"]);
const COLOR_MARKERS = Object.freeze({ blue: "🟦", green: "🟩", purple: "🟪", orange: "🟧", pink: "🟥", teal: "🔷" });

export async function adminMeetingOutboxAvailable(db) {
  if (!db?.prepare) return false;
  try {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(ADMIN_MEETING_OUTBOX_TABLE).first();
    return row?.name === ADMIN_MEETING_OUTBOX_TABLE;
  } catch { return false; }
}

const asText = (value) => String(value ?? "").trim();
const iso = (value = Date.now()) => new Date(value).toISOString();
const id = (prefix = "meeting_notice") => `${prefix}_${crypto.randomUUID()}`;

function escapeHtml(value) {
  return asText(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);
}

function formatKst(value, options) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, ...options }).format(date);
}

function dateTimeParts(value) {
  return {
    date: formatKst(value, { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }),
    time: formatKst(value, { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function minutesAfter(value, minutes) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + minutes * 60_000).toISOString() : "";
}

export function validateMeetingNotificationSettings(input) {
  const value = input && typeof input === "object" ? input : {};
  const errors = [];
  const allowed = new Set(MEETING_NOTIFICATION_TYPES);
  for (const key of MEETING_NOTIFICATION_TYPES) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`missing_notification:${key}`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`unknown_notification:${key}`);
  const result = {};
  for (const type of MEETING_NOTIFICATION_TYPES) {
    const option = value[type];
    if (!option || typeof option !== "object" || Array.isArray(option)) { errors.push(`${type}_object_required`); continue; }
    for (const key of Object.keys(option)) if (!["enabled", "template"].includes(key)) errors.push(`unknown_${type}_option:${key}`);
    if (typeof option.enabled !== "boolean") errors.push(`${type}.enabled_boolean_required`);
    if (typeof option.template !== "string") errors.push(`${type}.template_string_required`);
    if (typeof option.template === "string" && option.template.length > 2000) errors.push(`${type}.template_too_long`);
    if (typeof option.template === "string") {
      const matches = [...option.template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)];
      const stripped = option.template.replace(/\{\{\s*[a-z_]+\s*\}\}/g, "");
      if (/[{}]/.test(stripped)) errors.push(`${type}.invalid_template_syntax`);
      for (const match of matches) if (!VARIABLE_SET.has(match[1])) errors.push(`unknown_template_variable:${match[1]}`);
    }
    result[type] = { enabled: option.enabled === true, template: asText(option.template) };
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: result };
}

export function meetingNotificationValues(meeting = {}) {
  const start = asText(meeting.startsAt ?? meeting.starts_at ?? meeting.ConsultAt);
  const duration = Number(meeting.durationMinutes ?? meeting.duration_minutes ?? 120);
  const buffer = Number(meeting.bufferMinutes ?? meeting.buffer_minutes ?? 60);
  const startParts = dateTimeParts(start);
  const end = minutesAfter(start, Number.isFinite(duration) ? duration : 120);
  const bufferEnd = minutesAfter(start, (Number.isFinite(duration) ? duration : 120) + (Number.isFinite(buffer) ? buffer : 60));
  return {
    meeting_name: meeting.meetingName ?? meeting.meeting_name ?? meeting.typeName ?? meeting.kindName ?? "",
    type_marker: COLOR_MARKERS[asText(meeting.colorKey ?? meeting.typeMarker ?? meeting.type_marker)] || asText(meeting.typeMarker ?? meeting.type_marker ?? meeting.colorKey),
    date: startParts.date,
    start_time: startParts.time,
    end_time: dateTimeParts(end).time,
    buffer_end: dateTimeParts(bufferEnd).time,
    customer_name: meeting.customerName ?? meeting.customer_name ?? meeting.Name ?? "",
    assignee: meeting.assignee ?? meeting.Assignee ?? "",
    location: meeting.location ?? meeting.ConsultBranch ?? meeting.address ?? "",
    calendar_url: meeting.calendarUrl ?? meeting.calendar_url ?? "",
    detail_url: meeting.detailUrl ?? meeting.detail_url ?? "",
  };
}

export function renderMeetingTemplate(template, meeting, { escape = true } = {}) {
  if (typeof template !== "string") throw new TypeError("template_required");
  const values = meetingNotificationValues(meeting);
  const source = escape ? escapeHtml(template) : template;
  return source.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key) => {
    if (!VARIABLE_SET.has(key)) throw new TypeError(`unknown_template_variable:${key}`);
    return escape ? escapeHtml(values[key]) : asText(values[key]);
  });
}

export function meetingNotificationDueAt(notificationType, startsAt, now = Date.now()) {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) throw new TypeError("starts_at_required");
  if (notificationType === "created") return new Date(Number(now)).toISOString();
  const offset = notificationType === "day" ? 24 * 3600_000 : notificationType === "hour" ? 2 * 3600_000 : 0;
  const due = start - offset;
  return due < Number(now) ? null : new Date(due).toISOString();
}

export function planMeetingNotifications({ meeting, settings, now = Date.now() } = {}) {
  const checked = validateMeetingNotificationSettings(settings);
  if (!checked.ok) throw new TypeError(checked.errors.join(","));
  const version = Number(meeting?.version ?? meeting?.crmVersion ?? meeting?.CrmVersion ?? 1);
  if (!Number.isInteger(version) || version < 1) throw new TypeError("meeting_version_required");
  const tenantId = asText(meeting.tenantId ?? meeting.tenant_id ?? "day1design");
  const meetingId = asText(meeting.id ?? meeting.appointmentId ?? meeting.appointment_id);
  if (!tenantId || !meetingId) throw new TypeError("meeting_identity_required");
  const result = [];
  for (const type of MEETING_NOTIFICATION_TYPES) {
    if (!checked.value[type].enabled) continue;
    const dueAt = meetingNotificationDueAt(type, meeting.startsAt ?? meeting.starts_at ?? meeting.ConsultAt, now);
    if (dueAt) result.push({ type, dueAt, template: checked.value[type].template });
  }
  return result.map((item) => ({ ...item, tenantId, meetingId, version, idempotencyKey: `${tenantId}:${meetingId}:${version}:telegram:${item.type}` }));
}

export async function enqueueMeetingNotifications(db, { meeting, settings, now = Date.now(), payload = {} } = {}) {
  if (!db?.prepare) throw new TypeError("notification_db_required");
  const plans = planMeetingNotifications({ meeting, settings, now });
  const createdAt = iso(now);
  const statements = plans.map((plan) => {
    const outboxId = id();
    return db.prepare(`INSERT OR IGNORE INTO ${ADMIN_MEETING_OUTBOX_TABLE}
      (id,tenant_id,meeting_id,meeting_version,notification_type,idempotency_key,due_at,status,payload_json,attempts,created_at)
      VALUES(?,?,?,?,?,?,?,'queued',?,0,?)`).bind(
      outboxId, plan.tenantId, plan.meetingId, plan.version, plan.type, plan.idempotencyKey,
      plan.dueAt, JSON.stringify({ ...payload, meeting, template: plan.template || "" }), createdAt,
    );
  });
  if (db.batch && statements.length) await db.batch(statements);
  else for (const statement of statements) await statement.run();
  return plans;
}

export async function claimDueMeetingNotifications(db, { tenantId, now = Date.now(), limit = 50 } = {}) {
  if (!db?.prepare || !tenantId) throw new TypeError("notification_identity_required");
  const size = Math.min(Math.max(Number(limit) || 50, 1), 50);
  const rows = (await db.prepare(`SELECT id FROM ${ADMIN_MEETING_OUTBOX_TABLE} WHERE tenant_id=? AND status='queued' AND due_at<=? ORDER BY due_at,id LIMIT ?`).bind(tenantId, iso(now), size).all()).results || [];
  const claimed = [];
  for (const row of rows) {
    const result = await db.prepare(`UPDATE ${ADMIN_MEETING_OUTBOX_TABLE} SET status='reserved',reserved_at=? WHERE id=? AND tenant_id=? AND status='queued' AND due_at<=?`).bind(iso(now), row.id, tenantId, iso(now)).run();
    if (result?.meta?.changes > 0) claimed.push(row.id);
  }
  return claimed;
}

export async function cancelStaleMeetingNotifications(db, { tenantId, meetingId, currentVersion, at = Date.now() } = {}) {
  if (!db?.prepare || !tenantId || !meetingId || !Number.isInteger(currentVersion)) throw new TypeError("notification_identity_required");
  const result = await db.prepare(`UPDATE ${ADMIN_MEETING_OUTBOX_TABLE} SET status='cancelled',cancelled_at=? WHERE tenant_id=? AND meeting_id=? AND meeting_version<>? AND status IN ('queued','reserved')`).bind(iso(at), tenantId, meetingId, currentVersion).run();
  return { cancelled: result?.meta?.changes ?? 0 };
}

export async function reserveMeetingNotification(db, { id: outboxId, tenantId, at = Date.now() } = {}) {
  const result = await db.prepare(`UPDATE ${ADMIN_MEETING_OUTBOX_TABLE} SET status='reserved',reserved_at=? WHERE id=? AND tenant_id=? AND status='queued' AND due_at<=?`).bind(iso(at), outboxId, tenantId, iso(at)).run();
  if (!(result?.meta?.changes > 0)) return null;
  return db.prepare(`SELECT * FROM ${ADMIN_MEETING_OUTBOX_TABLE} WHERE id=? AND tenant_id=?`).bind(outboxId, tenantId).first();
}

export async function markMeetingNotificationSent(db, { id: outboxId, tenantId, dispatchResult, at = Date.now() } = {}) {
  if (dispatchResult?.accepted !== true) throw new Error("dispatch_receipt_required");
  const result = await db.prepare(`UPDATE ${ADMIN_MEETING_OUTBOX_TABLE} SET status='sent',sent_at=?,last_error=NULL WHERE id=? AND tenant_id=? AND status='reserved'`).bind(iso(at), outboxId, tenantId).run();
  if (!(result?.meta?.changes > 0)) throw new Error("outbox_not_reserved");
  return { id: outboxId, status: "sent", sentAt: iso(at) };
}

export async function sendCalendarTelegram(env, text, { botToken, chatId } = {}) {
  const token = asText(botToken ?? env?.CALENDAR_BOT_TOKEN);
  const recipient = asText(chatId ?? env?.CALENDAR_CHAT_ID);
  if (!token || !recipient) return { accepted: false, reason: "no-config" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: recipient, text: asText(text), disable_web_page_preview: true }),
    });
    let body = null; try { body = await response.json(); } catch {}
    if (!response.ok || body?.ok !== true) return { accepted: false, reason: "telegram_rejected", status: response.status };
    return { accepted: true, status: response.status, messageId: body.result?.message_id ?? null };
  } catch (error) {
    return { accepted: false, reason: "telegram_transport", error: error?.message || "fetch_failed" };
  }
}

export function meetingIsActive(meeting) {
  const status = asText(meeting?.status ?? meeting?.Status);
  return !status || ACTIVE_STATUSES.has(status);
}

function parseJson(value, fallback = {}) { try { return JSON.parse(value || "{}"); } catch { return fallback; } }

function settingsFromRow(row) {
  const raw = parseJson(row?.notifications_json, {});
  const checked = validateMeetingNotificationSettings(raw);
  return checked.ok ? checked.value : null;
}

function retryDelay(attempts) {
  return Math.min(15 * 60_000, 30_000 * (2 ** Math.max(0, attempts - 1)));
}

async function loadAdminMeetingSettings(db, tenantId) {
  const row = await db.prepare("SELECT notifications_json,version FROM AdminMeetingSettings WHERE id=?").bind(tenantId).first();
  return { settings: settingsFromRow(row), version: Number(row?.version || 0) };
}

export async function runAdminMeetingReminders(env, now = Date.now(), options = {}) {
  const db = options.db || env?.DB;
  if (!db?.prepare) return { checked: 0, sent: 0, cancelled: 0, retried: 0, blocked: 0 };
  const tenantId = asText(options.tenantId || "day1design");
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 50);
  const transport = options.transport || ((text) => sendCalendarTelegram(env, text));
  const { settings } = await loadAdminMeetingSettings(db, tenantId);
  if (!settings) return { checked: 0, sent: 0, cancelled: 0, retried: 0, blocked: 0, skipped: "invalid-settings" };
  const rows = (await db.prepare(`SELECT * FROM ${ADMIN_MEETING_OUTBOX_TABLE} WHERE tenant_id=? AND status='queued' AND due_at<=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY due_at,id LIMIT ?`).bind(tenantId, iso(now), iso(now), limit).all()).results || [];
  const result = { checked: rows.length, sent: 0, cancelled: 0, retried: 0, blocked: 0 };
  for (const candidate of rows) {
    const claimed = await reserveMeetingNotification(db, { id: candidate.id, tenantId, at: now });
    if (!claimed) continue;
    const payload = parseJson(claimed.payload_json);
    let meeting;
    if (options.resolveMeeting) meeting = await options.resolveMeeting(claimed.meeting_id, tenantId);
    else {
      const row = await db.prepare(`SELECT id,CrmTenantId,Name,Assignee,ConsultAt,ConsultBranch,ConsultCancelledAt,ConsultTypeName,ConsultDurationMinutes,ConsultBufferMinutes,ConsultColorKey,ConsultVersion FROM Estimates WHERE id=? AND CrmTenantId=? LIMIT 1`).bind(claimed.meeting_id, tenantId).first();
      meeting = row ? { ...(payload.meeting || {}), id: row.id, tenantId: row.CrmTenantId, version: Number(row.ConsultVersion || 1), startsAt: row.ConsultAt, meetingName: row.ConsultTypeName || payload.meeting?.meetingName || "이니셜미팅", durationMinutes: Number(row.ConsultDurationMinutes || 120), bufferMinutes: Number(row.ConsultBufferMinutes ?? 60), colorKey: row.ConsultColorKey || payload.meeting?.colorKey || "blue", customerName: row.Name || "", assignee: row.Assignee || "", location: row.ConsultBranch || "", status: row.ConsultCancelledAt ? "cancelled" : "scheduled" } : null;
    }
    const currentVersion = Number(meeting?.version ?? meeting?.crmVersion ?? meeting?.CrmVersion ?? claimed.meeting_version);
    const active = meetingIsActive(meeting);
    const currentSettings = (await loadAdminMeetingSettings(db, tenantId)).settings;
    if (!meeting || !active || currentVersion !== Number(claimed.meeting_version) || !currentSettings?.[claimed.notification_type]?.enabled) {
      await db.prepare(`UPDATE ${ADMIN_MEETING_OUTBOX_TABLE} SET status='cancelled',cancelled_at=?,last_error=? WHERE id=? AND tenant_id=? AND status='reserved'`).bind(iso(now), "stale_or_disabled", claimed.id, tenantId).run();
      result.cancelled++;
      continue;
    }
    let text;
    try { text = renderMeetingTemplate(currentSettings[claimed.notification_type].template, meeting, { escape: false }); }
    catch { await db.prepare(`UPDATE ${ADMIN_MEETING_OUTBOX_TABLE} SET status='blocked',last_error=? WHERE id=? AND tenant_id=? AND status='reserved'`).bind("template_invalid", claimed.id, tenantId).run(); result.blocked++; continue; }
    let receipt;
    try { receipt = await transport(text, { meeting, notificationType: claimed.notification_type, outbox: claimed }); }
    catch { receipt = { accepted: false, reason: "delivery_unknown" }; }
    if (receipt?.accepted === true) {
      await markMeetingNotificationSent(db, { id: claimed.id, tenantId, dispatchResult: receipt, at: now });
      result.sent++;
      continue;
    }
    const attempts = Number(claimed.attempts || 0) + 1;
    const unknown = receipt?.reason === "delivery_unknown" || receipt?.reason === "telegram_transport" || receipt?.unknown === true;
    if (unknown || attempts >= 3) {
      await db.prepare(`UPDATE ${ADMIN_MEETING_OUTBOX_TABLE} SET status='blocked',attempts=?,last_error=? WHERE id=? AND tenant_id=? AND status='reserved'`).bind(attempts, unknown ? "delivery_unknown" : String(receipt?.reason || "delivery_rejected"), claimed.id, tenantId).run();
      result.blocked++;
    } else {
      await db.prepare(`UPDATE ${ADMIN_MEETING_OUTBOX_TABLE} SET status='queued',attempts=?,next_attempt_at=?,last_error=? WHERE id=? AND tenant_id=? AND status='reserved'`).bind(attempts, iso(Number(now) + retryDelay(attempts)), String(receipt?.reason || "delivery_rejected"), claimed.id, tenantId).run();
      result.retried++;
    }
  }
  return result;
}
