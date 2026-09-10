import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readCachedCrmMetaAdCards, readCrmMetaAdCards } from "../src/lib/crm-meta-ad-cards.js";
import { metaCreativeThumbKey } from "../src/lib/crm-meta-preview.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE MetaAdsAd (Date TEXT,AdId TEXT,AdName TEXT,AdsetId TEXT,AdsetName TEXT,CampaignId TEXT,CampaignName TEXT,CreativeId TEXT,CreativeType TEXT,ThumbnailUrl TEXT,Status TEXT,CreativeTitle TEXT,CreativeBody TEXT,CreativeCallToAction TEXT,CreativeLinkUrl TEXT,CreativeVariants TEXT,Impressions INTEGER,Clicks INTEGER,LinkClicks INTEGER,Spend REAL,Leads INTEGER); CREATE INDEX idx_meta_ads_ad_date_adid ON MetaAdsAd(Date,AdId); CREATE INDEX idx_meta_ads_ad_adid_date ON MetaAdsAd(AdId,Date);`);
  const add = db.prepare("INSERT INTO MetaAdsAd VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  add.run("2026-09-10", "101", "Ad 1", "set-1", "Set", "camp-1", "Campaign", "cr-1", "IMAGE", "https://r2.test/a.webp", "ACTIVE", "제목", "본문", "상담하기", "https://example.test", JSON.stringify([{ title: "제목", body: "본문" }, { title: "대체 제목", body: "대체 본문" }]), 1000, 100, 80, 50, 5);
  add.run("2026-09-09", "101", "Ad 1", "set-1", "Set", "camp-1", "Campaign", "cr-1", "IMAGE", "https://r2.test/a.webp", "ACTIVE", "제목", "본문", "상담하기", "https://example.test", "", 500, 50, 40, 25, 2);
  add.run("2026-09-10", "102", "Ad 2", "set-2", "Set", "camp-2", "Campaign 2", "cr-2", "IMAGE", "https://r2.test/b.webp", "PAUSED", "제목2", "본문2", "자세히", "https://example.test/b", "", 100, 10, 8, 5, 1);
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
  assert.equal(result.cards[0].metrics.cpc, 0.625);
  assert.equal(result.cards[0].metrics.cpl, 75 / 7);
  assert.equal(result.cards[0].daily.length, 2);
});

test("rejects other tenants and periods over 31 days", async () => {
  await assert.rejects(() => readCrmMetaAdCards(fixture(), { tenantId: "other", startDate: "2026-09-09", endDate: "2026-09-10" }), /not_authorized/);
  await assert.rejects(() => readCrmMetaAdCards(fixture(), { tenantId: "day1design", startDate: "2026-08-01", endDate: "2026-09-10" }), /period_exceeded/);
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
});

test("rejects unsafe preview identifiers before constructing an object key", () => {
  assert.equal(metaCreativeThumbKey("cr-1"), "meta-ads/thumbs/cr-1");
  assert.throws(() => metaCreativeThumbKey("https://evil.test/x"), /meta_preview_id_invalid/);
});

test("keeps a 1000-ad 31-day source read within the 620-row page cap", async () => {
  const db = fixture();
  const add = db.prepare("INSERT INTO MetaAdsAd VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
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
  const add = db.prepare("INSERT INTO MetaAdsAd VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
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
  const add = db.prepare("INSERT INTO MetaAdsAd VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  add.run("2026-09-10", "104", "duplicate", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", "", 1, 1, 1, 1, 1);
  add.run("2026-09-10", "104", "duplicate", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", "", 1, 1, 1, 1, 1);
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10" });
  assert.equal(result.available, false);
  assert.equal(result.reason, "meta_ad_duplicate_day");
});

test("keeps lexical AdId keyset pages complete across digit lengths", async () => {
  const db = fixture();
  const add = db.prepare("INSERT INTO MetaAdsAd VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
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
  const add = db.prepare("INSERT INTO MetaAdsAd VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const sourceVariants = Array.from({ length: 40 }, (_, index) => ({ type: "title", source: `feed-${index}`, title: `제목-${index}` }));
  add.run("2026-09-10", "105", "variants", "set", "set", "camp", "camp", "cr", "IMAGE", "", "ACTIVE", "", "", "", "", JSON.stringify(sourceVariants), 1, 1, 1, 1, 1);
  const result = await readCrmMetaAdCards(db, { tenantId: "day1design", startDate: "2026-09-10", endDate: "2026-09-10" });
  const variants = result.cards.find((item) => item.adId === "105").creative.variants;
  assert.equal(variants.length, 32);
  assert.equal(variants[31].source, "feed-31");
});
