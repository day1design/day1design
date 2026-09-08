import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { calculateAdMetrics, calculateCrmMetrics, composeBriefing, dailyBriefingKey, readCrmAnalytics } from "../src/lib/crm-analytics.js";

test("CPL/CPC/CPM return null when their denominator is missing", () => {
  const metrics = calculateAdMetrics({ spend: 100 });
  assert.equal(metrics.cpl.value, null);
  assert.equal(metrics.cpc.value, null);
  assert.equal(metrics.cpm.value, null);
});

test("advertising rates use period sums and separate link CPC", () => {
  const metrics = calculateAdMetrics({ spend: 100, impressions: 2000, clicks: 20, linkClicks: 10, leads: 4 });
  assert.equal(metrics.ctr.value, 0.01);
  assert.equal(metrics.cpc.value, 5);
  assert.equal(metrics.cpcLink.value, 10);
  assert.equal(metrics.cpm.value, 50);
  assert.equal(metrics.cpl.value, 25);
});

test("briefing contains facts and no invented performance verdict", () => {
  const result = composeBriefing({ facts: [{ type: "fact", key: "saved_leads", value: 2 }], hypotheses: [] }, { runDate: "2026-09-09" });
  assert.equal(result.schedule.key, "crm-briefing:2026-09-09:10:00:Asia/Seoul");
  assert.equal(result.verdict, null);
  assert.match(result.verdict_reason, /thresholds/);
});

test("daily key is stable and date bounded", () => {
  assert.equal(dailyBriefingKey("2026-09-09"), dailyBriefingKey("2026-09-09"));
  assert.throws(() => dailyBriefingKey("2026-9-9"), /invalid/);
});

test("legacy tables without tenant columns are unavailable instead of leaking stats", async () => {
  const calls = [];
  const db = { prepare(sql) { calls.push(sql); return { all: async () => (/PRAGMA/.test(sql) ? { results: [{ name: "id" }, { name: "SubmittedAt" }] } : { results: [] }), bind() { return this; } }; } };
  const result = await readCrmAnalytics(db, { tenantId: "day1design", startDate: "2026-09-01", endDate: "2026-09-09" });
  assert.equal(result.sources.every((source) => source.available === false), true);
  assert.equal(result.sources.every((source) => source.reason === "tenant_column_missing"), true);
  assert.equal(calls.some((sql) => /SELECT COUNT/.test(sql)), false);
});

test("CRM metrics keep saved Estimates and Meta reported leads distinct", () => {
  const metrics = calculateCrmMetrics({ savedLeads: 8, metaSavedLeads: 3, sessions: 100, ads: { spend: 120, leads: 10 } });
  assert.equal(metrics.savedLeads, 8);
  assert.equal(metrics.metaSavedLeads, 3);
  assert.equal(metrics.ads.leads, 10);
  assert.equal(metrics.metaSavedCpl.value, 40);
});

test("SQLite reader applies KST midnight bounds and tenant filters", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Estimates (id TEXT, CrmTenantId TEXT, SubmittedAt TEXT, Source TEXT, Platform TEXT);
    CREATE TABLE MetaAdsDaily (id TEXT, CrmTenantId TEXT, Date TEXT, Level TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER, FetchedAt TEXT, CreatedAt TEXT);
    CREATE TABLE pixel_events (id TEXT, CrmTenantId TEXT, created_at TEXT, event_name TEXT);
    CREATE TABLE HeatmapEvents (id TEXT, CrmTenantId TEXT, CreatedAt TEXT, EventType TEXT, SessionId TEXT, IsBot INTEGER);
    CREATE INDEX estimates_tenant_date ON Estimates(CrmTenantId, SubmittedAt);
    CREATE INDEX meta_tenant_date ON MetaAdsDaily(CrmTenantId, Date);
    CREATE INDEX pixel_tenant_date ON pixel_events(CrmTenantId, created_at);
    CREATE INDEX heatmap_tenant_date ON HeatmapEvents(CrmTenantId, CreatedAt);
  `);
  const add = (table, values) => sqlite.prepare(`INSERT INTO ${table} VALUES (${values.map(() => "?").join(",")})`).run(...values);
  add("Estimates", ["a-in", "day1", "2026-08-31T15:00:00.000Z", "meta", "Meta"]);
  add("Estimates", ["a-out", "day1", "2026-08-31T14:59:59.999Z", "homepage", ""]);
  add("Estimates", ["b-in", "other", "2026-08-31T15:00:00.000Z", "meta", "Meta"]);
  add("MetaAdsDaily", ["m-in", "day1", "2026-09-01", "account", 1000, 20, 10, 40, 4, "2026-09-01T02:00:00Z", ""]);
  add("MetaAdsDaily", ["m-campaign", "day1", "2026-09-01", "campaign", 9000, 900, 500, 900, 90, "2026-09-01T02:00:00Z", ""]);
  add("pixel_events", ["p-in", "day1", "2026-09-01T14:59:59.999Z", "PageView"]);
  add("pixel_events", ["p-out", "day1", "2026-09-01T15:00:00.000Z", "Lead"]);
  add("HeatmapEvents", ["h-in", "day1", "2026-09-01T14:59:59.999Z", "page_view", "s1", 0]);
  add("HeatmapEvents", ["h-bot", "day1", "2026-09-01T14:59:59.999Z", "page_view", "bot", 1]);
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...args) { return { all: async () => ({ results: statement.all(...args) }) }; }, all: async () => ({ results: statement.all() }) }; } };
  const result = await readCrmAnalytics(db, { tenantId: "day1", startDate: "2026-09-01", endDate: "2026-09-01", refreshedAt: "2026-09-02T00:00:00Z" });
  assert.equal(result.sources.find((source) => source.key === "saved_estimates").metrics.saved, 1);
  assert.deepEqual(result.sources.find((source) => source.key === "saved_estimates").metrics.trend, [
    { date: "2026-09-01", saved: 1, metaSaved: 1 },
  ]);
  assert.deepEqual(result.sources.find((source) => source.key === "saved_estimates").metrics.channels, [
    { channel: "meta", saved: 1, metaSaved: 1 },
  ]);
  assert.equal(result.sources.find((source) => source.key === "saved_estimates").metrics.channelsHasMore, false);
  assert.equal(result.sources.find((source) => source.key === "meta_ads").metrics.impressions, 1000);
  assert.equal(result.sources.find((source) => source.key === "pixel_events").metrics.pageviews, 1);
  assert.equal(result.sources.find((source) => source.key === "pixel_events").metrics.leads, 0);
  assert.equal(result.sources.find((source) => source.key === "sessions").metrics.sessions, 1);
  assert.equal(result.range.startUtc, "2026-08-31T15:00:00.000Z");
  assert.equal(result.range.endExclusiveUtc, "2026-09-01T15:00:00.000Z");
  add("Estimates", ["case-meta-1", "day1", "2026-09-01T00:00:00.000Z", "Meta", ""]);
  add("Estimates", ["case-meta-2", "day1", "2026-09-01T00:00:00.000Z", "meta", ""]);
  const sharedPrefix = "x".repeat(80);
  add("Estimates", ["long-channel-1", "day1", "2026-09-01T00:00:00.000Z", `${sharedPrefix}A`, ""]);
  add("Estimates", ["long-channel-2", "day1", "2026-09-01T00:00:00.000Z", `${sharedPrefix}B`, ""]);
  const normalized = await readCrmAnalytics(db, { tenantId: "day1", startDate: "2026-09-01", endDate: "2026-09-01" });
  const normalizedChannels = normalized.sources.find((source) => source.key === "saved_estimates").metrics.channels;
  assert.equal(normalizedChannels.find((channel) => channel.channel === "meta").saved, 3);
  assert.equal(normalizedChannels.filter((channel) => channel.channel === sharedPrefix).length, 1);
  assert.equal(normalizedChannels.find((channel) => channel.channel === sharedPrefix).saved, 2);
  for (let index = 0; index < 101; index += 1) {
    add("Estimates", [`channel-${index}`, "day1", "2026-09-01T00:00:00.000Z", `source-${index}`, ""]);
  }
  const crowded = await readCrmAnalytics(db, { tenantId: "day1", startDate: "2026-09-01", endDate: "2026-09-01" });
  const crowdedSaved = crowded.sources.find((source) => source.key === "saved_estimates").metrics;
  assert.equal(crowdedSaved.channels.length, 100);
  assert.equal(crowdedSaved.channelsHasMore, true);
  assert.equal(crowdedSaved.shownLeads + crowdedSaved.otherLeads, crowdedSaved.saved);
  assert.equal(crowdedSaved.shownMetaLeads + crowdedSaved.otherMetaLeads, crowdedSaved.metaSaved);
  sqlite.close();
});

test("invalid calendar dates and unknown counters remain unavailable", () => {
  assert.throws(() => dailyBriefingKey("2026-02-31"), /invalid/);
  const metrics = calculateCrmMetrics({ savedLeads: null, metaSavedLeads: null, sessions: null, ads: {} });
  assert.equal(metrics.savedLeads, null);
  assert.equal(metrics.sessions, null);
  assert.equal(metrics.savedLeadRate.value, null);
});
