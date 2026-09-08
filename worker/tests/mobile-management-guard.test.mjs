import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleMobileManagement } from "../src/routes/mobile-management.js";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["0001_init.sql", "0041_consult_booking.sql", "0042_contract_fields.sql", "0043_consult_cancel.sql", "0045_mobile_crm.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  sqlite.prepare("INSERT INTO CrmTenants(id,name) VALUES('tenant-a','A')").run();
  sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role,active) VALUES('owner-a','tenant-a','owner-a@example.com','owner',1),('staff-a','tenant-a','staff-a@example.com','staff',1)").run();
  const stmt = (sql, args = []) => ({ bind(...values) { return stmt(sql, values); }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; } });
  return { sqlite, env: { DB: { prepare: (sql) => stmt(sql), async batch(items) { sqlite.exec("BEGIN"); try { const results = []; for (const item of items) results.push(await item.run()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } } } };
}
const owner = { id: "owner-a", user_id: "owner-a", email: "owner-a@example.com", role: "owner", tenant_id: "tenant-a" };
function req(path, method, body) { return new Request(`https://test.local${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }

test("suspended tenant owner cannot mutate, audit, or revoke sessions", async () => {
  const { sqlite, env } = setup();
  try {
    sqlite.prepare("UPDATE CrmTenants SET suspended=1 WHERE id='tenant-a'").run();
    sqlite.prepare("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?,?)").run("session-a", "hash-a", "staff-a", "2099-01-01T00:00:00Z", new Date().toISOString());
    const response = await handleMobileManagement(req("/api/mobile/members", "POST", { email: "new@example.com", role: "staff" }), env, owner);
    assert.equal(response.status, 403);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM CrmUsers WHERE email='new@example.com'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM CrmAuditLogs WHERE tenant_id='tenant-a'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT revoked_at FROM CrmSessions WHERE id='session-a'").get().revoked_at, null);
  } finally { sqlite.close(); }
});

test("audit failure rolls back member mutation and clears guard", async () => {
  const { sqlite, env } = setup();
  try {
    sqlite.exec("CREATE TRIGGER fail_management_audit BEFORE INSERT ON CrmAuditLogs BEGIN SELECT RAISE(ABORT, 'audit fixture failure'); END");
    const response = await handleMobileManagement(req("/api/mobile/members", "POST", { email: "rollback@example.com", role: "staff" }), env, owner);
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM CrmUsers WHERE email='rollback@example.com'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM CrmMutationGuard").get().n, 0);
  } finally { sqlite.close(); }
});
