import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createDueAppointmentNotifications } from "../src/lib/crm-notifications.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["0001_init.sql", "0041_consult_booking.sql", "0043_consult_cancel.sql", "0031_meta_lead_poll.sql", "0045_mobile_crm.sql", "0046_crm_notifications.sql", "0048_crm_automation.sql", "0078_crm_app_notification_fields.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  class Statement {
    constructor(statement) { this.statement = statement; this.args = []; }
    bind(...args) { this.args = args; return this; }
    all() { return { results: this.statement.all(...this.args) }; }
    first() { return this.statement.get(...this.args) ?? null; }
    run() { const result = this.statement.run(...this.args); return { meta: { changes: Number(result.changes) } }; }
  }
  return { prepare(sql) { return new Statement(sqlite.prepare(sql)); }, batch(statements) { sqlite.exec("BEGIN"); try { const results = statements.map(statement => statement.run()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } }, sqlite };
}

function seed(db) {
  db.sqlite.exec(`
    INSERT INTO CrmTenants(id,name,brand,logo_url,suspended,created_at) VALUES ('t1','Dayone','day1design','',0,'2026-09-09T00:00:00Z');
    INSERT INTO CrmUsers(id,tenant_id,email,role,active,created_at) VALUES ('o1','t1','owner@test','owner',1,'2026-09-09T00:00:00Z'),('s1','t1','staff@test','staff',1,'2026-09-09T00:00:00Z');
    INSERT INTO Estimates(id,CrmTenantId,Name,Phone,Branch,EstimateAmount,SubmittedAt) VALUES ('e1','t1','홍길동','010-0000-0000','판교점',12000000,'2026-09-09T00:00:00Z');
    INSERT INTO CrmAppointments(id,tenant_id,estimate_id,kind,starts_at,location,address,status,CrmVersion,created_by,created_at) VALUES ('a1','t1','e1','visit','2026-09-11T00:00:00.000Z','판교점','경기 성남시','scheduled',1,'o1','2026-09-09T00:00:00Z');
  `);
}

test("app appointment reminders are KST-windowed, tenant-scoped, and idempotent", async () => {
  const db = fixture();
  try {
    seed(db);
    const intake = db.sqlite.prepare("SELECT payload_json FROM CrmNotifications WHERE id='crm_auto_customer_e1'").get();
    assert.match(intake.payload_json, /"source":"homepage"/);
    assert.match(intake.payload_json, /"detail":""/);
    assert.deepEqual(await createDueAppointmentNotifications(db, { tenantId: "t1", now: "2026-09-10T00:00:00.000Z" }), { scanned: 1, created: 1 });
    const first = db.sqlite.prepare("SELECT type,payload_json FROM CrmNotifications WHERE event_key LIKE 'appointment_app_reminder:%'").get();
    assert.equal(first.type, "visit_reminder");
    assert.match(first.payload_json, /판교점/);
    assert.match(first.payload_json, /홍길동/);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM CrmNotificationRecipients WHERE notification_id LIKE 'crm_app_reminder_%'").get().n, 2);
    assert.deepEqual(await createDueAppointmentNotifications(db, { tenantId: "t1", now: "2026-09-10T00:01:00.000Z" }), { scanned: 1, created: 0 });
    assert.deepEqual(await createDueAppointmentNotifications(db, { tenantId: "t1", now: "2026-09-10T22:00:00.000Z" }), { scanned: 1, created: 1 });
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM CrmNotifications WHERE event_key LIKE 'appointment_app_reminder:%'").get().n, 2);
    db.sqlite.exec("UPDATE CrmAppointments SET status='cancelled', CrmVersion=2 WHERE id='a1'");
    assert.deepEqual(await createDueAppointmentNotifications(db, { tenantId: "t1", now: "2026-09-10T22:01:00.000Z" }), { scanned: 0, created: 0 });
  } finally { db.sqlite.close(); }
});


test("app notification audience failure rolls back notification and can retry", async () => {
  const db=fixture(); try {
    seed(db);
    db.sqlite.exec("CREATE TRIGGER fail_app_recipient BEFORE INSERT ON CrmNotificationRecipients WHEN NEW.notification_id LIKE 'crm_app_reminder_%' BEGIN SELECT RAISE(ABORT,'fixture_failure'); END");
    await assert.rejects(() => createDueAppointmentNotifications(db,{tenantId:"t1",now:"2026-09-10T00:00:00.000Z"}), /fixture_failure/);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM CrmNotifications WHERE event_key LIKE 'appointment_app_reminder:%'").get().n,0);
    db.sqlite.exec("DROP TRIGGER fail_app_recipient");
    assert.equal((await createDueAppointmentNotifications(db,{tenantId:"t1",now:"2026-09-10T00:00:00.000Z"})).created,1);
  } finally {db.sqlite.close();}
});
