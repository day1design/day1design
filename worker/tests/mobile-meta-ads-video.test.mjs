import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleMobileMetaAdCards } from "../src/routes/mobile-meta-ads.js";
import { openLocalD1 } from "../../mobile-crm/server/d1-local.mjs";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE MetaAdsAd(Date TEXT,AdId TEXT,VideoId TEXT,CreativeId TEXT,Status TEXT,CrmTenantId TEXT); CREATE INDEX idx_meta_ads_ad_adid_date ON MetaAdsAd(AdId,Date); CREATE INDEX idx_meta_ads_ad_tenant_adid_date ON MetaAdsAd(CrmTenantId,AdId,Date); CREATE TABLE MetaAdsCreativeCatalog(CrmTenantId TEXT,SnapshotDate TEXT,AdId TEXT,CreativeId TEXT,VideoId TEXT,Status TEXT); CREATE INDEX idx_meta_creative_catalog_tenant_adid_date ON MetaAdsCreativeCatalog(CrmTenantId,AdId,SnapshotDate); CREATE TABLE MetaAdsMediaAssets(CrmTenantId TEXT,Kind TEXT,MediaId TEXT,R2Key TEXT,State TEXT,UpdatedAt TEXT); CREATE INDEX idx_meta_ads_media_assets_tenant_kind_id ON MetaAdsMediaAssets(CrmTenantId,Kind,MediaId,State);");
  sqlite.prepare("INSERT INTO MetaAdsAd(Date,AdId,VideoId,CreativeId,Status,CrmTenantId) VALUES(?,?,?,?,?,?)").run("2026-09-10", "101", "video-101", "creative-101", "ACTIVE", "day1design");
  sqlite.prepare("INSERT INTO MetaAdsMediaAssets VALUES(?,?,?,?,?,?)").run("day1design", "image", "creative-101", "meta-ads/thumbs/creative-101", "ready", "2026-09-10T00:00:00Z");
  return openLocalD1(sqlite);
}
function catalogOnlyFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE MetaAdsAd(Date TEXT,AdId TEXT,VideoId TEXT,CreativeId TEXT,Status TEXT,CrmTenantId TEXT); CREATE INDEX idx_meta_ads_ad_tenant_adid_date ON MetaAdsAd(CrmTenantId,AdId,Date); CREATE TABLE MetaAdsCreativeCatalog(CrmTenantId TEXT,SnapshotDate TEXT,AdId TEXT,CreativeId TEXT,VideoId TEXT,Status TEXT); CREATE INDEX idx_meta_creative_catalog_tenant_adid_date ON MetaAdsCreativeCatalog(CrmTenantId,AdId,SnapshotDate); CREATE INDEX idx_meta_creative_catalog_tenant_date_adid ON MetaAdsCreativeCatalog(CrmTenantId,SnapshotDate,AdId); CREATE TABLE MetaAdsMediaAssets(CrmTenantId TEXT,Kind TEXT,MediaId TEXT,R2Key TEXT,State TEXT,UpdatedAt TEXT); CREATE INDEX idx_meta_ads_media_assets_tenant_kind_id ON MetaAdsMediaAssets(CrmTenantId,Kind,MediaId,State);");
  sqlite.prepare("INSERT INTO MetaAdsCreativeCatalog VALUES(?,?,?,?,?,?)").run("day1design", "2026-09-10", "202", "creative-202", "video-202", "ACTIVE");
  sqlite.prepare("INSERT INTO MetaAdsCreativeCatalog VALUES(?,?,?,?,?,?)").run("day1design", "2026-09-09", "203", "creative-203", "video-203", "ACTIVE");
  sqlite.prepare("INSERT INTO MetaAdsMediaAssets VALUES(?,?,?,?,?,?)").run("day1design", "image", "creative-202", "meta-ads/thumbs/creative-202", "ready", "2026-09-10T00:00:00Z");
  sqlite.prepare("INSERT INTO MetaAdsMediaAssets VALUES(?,?,?,?,?,?)").run("day1design", "image", "creative-203", "meta-ads/thumbs/creative-203", "ready", "2026-09-09T00:00:00Z");
  return openLocalD1(sqlite);
}
function noCatalogFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE MetaAdsAd(Date TEXT,AdId TEXT,VideoId TEXT,CreativeId TEXT,Status TEXT,CrmTenantId TEXT); CREATE INDEX idx_meta_ads_ad_tenant_adid_date ON MetaAdsAd(CrmTenantId,AdId,Date);");
  return openLocalD1(sqlite);
}
function request(path) { return new Request(`https://test.local${path}`); }
function makeEnv(db, payload = { kind: "facebook_embed", url: "https://www.facebook.com/plugins/video.php?href=abc&video_id=video-101", video_id: "video-101", updatedAt: "2026-09-10T00:00:00Z" }) {
  const calls = [];
  return { env: { DB: db, CRM_CACHE: { async get(key) { calls.push(key); if (!payload) return null; const body = JSON.stringify(payload); return { size: body.length, body: new Blob([body]).stream() }; } } }, calls };
}
const owner = { id: "owner", tenant_id: "day1design", role: "owner" };

test("serves sanitized Facebook embed metadata after explicit protected request", async () => {
  const { env, calls } = makeEnv(fixture());
  const response = await handleMobileMetaAdCards(request("/meta/ads/101/video-preview?start=2026-09-10&end=2026-09-10"), env, owner, "/meta/ads/101/video-preview");
  assert.equal(response.status, 410);
  assert.deepEqual(calls, []);
});

test("enforces owner tenant, validates embed URL, and returns 404 for unavailable assets", async () => {
  const path = "/meta/ads/101/video-preview?start=2026-09-10&end=2026-09-10";
  const denied = makeEnv(fixture());
  assert.equal((await handleMobileMetaAdCards(request(path), denied.env, { id: "staff", tenant_id: "day1design", role: "staff" }, "/meta/ads/101/video-preview")).status, 403);
  assert.equal((await handleMobileMetaAdCards(request(path), denied.env, { id: "other", tenant_id: "other", role: "owner" }, "/meta/ads/101/video-preview")).status, 403);
  assert.equal((await handleMobileMetaAdCards(request(path), denied.env, owner, "/meta/ads/101/video-preview")).status, 410);
});

test("resolves catalog-only creative assets through protected preview paths", async () => {
  const db = catalogOnlyFixture();
  const calls = [];
  const env = { DB: db, CRM_CACHE: { async get(key) { calls.push(key); if (key.endsWith("video-202.json")) { const body = JSON.stringify({ kind: "facebook_embed", url: "https://facebook.com/plugins/video.php?video_id=video-202" }); return { size: body.length, body: new Blob([body]).stream() }; } return { size: 12, body: new Blob(["image-bytes"]).stream(), httpMetadata: { contentType: "image/png" } }; } } };
  const query = "?start=2026-08-01&end=2026-08-31";
  const image = await handleMobileMetaAdCards(request(`/meta/ads/202/image${query}`), env, owner, "/meta/ads/202/image");
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  const video = await handleMobileMetaAdCards(request(`/meta/ads/202/video-preview${query}`), env, owner, "/meta/ads/202/video-preview");
  assert.equal(video.status, 410);
  assert.deepEqual(calls, ["meta-ads/thumbs/creative-202"]);
  const removed = await handleMobileMetaAdCards(request(`/meta/ads/203/image${query}`), env, owner, "/meta/ads/203/image");
  assert.equal(removed.status, 404);
  assert.deepEqual(calls, ["meta-ads/thumbs/creative-202"]);
});

test("fails closed when current creative catalog is missing", async () => {
  const db = noCatalogFixture();
  const env = { DB: db, CRM_CACHE: { async get() { throw new Error("must_not_read_asset"); } } };
  const response = await handleMobileMetaAdCards(request("/meta/ads/101/image?start=2026-09-10&end=2026-09-10"), env, owner, "/meta/ads/101/image");
  assert.equal(response.status, 404);
});
