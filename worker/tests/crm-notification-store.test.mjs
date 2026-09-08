import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  createInternalNotification,
  listMyNotifications,
  markNotificationRead,
  previewNotificationTemplate,
  upsertNotificationTemplate,
  listNotificationTemplates,
  enqueueAppointmentReminder,
  cancelStaleAppointmentReminders,
  reserveDueReminder,
} from "../src/lib/crm-notification-store.js";

function db() {
  const sqlite = new DatabaseSync(":memory:");
  for(const file of ['0001_init.sql','0041_consult_booking.sql','0042_contract_fields.sql','0043_consult_cancel.sql','0044_consult_reminders.sql']) sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL("../migrations/0045_mobile_crm.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0046_crm_notifications.sql", import.meta.url), "utf8"));
  class Statement {
    constructor(statement) { this.statement = statement; this.args = []; }
    bind(...args) { this.args = args; return this; }
    all() { return { results: this.statement.all(...this.args) }; }
    first() { return this.statement.get(...this.args) ?? null; }
    run() { const r = this.statement.run(...this.args); return { meta: { changes: Number(r.changes) } }; }
  }
  return { prepare(sql) { return new Statement(sqlite.prepare(sql)); }, batch(stmts) { for (const s of stmts) s.run(); return Promise.resolve(); } };
}

const OWNER = { id: "owner", tenant_id: "t1", role: "owner" };
const STAFF = { id: "staff", tenant_id: "t1", role: "staff" };
function seed(database) {
  database.prepare("INSERT INTO CrmTenants VALUES (?,?,?,?,?,?)").bind("t1", "Tenant", "brand", "", 0, "2026-09-09T00:00:00Z").run();
  database.prepare("INSERT INTO CrmUsers VALUES (?,?,?,?,?,?)").bind("owner", "t1", "owner@test", "owner", 1, "2026-09-09T00:00:00Z").run();
  database.prepare("INSERT INTO CrmUsers VALUES (?,?,?,?,?,?)").bind("staff", "t1", "staff@test", "staff", 1, "2026-09-09T00:00:00Z").run();
  database.prepare("INSERT INTO CrmUsers VALUES (?,?,?,?,?,?)").bind("other", "t1", "other@test", "staff", 1, "2026-09-09T00:00:00Z").run();
}

test("notification store exposes the customer reminder preview contract without sending", () => {
  const result = previewNotificationTemplate({ kind: "visit", templateState: "draft", variables: { name: "고객", date: "9월 10일", time: "오전 10시", location: "현장", address: "서울" } });
  assert.equal(result.channel, "customer_preview");
  assert.match(result.text, /고객/);
  assert.match(result.text, /서울/);
});

test("preview rejects unsupported template kinds", () => {
  assert.throws(() => previewNotificationTemplate({ kind: "contract" }), /visit or measurement/);
});

test("notification persistence snapshots recipients and limits read receipts to that recipient", async () => {
  const database = db();
  seed(database);
  const created = await createInternalNotification(database, { actor: OWNER, type: "new_customer", recipientIds: ["staff"], mode: "selected", payload: { estimate_id: "e1" }, createdAt: "2026-09-09T00:00:00Z" });
  assert.deepEqual(created.audience, ["staff"]);
  assert.equal((await listMyNotifications(database, { actor: STAFF })).notifications.length, 1);
  await assert.rejects(markNotificationRead(database, { actor: { ...STAFF, id: "other" }, notificationId: created.id }), /notification_not_found/);
  await markNotificationRead(database, { actor: STAFF, notificationId: created.id, readAt: "2026-09-09T00:01:00Z" });
  assert.equal((await listMyNotifications(database, { actor: STAFF })).notifications[0].unread, false);
});

test("templates and reminder outbox are tenant scoped, idempotent, and version cancellable", async () => {
  const database = db();
  seed(database);
  const template = await upsertNotificationTemplate(database, { actor: OWNER, kind: "visit", body: "{{name}} 방문", enabled: true, updatedAt: "2026-09-09T00:00:00Z" });
  assert.equal((await listNotificationTemplates(database, { actor: OWNER }))[0].enabled, true);
  assert.equal(template.body, "{{name}} 방문");
  const appointment = { id: "a1", tenant_id: "t1", version: 2 };
  database.prepare("INSERT INTO Estimates(id,Name) VALUES (?,?)").bind("e1", "Customer").run();
  database.prepare("INSERT INTO CrmAppointments(id,tenant_id,estimate_id,kind,starts_at,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)").bind("a1", "t1", "e1", "visit", "2026-09-10T04:00:00Z", "scheduled", "owner", "2026-09-09T00:00:00Z").run();
  const first = await enqueueAppointmentReminder(database, { actor: OWNER, appointment, notificationType: "visit_reminder", dueAt: "2026-09-09T01:00:00Z", createdAt: "2026-09-09T00:00:00Z" });
  const second = await enqueueAppointmentReminder(database, { actor: OWNER, appointment, notificationType: "visit_reminder", dueAt: "2026-09-09T01:00:00Z", createdAt: "2026-09-09T00:00:00Z" });
  assert.equal(second.id, first.id);
  database.prepare("UPDATE CrmAppointments SET CrmVersion=3").run();
  const current = await enqueueAppointmentReminder(database, { actor: OWNER, appointment, notificationType: "visit_reminder", recipientId: "customer-2", dueAt: "2026-09-09T01:00:00Z", createdAt: "2026-09-09T00:00:00Z" });
  assert.equal(current.appointment_version, 3);
  assert.equal(await reserveDueReminder(database, { actor: OWNER, outboxId: current.id, expectedVersion: 2, reservedAt: "2026-09-09T02:00:00Z" }), null);
  database.prepare("UPDATE CrmTenants SET suspended=1 WHERE id='t1'").run();
  await assert.rejects(reserveDueReminder(database, { actor: OWNER, outboxId: current.id, expectedVersion: 3, reservedAt: "2026-09-09T02:00:00Z" }), /actor_inactive/);
  database.prepare("UPDATE CrmTenants SET suspended=0 WHERE id='t1'").run();
  assert.equal((await cancelStaleAppointmentReminders(database, { actor: OWNER, appointmentId: "a1", currentVersion: 3, cancelledAt: "2026-09-09T00:02:00Z" })).cancelled, 1);
  assert.equal(database.prepare("SELECT status FROM CrmNotificationOutbox WHERE id=?").bind(first.id).first().status, "cancelled");
});
