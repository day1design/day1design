import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readCachedCrmMetaAdCards, readCrmMetaAdCards } from "../src/lib/crm-meta-ad-cards.js";
import { metaCreativeThumbKey } from "../src/lib/crm-meta-preview.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE MetaAdsAd (CrmTenantId TEXT NOT NULL DEFAULT 'day1design',Date TEXT,AdId TEXT,AdName TEXT,AdsetId TEXT,AdsetName TEXT,CampaignId TEXT,CampaignName TEXT,CreativeId TEXT,CreativeType TEXT,ThumbnailUrl TEXT,Status TEXT,CreativeTitle TEXT,CreativeBody TEXT,CreativeCallToAction TEXT,CreativeLinkUrl TEXT,CreativeVariants TEXT,Impressions INTEGER,Clicks INTEGER,LinkClicks INTEGER,Spend REAL,Leads INTEGER); CREATE INDEX idx_meta_ads_ad_date_adid ON MetaAdsAd(Date,AdId); CREATE INDEX idx_meta_ads_ad_adid_date ON MetaAdsAd(AdId,Date); CREATE INDEX idx_meta_ads_ad_tenant_date_adid ON MetaAdsAd(CrmTenantId,Date,AdId); CREATE INDEX idx_meta_ads_ad_tenant_adid_date ON MetaAdsAd(CrmTenantId,AdId,Date); CREATE TABLE MetaAdsCreativeCatalog (CrmTenantId TEXT NOT NULL,SnapshotDate TEXT NOT NULL,AdId TEXT NOT NULL,AdName TEXT NOT NULL DEFAULT '',AdsetId TEXT NOT NULL DEFAULT '',AdsetName TEXT NOT NULL DEFAULT '',CampaignId TEXT NOT NULL DEFAULT '',CampaignName TEXT NOT NULL DEFAULT '',CreativeId TEXT NOT NULL DEFAULT '',CreativeType TEXT NOT NULL DEFAULT '',VideoId TEXT NOT NULL DEFAULT '',Status TEXT NOT NULL DEFAULT '',UpdatedAt TEXT NOT NULL DEFAULT ''); CREATE INDEX idx_meta_creative_catalog_tenant_date_adid ON MetaAdsCreativeCatalog(CrmTenantId,SnapshotDate,AdId); CREATE INDEX idx_meta_creative_catalog_tenant_adid_date ON MetaAdsCreativeCatalog(CrmTenantId,AdId,SnapshotDate);`);
  db.exec("ALTER TABLE MetaAdsAd ADD COLUMN VideoId TEXT");
  const add = db.prepare("INSERT INTO MetaAdsAd (Date,AdId,AdName,AdsetId,AdsetName,CampaignId,CampaignName,CreativeId,CreativeType,ThumbnailUrl,Status,CreativeTitle,CreativeBody,CreativeCallToAction,CreativeLinkUrl,CreativeVariants,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  add.run("2026-09-10", "101", "Ad 1", "set-1", "Set", "camp-1", "Campaign", "cr-1", "IMAGE", "https://r2.test/a.webp", "ACTIVE", "제목", "본문", "상담하기", "https://example.test", JSON.stringify([{ title: "제목", body: "본문" }, { title: "대체 제목", body: "대체 본문" }]), 1000, 100, 80, 50, 5);
  add.run("2026-09-09", "101", "Ad 1", "set-1", "Set", "camp-1", "Campaign", "cr-1", "IMAGE", "https://r2.test/a.webp", "ACTIVE", "제목", "본문", "상담하기", "https://example.test", "", 500, 50, 40, 25, 2);
  add.run("2026-09-10", "102", "Ad 2", "set-2", "Set", "camp-2", "Campaign 2", "cr-2", "IMAGE", "https://r2.test/b.webp", "PAUSED", "제목2", "본문2", "자세히", "https://example.test/b", "", 100, 10, 8, 5, 1);
  db.prepare("UPDATE MetaAdsAd SET VideoId=? WHERE AdId=?").run("video-101", "101");
  return db;
}

test("returns bounded creative cards with metrics and daily series", async () => {
  const result = await readCrmMetaAdCards(fixture(), { tenantId: "day1design", startDate: "2026-09-09", endDate: "2026-09-10", limit: 20 });
  assert.equal(result.available, true);
  assert.equal(result.cards[0].creative.title, "제목");
  assert.equal(result.cards[0].creative.body, "본문");
  assert.equal(result.cards[0].creative.callToAction, "상담하기");
  assert.equal(result.cards[0].creative.linkUrl, "https://example.test");
  assert.equal(result.cards[0].creative.variants.length, 2);
  assert.equal(result.cards[0].creative.thumbnailUrl, null);
  assert.equal(result.cards[0].creative.thumbnailRef.key, "meta-ads/thumbs/cr-1");
  assert.equal(result.cards[0].creative.videoId, "video-101");
  assert.equal(result.cards[0].metrics.cpc, 0.625);
  assert.equal(result.cards[0].metrics.cpl, 75 / 7);
  assert.equal(result.cards[0].daily.length, 2);
});

test("rejects other tenants and periods over 31 days", async () => {
  await assert.rejects(() => readCrmMetaAdCards(fixture(), { tenantId: "other", startDate: "2026-09-09", endDate: "2026-09-10" }), /not_authorized/);
  await assert.rejects(() => readCrmMetaAdCards(fixture(), { tenantId: "day1design", startDate: "2026-08-01", endDate: "2026-09-10" }), /period_exceeded/);
});

test("does not mix rows from another tenant", async () => {
  const db = fixture();
  db.prepare("INSERT INTO MetaAdsAd (CrmTenantId,Date,AdId,AdName,CreativeId,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run("other-tenant", "2026-09-10", "099", "foreign", "foreign", 999, 99, 99, 99, 99);
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10" });
  assert.equal(result.cards.some((card) => card.adId === "099"), false);
});

test("keeps a new catalog ad visible when Insights has no row", async () => {
  const db = fixture();
  db.prepare("INSERT INTO MetaAdsCreativeCatalog (CrmTenantId,SnapshotDate,AdId,AdName,CreativeId,CreativeType,Status,UpdatedAt) VALUES(?,?,?,?,?,?,?,?)")
    .run("day1design", "2026-09-10", "099", "신규 광고", "creative-099", "VIDEO", "PAUSED", "2026-09-10T04:00:00Z");
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10" });
  const card = result.cards.find((item) => item.adId === "099");
  assert.equal(card.adName, "신규 광고");
  assert.equal(card.status, "PAUSED");
  assert.equal(card.metrics.impressions, null);
  assert.deepEqual(card.daily, []);
});

test("catalog metadata does not overwrite metrics from overlapping Insights", async () => {
  const db = fixture();
  db.prepare("INSERT INTO MetaAdsCreativeCatalog (CrmTenantId,SnapshotDate,AdId,AdName,CreativeId,CreativeType,Status,UpdatedAt) VALUES(?,?,?,?,?,?,?,?)")
    .run("day1design", "2026-09-10", "101", "최신 이름", "creative-latest", "VIDEO", "PAUSED", "2026-09-10T04:00:00Z");
  const card = (await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10" })).cards.find((item) => item.adId === "101");
  assert.equal(card.adName, "최신 이름");
  assert.equal(card.metrics.impressions, 1000);
  assert.equal(card.metrics.spend, 50);
});

test("keeps 21 unique ads paginable when each exists in both sources", async () => {
  const db = fixture();
  const ad = db.prepare("INSERT INTO MetaAdsAd (CrmTenantId,Date,AdId,AdName,CreativeId,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES(?,?,?,?,?,?,?,?,?,?)");
  const catalog = db.prepare("INSERT INTO MetaAdsCreativeCatalog (CrmTenantId,SnapshotDate,AdId,AdName,CreativeId,Status) VALUES(?,?,?,?,?,?)");
  for (let i = 1; i <= 21; i += 1) {
    const id = String(300 + i);
    ad.run("day1design", "2026-09-10", id, `insight-${id}`, `creative-${id}`, 1, 1, 1, 1, 1);
    catalog.run("day1design", "2026-09-10", id, `catalog-${id}`, `creative-${id}`, "ACTIVE");
  }
  const first = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10", limit: 20, cursor: "300" });
  const second = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10", limit: 20, cursor: first.nextCursor });
  const ids = [...first.cards, ...second.cards].map((item) => item.adId);
  assert.equal(first.cards.length, 20);
  assert.equal(second.cards.length, 1);
  assert.equal(new Set(ids).size, 21);
});

test("hydrates latest catalog metadata for 20 ads across 31 snapshots", async () => {
  const db = fixture();
  const catalog = db.prepare("INSERT INTO MetaAdsCreativeCatalog (CrmTenantId,SnapshotDate,AdId,AdName,CreativeId,Status) VALUES(?,?,?,?,?,?)");
  for (let day = 0; day < 31; day += 1) {
    const date = new Date(Date.parse("2026-08-11T00:00:00Z") + day * 86400000).toISOString().slice(0, 10);
    for (let ad = 1; ad <= 20; ad += 1) catalog.run("day1design", date, `cat-${ad}`, `ad-${ad}-${date}`, `creative-${ad}`, "PAUSED");
  }
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-08-11", endDate: "2026-09-10", limit: 20, cursor: "102" });
  assert.equal(result.cards.length, 20);
  assert.equal(result.cards.filter((card) => card.adName.endsWith("2026-09-10")).length, 20);
});

test("uses strict keyset cursors and singleflight cache", async () => {
  const db = fixture();
  await assert.rejects(() => readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-09", endDate: "2026-09-10", cursor: "x".repeat(121) }), /cursor_invalid/);
  await assert.rejects(() => readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-09", endDate: "2026-09-10", cursor: "101x" }), /cursor_invalid/);
  const query = { tenantId: "day1design", startDate: "2026-09-09", endDate: "2026-09-10", limit: 1, now: 1000 };
  const [a, b] = await Promise.all([readCachedCrmMetaAdCards(db, query), readCachedCrmMetaAdCards(db, query)]);
  assert.deepEqual(a, b);
  assert.equal(a.nextCursor, "101");
  const next = await readCrmMetaAdCards(db, { ...query, cursor: a.nextCursor });
  assert.equal(next.cards.length, 1);
  assert.equal(next.cards[0].adId, "102");
});

test("uses the date and ad index for bounded candidate selection", () => {
  const db = fixture();
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT DISTINCT AdId FROM MetaAdsAd WHERE Date BETWEEN ? AND ? ORDER BY AdId ASC LIMIT 21").all("2026-09-09", "2026-09-10");
  assert.match(plan.map((row) => String(row.detail || "")).join(" "), /idx_meta_ads_ad_date_adid/);
  const reversePlan = db.prepare("EXPLAIN QUERY PLAN SELECT Date,AdId FROM MetaAdsAd INDEXED BY idx_meta_ads_ad_adid_date WHERE AdId IN (?) AND Date BETWEEN ? AND ? ORDER BY AdId,Date LIMIT 621").all("101", "2026-09-09", "2026-09-10");
  assert.match(reversePlan.map((row) => String(row.detail || "")).join(" "), /idx_meta_ads_ad_adid_date/);
  const tenantDatePlan = db.prepare("EXPLAIN QUERY PLAN SELECT AdId FROM MetaAdsAd INDEXED BY idx_meta_ads_ad_tenant_date_adid WHERE CrmTenantId=? AND Date=? AND AdId>? ORDER BY AdId LIMIT 21").all("day1design", "2026-09-10", "");
  assert.match(tenantDatePlan.map((row) => String(row.detail || "")).join(" "), /idx_meta_ads_ad_tenant_date_adid/);
  const tenantAdPlan = db.prepare("EXPLAIN QUERY PLAN SELECT Date,AdId FROM MetaAdsAd INDEXED BY idx_meta_ads_ad_tenant_adid_date WHERE CrmTenantId=? AND AdId IN (?) AND Date BETWEEN ? AND ? ORDER BY AdId,Date LIMIT 621").all("day1design", "101", "2026-09-09", "2026-09-10");
  assert.match(tenantAdPlan.map((row) => String(row.detail || "")).join(" "), /idx_meta_ads_ad_tenant_adid_date/);
  const catalogPlan = db.prepare("EXPLAIN QUERY PLAN SELECT AdId FROM MetaAdsCreativeCatalog INDEXED BY idx_meta_creative_catalog_tenant_date_adid WHERE CrmTenantId=? AND SnapshotDate=? AND AdId>? ORDER BY AdId LIMIT 21").all("day1design", "2026-09-10", "");
  assert.match(catalogPlan.map((row) => String(row.detail || "")).join(" "), /idx_meta_creative_catalog_tenant_date_adid/);
});

test("rejects unsafe preview identifiers before constructing an object key", () => {
  assert.equal(metaCreativeThumbKey("cr-1"), "meta-ads/thumbs/cr-1");
  assert.throws(() => metaCreativeThumbKey("https://evil.test/x"), /meta_preview_id_invalid/);
});

test("keeps a 1000-ad 31-day source read within the 620-row page cap", async () => {
  const db = fixture();
  const add = db.prepare("INSERT INTO MetaAdsAd (Date,AdId,AdName,AdsetId,AdsetName,CampaignId,CampaignName,CreativeId,CreativeType,ThumbnailUrl,Status,CreativeTitle,CreativeBody,CreativeCallToAction,CreativeLinkUrl,CreativeVariants,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let day = 0; day < 31; day += 1) {
    const date = new Date(Date.parse("2026-08-11T00:00:00Z") + day * 86400000).toISOString().slice(0, 10);
    for (let ad = 1; ad <= 1000; ad += 1) add.run(date, String(1000 + ad), "bulk", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", "", 1, 1, 1, 1, 1);
  }
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-08-11", endDate: "2026-09-10", limit: 20, cursor: "102" });
  assert.equal(result.available, true);
  assert.equal(result.cards.length, 20);
  assert.equal(result.cards[0].daily.length, 31);
});

test("splits 31-day candidate CTEs into chunks of at most five dates", async () => {
  const base = fixture();
  const candidateQueries = [];
  const db = { prepare(sql) {
    const cteCount = (String(sql).match(/\bd\d+ AS \(/g) || []).length;
    if (cteCount) candidateQueries.push(cteCount);
    assert.ok(cteCount === 0 || cteCount <= 5);
    return base.prepare(sql);
  } };
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-08-11", endDate: "2026-09-10", limit: 20 });
  assert.equal(result.available, true);
  assert.deepEqual(candidateQueries, [5, 5, 5, 5, 5, 5, 1]);
});

test("preserves null metrics while summing known values", async () => {
  const db = fixture();
  const add = db.prepare("INSERT INTO MetaAdsAd (Date,AdId,AdName,AdsetId,AdsetName,CampaignId,CampaignName,CreativeId,CreativeType,ThumbnailUrl,Status,CreativeTitle,CreativeBody,CreativeCallToAction,CreativeLinkUrl,CreativeVariants,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  add.run("2026-09-09", "103", "mixed", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", "", null, 2, 1, 4, null);
  add.run("2026-09-10", "103", "mixed", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", "", 5, null, 3, 6, 2);
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-09", endDate: "2026-09-10" });
  const card = result.cards.find((item) => item.adId === "103");
  assert.equal(card.metrics.impressions, null);
  assert.equal(card.metrics.clicks, null);
  assert.equal(card.metrics.linkClicks, 4);
  assert.equal(card.metrics.spend, 10);
  assert.equal(card.metrics.leads, null);
  assert.equal(card.daily[0].impressions, null);
});

test("returns unavailable when one ad has duplicate rows for a date", async () => {
  const db = fixture();
  const add = db.prepare("INSERT INTO MetaAdsAd (Date,AdId,AdName,AdsetId,AdsetName,CampaignId,CampaignName,CreativeId,CreativeType,ThumbnailUrl,Status,CreativeTitle,CreativeBody,CreativeCallToAction,CreativeLinkUrl,CreativeVariants,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  add.run("2026-09-10", "104", "duplicate", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", "", 1, 1, 1, 1, 1);
  add.run("2026-09-10", "104", "duplicate", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", "", 1, 1, 1, 1, 1);
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10" });
  assert.equal(result.available, false);
  assert.equal(result.reason, "meta_ad_duplicate_day");
});

test("keeps lexical AdId keyset pages complete across digit lengths", async () => {
  const db = fixture();
  const add = db.prepare("INSERT INTO MetaAdsAd (Date,AdId,AdName,AdsetId,AdsetName,CampaignId,CampaignName,CreativeId,CreativeType,ThumbnailUrl,Status,CreativeTitle,CreativeBody,CreativeCallToAction,CreativeLinkUrl,CreativeVariants,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const adId of ["2", "10", "200"]) add.run("2026-09-10", adId, adId, "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", "", 1, 1, 1, 1, 1);
  const ids = [];
  let cursor = "";
  for (let page = 0; page < 10; page += 1) {
    const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10", limit: 1, cursor });
    ids.push(...result.cards.map((item) => item.adId));
    if (!result.cards.length || !result.nextCursor) break;
    cursor = result.nextCursor;
  }
  assert.deepEqual(ids, ["10", "101", "102", "2", "200"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("retains bounded variant provenance", async () => {
  const db = fixture();
  const add = db.prepare("INSERT INTO MetaAdsAd (Date,AdId,AdName,AdsetId,AdsetName,CampaignId,CampaignName,CreativeId,CreativeType,ThumbnailUrl,Status,CreativeTitle,CreativeBody,CreativeCallToAction,CreativeLinkUrl,CreativeVariants,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const sourceVariants = Array.from({ length: 40 }, (_, index) => ({ type: "title", source: `feed-${index}`, title: `제목-${index}` }));
  add.run("2026-09-10", "105", "variants", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", JSON.stringify(sourceVariants), 1, 1, 1, 1, 1);
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10" });
  const variants = result.cards.find((item) => item.adId === "105").creative.variants;
  assert.equal(variants.length, 32);
  assert.equal(variants[31].source, "feed-31");
});
