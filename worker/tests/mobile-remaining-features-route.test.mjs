import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleMobileCrm } from "../src/routes/mobile-crm.js";
import { authenticate, createSession, hashToken } from "../src/lib/crm-auth.js";
import { startTenantPreview } from "../src/lib/crm-tenant-preview.js";
import { openLocalD1 } from "../../mobile-crm/server/d1-local.mjs";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of [
    "../migrations/0001_init.sql", "../migrations/0041_consult_booking.sql", "../migrations/0042_contract_fields.sql",
    "../migrations/0043_consult_cancel.sql", "../migrations/0044_consult_reminders.sql", "../migrations/0045_mobile_crm.sql",
    "../migrations/0046_crm_notifications.sql", "../migrations/0047_crm_auth.sql", "../migrations/0048_crm_automation.sql",
    "../migrations/0049_crm_calendar.sql", "../migrations/0050_crm_scheduler.sql", "../migrations/0051_crm_assignment.sql",
    "../migrations/0052_crm_devices.sql", "../migrations/0053_crm_push.sql", "../migrations/0054_crm_persistent_sessions.sql",
    "../migrations/0056_crm_consultation_outcomes.sql", "../migrations/0060_crm_data_revision.sql", "../migrations/0061_crm_analytics_cache.sql",
    "../migrations/0062_crm_appointment_details.sql", "../migrations/0063_crm_analytics_cache_revision_window.sql", "../migrations/0068_crm_member_names.sql",
    "../migrations/0057_crm_tenant_onboarding.sql",
    "../migrations/0058_crm_session_revocation_reason.sql", "../migrations/0080_crm_tenant_preview_sessions.sql",
  ]) sqlite.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  sqlite.exec(`
    CREATE TABLE MetaAdsAd (
      Date TEXT, AdId TEXT, AdName TEXT, AdsetId TEXT, AdsetName TEXT, CampaignId TEXT,
      CampaignName TEXT, CreativeId TEXT, CreativeType TEXT, ThumbnailUrl TEXT, Status TEXT,
      CrmTenantId TEXT NOT NULL DEFAULT 'day1design',
      Impressions INTEGER, Clicks INTEGER, LinkClicks INTEGER, Spend REAL, Leads INTEGER
    );
    CREATE INDEX idx_meta_ads_ad_adid_date ON MetaAdsAd(AdId, Date);
    CREATE INDEX idx_meta_ads_ad_tenant_date_adid ON MetaAdsAd(CrmTenantId, Date, AdId);
    CREATE INDEX idx_meta_ads_ad_tenant_adid_date ON MetaAdsAd(CrmTenantId, AdId, Date);
    CREATE TABLE HeatmapEvents (id TEXT PRIMARY KEY, CrmTenantId TEXT, SessionId TEXT, Page TEXT, EventType TEXT, IsBot INTEGER, Device TEXT NOT NULL DEFAULT '', Referrer TEXT NOT NULL DEFAULT '', UtmSource TEXT, UtmMedium TEXT, UtmCampaign TEXT NOT NULL DEFAULT '', CreatedAt TEXT);
    CREATE INDEX heatmap_tenant_date ON HeatmapEvents(CrmTenantId, CreatedAt);
  `);
  sqlite.exec("ALTER TABLE Estimates ADD COLUMN SessionId TEXT NOT NULL DEFAULT ''; ALTER TABLE Estimates ADD COLUMN FirstSource TEXT NOT NULL DEFAULT ''; ALTER TABLE Estimates ADD COLUMN FirstPlatform TEXT NOT NULL DEFAULT ''; ALTER TABLE Estimates ADD COLUMN FirstReferrer TEXT NOT NULL DEFAULT ''; ALTER TABLE Estimates ADD COLUMN FirstInflowApp TEXT NOT NULL DEFAULT ''; ALTER TABLE Estimates ADD COLUMN MetaFieldData TEXT NOT NULL DEFAULT ''; ALTER TABLE Estimates ADD COLUMN MetaLeadId TEXT NOT NULL DEFAULT ''; CREATE INDEX IF NOT EXISTS idx_heatmap_crm_tenant_session_event_bot_created_id ON HeatmapEvents(CrmTenantId,SessionId,EventType,IsBot,CreatedAt,id);");
  sqlite.exec(readFileSync(new URL("../migrations/0083_crm_customer_source_channels.sql", import.meta.url), "utf8"));
  sqlite.prepare("INSERT INTO MetaAdsAd (Date,AdId,AdName,AdsetId,AdsetName,CampaignId,CampaignName,CreativeId,CreativeType,ThumbnailUrl,Status,Impressions,Clicks,LinkClicks,Spend,Leads) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    "2026-09-10", "1001", "실내광고", "set-1", "세트", "campaign-1", "캠페인", "creative-1", "image", "", "ACTIVE", 1000, 80, 70, 35, 5,
  );
  sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role,active) VALUES(?,?,?,?,?)").run("staff-route", "day1design", "staff-route@example.test", "staff", 1);
  sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role,active) VALUES(?,?,?,?,?)").run("staff-other", "day1design", "staff-other@example.test", "staff", 1);
  sqlite.prepare("INSERT INTO CrmTenants(id,name) VALUES(?,?)").run("other-route", "다른 업체");
  sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role,active) VALUES(?,?,?,?,?)").run("other-route-owner", "other-route", "other-route@example.test", "owner", 1);
  return sqlite;
}

function env(sqlite) {
  return { DB: openLocalD1(sqlite), CRM_ENABLED: "true", CRM_PLATFORM_EMAILS: "mkt@polarad.co.kr", CRM_SESSION_SECRET: "route-test-secret" };
}

function request(path, method = "GET", token, body) {
  const headers = { "content-type": "application/json", "cf-connecting-ip": "127.0.0.1" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://test.local${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function seedCustomer(sqlite) {
  sqlite.prepare(`INSERT INTO Estimates
    (id,CrmTenantId,SessionId,Name,Phone,Email,Source,FirstSource,Branch,EstimateAmount,ConceptFiles,FloorPlans,MetaFieldData,Assignee,CrmVersion)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "customer-route", "day1design", "session-route", "고객", "010-0000-0000", "customer@example.test",
    "homepage", "google", "강남", 2500000,
    JSON.stringify([{ url: "https://files.example.test/concept.pdf", name: "컨셉" }]),
    JSON.stringify([{ url: "https://files.example.test/plan.png", name: "도면" }]),
    JSON.stringify([{ q: "희망지점", a: "강남", f: "branch" }]),
    "staff-route", 1,
  );
  sqlite.prepare(`INSERT INTO Estimates (id,CrmTenantId,SessionId,Name,CrmVersion) VALUES(?,?,?,?,?)`)
    .run("other-customer", "other-route", "other-session", "타 업체", 1);
  const add = sqlite.prepare(`INSERT INTO HeatmapEvents
    (id,CrmTenantId,SessionId,Page,EventType,IsBot,Device,Referrer,UtmSource,UtmMedium,UtmCampaign,CreatedAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < 53; i += 1) {
    const createdAt = i < 2 ? "2026-09-10T00:00:00Z" : new Date(Date.UTC(2026, 8, 10, 0, 0, i)).toISOString();
    add.run(`route-event-${String(i).padStart(3, "0")}`, "day1design", "session-route", `/route-${i}`, "page_view", 0, "mobile", "https://source.example.test", "google", "organic", "route-campaign", createdAt);
  }
  add.run("route-bot", "day1design", "session-route", "/bot", "page_view", 1, "pc", "", "", "", "", "2026-09-10T00:01:00Z");
}

test("new mobile routes require authentication and isolate staff and other tenants", async () => {
  const sqlite = database();
  try {
    const e = env(sqlite);
    const anonymous = await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10"), e);
    assert.equal(anonymous.status, 401);
    const staff = await createSession(e.DB, "staff-route");
    assert.equal((await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10", "GET", staff), e)).status, 403);
    const other = await createSession(e.DB, "other-route-owner");
    assert.equal((await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10", "GET", other), e)).status, 403);
  } finally { sqlite.close(); }
});

test("pending, suspended, and revoked sessions cannot use the new routes", async () => {
  const sqlite = database();
  try {
    const e = env(sqlite);
    sqlite.prepare("UPDATE CrmTenants SET onboarding_status='pending' WHERE id='day1design'").run();
    const pending = await createSession(e.DB, "day1-owner");
    assert.equal((await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10", "GET", pending), e)).status, 403);
    sqlite.prepare("UPDATE CrmTenants SET onboarding_status='active', suspended=1 WHERE id='day1design'").run();
    const suspended = await createSession(e.DB, "day1-owner");
    sqlite.prepare("UPDATE CrmSessions SET revoked_reason='tenant_suspended' WHERE token_hash=?").run(await hashToken(suspended));
    assert.equal((await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10", "GET", suspended), e)).status, 403);
    sqlite.prepare("UPDATE CrmTenants SET suspended=0 WHERE id='day1design'").run();
    const revoked = await createSession(e.DB, "day1-owner");
    sqlite.prepare("UPDATE CrmSessions SET revoked_at=datetime('now') WHERE token_hash=?").run(await hashToken(revoked));
    assert.equal((await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10", "GET", revoked), e)).status, 401);
  } finally { sqlite.close(); }
});

test("owner can read update and Meta routes, while POST and traversal are rejected", async () => {
  const sqlite = database();
  try {
    const e = env(sqlite);
    const owner = await createSession(e.DB, "day1-owner");
    assert.equal((await handleMobileCrm(request("/api/mobile/me", "GET", owner), e)).status, 200);
    assert.equal((await handleMobileCrm(request("/api/mobile/home", "GET", owner), e)).status, 200);
    const update = await handleMobileCrm(request("/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=9", "GET", owner), e);
    assert.equal(update.status, 503);
    assert.equal((await handleMobileCrm(request("/api/mobile/app-update/latest", "POST", owner, {}), e)).status, 405);
    const cards = await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10", "GET", owner), e);
    assert.equal(cards.status, 200);
    const cardPayload = await cards.json();
    assert.equal(cardPayload.cards[0].metrics.cpl, 7);
    assert.equal(cardPayload.cards[0].creative.body, undefined);
    assert.equal((await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10&cursor=../../secret", "GET", owner), e)).status, 400);
    assert.equal((await handleMobileCrm(request("/api/mobile/app-update/artifacts/unsafe%2Fsecret.apk", "GET", owner), e)).status, 404);
  } finally { sqlite.close(); }
});

test("platform preview can read the new routes but cannot POST", async () => {
  const sqlite = database();
  try {
    const e = env(sqlite);
    const platformToken = await createSession(e.DB, "platform-owner");
    const platformAuth = await authenticate(e.DB, request("/api/mobile/me", "GET", platformToken));
    const started = await startTenantPreview(request("/api/mobile/platform/preview-session", "POST", platformToken, { tenant_id: "day1design" }), e, platformAuth, "day1design");
    assert.equal(started.status, 200);
    const previewToken = (await started.json()).token;
    assert.equal((await handleMobileCrm(request("/api/mobile/meta/ads?start=2026-09-10&end=2026-09-10", "GET", previewToken), e)).status, 200);
    assert.equal((await handleMobileCrm(request("/api/mobile/app-update/latest", "POST", previewToken, {}), e)).status, 403);
  } finally { sqlite.close(); }
});

test("owner customer detail exposes source, attachments, and original answers with tenant isolation", async () => {
  const sqlite = database();
  try {
    seedCustomer(sqlite);
    const e = env(sqlite);
    const owner = await createSession(e.DB, "day1-owner");
    const response = await handleMobileCrm(request("/api/mobile/customers/customer-route", "GET", owner), e);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const payload = await response.json();
    assert.equal(payload.source, "homepage");
    assert.equal(payload.first_source, "google");
    assert.equal(payload.branch, "강남");
    assert.equal(payload.budget, 2500000);
    assert.deepEqual(payload.attachments, [
      { url: "https://files.example.test/concept.pdf", name: "컨셉" },
      { url: "https://files.example.test/plan.png", name: "도면" },
    ]);
    assert.deepEqual(payload.form_answers, [{ question: "희망지점", answer: "강남", field: "branch" }]);
    assert.equal(payload.form_answers_source, "captured");
    const unauthorizedStaff = await createSession(e.DB, "staff-other");
    assert.equal((await handleMobileCrm(request("/api/mobile/customers/customer-route", "GET", unauthorizedStaff), e)).status, 403);
    assert.equal((await handleMobileCrm(request("/api/mobile/customers/other-customer", "GET", owner), e)).status, 404);
  } finally { sqlite.close(); }
});

test("visit history enforces assigned staff and paginates tenant-scoped page views", async () => {
  const sqlite = database();
  try {
    seedCustomer(sqlite);
    const e = env(sqlite);
    const assigned = await createSession(e.DB, "staff-route");
    const first = await handleMobileCrm(request("/api/mobile/customers/customer-route/visit-history", "GET", assigned), e);
    assert.equal(first.status, 200);
    const firstPayload = await first.json();
    assert.equal(firstPayload.linked, true);
    assert.equal(firstPayload.events.length, 50);
    assert.equal(firstPayload.events[0].id, "route-event-000");
    assert.equal(firstPayload.events[0].page, "/route-0");
    assert.equal(firstPayload.nextCursor, "2026-09-10T00:00:49.000Z|route-event-049");
    const second = await handleMobileCrm(request(`/api/mobile/customers/customer-route/visit-history?cursor=${encodeURIComponent(firstPayload.nextCursor)}`, "GET", assigned), e);
    assert.equal(second.status, 200);
    const secondPayload = await second.json();
    assert.equal(secondPayload.events.length, 3);
    assert.equal(secondPayload.nextCursor, null);
    assert.equal(new Set([...firstPayload.events, ...secondPayload.events].map((row) => row.id)).size, 53);
    assert.equal([...firstPayload.events, ...secondPayload.events].some((row) => row.id === "route-bot"), false);
    const unauthorized = await createSession(e.DB, "staff-other");
    assert.equal((await handleMobileCrm(request("/api/mobile/customers/customer-route/visit-history", "GET", unauthorized), e)).status, 403);
    assert.equal((await handleMobileCrm(request("/api/mobile/customers/other-customer/visit-history", "GET", assigned), e)).status, 404);
    assert.equal((await handleMobileCrm(request("/api/mobile/customers/customer-route/visit-history?cursor=bad", "GET", assigned), e)).status, 400);
  } finally { sqlite.close(); }
});

test("customer list source channels stay tenant-scoped across pages and preserve exact source filters", async () => {
  const sqlite = database();
  try {
    for (let i = 0; i < 60; i += 1) {
      sqlite.prepare(`INSERT INTO Estimates (id,CrmTenantId,Name,Status,Source,MetaLeadId,SubmittedAt,CrmVersion)
        VALUES(?,?,?,?,?,?,?,?)`).run(`home-${String(i).padStart(3, "0")}`, "day1design", `homepage-${i}`, i % 2 ? "계약완료" : "접수대기", "google", "", `2026-09-10T00:${String(i).padStart(2, "0")}:00Z`, 1);
      const isMetaLead = i % 2 === 0;
      sqlite.prepare(`INSERT INTO Estimates (id,CrmTenantId,Name,Status,Source,MetaLeadId,SubmittedAt,CrmVersion)
        VALUES(?,?,?,?,?,?,?,?)`).run(`meta-${String(i).padStart(3, "0")}`, "day1design", `meta-${i}`, i % 2 ? "계약완료" : "접수대기", isMetaLead ? "homepage" : "meta", isMetaLead ? `lead-${i}` : "", `2026-09-11T00:${String(i).padStart(2, "0")}:00Z`, 1);
    }
    sqlite.prepare(`INSERT INTO Estimates (id,CrmTenantId,Name,Status,Source,MetaLeadId,SubmittedAt,CrmVersion)
      VALUES(?,?,?,?,?,?,?,?)`).run("foreign-home", "other-route", "foreign-home", "접수대기", "google", "", "2026-09-12T00:00:00Z", 1);
    const e = env(sqlite);
    const owner = await createSession(e.DB, "day1-owner");
    const collect = async (source) => {
      const found = [];
      let cursor = "";
      do {
        const suffix = `&source=${source}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const response = await handleMobileCrm(request(`/api/mobile/customers?${suffix.slice(1)}`, "GET", owner), e);
        assert.equal(response.status, 200);
        const payload = await response.json();
        found.push(...payload.customers);
        cursor = payload.next_cursor || "";
      } while (cursor);
      return found;
    };
    const homepage = await collect("__homepage");
    assert.equal(homepage.length, 60);
    assert.equal(new Set(homepage.map((row) => row.id)).size, 60);
    assert.equal(homepage.every((row) => row.id.startsWith("home-")), true);
    const meta = await collect("__meta");
    assert.equal(meta.length, 60);
    assert.equal(new Set(meta.map((row) => row.id)).size, 60);
    assert.equal(meta.every((row) => row.id.startsWith("meta-")), true);
    const pendingHomepage = await (await handleMobileCrm(request("/api/mobile/customers?status=__pending&source=__homepage", "GET", owner), e)).json();
    assert.equal(pendingHomepage.customers.length, 30);
    assert.equal(pendingHomepage.customers.every((row) => row.id.startsWith("home-") && row.status === "접수대기"), true);
    const searched = await (await handleMobileCrm(request("/api/mobile/customers?q=homepage-55&source=__homepage", "GET", owner), e)).json();
    assert.deepEqual(searched.customers.map((row) => row.id), ["home-055"]);
    const exact = await (await handleMobileCrm(request("/api/mobile/customers?source=google", "GET", owner), e)).json();
    assert.equal(exact.customers.every((row) => row.id.startsWith("home-")), true);
    assert.equal(exact.customers.length, 50);
    const plan = sqlite.prepare(`EXPLAIN QUERY PLAN SELECT id FROM Estimates
      WHERE CrmTenantId=? AND (CASE WHEN COALESCE(NULLIF(TRIM(MetaLeadId),''),'')<>'' OR lower(TRIM(COALESCE(Source,'')))='meta' THEN 'meta' ELSE 'homepage' END)=?
      ORDER BY (CASE WHEN COALESCE(SubmittedAt,'')='' THEN 1 ELSE 0 END), SubmittedAt DESC, id DESC LIMIT 51`).all("day1design", "homepage");
    assert.match(plan.map((row) => String(row.detail || "")).join(" "), /idx_estimates_crm_tenant_channel_submitted_desc/);
  } finally { sqlite.close(); }
});
