import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readCrmAnalyticsDimensions } from "../src/lib/crm-analytics-dimensions.js";

function dbWith(sql) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(sql);
  return {
    sqlite,
    db: { prepare(sqlText) { const statement = sqlite.prepare(sqlText); return { all: (...args) => statement.all(...args), bind(...args) { return { all: async () => ({ results: statement.all(...args) }) }; } }; } },
  };
}

test("traffic dimensions stay tenant scoped and report unavailable schema dimensions", async () => {
  const { sqlite, db } = dbWith(`
    CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, SessionId TEXT, SubmittedAt TEXT, Source TEXT, Platform TEXT, Campaign TEXT);
    CREATE INDEX estimates_tenant_date ON Estimates(CrmTenantId, SubmittedAt);
    CREATE TABLE HeatmapEvents (id TEXT, Page TEXT, EventType TEXT, Device TEXT, SessionId TEXT, UtmSource TEXT, UtmCampaign TEXT, IsBot INTEGER, CreatedAt TEXT);
    INSERT INTO Estimates VALUES ('e1','t1','s1','2026-09-01T00:00:00Z','google','web','spring');
    INSERT INTO Estimates VALUES ('e2','t1','s2','2026-09-02T00:00:00Z','meta','instagram','lead-a');
    INSERT INTO Estimates VALUES ('other','t2','other-session','2026-09-02T00:00:00Z','other','web','other');
    INSERT INTO HeatmapEvents VALUES ('h1','/','page_view','mobile','s1','google','spring',0,'2026-09-01T01:00:00Z');
    INSERT INTO HeatmapEvents VALUES ('h2','/estimates','page_view','pc','s1','google','spring',0,'2026-09-01T01:01:00Z');
    INSERT INTO HeatmapEvents VALUES ('h3','/estimates','form_start','mobile','s1','google','spring',0,'2026-09-01T01:02:00Z');
    INSERT INTO HeatmapEvents VALUES ('h4','/estimates','form_success','mobile','s1','google','spring',0,'2026-09-01T01:03:00Z');
    INSERT INTO HeatmapEvents VALUES ('h5','/','page_view','pc','other-session','other','other',0,'2026-09-02T01:00:00Z');
  `);
  const result = await readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-09-01", endDate: "2026-09-03" });
  assert.equal(result.traffic.available, false);
  for (const dimension of Object.values(result.traffic.dimensions)) assert.equal(dimension.available, false);
  assert.equal(result.traffic.dimensions.source.reason, "tenant_column_missing");
  assert.equal(result.meta.available, false);
  assert.equal(result.meta.reason, "source_table_missing");
  sqlite.close();
});

test("tenant-scoped HeatmapEvents provide visitor dimensions without converted-session fallback", async () => {
  const { sqlite, db } = dbWith(`
    CREATE TABLE HeatmapEvents (id TEXT, tenant_id TEXT, Page TEXT, EventType TEXT, Device TEXT, SessionId TEXT, UtmSource TEXT, UtmCampaign TEXT, IsBot INTEGER, CreatedAt TEXT);
    CREATE INDEX heatmap_tenant_date ON HeatmapEvents(tenant_id, CreatedAt);
    INSERT INTO HeatmapEvents VALUES ('h1','t1','/','page_view','mobile','s1','google','spring',0,'2026-09-01T01:00:00Z');
    INSERT INTO HeatmapEvents VALUES ('h2','t1','/estimates','form_start','mobile','s1','google','spring',0,'2026-09-01T01:02:00Z');
    INSERT INTO HeatmapEvents VALUES ('h3','t2','/','page_view','pc','other','other','other',0,'2026-09-01T01:00:00Z');
  `);
  const result = await readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-09-01", endDate: "2026-09-01" });
  assert.deepEqual(result.traffic.dimensions.source.values, [{ value: "google", count: 1 }]);
  assert.deepEqual(result.traffic.dimensions.page.values, [{ value: "/", count: 1 }]);
  assert.deepEqual(result.traffic.dimensions.form_events.values, [{ value: "form_start", count: 1 }]);
  sqlite.close();
});

test("traffic source falls back to InflowApp when UTM source is empty", async () => {
  const { sqlite, db } = dbWith(`
    CREATE TABLE HeatmapEvents (id TEXT, CrmTenantId TEXT, Page TEXT, EventType TEXT, Device TEXT, SessionId TEXT, UtmSource TEXT, InflowApp TEXT, IsBot INTEGER, CreatedAt TEXT);
    CREATE INDEX heatmap_tenant_date ON HeatmapEvents(CrmTenantId, CreatedAt);
    INSERT INTO HeatmapEvents VALUES ('h1','t1','/','page_view','mobile','s1','','instagram-app',0,'2026-09-01T01:00:00Z');
  `);
  const result = await readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-09-01", endDate: "2026-09-01" });
  assert.deepEqual(result.traffic.dimensions.source.values, [{ value: "instagram-app", count: 1 }]);
  sqlite.close();
});

test("Meta dimensions aggregate real tenant rows and calculate rates", async () => {
  const { sqlite, db } = dbWith(`
    CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, SubmittedAt TEXT, Source TEXT, Platform TEXT, Campaign TEXT);
    CREATE INDEX estimates_tenant_date ON Estimates(CrmTenantId, SubmittedAt);
    CREATE TABLE MetaAdsDaily (Date TEXT, tenant_id TEXT, Level TEXT, EntityId TEXT, EntityName TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER);
    CREATE INDEX meta_daily_tenant_date ON MetaAdsDaily(tenant_id, Date);
    CREATE TABLE MetaAdsAd (Date TEXT, tenant_id TEXT, AdId TEXT, AdName TEXT, AdsetId TEXT, AdsetName TEXT, CampaignId TEXT, CampaignName TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER);
    CREATE INDEX meta_ad_tenant_date ON MetaAdsAd(tenant_id, Date);
    INSERT INTO MetaAdsDaily VALUES ('2026-09-01','t1','account','act_1','Account',1000,100,80,50,5);
    INSERT INTO MetaAdsDaily VALUES ('2026-09-01','t1','campaign','c1','Campaign 1',800,80,60,40,4);
    INSERT INTO MetaAdsDaily VALUES ('2026-09-01','t2','account','act_2','Other',9000,900,800,900,90);
    INSERT INTO MetaAdsAd VALUES ('2026-09-01','t1','', 'Ad', 'as1','Adset 1','c1','Campaign 1',500,50,40,25,2);
  `);
  const result = await readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-09-01", endDate: "2026-09-01" });
  assert.equal(result.meta.available, true);
  assert.equal(result.meta.dimensions.accounts.values[0].spend, 50);
  assert.equal(result.meta.dimensions.accounts.values[0].cpc, 0.625);
  assert.equal(result.meta.dimensions.accounts.values[0].cpcClick, 0.5);
  assert.equal(result.meta.dimensions.accounts.values[0].cpl, 10);
  assert.equal(result.meta.dimensions.accounts.values[0].cpm, 50);
  assert.equal(result.meta.dimensions.campaigns.values[0].id, "c1");
  assert.equal(result.meta.dimensions.adsets.values[0].name, "Adset 1");
  assert.equal(result.meta.dimensions.ads.values[0].name, "Ad");
  sqlite.close();
});

test("Meta ad dimensions expose current catalog status without changing period metrics", async () => {
  const { sqlite, db } = dbWith(`
    CREATE TABLE MetaAdsAd (Date TEXT, CrmTenantId TEXT, AdId TEXT, AdName TEXT, AdsetId TEXT, AdsetName TEXT, CampaignId TEXT, CampaignName TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER);
    CREATE INDEX meta_ad_tenant_date ON MetaAdsAd(CrmTenantId, Date);
    CREATE TABLE MetaAdsCreativeCatalog (CrmTenantId TEXT, SnapshotDate TEXT, AdId TEXT, AdsetId TEXT, CampaignId TEXT, Status TEXT);
    INSERT INTO MetaAdsAd VALUES ('2026-09-01','t1','a1','Ad 1','s1','Set 1','c1','Campaign 1',100,10,8,5,1);
    INSERT INTO MetaAdsAd VALUES ('2026-09-01','t1','a2','Ad 2','s2','Set 2','c2','Campaign 2',100,10,8,4,1);
    INSERT INTO MetaAdsCreativeCatalog VALUES ('t1','2026-09-10','a1','s1','c1','ACTIVE');
    INSERT INTO MetaAdsCreativeCatalog VALUES ('t1','2026-09-10','a2','s2','c2','PAUSED');
  `);
  const result = await readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-09-01", endDate: "2026-09-01" });
  const statuses = new Map(result.meta.dimensions.ads.values.map((row) => [row.id, row.status]));
  assert.equal(statuses.get("a1"), "ACTIVE");
  assert.equal(statuses.get("a2"), "OFF");
  assert.equal(result.meta.dimensions.ads.values.find((row) => row.id === "a1").spend, 5);
  sqlite.close();
});

test("date range is bounded", async () => {
  const { sqlite, db } = dbWith("CREATE TABLE Estimates (id TEXT, CrmTenantId TEXT, SubmittedAt TEXT, Source TEXT, Platform TEXT);");
  await assert.rejects(() => readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2025-01-01", endDate: "2026-09-01" }), /analytics_date_window_exceeded/);
  await assert.rejects(() => readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-02-31", endDate: "2026-03-01" }), /analytics_invalid_date_range/);
  sqlite.close();
});

test("Meta breakdowns are tenant scoped and ads retain campaign and adset parents", async () => {
  const { sqlite, db } = dbWith(`
    CREATE TABLE MetaAdsDaily (Date TEXT, CrmTenantId TEXT, Level TEXT, EntityId TEXT, EntityName TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER);
    CREATE INDEX meta_daily_tenant_date ON MetaAdsDaily(CrmTenantId, Date);
    CREATE TABLE MetaAdsAd (Date TEXT, CrmTenantId TEXT, AdId TEXT, AdName TEXT, AdsetId TEXT, AdsetName TEXT, CampaignId TEXT, CampaignName TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER);
    CREATE INDEX meta_ad_tenant_date ON MetaAdsAd(CrmTenantId, Date);
    CREATE TABLE MetaAdsBreakdown (Date TEXT, CrmTenantId TEXT, Dimension TEXT, DimensionValue TEXT, DimensionSub TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER);
    CREATE INDEX meta_breakdown_tenant_date ON MetaAdsBreakdown(CrmTenantId, Date);
    INSERT INTO MetaAdsDaily VALUES ('2026-09-01','t1','account','act','Account',100,10,8,20,2);
    INSERT INTO MetaAdsAd VALUES ('2026-09-01','t1','ad1','Ad 1','set1','Set 1','camp1','Campaign 1',100,10,8,20,2);
    INSERT INTO MetaAdsAd VALUES ('2026-09-01','t2','ad2','Other','set2','Other','camp2','Other',9000,900,800,900,90);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','age_gender','25-34','female',100,10,8,20,2);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','region','Seoul','',100,10,8,20,2);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','position','feed','instagram',100,10,8,20,2);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t2','region','Other','',9000,900,800,900,90);
  `);
  const result = await readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-09-01", endDate: "2026-09-01" });
  assert.deepEqual(result.meta.dimensions.age_gender.values[0].value, "25-34");
  assert.deepEqual(result.meta.dimensions.regions.values[0].value, "Seoul");
  assert.deepEqual(result.meta.dimensions.placements.values[0].sub, "instagram");
  assert.equal(result.meta.dimensions.ads.values[0].campaignId, "camp1");
  assert.equal(result.meta.dimensions.ads.values[0].adsetId, "set1");
  sqlite.close();
});

test("video platform and age distributions use complete tenant-scoped play counts", async () => {
  const { sqlite, db } = dbWith(`
    CREATE TABLE MetaAdsBreakdown (Date TEXT, CrmTenantId TEXT, Dimension TEXT, DimensionValue TEXT, DimensionSub TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER, VideoPlays INTEGER);
    CREATE INDEX meta_video_breakdown_tenant_date ON MetaAdsBreakdown(CrmTenantId, Date);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','platform','instagram','',100,10,8,20,2,70);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','platform','facebook','',100,10,8,20,2,30);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','platform','threads','',100,10,8,20,2,0);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','age_gender','25-34_female','',100,10,8,20,2,40);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','age_gender','35-44_male','',100,10,8,20,2,60);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t2','platform','instagram','',9000,900,800,900,90,9000);
  `);
  const result = await readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-09-01", endDate: "2026-09-01" });
  assert.equal(result.meta.dimensions.video_platform.available, true);
  assert.equal(result.meta.dimensions.video_platform.basis, "VideoPlays");
  assert.equal(result.meta.dimensions.video_platform.totalVideoPlays, 100);
  assert.deepEqual(result.meta.dimensions.video_platform.values.slice(0, 2).map((row) => [row.value, row.videoPlays, row.share]), [["instagram", 70, 0.7], ["facebook", 30, 0.3]]);
  assert.equal(Object.hasOwn(result.meta.dimensions.video_platform.values[0], "sub"), false);
  assert.equal(result.meta.dimensions.video_platform.values.find((row) => row.value === "threads").videoPlays, 0);
  assert.deepEqual(result.meta.dimensions.video_age_gender.values.map((row) => [row.value, row.videoPlays]), [["35-44", 60], ["25-34", 40]]);
  sqlite.close();
});

test("video distributions distinguish uncollected and partial play counts", async () => {
  const { sqlite, db } = dbWith(`
    CREATE TABLE MetaAdsBreakdown (Date TEXT, CrmTenantId TEXT, Dimension TEXT, DimensionValue TEXT, DimensionSub TEXT, Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER, VideoPlays INTEGER);
    CREATE INDEX meta_video_partial_tenant_date ON MetaAdsBreakdown(CrmTenantId, Date);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','platform','instagram','',100,10,8,20,2,NULL);
    INSERT INTO MetaAdsBreakdown VALUES ('2026-09-01','t1','platform','facebook','',100,10,8,20,2,30);
  `);
  const result = await readCrmAnalyticsDimensions(db, { tenantId: "t1", startDate: "2026-09-01", endDate: "2026-09-01" });
  assert.equal(result.meta.dimensions.video_platform.available, false);
  assert.equal(result.meta.dimensions.video_platform.reason, "partial_video_breakdown");
  sqlite.close();
});
