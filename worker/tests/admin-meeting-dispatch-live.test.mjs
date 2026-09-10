import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { runAdminMeetingReminders } from "../src/lib/admin-meeting-notifications.js";

function apply(db, name) { db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8")); }
function envWithDb(db) {
  const prepare = (sql) => ({ bind(...args) { return { first: async () => db.prepare(sql).get(...args), all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes || 0) } }) }; } });
  return { DB: { prepare } };
}

test("default dispatcher reloads current estimate and preserves reminder on customer-only edits", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, CrmVersion INTEGER DEFAULT 1, Name TEXT, Assignee TEXT, ContractAmount INTEGER DEFAULT 0, ContractAt TEXT DEFAULT '', Address TEXT, AddressDetail TEXT, SubmittedAt TEXT, ConsultAt TEXT DEFAULT '', ConsultBranch TEXT DEFAULT '', ConsultCancelledAt TEXT DEFAULT '')");
  db.exec("CREATE TRIGGER trg_estimates_crm_version AFTER UPDATE OF Name,Address,ConsultAt,ConsultBranch,ConsultCancelledAt ON Estimates WHEN NEW.CrmVersion=OLD.CrmVersion BEGIN UPDATE Estimates SET CrmVersion=OLD.CrmVersion+1 WHERE id=NEW.id; END");
  apply(db, "0091_admin_meetings_contracts.sql");
  apply(db, "0092_admin_meeting_outbox.sql");
  apply(db, "0093_admin_meeting_outbox_source_atomicity.sql");
  db.prepare("UPDATE AdminMeetingSettings SET notifications_json=? WHERE id='day1design'").run(JSON.stringify({ created: { enabled: true, template: "{{customer_name}} {{location}} {{type_marker}}" }, day: { enabled: false, template: "" }, hour: { enabled: false, template: "" } }));
  db.prepare("INSERT INTO Estimates(id,CrmTenantId,Name,ConsultAt,ConsultBranch) VALUES(?,?,?,?,?)").run("live-1", "day1design", "초기 고객", "2099-09-20T01:00:00.000Z", "강남점");
  db.prepare("UPDATE Estimates SET Name=?,ConsultBranch=? WHERE id=?").run("최신 고객", "성수점", "live-1");
  const sent = [];
  const result = await runAdminMeetingReminders(envWithDb(db), Date.now(), { transport: async (text) => { sent.push(text); return { accepted: true }; } });
  assert.equal(result.sent, 1);
  assert.equal(sent[0].includes("최신 고객"), true);
  assert.equal(sent[0].includes("성수점"), true);
  assert.equal(sent[0].includes("🟦"), true);
});
