import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleMobileMetaAdCards } from "../src/routes/mobile-meta-ads.js";
import { openLocalD1 } from "../../mobile-crm/server/d1-local.mjs";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE MetaAdsAd(Date TEXT,AdId TEXT,VideoId TEXT,CrmTenantId TEXT); CREATE INDEX idx_meta_ads_ad_adid_date ON MetaAdsAd(AdId,Date); CREATE INDEX idx_meta_ads_ad_tenant_adid_date ON MetaAdsAd(CrmTenantId,AdId,Date);");
  sqlite.prepare("INSERT INTO MetaAdsAd(Date,AdId,VideoId,CrmTenantId) VALUES(?,?,?,?)").run("2026-09-10", "101", "video-101", "day1design");
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
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { kind: "facebook_embed", url: "https://www.facebook.com/plugins/video.php?href=abc&video_id=video-101", updatedAt: "2026-09-10T00:00:00Z" });
  assert.deepEqual(calls, ["meta-ads/video-previews/video-101.json"]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("enforces owner tenant, validates embed URL, and returns 404 for unavailable assets", async () => {
  const path = "/meta/ads/101/video-preview?start=2026-09-10&end=2026-09-10";
  const denied = makeEnv(fixture());
  assert.equal((await handleMobileMetaAdCards(request(path), denied.env, { id: "staff", tenant_id: "day1design", role: "staff" }, "/meta/ads/101/video-preview")).status, 403);
  assert.equal((await handleMobileMetaAdCards(request(path), denied.env, { id: "other", tenant_id: "other", role: "owner" }, "/meta/ads/101/video-preview")).status, 403);
  const invalid = makeEnv(fixture(), { kind: "facebook_embed", url: "https://evil.example/video", updatedAt: "now" });
  assert.equal((await handleMobileMetaAdCards(request(path), invalid.env, owner, "/meta/ads/101/video-preview")).status, 404);
  const token = makeEnv(fixture(), { kind: "facebook_embed", url: "https://facebook.com/video/embed/1?access_token=secret", updatedAt: "now" });
  assert.equal((await handleMobileMetaAdCards(request(path), token.env, owner, "/meta/ads/101/video-preview")).status, 404);
  const missing = makeEnv(fixture(), null);
  assert.equal((await handleMobileMetaAdCards(request(path), missing.env, owner, "/meta/ads/101/video-preview")).status, 404);
});
