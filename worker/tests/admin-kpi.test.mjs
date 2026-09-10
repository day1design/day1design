import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  budgetBand,
  buildMetricComparison,
  classifyOrganicLead,
  parseBudgetWon,
  readAdminKpiCached,
  resolveKpiPeriod,
} from "../src/lib/admin-kpi.js";

const BUSINESS = [
  "inquiries", "metaReceived", "webReceived", "organic", "naverOrganic",
  "googleOrganic", "chatgptOrganic", "meetings", "contracts", "amount", "changes",
  "budget0", "budget1", "budget2", "budget3", "budget4", "budget5", "budget6",
];

function addDays(iso, amount) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function eachDay(start, endExclusive, fn) {
  for (let day = start; day < endExclusive; day = addDays(day, 1)) fn(day);
}

function d1(sqlite, observe = () => {}) {
  const stmt = (sql, args = []) => ({
    bind(...values) { return stmt(sql, values); },
    async first() { observe(sql, args); return sqlite.prepare(sql).get(...args) || null; },
    async all() { observe(sql, args); return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { observe(sql, args); const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes || 0) } }; },
  });
  return { prepare: (sql) => stmt(sql) };
}

function fixture(observe) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE CrmDataRevisions(tenant_id TEXT PRIMARY KEY,version INTEGER,updated_at TEXT);
    INSERT INTO CrmDataRevisions VALUES('day1design',1,'2026-09-10T00:00:00.000Z');
    CREATE TABLE AdminKpiDaily(tenant_id TEXT,day TEXT,metric TEXT,value REAL,source TEXT,coverage_status TEXT,source_revision TEXT,updated_at TEXT,PRIMARY KEY(tenant_id,day,metric));
    CREATE INDEX idx_admin_kpi_daily_metric_day ON AdminKpiDaily(tenant_id,metric,day);
    CREATE TABLE AdminKpiMonthly(tenant_id TEXT,month TEXT,metric TEXT,value REAL,source TEXT,coverage_status TEXT,source_revision TEXT,updated_at TEXT,PRIMARY KEY(tenant_id,month,metric));
    CREATE INDEX idx_admin_kpi_monthly_metric_month ON AdminKpiMonthly(tenant_id,metric,month);
    CREATE TABLE AdminKpiDirtyDays(tenant_id TEXT,day TEXT,source TEXT,revision INTEGER,dirty_at TEXT,PRIMARY KEY(tenant_id,day,source));
    CREATE TABLE AdminKpiSnapshotMeta(id TEXT PRIMARY KEY,tenant_id TEXT,anchor TEXT,period TEXT,revision INTEGER,r2_key TEXT,byte_size INTEGER,created_at TEXT,expires_at TEXT);
    CREATE UNIQUE INDEX idx_admin_kpi_snapshot_key ON AdminKpiSnapshotMeta(tenant_id,anchor,period,revision);
    CREATE TABLE MetaAdsDaily(id TEXT PRIMARY KEY,Date TEXT,CrmTenantId TEXT,Level TEXT,EntityId TEXT,EntityName TEXT,Impressions INTEGER,Clicks INTEGER,LinkClicks INTEGER,Spend REAL,Leads INTEGER,FetchedAt TEXT);
    CREATE INDEX idx_meta_ads_daily_tenant_date ON MetaAdsDaily(CrmTenantId,Date,Level);
    CREATE TABLE CrmGa4AnalyticsSnapshots(id TEXT PRIMARY KEY,tenant_id TEXT,source_kind TEXT,source_id TEXT,start_date TEXT,end_date TEXT,payload_json TEXT,created_at TEXT);
    CREATE INDEX idx_crm_ga4_snapshot_lookup ON CrmGa4AnalyticsSnapshots(tenant_id,source_kind,source_id,start_date,end_date,created_at DESC);
  `);
  return { sqlite, DB: d1(sqlite, observe) };
}

function seedBusiness(sqlite, start, endExclusive, values = {}) {
  const insert = sqlite.prepare("INSERT INTO AdminKpiDaily VALUES(?,?,?,?,?,?,?,?)");
  eachDay(start, endExclusive, (day) => {
    for (const metric of BUSINESS) insert.run("day1design", day, metric, values[metric] ?? 0, "business", "complete", "1", "2026-09-10T00:00:00.000Z");
  });
}

function seedMeta(sqlite, start, endExclusive, values = {}) {
  const insert = sqlite.prepare("INSERT INTO MetaAdsDaily(id,Date,CrmTenantId,Level,EntityId,EntityName,Impressions,Clicks,LinkClicks,Spend,Leads,FetchedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  eachDay(start, endExclusive, (day) => {
    insert.run(`meta-${day}`, day, "day1design", "account", "act_1", "Account", values.impressions ?? 0, values.clicks ?? 0, values.linkClicks ?? 0, values.spend ?? 0, values.leads ?? 0, values.fetchedAt ?? "2026-09-10T00:00:00.000Z");
  });
}

function seedGa4(sqlite, start, end, summary) {
  sqlite.prepare("INSERT INTO CrmGa4AnalyticsSnapshots VALUES(?,?,?,?,?,?,?,?)").run(
    `ga4-${start}-${end}`,
    "day1design",
    "ga4",
    "123",
    start,
    end,
    JSON.stringify({ tenant_id: "day1design", source_kind: "ga4", source_id: "123", summary }),
    "2026-09-10T00:00:00.000Z",
  );
}

async function read(sqlite, options = {}) {
  return readAdminKpiCached(d1(sqlite), {
    period: "7",
    anchor: "2026-09-10",
    now: new Date("2026-09-10T03:00:00.000Z"),
    metaAccountId: "act_1",
    ga4PropertyId: "123",
    ...options,
  });
}

test("KPI rolling periods end before the KST anchor", () => {
  const result = resolveKpiPeriod("7", "2026-09-10", new Date("2026-09-10T03:00:00.000Z"));
  assert.deepEqual(result.current, { start: "2026-09-03", endExclusive: "2026-09-10", end: "2026-09-09", days: 7 });
  assert.deepEqual(result.previous, { start: "2026-08-27", endExclusive: "2026-09-03", end: "2026-09-02", days: 7 });
});

test("monthly KPI periods use completed calendar months", () => {
  const result = resolveKpiPeriod("month", "2026-09-10", new Date("2026-09-10T03:00:00.000Z"));
  assert.equal(result.current.start, "2026-08-01");
  assert.equal(result.current.endExclusive, "2026-09-01");
  assert.equal(result.previous.start, "2026-07-01");
});

test("future KST anchors are rejected", () => {
  assert.throws(() => resolveKpiPeriod("7", "2026-09-11", new Date("2026-09-10T03:00:00.000Z")), /kpi_anchor_future/);
});

test("impossible provided anchors are rejected instead of defaulting to today", () => {
  assert.throws(() => resolveKpiPeriod("7", "2026-02-30", new Date("2026-09-10T03:00:00.000Z")), /kpi_anchor_invalid/);
});

test("organic attribution includes only search-originated homepage leads", () => {
  assert.equal(classifyOrganicLead({ FirstReferrer: "https://search.naver.com" }), "naver");
  assert.equal(classifyOrganicLead({ FirstReferrer: "https://www.google.com/search" }), "google");
  assert.equal(classifyOrganicLead({ FirstSource: "chatgpt" }), "chatgpt");
  assert.equal(classifyOrganicLead({ FirstSource: "google", MetaLeadId: "lead-1" }), null);
  assert.equal(classifyOrganicLead({ FirstSource: "instagram" }), null);
});

test("budget strings map to the seven fixed bands", () => {
  assert.equal(parseBudgetWon("1억 5천만원"), 15000);
  assert.equal(budgetBand("3천만원"), "3천-5천만원 미만");
  assert.equal(budgetBand("1억 5천만원"), "1억5천만원 이상");
  assert.equal(budgetBand(""), "미기재·분류 불가");
});

test("metric comparison exposes direction without treating unavailable values as zero", () => {
  const result = buildMetricComparison({ spend: 120, users: null }, { spend: 100, users: 10 });
  assert.deepEqual(result.spend, { current: 120, previous: 100, delta: 20, direction: "increase" });
  assert.equal(result.users.delta, null);
  assert.equal(result.users.direction, "unavailable");
});

test("KPI reuses saved business rollups, Meta daily rows, and exact GA4 snapshots", async () => {
  const { sqlite } = fixture();
  try {
    seedBusiness(sqlite, "2026-08-27", "2026-09-10", { inquiries: 2, organic: 1, naverOrganic: 1, budget1: 1 });
    seedMeta(sqlite, "2026-08-27", "2026-09-10", { impressions: 100, clicks: 30, linkClicks: 20, spend: 40, leads: 4 });
    seedGa4(sqlite, "2026-09-03", "2026-09-09", { users: 17, visitors: 999, sessions: 30, pageviews: 41 });
    seedGa4(sqlite, "2026-08-27", "2026-09-02", { users: 11, sessions: 20, pageviews: 31 });
    const result = await read(sqlite);
    assert.equal(result.status, undefined);
    assert.equal(result.coverage.status, "complete");
    assert.equal(result.metrics.inquiries.current, 14);
    assert.equal(result.metrics.spend.current, 280);
    assert.equal(result.metrics.linkClicks.current, 140);
    assert.equal(result.metrics.cpc.current, 2);
    assert.equal(result.metrics.cpl.current, 10);
    assert.equal(result.metrics.users.current, 17);
    assert.equal(result.metrics.sessions.previous, 20);
    assert.equal(result.budgetBands.find((band) => band.name === "3천-5천만원 미만").current, 7);
  } finally {
    sqlite.close();
  }
});

test("zero stored metrics remain valid zero when every required day exists", async () => {
  const { sqlite } = fixture();
  try {
    seedBusiness(sqlite, "2026-08-27", "2026-09-10");
    seedMeta(sqlite, "2026-08-27", "2026-09-10");
    seedGa4(sqlite, "2026-09-03", "2026-09-09", { users: 0, sessions: 0, pageviews: 0 });
    seedGa4(sqlite, "2026-08-27", "2026-09-02", { users: 0, sessions: 0, pageviews: 0 });
    const result = await read(sqlite);
    assert.equal(result.coverage.status, "complete");
    assert.equal(result.metrics.inquiries.current, 0);
    assert.equal(result.metrics.spend.current, 0);
    assert.equal(result.metrics.users.current, 0);
    assert.equal(result.metrics.cpl.current, null);
  } finally {
    sqlite.close();
  }
});

test("missing coverage and dirty days produce null values instead of fake zeroes", async () => {
  const { sqlite } = fixture();
  try {
    seedBusiness(sqlite, "2026-08-27", "2026-09-09", { inquiries: 1 });
    seedMeta(sqlite, "2026-08-27", "2026-09-10", { spend: 1, leads: 1 });
    seedGa4(sqlite, "2026-09-03", "2026-09-09", { users: 1, sessions: 1, pageviews: 1 });
    seedGa4(sqlite, "2026-08-27", "2026-09-02", { users: 1, sessions: 1, pageviews: 1 });
    sqlite.prepare("INSERT INTO AdminKpiDirtyDays VALUES(?,?,?,?,?)").run("day1design", "2026-09-08", "business", 1, "2026-09-10T00:00:00.000Z");
    const result = await read(sqlite);
    assert.equal(result.coverage.status, "insufficient");
    assert.equal(result.coverage.current.business.reason, "dirty_business_days");
    assert.equal(result.metrics.inquiries.current, null);
    assert.equal(result.metrics.spend.current, 7);
  } finally {
    sqlite.close();
  }
});

test("invalid stored GA4 numbers stay unavailable", async () => {
  const { sqlite } = fixture();
  try {
    seedBusiness(sqlite, "2026-08-27", "2026-09-10");
    seedMeta(sqlite, "2026-08-27", "2026-09-10");
    seedGa4(sqlite, "2026-09-03", "2026-09-09", { users: "not-a-number", sessions: 1, pageviews: 1 });
    seedGa4(sqlite, "2026-08-27", "2026-09-02", { users: 1, sessions: 1, pageviews: 1 });
    const result = await read(sqlite);
    assert.equal(result.metrics.users.current, null);
    assert.equal(result.coverage.current.ga4.reason, "ga4_snapshot_metric_missing");
  } finally { sqlite.close(); }
});

test("organic unit value uses recent 15 day CPL and savings uses selected period CPL", async () => {
  const { sqlite } = fixture();
  try {
    seedBusiness(sqlite, "2026-08-27", "2026-09-10", { organic: 2 });
    seedMeta(sqlite, "2026-08-26", "2026-09-10", { spend: 30, leads: 3, linkClicks: 10, impressions: 100, clicks: 10 });
    seedGa4(sqlite, "2026-09-03", "2026-09-09", { users: 1, sessions: 1, pageviews: 1 });
    seedGa4(sqlite, "2026-08-27", "2026-09-02", { users: 1, sessions: 1, pageviews: 1 });
    const result = await read(sqlite);
    assert.equal(result.organic.unitValue, 10);
    assert.equal(result.organic.savings, 140);
    assert.equal(result.organic.range, "2026.08.26-2026.09.09");
  } finally {
    sqlite.close();
  }
});

test("organic savings is withheld when the comparison period is incomplete", async () => {
  const { sqlite } = fixture();
  try {
    seedBusiness(sqlite, "2026-09-03", "2026-09-10", { organic: 2 });
    seedMeta(sqlite, "2026-08-26", "2026-09-10", { spend: 30, leads: 3 });
    seedGa4(sqlite, "2026-09-03", "2026-09-09", { users: 1, sessions: 1, pageviews: 1 });
    const result = await read(sqlite);
    assert.equal(result.organic.savings, null);
  } finally { sqlite.close(); }
});

test("cache is revision scoped and coalesces concurrent reads", async () => {
  let revisionReads = 0;
  let slowBusinessReads = 0;
  const { sqlite, DB } = fixture((sql) => {
    if (sql.includes("CrmDataRevisions")) revisionReads += 1;
    if (sql.includes("AdminKpiDaily")) slowBusinessReads += 1;
  });
  try {
    seedBusiness(sqlite, "2026-08-27", "2026-09-10", { inquiries: 1 });
    seedMeta(sqlite, "2026-08-27", "2026-09-10", { spend: 1, leads: 1 });
    seedGa4(sqlite, "2026-09-03", "2026-09-09", { users: 1, sessions: 1, pageviews: 1 });
    seedGa4(sqlite, "2026-08-27", "2026-09-02", { users: 1, sessions: 1, pageviews: 1 });
    const opts = { period: "7", anchor: "2026-09-10", now: new Date("2026-09-10T03:00:00.000Z"), metaAccountId: "act_1", ga4PropertyId: "123" };
    const [first, second] = await Promise.all([readAdminKpiCached(DB, opts), readAdminKpiCached(DB, opts)]);
    assert.equal(first.cache.hit, false);
    assert.equal(second.cache.coalesced, true);
    const third = await readAdminKpiCached(DB, opts);
    assert.equal(third.cache.hit, true);
    assert.ok(revisionReads >= 3);
    assert.ok(slowBusinessReads <= 4);
  } finally {
    sqlite.close();
  }
});

test("private R2 snapshot is written and read by exact period, role, tenant, and revision", async () => {
  const { sqlite } = fixture();
  const objects = new Map();
  const r2 = {
    async get(key) {
      const body = objects.get(key);
      return body ? { async json() { return JSON.parse(body); } } : null;
    },
    async put(key, value) { objects.set(key, value); },
  };
  try {
    seedBusiness(sqlite, "2026-08-27", "2026-09-10", { inquiries: 1 });
    seedMeta(sqlite, "2026-08-27", "2026-09-10", { spend: 1, leads: 1 });
    seedGa4(sqlite, "2026-09-03", "2026-09-09", { users: 1, sessions: 1, pageviews: 1 });
    seedGa4(sqlite, "2026-08-27", "2026-09-02", { users: 1, sessions: 1, pageviews: 1 });
    const opts = { period: "7", anchor: "2026-09-10", now: new Date("2026-09-10T03:00:00.000Z"), metaAccountId: "act_1", ga4PropertyId: "123", r2 };
    const first = await readAdminKpiCached(d1(sqlite), opts);
    assert.equal(first.cache.snapshot, "miss");
    assert.equal(objects.size, 1);
    const second = await readAdminKpiCached(d1(sqlite), opts);
    assert.equal(second.cache.snapshot, "hit");
    assert.equal(second.metrics.inquiries.current, 7);
    const otherBinding = await readAdminKpiCached(d1(sqlite), { ...opts, metaAccountId: "act_2" });
    assert.equal(otherBinding.cache.snapshot, "miss");
  } finally {
    sqlite.close();
  }
});
