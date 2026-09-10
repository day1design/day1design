export const NOTIFICATION_TYPES = Object.freeze({
  NEW_CUSTOMER: "new_customer",
  VISIT_REMINDER: "visit_reminder",
  MEASUREMENT_REMINDER: "measurement_reminder",
  STAFF_MESSAGE: "staff_message",
});

export const DAILY_BRIEFING_TYPE = "daily_briefing";
export const REMINDER_LEAD_MS = 3 * 60 * 60 * 1000;
export const SHORT_NOTICE_POLICY = "manual_review";

const INTERNAL_TYPES = new Set(Object.values(NOTIFICATION_TYPES));
const RESERVATION_STATUSES = new Set(["scheduled", "confirmed", "booked"]);
const TEMPLATE_STATES = new Set(["draft", "approved"]);

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function isoDate(value, name) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError(`${name} must be a date`);
  return parsed;
}

function activeTenant(tenant) {
  return Boolean(
    tenant &&
      tenant.active !== false &&
      tenant.suspended !== true &&
      tenant.status !== "suspended" &&
      tenant.suspendedAt == null,
  );
}

function activeStaff(member, tenantId) {
  return Boolean(
    member &&
      member.tenantId === tenantId &&
      member.role === "staff" &&
      member.active !== false &&
      member.disabled !== true &&
      member.disabledAt == null &&
      member.status !== "disabled" &&
      member.id,
  );
}

export function snapshotStaffAudience({ tenantId, members, mode = "all", recipientIds = [] }) {
  const id = requiredString(tenantId, "tenantId");
  if (!Array.isArray(members)) throw new TypeError("members must be an array");
  if (mode !== "all" && mode !== "selected") throw new TypeError("mode must be all or selected");
  const selected = new Set(recipientIds.map((value) => requiredString(value, "recipientId")));
  const seen = new Set();
  return members
    .filter((member) => activeStaff(member, id))
    .filter((member) => mode === "all" || selected.has(member.id))
    .filter((member) => !seen.has(member.id) && seen.add(member.id))
    .map(({ id: memberId, tenantId: memberTenantId, email }) => ({
      id: memberId,
      tenantId: memberTenantId,
      email: email ?? null,
    }));
}

export function canReadNotification({ notification, actorId, tenantId }) {
  return Boolean(
    notification &&
      notification.tenantId === tenantId &&
      notification.recipientId === actorId &&
      notification.recipientId,
  );
}

export function buildAppointmentOutboxKey({
  tenantId,
  appointmentId,
  appointmentVersion,
  notificationType,
  recipientId = "customer",
  channel = "customer",
}) {
  const type = requiredString(notificationType, "notificationType");
  if (!INTERNAL_TYPES.has(type) || ![NOTIFICATION_TYPES.VISIT_REMINDER, NOTIFICATION_TYPES.MEASUREMENT_REMINDER].includes(type)) {
    throw new TypeError("notificationType must be a reminder type");
  }
  if (!Number.isInteger(appointmentVersion) || appointmentVersion < 1) {
    throw new TypeError("appointmentVersion must be a positive integer");
  }
  return [tenantId, appointmentId, appointmentVersion, type, recipientId, channel]
    .map((part, index) => requiredString(String(part), `key part ${index}`))
    .join(":");
}

export function reminderDueAt(appointmentAt) {
  return new Date(isoDate(appointmentAt, "appointmentAt").getTime() - REMINDER_LEAD_MS);
}

export function isReminderDue({ appointmentAt, now = new Date(), sentAt = null }) {
  const appointment = isoDate(appointmentAt, "appointmentAt");
  const current = isoDate(now, "now");
  if (appointment <= current || sentAt != null) return false;
  return current >= reminderDueAt(appointment);
}

export function revalidateReminderExecution({
  tenant,
  appointment,
  expectedVersion,
  channelEnabled,
  now = new Date(),
}) {
  if (!activeTenant(tenant)) return { ok: false, reason: "tenant_inactive" };
  if (!appointment || appointment.tenantId !== tenant.id) return { ok: false, reason: "tenant_mismatch" };
  if (!RESERVATION_STATUSES.has(appointment.status)) return { ok: false, reason: "reservation_inactive" };
  if (appointment.version !== expectedVersion) return { ok: false, reason: "appointment_version_changed" };
  if (channelEnabled !== true) return { ok: false, reason: "channel_disabled" };
  if (!isReminderDue({ appointmentAt: appointment.startsAt, now })) return { ok: false, reason: "not_due" };
  return { ok: true, reason: null };
}

export function classifyShortNotice({ appointmentAt, createdAt, now = new Date(), policy = SHORT_NOTICE_POLICY }) {
  if (policy !== SHORT_NOTICE_POLICY && policy !== "send_once") {
    throw new TypeError("short-notice policy must be manual_review or send_once");
  }
  const appointment = isoDate(appointmentAt, "appointmentAt");
  const current = isoDate(now, "now");
  const created = isoDate(createdAt, "createdAt");
  const remaining = appointment.getTime() - current.getTime();
  const shortNotice = created < appointment && remaining > 0 && remaining < REMINDER_LEAD_MS;
  if (!shortNotice) return { shortNotice: false, action: "scheduled", autoSend: false };
  return {
    shortNotice: true,
    action: policy,
    autoSend: policy === "send_once",
    remainingMs: remaining,
  };
}

const TEMPLATE_COPY = Object.freeze({
  visit: {
    draft: "{{name}}님, {{date}} {{time}}에 {{location}} 방문 일정이 예정되어 있습니다. 주소: {{address}}",
    approved: "{{name}}님, {{date}} {{time}} {{location}} 방문 일정입니다. 주소: {{address}}",
  },
  measurement: {
    draft: "{{name}}님, {{date}} {{time}}에 {{location}} 실측 일정이 예정되어 있습니다. 주소: {{address}}",
    approved: "{{name}}님, {{date}} {{time}} {{location}} 실측 일정입니다. 주소: {{address}}",
  },
});

function substitute(template, variables) {
  return template.replace(/\{\{(name|date|time|location|address|phone|map)\}\}/g, (_, key) => variables[key] ?? "");
}

export function previewReminderMessage({ kind, templateState = "draft", variables = {} }) {
  if (!Object.hasOwn(TEMPLATE_COPY, kind)) throw new TypeError("kind must be visit or measurement");
  if (!TEMPLATE_STATES.has(templateState)) throw new TypeError("templateState must be draft or approved");
  const normalized = Object.fromEntries(
    ["name", "date", "time", "location", "address", "phone", "map"].map((key) => [key, String(variables[key] ?? "")]),
  );
  return {
    kind,
    templateState,
    channel: "customer_preview",
    text: substitute(TEMPLATE_COPY[kind][templateState], normalized),
    variables: normalized,
  };
}

export function buildInternalNotification({ tenantId, type, actorId, audience, payload, createdAt = new Date() }) {
  const id = requiredString(tenantId, "tenantId");
  if (!INTERNAL_TYPES.has(type)) throw new TypeError("unsupported internal notification type");
  if (!Array.isArray(audience)) throw new TypeError("audience must be a snapshotted array");
  return {
    tenantId: id,
    type,
    actorId: requiredString(actorId, "actorId"),
    audience: audience.filter((recipient) => recipient.tenantId === id).map((recipient) => ({ ...recipient })),
    payload: payload && typeof payload === "object" ? { ...payload } : {},
    createdAt: isoDate(createdAt, "createdAt").toISOString(),
  };
}

export function dailyBriefingDueAt(date) {
  const day = requiredString(date, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new TypeError("date must be YYYY-MM-DD");
  return new Date(`${day}T01:00:00.000Z`);
}

function appointmentReminderType(kind) {
  return kind === "measurement" ? NOTIFICATION_TYPES.MEASUREMENT_REMINDER : NOTIFICATION_TYPES.VISIT_REMINDER;
}

function kstAppointmentLabel(value) {
  const date = isoDate(value, "appointmentAt");
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function appointmentReminderMessage({ kind, startsAt, offsetHours, location }) {
  const label = kind === "measurement" ? "실측" : "방문";
  const when = offsetHours === 24 ? "내일" : "오늘 2시간 전";
  const place = location ? ` · ${location}` : "";
  return `${when} ${label} 일정 알림 · ${kstAppointmentLabel(startsAt)}${place}`;
}

function notificationBudget(amount, detail) {
  if (Number(amount) > 0) return String(amount);
  const match = String(detail || "").match(/예산\s*[:：]?\s*([0-9][0-9,]*(?:\s*[만천억]?원)?)/i);
  return match ? match[1].replace(/\s+/g, "") : "";
}

export const APPOINTMENT_APP_REMINDER_OFFSETS_HOURS = Object.freeze([24, 2]);

export async function createDueAppointmentNotifications(db, { tenantId, now = new Date(), limit = 50 } = {}) {
  if (!db?.prepare) throw new TypeError("notification_db_required");
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new TypeError("notification_tenant_required");
  const current = isoDate(now, "now");
  const reminderWindowMs = 15 * 60 * 1000;
  const horizon = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  const due24Start = new Date(current.getTime() + 24 * 60 * 60 * 1000 - reminderWindowMs);
  const due2Start = new Date(current.getTime() + 2 * 60 * 60 * 1000 - reminderWindowMs);
  const size = Math.max(1, Math.min(50, Number(limit) || 50));
  const appointments = (await db.prepare(`
    WITH due24 AS (
      SELECT id FROM CrmAppointments WHERE tenant_id=? AND status IN ('scheduled','confirmed','booked')
        AND starts_at>? AND starts_at<=? ORDER BY starts_at,id LIMIT ?
    ), due2 AS (
      SELECT id FROM CrmAppointments WHERE tenant_id=? AND status IN ('scheduled','confirmed','booked')
        AND starts_at>? AND starts_at<=? ORDER BY starts_at,id LIMIT ?
    ), due AS (SELECT id FROM due24 UNION ALL SELECT id FROM due2)
    SELECT a.id,a.tenant_id,a.estimate_id,a.kind,a.starts_at,a.location,a.address,a.status,a.CrmVersion AS version,a.created_by,
           e.Name AS name,e.Phone AS phone,e.Branch AS branch,e.EstimateAmount AS budget,e.Detail AS detail,e.Source AS source
      FROM due JOIN CrmAppointments a ON a.id=due.id
      JOIN CrmTenants t ON t.id=a.tenant_id AND t.suspended=0
      LEFT JOIN Estimates e ON e.id=a.estimate_id AND e.CrmTenantId=a.tenant_id
     ORDER BY a.starts_at,a.id
     LIMIT ?`).bind(tenantId, due24Start.toISOString(), horizon.toISOString(), size, tenantId, due2Start.toISOString(), new Date(current.getTime() + 2 * 60 * 60 * 1000).toISOString(), size, size).all()).results ?? [];
  const recipients = (await db.prepare("SELECT id FROM CrmUsers WHERE tenant_id=? AND active=1 ORDER BY id LIMIT 101").bind(tenantId).all()).results ?? [];
  if (recipients.length > 100) throw new Error("notification_audience_too_large");
  let created = 0;
  for (const appointment of appointments) {
    const startsAt = isoDate(appointment.starts_at, "startsAt");
    const offsetCandidates = APPOINTMENT_APP_REMINDER_OFFSETS_HOURS.filter((hours) => {
      const dueAt = startsAt.getTime() - hours * 60 * 60 * 1000;
      return current.getTime() >= dueAt && current.getTime() < dueAt + reminderWindowMs;
    });
    for (const offsetHours of offsetCandidates) {
      const type = appointmentReminderType(appointment.kind);
      const eventKey = `appointment_app_reminder:${tenantId}:${appointment.id}:${appointment.version}:${offsetHours}`;
      const notificationId = `crm_app_reminder_${appointment.id}_${appointment.version}_${offsetHours}`;
      const payload = {
        kind: "appointment_reminder",
        appointment_id: appointment.id,
        appointment_version: appointment.version,
        estimate_id: appointment.estimate_id,
        appointment_kind: appointment.kind,
        starts_at: appointment.starts_at,
        location: appointment.location || "",
        address: appointment.address || "",
        name: appointment.name || "",
        phone: appointment.phone || "",
        branch: appointment.branch || "",
        source: appointment.source || (appointment.meta_lead_id ? "meta" : "homepage"),
        meta_lead_id: "",
        detail: appointment.detail || "",
        budget: notificationBudget(appointment.budget, appointment.detail),
        offset_hours: offsetHours,
        message: appointmentReminderMessage({ kind: appointment.kind, startsAt: appointment.starts_at, offsetHours, location: appointment.location }),
      };
      if (!recipients.length) continue;
      const existing = await db.prepare("SELECT id FROM CrmNotifications WHERE event_key=?").bind(eventKey).first();
      if (existing) continue;
      const statements = [db.prepare("INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM CrmUsers WHERE id=? AND tenant_id=? AND active=1)")
        .bind(notificationId, tenantId, type, appointment.created_by || "", JSON.stringify(payload), current.toISOString(), eventKey, appointment.created_by || "", tenantId)];
      statements.push(db.prepare("INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) SELECT ?,?,value,? FROM json_each(?) WHERE EXISTS (SELECT 1 FROM CrmNotifications WHERE id=? AND tenant_id=?)").bind(notificationId, tenantId, current.toISOString(), JSON.stringify(recipients.map(recipient => recipient.id)), notificationId, tenantId));
      const results = await db.batch(statements);
      if (results?.[0]?.meta?.changes) created += 1;
    }
  }
  return { scanned: appointments.length, created };
}
