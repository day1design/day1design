import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readCrmCustomerVisitHistory } from "../src/lib/crm-customer-history.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE Estimates(id TEXT PRIMARY KEY, CrmTenantId TEXT, SessionId TEXT); CREATE TABLE HeatmapEvents(id TEXT PRIMARY KEY, CrmTenantId TEXT, SessionId TEXT, EventType TEXT, IsBot INTEGER, Page TEXT, Device TEXT, Referrer TEXT, UtmSource TEXT, UtmMedium TEXT, UtmCampaign TEXT, CreatedAt TEXT);");
  db.exec(readFileSync(new URL("../migrations/0082_crm_customer_visits.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO Estimates VALUES (?,?,?)").run("customer-1", "day1design", "session-1");
  const add = db.prepare("INSERT INTO HeatmapEvents (id,CrmTenantId,SessionId,EventType,IsBot,Page,Device,Referrer,UtmSource,UtmMedium,UtmCampaign,CreatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 0; i < 1003; i += 1) {
    const createdAt = i < 2 ? "2026-09-10T00:00:00Z" : new Date(Date.UTC(2026, 8, 10, 0, 0, i)).toISOString();
    add.run(`event-${String(i).padStart(3, "0")}`, "day1design", "session-1", "page_view", 0, `/page-${i}`, "mobile", "https://source.test", "google", "organic", "campaign", createdAt);
  }
  add.run("bot", "day1design", "session-1", "page_view", 1, "/bot", "pc", "", "", "", "", "2026-09-10T00:00:59Z");
  add.run("other", "other", "session-1", "page_view", 0, "/other", "pc", "", "", "", "", "2026-09-10T00:01:00Z");
  return db;
}

test("returns tenant-scoped page views with keyset pagination and bot exclusion", async () => {
  const db = fixture();
  const first = await readCrmCustomerVisitHistory(db, { tenantId: "day1design", customerId: "customer-1" });
  assert.equal(first.linked, true);
  assert.equal(first.events.length, 50);
  assert.deepEqual(first.events.slice(0, 2).map((row) => row.id), ["event-000", "event-001"]);
  assert.equal(first.nextCursor, "2026-09-10T00:00:49.000Z|event-049");
  const second = await readCrmCustomerVisitHistory(db, { tenantId: "day1design", customerId: "customer-1", cursor: first.nextCursor });
  assert.equal(second.events.length, 50);
  const all = [...first.events, ...second.events];
  let cursor = second.nextCursor;
  while (cursor) {
    const next = await readCrmCustomerVisitHistory(db, { tenantId: "day1design", customerId: "customer-1", cursor });
    all.push(...next.events);
    cursor = next.nextCursor;
  }
  assert.equal(all.length, 1003);
  assert.equal(new Set(all.map((row) => row.id)).size, 1003);
  assert.equal(all.some((row) => row.id === "bot" || row.id === "other"), false);
});

test("returns unlinked for missing or cross-tenant customers", async () => {
  const db = fixture();
  assert.deepEqual(await readCrmCustomerVisitHistory(db, { tenantId: "other", customerId: "customer-1" }), { linked: false, events: [], nextCursor: null });
  assert.deepEqual(await readCrmCustomerVisitHistory(db, { tenantId: "day1design", customerId: "missing" }), { linked: false, events: [], nextCursor: null });
});

test("rejects malformed oversized cursors", async () => {
  const db = fixture();
  await assert.rejects(() => readCrmCustomerVisitHistory(db, { tenantId: "day1design", customerId: "customer-1", cursor: "bad" }), /cursor_invalid/);
  await assert.rejects(() => readCrmCustomerVisitHistory(db, { tenantId: "day1design", customerId: "customer-1", cursor: `${"x".repeat(501)}` }), /cursor_invalid/);
});

test("uses the tenant session event keyset index", () => {
  const db = fixture();
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM HeatmapEvents WHERE CrmTenantId=? AND SessionId=? AND EventType='page_view' AND IsBot=0 ORDER BY CreatedAt,id LIMIT 51").all("day1design", "session-1");
  assert.match(plan.map((row) => String(row.detail || "")).join(" "), /idx_heatmap_crm_tenant_session_event_bot_created_id/);
});
