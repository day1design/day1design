import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { calculateAdMetrics, calculateCrmMetrics, composeBriefing, dailyBriefingKey, readCrmAnalytics } from "../src/lib/crm-analytics.js";

test("CPL/CPC/CPM return null when their denominator is missing", () => {
  const metrics = calculateAdMetrics({ spend: 100 });
  assert.equal(metrics.cpl.value, null);
  assert.equal(metrics.cpc.value, null);
  assert.equal(metrics.cpm.value, null);
  assert.equal(metrics.ctrLink.value, null);
});

test("advertising rates use period sums and separate link CPC", () => {
  const metrics = calculateAdMetrics({ spend: 100, impressions: 2000, clicks: 20, linkClicks: 10, leads: 4 });
  assert.equal(metrics.ctr.value, 0.01);
  assert.equal(metrics.ctrLink.value, 0.005);
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

test("briefing preserves ad methods, nullable currency, period, and flow evidence", () => {
  const result = composeBriefing({
    range: { startDate: "2026-09-01", endDate: "2026-09-07", timezone: "Asia/Seoul" },
    metrics: { ads: { spend: 12, leads: 2, impressions: 1000, linkClicks: 20, cpl: { value: 6, method: "spend / Meta reported leads" }, cpcLink: { value: 0.6, method: "spend / link_clicks" }, cpm: { value: 12, method: "spend * 1000 / impressions" }, ctrLink: { value: 0.02, method: "link_clicks / impressions" } } },
    facts: [],
    hypotheses: [],
  }, { runDate: "2026-09-09", flow: { available: true, periods: { current: { start: "2026-09-01", end: "2026-09-07" }, previous: { start: "2026-08-25", end: "2026-08-31" } }, totals: { current: { visits: 10 }, previous: { visits: 8 } }, facts: [{ type: "fact", key: "visits", value: 10 }] } });
  assert.deepEqual(result.period, { startDate: "2026-09-01", endDate: "2026-09-07", timezone: "Asia/Seoul" });
  assert.deepEqual(result.metrics, { spend: 12, leads: 2, impressions: 1000, linkClicks: 20, currency: null, cpl: 6, cpc: 0.6, cpm: 12, ctr: 0.02, methods: { cpl: "spend / Meta reported leads", cpc: "spend / link_clicks", cpm: "spend * 1000 / impressions", ctr: "link_clicks / impressions" } });
  assert.equal(result.flow.available, true);
  assert.equal(result.flow.totals.current.visits, 10);
  assert.equal(result.flow.totals.previous.visits, 8);
  assert.equal(result.flow.facts[0].value, 10);
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
    { date: "2026-09-01", saved: 1, metaSaved: 1, homepageSaved: 0 },
  ]);
  assert.deepEqual(result.sources.find((source) => source.key === "saved_estimates").metrics.channels, [
    { channel: "meta", saved: 1, metaSaved: 1 },
  ]);
  assert.equal(result.sources.find((source) => source.key === "saved_estimates").metrics.channelsHasMore, false);
  assert.equal(result.sources.find((source) => source.key === "meta_ads").metrics.impressions, 1000);
  assert.equal(result.sources.find((source) => source.key === "pixel_events").metrics.pageviews, 1);
  assert.equal(result.sources.find((source) => source.key === "pixel_events").metrics.leads, 0);
  assert.equal(result.sources.find((source) => source.key === "sessions").metrics.sessions, 1);
  assert.deepEqual(result.sources.find((source) => source.key === "sessions").metrics.trend, [
    { date: "2026-09-01", sessions: 1 },
  ]);
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

test("D02 intake details use the submitted cohort and keep tenant data isolated", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, SubmittedAt TEXT, Source TEXT, Platform TEXT, EstimateAmount INTEGER, Address TEXT, Status TEXT, Assignee TEXT, Branch TEXT, ConsultAt TEXT, ContractAt TEXT, ContractAmount INTEGER);
    CREATE TABLE CrmAppointments (id TEXT PRIMARY KEY, tenant_id TEXT, estimate_id TEXT, kind TEXT, status TEXT, starts_at TEXT);
    CREATE TABLE CrmContracts (id TEXT PRIMARY KEY, tenant_id TEXT, estimate_id TEXT, status TEXT, amount INTEGER, signed_at TEXT);
    CREATE INDEX estimates_tenant_date ON Estimates(CrmTenantId, SubmittedAt);
  `);
  const add = (table, values) => sqlite.prepare(`INSERT INTO ${table} VALUES (${values.map(() => "?").join(",")})`).run(...values);
  add("Estimates", ["e1", "day1", "2026-09-04T15:00:00.000Z", "homepage", "web", 50000000, "경기도 성남시 분당구", "접수대기", "담당 A", "판교점", "", "", 0]);
  add("Estimates", ["e2", "day1", "2026-09-05T15:00:00.000Z", "meta", "Meta", 0, "서울특별시 강남구", "보류", "담당 B", "강남점", "", "2026-09-16T01:00:00.000Z", 30000000]);
  add("Estimates", ["e3", "day1", "2026-09-05T16:00:00.000Z", "homepage", "web", 0, "경기도 성남시 수정구", "접수대기", "담당 A", "판교점", "", "", 0]);
  add("Estimates", ["other", "other", "2026-09-04T15:00:00.000Z", "homepage", "web", 90000000, "서울특별시", "계약완료", "외부", "강남점", "", "", 0]);
  add("CrmAppointments", ["a1", "day1", "e1", "visit", "scheduled", "2026-09-12T01:00:00.000Z"]);
  add("CrmAppointments", ["a2", "day1", "e2", "measurement", "cancelled", "2026-09-13T01:00:00.000Z"]);
  add("CrmAppointments", ["a3", "other", "other", "visit", "scheduled", "2026-09-12T01:00:00.000Z"]);
  add("CrmContracts", ["c1", "day1", "e1", "signed", 50000000, "2026-09-15T01:00:00.000Z"]);
  add("CrmContracts", ["c2", "other", "other", "signed", 90000000, "2026-09-15T01:00:00.000Z"]);
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...args) { return { all: async () => ({ results: statement.all(...args) }) }; }, all: async () => ({ results: statement.all() }) }; } };
  const result = await readCrmAnalytics(db, { tenantId: "day1", startDate: "2026-09-05", endDate: "2026-09-06" });
  const saved = result.sources.find((source) => source.key === "saved_estimates").metrics;
  assert.equal(saved.saved, 3);
  assert.deepEqual(Object.fromEntries(saved.intake.dimensions.regions.values.map((row) => [row.value, row.count])), { 서울: 1, 성남: 2 });
  assert.deepEqual(saved.intake.dimensions.budget.values, [
    { label: "3천만 미만", count: 0 },
    { label: "3~5천만", count: 0 },
    { label: "5~7천만", count: 1 },
    { label: "7천만 이상", count: 0 },
    { label: "미확인", count: 2 },
  ]);
  assert.equal(saved.intake.dimensions.budget.known, 1);
  assert.equal(saved.intake.dimensions.budget.unknown, 2);
  assert.equal(saved.intake.dimensions.budget.hasMore, false);
  assert.deepEqual(saved.intakeChannels, [
    { channel: "홈페이지", saved: 2 },
    { channel: "Meta 내부폼", saved: 1 },
  ]);
  assert.deepEqual(saved.intake.cohort.appointments.values, [
    { kind: "measurement", customers: 1, events: 1, cancelled: 1 },
    { kind: "visit", customers: 1, events: 1, cancelled: 0 },
  ]);
  assert.deepEqual(saved.intake.cohort.contracts.values, [{ status: "signed", customers: 2, events: 2, amount: 80000000 }]);
  const empty = await readCrmAnalytics(db, { tenantId: "day1", startDate: "2026-09-20", endDate: "2026-09-20" });
  const emptySaved = empty.sources.find((source) => source.key === "saved_estimates").metrics;
  assert.equal(emptySaved.saved, 0);
  assert.equal(emptySaved.intake.cohort.appointments.values.length, 0);
  assert.equal(emptySaved.intake.cohort.contracts.values.length, 0);
  sqlite.close();
});

test("D02 budget buckets and intake channels apply boundaries, tenant, and date bounds", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, SubmittedAt TEXT, Source TEXT, Platform TEXT, MetaLeadId TEXT, EstimateAmount INTEGER);
    CREATE INDEX estimates_tenant_date ON Estimates(CrmTenantId, SubmittedAt);
  `);
  const add = (id, tenant, submittedAt, source, metaLeadId, amount) => sqlite.prepare("INSERT INTO Estimates VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, tenant, submittedAt, source, "", metaLeadId, amount);
  add("below", "day1", "2026-09-05T00:00:00.000Z", "homepage", "", 29999999);
  add("at30", "day1", "2026-09-05T01:00:00.000Z", "homepage", "", 30000000);
  add("at50", "day1", "2026-09-05T02:00:00.000Z", "homepage", "", 50000000);
  add("at70", "day1", "2026-09-05T03:00:00.000Z", "meta", "lead-70", 70000000);
  add("zero", "day1", "2026-09-05T04:00:00.000Z", "homepage", "", 0);
  add("null", "day1", "2026-09-05T05:00:00.000Z", "homepage", "", null);
  add("instagram", "day1", "2026-09-05T06:00:00.000Z", "instagram", "", 10000000);
  add("other-tenant", "other", "2026-09-05T00:00:00.000Z", "meta", "other-lead", 90000000);
  add("other-date", "day1", "2026-09-06T00:00:00.000Z", "meta", "future-lead", 90000000);
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...args) { return { all: async () => ({ results: statement.all(...args) }) }; }, all: async () => ({ results: statement.all() }) }; } };
  const result = await readCrmAnalytics(db, { tenantId: "day1", startDate: "2026-09-05", endDate: "2026-09-05" });
  const saved = result.sources.find((source) => source.key === "saved_estimates").metrics;
  assert.deepEqual(saved.intake.dimensions.budget.values, [
    { label: "3천만 미만", count: 2 },
    { label: "3~5천만", count: 1 },
    { label: "5~7천만", count: 1 },
    { label: "7천만 이상", count: 1 },
    { label: "미확인", count: 2 },
  ]);
  assert.equal(saved.intake.dimensions.budget.known, 5);
  assert.equal(saved.intake.dimensions.budget.unknown, 2);
  assert.equal(saved.intake.dimensions.budget.hasMore, false);
  assert.deepEqual(saved.intakeChannels, [
    { channel: "홈페이지", saved: 6 },
    { channel: "Meta 내부폼", saved: 1 },
  ]);
  sqlite.close();
});

test("traffic trends pair KST sessions with homepage receipts and zero-fill available dates", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, SubmittedAt TEXT, Source TEXT, Platform TEXT, MetaLeadId TEXT);
    CREATE TABLE HeatmapEvents (id TEXT PRIMARY KEY, CrmTenantId TEXT, CreatedAt TEXT, EventType TEXT, SessionId TEXT, IsBot INTEGER);
    CREATE INDEX estimates_tenant_date ON Estimates(CrmTenantId, SubmittedAt);
    CREATE INDEX heatmap_tenant_date ON HeatmapEvents(CrmTenantId, CreatedAt);
  `);
  const estimate = sqlite.prepare("INSERT INTO Estimates VALUES (?, ?, ?, ?, ?, ?)");
  const event = sqlite.prepare("INSERT INTO HeatmapEvents VALUES (?, ?, ?, ?, ?, ?)");
  estimate.run("home-day1", "day1", "2026-08-31T15:00:00.000Z", "homepage", "web", "");
  estimate.run("instagram-day2", "day1", "2026-09-01T15:00:00.000Z", "instagram", "", "");
  estimate.run("meta-day2", "day1", "2026-09-01T16:00:00.000Z", "meta", "Meta", "lead-1");
  estimate.run("other-tenant", "other", "2026-08-31T15:00:00.000Z", "homepage", "web", "");
  event.run("visit-day1", "day1", "2026-08-31T15:00:00.000Z", "page_view", "session-1", 0);
  event.run("visit-day2", "day1", "2026-09-01T15:00:00.000Z", "page_view", "session-2", 0);
  event.run("bot-day2", "day1", "2026-09-01T16:00:00.000Z", "page_view", "bot", 1);
  event.run("other-tenant", "other", "2026-08-31T15:00:00.000Z", "page_view", "other", 0);
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...args) { return { all: async () => ({ results: statement.all(...args) }) }; }, all: async () => ({ results: statement.all() }) }; } };
  const result = await readCrmAnalytics(db, { tenantId: "day1", startDate: "2026-09-01", endDate: "2026-09-03" });
  const saved = result.sources.find((source) => source.key === "saved_estimates").metrics;
  const sessions = result.sources.find((source) => source.key === "sessions").metrics;
  assert.deepEqual(saved.trend, [
    { date: "2026-09-01", saved: 1, metaSaved: 0, homepageSaved: 1 },
    { date: "2026-09-02", saved: 2, metaSaved: 2, homepageSaved: 1 },
    { date: "2026-09-03", saved: 0, metaSaved: 0, homepageSaved: 0 },
  ]);
  assert.deepEqual(sessions.trend, [
    { date: "2026-09-01", sessions: 1 },
    { date: "2026-09-02", sessions: 1 },
    { date: "2026-09-03", sessions: 0 },
  ]);
  const empty = await readCrmAnalytics(db, { tenantId: "day1", startDate: "2026-09-10", endDate: "2026-09-11" });
  assert.deepEqual(empty.sources.find((source) => source.key === "saved_estimates").metrics.trend, [
    { date: "2026-09-10", saved: 0, metaSaved: 0, homepageSaved: 0 },
    { date: "2026-09-11", saved: 0, metaSaved: 0, homepageSaved: 0 },
  ]);
  assert.deepEqual(empty.sources.find((source) => source.key === "sessions").metrics.trend, [
    { date: "2026-09-10", sessions: 0 },
    { date: "2026-09-11", sessions: 0 },
  ]);
  sqlite.close();
});
