import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

function apply(db, name) { db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8")); }

test("estimate booking and meeting outbox intent commit or roll back together", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, CrmVersion INTEGER DEFAULT 1, Name TEXT, Assignee TEXT, ContractAmount INTEGER DEFAULT 0, ContractAt TEXT DEFAULT '', Address TEXT, AddressDetail TEXT, SubmittedAt TEXT, ConsultAt TEXT DEFAULT '', ConsultBranch TEXT DEFAULT '', ConsultCancelledAt TEXT DEFAULT '')");
  db.exec("CREATE TRIGGER trg_estimates_crm_version AFTER UPDATE OF Name,Address,ConsultAt,ConsultBranch,ConsultCancelledAt ON Estimates WHEN NEW.CrmVersion=OLD.CrmVersion BEGIN UPDATE Estimates SET CrmVersion=OLD.CrmVersion+1 WHERE id=NEW.id; END");
  apply(db, "0091_admin_meetings_contracts.sql");
  apply(db, "0092_admin_meeting_outbox.sql");
  apply(db, "0093_admin_meeting_outbox_source_atomicity.sql");
  db.prepare("INSERT INTO Estimates(id,CrmTenantId,Name) VALUES(?,?,?)").run("e1", "day1design", "고객");
  db.prepare("UPDATE Estimates SET ConsultAt=?,ConsultBranch=? WHERE id=?").run("2026-09-20T01:00:00.000Z", "강남점", "e1");
  assert.equal(db.prepare("SELECT ConsultAt FROM Estimates WHERE id='e1'").get().ConsultAt, "2026-09-20T01:00:00.000Z");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM AdminMeetingOutbox WHERE meeting_id='e1' AND status='queued'").get().n, 3);
  assert.equal(db.prepare("SELECT MIN(meeting_version) AS v FROM AdminMeetingOutbox WHERE meeting_id='e1'").get().v, 1);
  assert.match(db.prepare("SELECT payload_json FROM AdminMeetingOutbox WHERE meeting_id='e1' LIMIT 1").get().payload_json, /calendarUrl/);
  db.prepare("INSERT INTO Estimates(id,CrmTenantId,Name,ConsultAt) VALUES(?,?,?,?)").run("past", "day1design", "지난예약", "2026-09-01T01:00:00.000Z");
  assert.deepEqual(db.prepare("SELECT notification_type FROM AdminMeetingOutbox WHERE meeting_id='past' ORDER BY notification_type").all().map((row) => row.notification_type), ["created"]);
  db.exec("CREATE TRIGGER injected_outbox_failure BEFORE INSERT ON AdminMeetingOutbox BEGIN SELECT RAISE(ABORT,'injected_outbox_failure'); END");
  assert.throws(() => db.prepare("UPDATE Estimates SET ConsultAt=? WHERE id=?").run("2026-09-21T01:00:00.000Z", "e1"), /injected_outbox_failure/);
  assert.equal(db.prepare("SELECT ConsultAt FROM Estimates WHERE id='e1'").get().ConsultAt, "2026-09-20T01:00:00.000Z");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM AdminMeetingOutbox WHERE meeting_id='e1'").get().n, 3);
});
