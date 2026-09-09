import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readCrmFlowAnalysis } from "../src/lib/crm-flow-analysis.js";

function dbWithSchema({ pixel = false } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE HeatmapEvents (id TEXT PRIMARY KEY, CrmTenantId TEXT, SessionId TEXT, Page TEXT, EventType TEXT, IsBot INTEGER, UtmSource TEXT, UtmMedium TEXT, CreatedAt TEXT);
    CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, Source TEXT, Platform TEXT, SubmittedAt TEXT);
    CREATE INDEX heatmap_tenant_date ON HeatmapEvents(CrmTenantId, CreatedAt);
    CREATE INDEX estimates_tenant_date ON Estimates(CrmTenantId, SubmittedAt);
  `);
  if (pixel) {
    sqlite.exec("CREATE TABLE pixel_events (id TEXT PRIMARY KEY, CrmTenantId TEXT, event_name TEXT, ga4_name TEXT, session_id TEXT, source TEXT, created_at TEXT); CREATE INDEX pixel_tenant_date ON pixel_events(CrmTenantId, created_at);");
  }
  const add = (table, row) => sqlite.prepare(`INSERT INTO ${table} VALUES (${row.map(() => "?").join(",")})`).run(...row);
  return { sqlite, add, db: { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...args) { return { all: async () => ({ results: statement.all(...args) }) }; }, all: async () => ({ results: statement.all() }) }; } } };
}

test("tenant-bound flow returns current and previous periods with separate rates", async () => {
  const fixture = dbWithSchema();
  fixture.add("HeatmapEvents", ["h1", "day1", "s1", "/home", "page_view", 0, "meta", "paid", "2026-09-01T00:00:00Z"]);
  fixture.add("HeatmapEvents", ["h2", "day1", "s1", "/pages/estimates", "page_view", 0, "meta", "paid", "2026-09-01T00:01:00Z"]);
  fixture.add("HeatmapEvents", ["h3", "day1", "s2", "/home", "page_view", 0, "google", "organic", "2026-09-02T00:00:00Z"]);
  fixture.add("Estimates", ["e1", "day1", "meta", "", "2026-09-02T00:00:00Z"]);
  fixture.add("HeatmapEvents", ["h4", "day1", "s3", "/home", "page_view", 0, "meta", "paid", "2026-08-26T00:00:00Z"]);
  fixture.add("Estimates", ["e2", "day1", "meta", "", "2026-08-27T00:00:00Z"]);
  const result = await readCrmFlowAnalysis(fixture.db, { tenantId: "day1", startDate: "2026-09-01", endDate: "2026-09-07" });
  assert.equal(result.available, true);
  assert.deepEqual(result.periods.previous, { start: "2026-08-25", end: "2026-08-31" });
  assert.equal(result.totals.current.visits, 2);
  assert.equal(result.totals.current.applicationStarts, null);
  assert.equal(result.totals.current.savedLeads, 1);
  assert.equal(result.totals.current.rates.visitToApplicationStart.value, null);
  assert.equal(result.totals.current.rates.applicationStartToSaved.value, null);
  assert.equal(result.totals.current.rates.visitToSaved.value, 0.5);
  assert.deepEqual(result.stageAvailability.applicationStart, { available: false, reason: "form_start_event_not_tenant_bound" });
  assert.equal(result.judgment.status, "unavailable");
  assert.equal(result.judgment.reason, "threshold_policy_missing");
  assert.equal(result.hypotheses.length, 0);
  for (let index = 0; index < 101; index += 1) {
    fixture.add("Estimates", [`overflow-${index}`, "day1", `source-${index}`, "", "2026-09-03T00:00:00Z"]);
  }
  const crowded = await readCrmFlowAnalysis(fixture.db, { tenantId: "day1", startDate: "2026-09-01", endDate: "2026-09-07" });
  const shownSaved = crowded.sources.reduce((sum, source) => sum + source.current.savedLeads, 0);
  assert.equal(crowded.sourcesHasMore, true);
  assert.equal(shownSaved + crowded.otherSavedLeads.current, crowded.totals.current.savedLeads);
  fixture.sqlite.close();
});

test("legacy global HeatmapEvents is unavailable without tenant mapping", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE HeatmapEvents (id TEXT, SessionId TEXT, Page TEXT, EventType TEXT, IsBot INTEGER, UtmSource TEXT, UtmMedium TEXT, CreatedAt TEXT); CREATE TABLE Estimates (id TEXT, CrmTenantId TEXT, Source TEXT, Platform TEXT, SubmittedAt TEXT); CREATE INDEX estimates_tenant_date ON Estimates(CrmTenantId,SubmittedAt);");
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...args) { return { all: async () => ({ results: statement.all(...args) }) }; }, all: async () => ({ results: statement.all() }) }; } };
  const result = await readCrmFlowAnalysis(db, { tenantId: "day1", startDate: "2026-09-01", endDate: "2026-09-01" });
  assert.equal(result.available, false);
  assert.equal(result.reason, "heatmap_tenant_column_missing");
  sqlite.close();
});

test("tenant-bound FormStart events provide the application-start stage", async () => {
  const fixture = dbWithSchema({ pixel: true });
  fixture.add("HeatmapEvents", ["h1", "day1", "s1", "/home", "page_view", 0, "meta", "paid", "2026-09-01T00:00:00Z"]);
  fixture.add("pixel_events", ["p1", "day1", "FormStart", "form_start", "s1", "meta", "2026-09-01T00:01:00Z"]);
  fixture.add("Estimates", ["e1", "day1", "meta", "", "2026-09-01T00:02:00Z"]);
  const result = await readCrmFlowAnalysis(fixture.db, { tenantId: "day1", startDate: "2026-09-01", endDate: "2026-09-01" });
  assert.equal(result.stageAvailability.applicationStart.available, true);
  assert.equal(result.totals.current.applicationStarts, 1);
  assert.equal(result.totals.current.rates.visitToApplicationStart.value, 1);
  assert.equal(result.totals.current.rates.applicationStartToSaved.value, 1);
  fixture.sqlite.close();
});
