import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { persistCrmGa4Snapshot, readCrmTrafficSummary } from "../src/lib/crm-traffic-summary.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE HeatmapEvents (id TEXT PRIMARY KEY, CrmTenantId TEXT, SessionId TEXT, Page TEXT, EventType TEXT, IsBot INTEGER, CreatedAt TEXT);
    CREATE INDEX heatmap_tenant_date ON HeatmapEvents(CrmTenantId, CreatedAt);
  `);
  const add = db.prepare("INSERT INTO HeatmapEvents VALUES (?, ?, ?, ?, ?, ?, ?)");
  add.run("a", "day1design", "s1", "/", "page_view", 0, "2026-09-09T00:00:00.000Z");
  add.run("b", "day1design", "s1", "/contact", "page_view", 0, "2026-09-09T00:01:00.000Z");
  add.run("c", "day1design", "s2", "/", "page_view", 0, "2026-09-09T00:02:00.000Z");
  add.run("d", "other", "sx", "/", "page_view", 0, "2026-09-09T00:03:00.000Z");
  add.run("e", "day1design", "bot", "/", "page_view", 1, "2026-09-09T00:04:00.000Z");
  return db;
}

test("reads tenant-safe touch, pageview, and dwell numbers without fabricating GA4 fields", async () => {
  const result = await readCrmTrafficSummary(fixture(), { tenantId: "day1design", startDate: "2026-09-09", endDate: "2026-09-09" });
  assert.equal(result.available, true);
  assert.deepEqual(result.traffic.touches, { value: 2, reason: null });
  assert.deepEqual(result.traffic.pageviews, { value: null, reason: "ga4_property_binding_missing" });
  assert.deepEqual(result.traffic.avgDurationSec, { value: null, reason: "ga4_property_binding_missing" });
  assert.equal(result.traffic.visitors.value, null);
  assert.equal(result.traffic.bounceRate.value, null);
  assert.equal(result.traffic.returningVisitors.value, null);
  assert.equal(result.traffic.returningVisitors.reason, "traffic_returning_visitors_tenant_history_unavailable");
});

test("rejects non-day1 tenant traffic and does not mix rows", async () => {
  const result = await readCrmTrafficSummary(fixture(), { tenantId: "other", startDate: "2026-09-09", endDate: "2026-09-09" });
  assert.equal(result.reason, "traffic_tenant_not_authorized");
  assert.equal(result.traffic.touches.value, null);
});

test("requires the tenant/date index before querying HeatmapEvents", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE HeatmapEvents (id TEXT, CrmTenantId TEXT, SessionId TEXT, EventType TEXT, IsBot INTEGER, CreatedAt TEXT)");
  const result = await readCrmTrafficSummary(db, { tenantId: "day1design", startDate: "2026-09-09", endDate: "2026-09-09" });
  assert.equal(result.reason, "heatmap_tenant_date_index_missing");
  assert.equal(result.traffic.pageviews.value, null);
});

test("uses only an explicitly tenant/property-bound GA4 snapshot", async () => {
  const db = fixture();
  db.exec(`
    CREATE TABLE CrmGa4AnalyticsSnapshots (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, source_kind TEXT NOT NULL, source_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX idx_ga4_binding ON CrmGa4AnalyticsSnapshots(tenant_id,source_kind,source_id,start_date,end_date);
  `);
  await persistCrmGa4Snapshot(db, {
    tenantId: "day1design", propertyId: "537274300", startDate: "2026-09-09", endDate: "2026-09-09",
    summary: { visitors: 12, pageviews: 40, avgDurationSec: 18, bounceRate: 0.2 }, createdAt: "2026-09-10T00:00:00.000Z",
  });
  const result = await readCrmTrafficSummary(db, { tenantId: "day1design", propertyId: "537274300", startDate: "2026-09-09", endDate: "2026-09-09" });
  assert.deepEqual(result.traffic.visitors, { value: 12, reason: null });
  assert.deepEqual(result.traffic.pageviews, { value: 40, reason: null });
  assert.deepEqual(result.traffic.avgDurationSec, { value: 18, reason: null });
  assert.deepEqual(result.traffic.bounceRate, { value: 0.2, reason: null });
  const wrongProperty = await readCrmTrafficSummary(db, { tenantId: "day1design", propertyId: "9999999", startDate: "2026-09-09", endDate: "2026-09-09" });
  assert.equal(wrongProperty.traffic.visitors.value, null);
  assert.equal(wrongProperty.traffic.visitors.reason, "ga4_tenant_snapshot_missing");
});

test("falls back to the tenant property's legacy self snapshot for returning visitors", async () => {
  const db = fixture();
  db.exec("CREATE TABLE AnalyticsSnapshots (Payload TEXT NOT NULL, RangeKey TEXT NOT NULL, Source TEXT NOT NULL, StartDate TEXT NOT NULL, EndDate TEXT NOT NULL, CreatedAt TEXT NOT NULL); CREATE INDEX idx_analytics_snapshots_range ON AnalyticsSnapshots(RangeKey,StartDate,EndDate,Source,CreatedAt DESC)");
  db.prepare("INSERT INTO AnalyticsSnapshots VALUES (?, 'today', 'self', ?, ?, ?)").run(JSON.stringify({ propertyId: "537274300", self: { returningVisitors: 2 } }), "2026-09-09", "2026-09-09", "2026-09-10T00:00:00.000Z");
  const result = await readCrmTrafficSummary(db, { tenantId: "day1design", propertyId: "537274300", startDate: "2026-09-09", endDate: "2026-09-09" });
  assert.deepEqual(result.traffic.returningVisitors, { value: 2, reason: null });
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT Payload FROM AnalyticsSnapshots WHERE RangeKey=? AND StartDate=? AND EndDate=? AND Source=? AND length(Payload)<=? ORDER BY CreatedAt DESC LIMIT 1").all("today", "2026-09-09", "2026-09-09", "self", 524288);
  assert.ok(plan.some((row) => String(row.detail || "").includes("idx_analytics_snapshots_range")));
});

test("legacy self snapshot never crosses the requested period or payload bound", async () => {
  const db = fixture();
  db.exec("CREATE TABLE AnalyticsSnapshots (Payload TEXT NOT NULL, RangeKey TEXT NOT NULL, Source TEXT NOT NULL, StartDate TEXT NOT NULL, EndDate TEXT NOT NULL, CreatedAt TEXT NOT NULL); CREATE INDEX idx_analytics_snapshots_range ON AnalyticsSnapshots(RangeKey,StartDate,EndDate,Source,CreatedAt DESC)");
  db.prepare("INSERT INTO AnalyticsSnapshots VALUES (?, 'today', 'self', ?, ?, ?)").run(JSON.stringify({ propertyId: "537274300", self: { returningVisitors: 9 } }), "2026-09-08", "2026-09-08", "2026-09-09T00:00:00.000Z");
  db.prepare("INSERT INTO AnalyticsSnapshots VALUES (?, 'today', 'self', ?, ?, ?)").run("x".repeat(524289), "2026-09-09", "2026-09-09", "2026-09-10T00:00:00.000Z");
  const result = await readCrmTrafficSummary(db, { tenantId: "day1design", propertyId: "537274300", startDate: "2026-09-09", endDate: "2026-09-09" });
  assert.deepEqual(result.traffic.returningVisitors, { value: null, reason: "ga4_tenant_snapshot_table_missing" });
});
