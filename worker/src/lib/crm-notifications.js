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
