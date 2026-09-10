import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createContract, regionFromAddress, validateMeetingBuffer } from "../src/lib/admin-meetings.js";

function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, ContractAmount INTEGER DEFAULT 0, ContractAt TEXT DEFAULT '', Address TEXT, AddressDetail TEXT, SubmittedAt TEXT, ConsultAt TEXT DEFAULT '', ConsultCancelledAt TEXT DEFAULT '')");
  db.prepare("INSERT INTO Estimates(id,CrmTenantId,ContractAmount,Address,AddressDetail,SubmittedAt) VALUES(?,?,?,?,?,?)").run("e1", "day1design", 10000000, "서울특별시 강남구 테헤란로 123", "101호", "2026-01-01T00:00:00.000Z");
  db.exec(readFileSync(new URL("../migrations/0091_admin_meetings_contracts.sql", import.meta.url), "utf8"));
  const wrap = (sql) => ({
    bind(...args) { return { first: async () => db.prepare(sql).get(...args), all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes || 0) } }) }; },
  });
  return { DB: { prepare: wrap, async batch(items) { db.exec("BEGIN"); try { const out = items.map((item) => item.run()); db.exec("COMMIT"); return out; } catch (error) { db.exec("ROLLBACK"); throw error; } } }, db };
}

test("contract history is persistent, address-led, idempotent, and version guarded", async () => {
  const env = makeDb();
  assert.equal(validateMeetingBuffer(0), 0);
  assert.equal(validateMeetingBuffer(60), 60);
  assert.equal(validateMeetingBuffer(30), null);
  assert.equal(regionFromAddress("서울특별시 강남구 테헤란로 123"), "서울특별시 강남구");
  assert.equal(regionFromAddress("경기도 성남시 분당구 판교역로 100"), "경기도 성남시 분당구");
  const first = await createContract(env, "e1", { amount: 12000000, reason: "first", idempotencyKey: "k1", expectedVersion: 0 }, "admin");
  assert.equal(first.contract.previousAmount, 10000000);
  assert.equal(first.contract.address, "서울특별시 강남구 테헤란로 123");
  assert.equal(first.contract.region, "서울특별시 강남구");
  const second = await createContract(env, "e1", { amount: 15000000, reason: "scope", idempotencyKey: "k2", expectedVersion: 1 }, "admin");
  assert.equal(second.contract.previousAmount, 12000000);
  assert.equal(second.contract.address, "서울특별시 강남구 테헤란로 123");
  const duplicate = await createContract(env, "e1", { amount: 15000000, idempotencyKey: "k2", expectedVersion: 1 }, "admin");
  assert.equal(duplicate.idempotent, true);
  const stale = await createContract(env, "e1", { amount: 18000000, idempotencyKey: "k3", expectedVersion: 1 }, "admin");
  assert.equal(stale.response.status, 409);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM EstimateContractHistory WHERE estimate_id='e1'").get().n, 3);
  env.db.prepare("INSERT INTO Estimates(id,CrmTenantId,ConsultAt,ConsultDurationMinutes,ConsultBufferMinutes,ConsultCancelledAt) VALUES(?,?,?,?,?,?)").run("e2", "day1design", "2026-09-10T01:00:00.000Z", 120, 60, "");
  assert.throws(() => env.db.prepare("INSERT INTO Estimates(id,CrmTenantId,ConsultAt,ConsultDurationMinutes,ConsultBufferMinutes,ConsultCancelledAt) VALUES(?,?,?,?,?,?)").run("e3", "day1design", "2026-09-10T02:00:00.000Z", 60, 60, ""), /meeting_conflict/);
  env.db.prepare("INSERT INTO Estimates(id,CrmTenantId,ConsultAt,ConsultDurationMinutes,ConsultBufferMinutes,ConsultCancelledAt) VALUES(?,?,?,?,?,?)").run("other", "other-crm", "2026-09-10T02:00:00.000Z", 60, 60, "");
  env.db.prepare("UPDATE Estimates SET ConsultCancelledAt='2026-09-09T00:00:00.000Z' WHERE id='e2'").run();
  env.db.prepare("INSERT INTO Estimates(id,CrmTenantId,ConsultAt,ConsultDurationMinutes,ConsultBufferMinutes,ConsultCancelledAt) VALUES(?,?,?,?,?,?)").run("e4", "day1design", "2026-09-10T02:00:00.000Z", 60, 60, "");
  assert.throws(() => env.db.prepare("UPDATE Estimates SET ConsultCancelledAt='' WHERE id='e2'").run(), /meeting_conflict/);
  env.db.prepare("INSERT INTO Estimates(id,CrmTenantId,ConsultAt,ConsultDurationMinutes,ConsultBufferMinutes,ConsultCancelledAt) VALUES(?,?,?,?,?,?)").run("buffer-a", "day1design", "2026-09-10T05:00:00.000Z", 120, 0, "");
  env.db.prepare("INSERT INTO Estimates(id,CrmTenantId,ConsultAt,ConsultDurationMinutes,ConsultBufferMinutes,ConsultCancelledAt) VALUES(?,?,?,?,?,?)").run("buffer-b", "day1design", "2026-09-10T07:00:00.000Z", 60, 60, "");
  assert.throws(() => env.db.prepare("UPDATE Estimates SET ConsultBufferMinutes=60 WHERE id='buffer-a'").run(), /meeting_conflict/);
});
