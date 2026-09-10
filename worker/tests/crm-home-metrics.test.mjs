import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmHomeMetrics, homeMetricPeriods } from "../src/lib/crm-home-metrics.js";

function analytics(tenantId, savedLeads) {
  return {
    tenant_id: tenantId,
    metrics: { savedLeads },
    sources: [{ key: "saved_estimates", available: true, metrics: { saved: savedLeads } }],
    summary: {
      visitors: 120,
      touches: 100,
      returningVisitors: 20,
      pageviews: 240,
      avgDurationSec: 42.5,
      bounceRate: 0.25,
    },
  };
}

test("home periods use KST today and today-inclusive 30-day bounds", () => {
  assert.deepEqual(homeMetricPeriods("2026-09-09"), {
    today: { start: "2026-09-09", end: "2026-09-09", timezone: "Asia/Seoul" },
    recent30: { start: "2026-08-11", end: "2026-09-09", timezone: "Asia/Seoul" },
  });
});

test("home metrics map cached submission and traffic values without recalculation", () => {
  const result = buildCrmHomeMetrics({
    tenantId: "day1design",
    todayDate: "2026-09-09",
    todayAnalytics: analytics("day1design", 8),
    recent30Analytics: analytics("day1design", 158),
  });
  assert.deepEqual(result.submissions.today, { value: 8, reason: null });
  assert.deepEqual(result.submissions.recent30, { value: 158, reason: null });
  assert.deepEqual(result.traffic, {
    visitors: { value: 120, reason: null },
    touches: { value: 100, reason: null },
    returningVisitors: { value: 20, reason: null },
    pageviews: { value: 240, reason: null },
    avgDurationSec: { value: 42.5, reason: null },
    bounceRate: { value: 0.25, reason: null },
  });
});

test("missing analytics stays null with a concrete reason and self fallback is allowed", () => {
  const result = buildCrmHomeMetrics({
    tenantId: "day1design",
    todayDate: "2026-09-09",
    todayAnalytics: { tenant_id: "day1design", metrics: { savedLeads: null }, sources: [{ key: "saved_estimates", available: false, reason: "source_table_missing" }], self: { touches: 3, returningVisitors: 1, pageviews: 7, avgDwellSec: 12 } },
    recent30Analytics: null,
  });
  assert.deepEqual(result.submissions.today, { value: null, reason: "source_table_missing" });
  assert.deepEqual(result.submissions.recent30, { value: null, reason: "recent30_submissions_missing" });
  assert.deepEqual(result.traffic.touches, { value: 3, reason: null });
  assert.deepEqual(result.traffic.returningVisitors, { value: 1, reason: null });
  assert.deepEqual(result.traffic.pageviews, { value: 7, reason: null });
  assert.deepEqual(result.traffic.avgDurationSec, { value: 12, reason: null });
  assert.deepEqual(result.traffic.bounceRate, { value: null, reason: "traffic_bounce_rate_missing" });
});

test("payload from another tenant is never mapped into home metrics", () => {
  const result = buildCrmHomeMetrics({
    tenantId: "day1design",
    todayDate: "2026-09-09",
    todayAnalytics: analytics("other", 99),
    recent30Analytics: analytics("day1design", 158),
  });
  assert.deepEqual(result.submissions.today, { value: null, reason: "tenant_mismatch" });
  assert.equal(result.submissions.recent30.value, 158);
});

test("tenant-scoped traffic summary fills mapped fields without an analytics summary", () => {
  const result = buildCrmHomeMetrics({
    tenantId: "day1design",
    todayDate: "2026-09-09",
    todayAnalytics: { tenant_id: "day1design", metrics: { savedLeads: 2 }, sources: [] },
    recent30Analytics: { tenant_id: "day1design", metrics: { savedLeads: 5 }, sources: [] },
    trafficSummary: { tenant_id: "day1design", traffic: { touches: { value: 2, reason: null } } },
  });
  assert.deepEqual(result.traffic.touches, { value: 2, reason: null });
  assert.deepEqual(result.traffic.pageviews, { value: null, reason: "traffic_pageviews_missing" });
});

test("tenant-scoped traffic summary takes precedence over absent analytics summary", () => {
  const result = buildCrmHomeMetrics({
    tenantId: "day1design",
    todayDate: "2026-09-09",
    todayAnalytics: { tenant_id: "day1design", metrics: { savedLeads: 2 }, sources: [] },
    recent30Analytics: { tenant_id: "day1design", metrics: { savedLeads: 5 }, sources: [] },
    trafficSummary: { tenant_id: "day1design", traffic: { touches: { value: 2, reason: null } } },
  });
  assert.deepEqual(result.traffic.touches, { value: 2, reason: null });
  assert.deepEqual(result.traffic.pageviews, { value: null, reason: "traffic_pageviews_missing" });
});

test("tenant-scoped traffic summary falls back to cached analytics when a field is unavailable", () => {
  const result = buildCrmHomeMetrics({
    tenantId: "day1design",
    todayDate: "2026-09-09",
    todayAnalytics: { ...analytics("day1design", 2), summary: undefined, self: { returningVisitors: 2 } },
    recent30Analytics: null,
    trafficSummary: {
      tenant_id: "day1design",
      traffic: {
        touches: { value: 4, reason: null },
        returningVisitors: { value: null, reason: "traffic_returning_visitors_ga4_unavailable" },
      },
    },
  });
  assert.deepEqual(result.traffic.touches, { value: 4, reason: null });
  assert.deepEqual(result.traffic.returningVisitors, { value: 2, reason: null });
});

test("traffic summary with a different period cannot supply today's home metrics", () => {
  const result = buildCrmHomeMetrics({
    tenantId: "day1design",
    todayDate: "2026-09-09",
    todayAnalytics: { tenant_id: "day1design", range: { startDate: "2026-09-08", endDate: "2026-09-08" }, summary: { returningVisitors: 3 } },
    trafficSummary: { tenant_id: "day1design", period: { start: "2026-09-08", end: "2026-09-08" }, traffic: { returningVisitors: { value: 99, reason: null } } },
  });
  assert.deepEqual(result.traffic.returningVisitors, { value: null, reason: "traffic_returning_visitors_missing" });
});
