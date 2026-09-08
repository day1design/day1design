import assert from "node:assert/strict";
import test from "node:test";

import {
  DAILY_BRIEFING_TYPE,
  NOTIFICATION_TYPES,
  buildAppointmentOutboxKey,
  buildInternalNotification,
  canReadNotification,
  classifyShortNotice,
  dailyBriefingDueAt,
  isReminderDue,
  previewReminderMessage,
  reminderDueAt,
  revalidateReminderExecution,
  snapshotStaffAudience,
} from "../src/lib/crm-notifications.js";

const TENANT = "day1design";
const APPOINTMENT = "2026-09-10T06:00:00.000Z";
const NOW = "2026-09-10T02:00:00.000Z";

test("audience snapshots only active staff in the same tenant", () => {
  const audience = snapshotStaffAudience({
    tenantId: TENANT,
    members: [
      { id: "owner", tenantId: TENANT, role: "owner", active: true },
      { id: "a", tenantId: TENANT, role: "staff", active: true, email: "a@example.test" },
      { id: "disabled", tenantId: TENANT, role: "staff", active: true, disabled: true },
      { id: "other", tenantId: "other", role: "staff", active: true },
    ],
    mode: "all",
  });
  assert.deepEqual(audience, [{ id: "a", tenantId: TENANT, email: "a@example.test" }]);
});

test("selected audience is deduplicated and read access is per recipient", () => {
  const audience = snapshotStaffAudience({
    tenantId: TENANT,
    members: [
      { id: "a", tenantId: TENANT, role: "staff" },
      { id: "a", tenantId: TENANT, role: "staff" },
      { id: "b", tenantId: TENANT, role: "staff" },
    ],
    mode: "selected",
    recipientIds: ["b", "a", "missing"],
  });
  assert.deepEqual(audience.map(({ id }) => id), ["a", "b"]);
  assert.equal(canReadNotification({ notification: { tenantId: TENANT, recipientId: "a" }, actorId: "a", tenantId: TENANT }), true);
  assert.equal(canReadNotification({ notification: { tenantId: TENANT, recipientId: "a" }, actorId: "b", tenantId: TENANT }), false);
  assert.equal(canReadNotification({ notification: { tenantId: "other", recipientId: "a" }, actorId: "a", tenantId: TENANT }), false);
});

test("appointment version key is stable and distinguishes recipient/channel", () => {
  const base = { tenantId: TENANT, appointmentId: "apt-1", appointmentVersion: 3, notificationType: NOTIFICATION_TYPES.VISIT_REMINDER };
  assert.equal(buildAppointmentOutboxKey(base), buildAppointmentOutboxKey(base));
  assert.notEqual(buildAppointmentOutboxKey(base), buildAppointmentOutboxKey({ ...base, appointmentVersion: 4 }));
  assert.notEqual(buildAppointmentOutboxKey(base), buildAppointmentOutboxKey({ ...base, channel: "sms" }));
});

test("reminder is due exactly three hours before and only once", () => {
  assert.equal(reminderDueAt(APPOINTMENT).toISOString(), "2026-09-10T03:00:00.000Z");
  assert.equal(isReminderDue({ appointmentAt: APPOINTMENT, now: NOW }), false);
  assert.equal(isReminderDue({ appointmentAt: APPOINTMENT, now: "2026-09-10T03:00:00.000Z" }), true);
  assert.equal(isReminderDue({ appointmentAt: APPOINTMENT, now: "2026-09-10T04:00:00.000Z", sentAt: NOW }), false);
});

test("execution revalidates tenant, reservation, version, and channel", () => {
  const input = {
    tenant: { id: TENANT, active: true },
    appointment: { tenantId: TENANT, status: "confirmed", version: 2, startsAt: APPOINTMENT },
    expectedVersion: 2,
    channelEnabled: true,
    now: "2026-09-10T03:00:00.000Z",
  };
  assert.deepEqual(revalidateReminderExecution(input), { ok: true, reason: null });
  for (const [field, value, reason] of [
    ["tenant", { id: TENANT, active: false }, "tenant_inactive"],
    ["appointment", { tenantId: TENANT, status: "cancelled", version: 2, startsAt: APPOINTMENT }, "reservation_inactive"],
    ["expectedVersion", 1, "appointment_version_changed"],
    ["channelEnabled", false, "channel_disabled"],
  ]) {
    assert.equal(revalidateReminderExecution({ ...input, [field]: value }).reason, reason);
  }
});

test("short notice defaults to explicit manual review", () => {
  const shortNoticeInput = { appointmentAt: APPOINTMENT, createdAt: "2026-09-10T03:00:00.000Z", now: "2026-09-10T03:30:00.000Z" };
  const result = classifyShortNotice(shortNoticeInput);
  assert.deepEqual(result, { shortNotice: true, action: "manual_review", autoSend: false, remainingMs: 9000000 });
  assert.equal(classifyShortNotice({ ...shortNoticeInput, policy: "send_once" }).autoSend, true);
});

test("preview distinguishes visit/measurement and draft/approved copy", () => {
  const variables = { name: "개발 고객", date: "9월 10일", time: "15:00", location: "판교 현장", address: "서울" };
  const visitDraft = previewReminderMessage({ kind: "visit", templateState: "draft", variables });
  const measurementApproved = previewReminderMessage({ kind: "measurement", templateState: "approved", variables });
  assert.match(visitDraft.text, /방문/);
  assert.match(measurementApproved.text, /실측/);
  assert.notEqual(visitDraft.text, measurementApproved.text);
  assert.equal(measurementApproved.templateState, "approved");
});

test("internal work notifications have three types and daily briefing stays separate", () => {
  for (const type of Object.values(NOTIFICATION_TYPES)) {
    const notification = buildInternalNotification({ tenantId: TENANT, type, actorId: "owner", audience: [{ id: "a", tenantId: TENANT }], payload: { name: "고객" }, createdAt: NOW });
    assert.equal(notification.type, type);
  }
  assert.equal(DAILY_BRIEFING_TYPE, "daily_briefing");
  assert.equal(dailyBriefingDueAt("2026-09-10").toISOString(), "2026-09-10T01:00:00.000Z");
});
