import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleMobileCrm, homeKstBounds } from "../src/routes/mobile-crm.js";
import { openLocalD1 } from "../../mobile-crm/server/d1-local.mjs";
import { createSession } from "../src/lib/crm-auth.js";

function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of [
    "../migrations/0001_init.sql", "../migrations/0041_consult_booking.sql", "../migrations/0042_contract_fields.sql",
    "../migrations/0043_consult_cancel.sql", "../migrations/0044_consult_reminders.sql", "../migrations/0045_mobile_crm.sql",
    "../migrations/0046_crm_notifications.sql", "../migrations/0047_crm_auth.sql", "../migrations/0048_crm_automation.sql",
    "../migrations/0049_crm_calendar.sql", "../migrations/0050_crm_scheduler.sql", "../migrations/0051_crm_assignment.sql",
    "../migrations/0052_crm_devices.sql", "../migrations/0053_crm_push.sql", "../migrations/0054_crm_persistent_sessions.sql",
    "../migrations/0060_crm_data_revision.sql", "../migrations/0061_crm_analytics_cache.sql", "../migrations/0063_crm_analytics_cache_revision_window.sql",
  ]) sqlite.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  sqlite.exec(`
    CREATE TABLE HeatmapEvents (id TEXT PRIMARY KEY, CrmTenantId TEXT, SessionId TEXT, Page TEXT, EventType TEXT, IsBot INTEGER, UtmSource TEXT, UtmMedium TEXT, CreatedAt TEXT);
    CREATE INDEX heatmap_tenant_date ON HeatmapEvents(CrmTenantId, CreatedAt);
  `);
  return sqlite;
}

function req(path, token) {
  return new Request(`https://test.local${path}`, { headers: { authorization: `Bearer ${token}`, "cf-connecting-ip": "127.0.0.1" } });
}

function seedTraffic(sqlite, bounds) {
  const current = new Date(Date.parse(bounds.startUtc) + 3600000).toISOString();
  const currentLater = new Date(Date.parse(bounds.startUtc) + 3660000).toISOString();
  const insert = sqlite.prepare("INSERT INTO HeatmapEvents(id,CrmTenantId,SessionId,Page,EventType,IsBot,UtmSource,UtmMedium,CreatedAt) VALUES(?,?,?,?,?,?,?,?,?)");
  insert.run("h1", "day1design", "s1", "/", "page_view", 0, "meta", "paid", current);
  insert.run("h2", "day1design", "s1", "/contact", "page_view", 0, "meta", "paid", currentLater);
  insert.run("h3", "day1design", "s2", "/", "page_view", 0, "naver", "organic", current);
  insert.run("h4", "other", "other-s", "/", "page_view", 0, "other", "referral", current);
}

test("GET home returns tenant-matched home metrics and the same-period analytics payload", async () => {
  const sqlite = makeDb();
  try {
    const bounds = homeKstBounds();
    seedTraffic(sqlite, bounds);
    const env = { DB: openLocalD1(sqlite), CRM_ENABLED: "true" };
    const token = await createSession(env.DB, "day1-owner");
    const analyticsResponse = await handleMobileCrm(req(`/api/mobile/analytics?start=${bounds.date}&end=${bounds.date}`, token), env);
    assert.equal(analyticsResponse.status, 200);
    const analytics = await analyticsResponse.json();
    const homeResponse = await handleMobileCrm(req("/api/mobile/home", token), env);
    assert.equal(homeResponse.status, 200);
    const home = await homeResponse.json();
    assert.equal(home.home_metrics.periods.today.start, bounds.date);
    assert.equal(home.home_metrics.periods.recent30.end, bounds.date);
    assert.equal(home.home_metrics.traffic.touches.value, 2);
    assert.equal(home.home_metrics.traffic.pageviews.value, null);
    assert.equal(home.home_metrics.traffic.pageviews.reason, "ga4_property_binding_missing");
    assert.deepEqual(home.home_metrics.periods.today, { start: bounds.date, end: bounds.date, timezone: "Asia/Seoul" });
    assert.ok(home.marketing_flow);
    assert.deepEqual(home.marketing_flow.period, analytics.flowAnalysis.periods);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM CrmAnalyticsCache WHERE tenant_id='day1design' AND start_date=? AND end_date=?").get(bounds.date, bounds.date).count, 1);
  } finally { sqlite.close(); }
});

test("GET home and analytics never expose another tenant or staff analytics", async () => {
  const sqlite = makeDb();
  try {
    sqlite.prepare("INSERT INTO CrmTenants(id,name) VALUES('other','Other')").run();
    sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('other-owner','other','other@test.local','owner')").run();
    sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('day1-staff','day1design','staff@test.local','staff')").run();
    const bounds = homeKstBounds();
    seedTraffic(sqlite, bounds);
    const env = { DB: openLocalD1(sqlite), CRM_ENABLED: "true" };
    const otherToken = await createSession(env.DB, "other-owner");
    const otherHome = await handleMobileCrm(req("/api/mobile/home", otherToken), env);
    assert.equal(otherHome.status, 200);
    const otherBody = await otherHome.json();
    assert.ok(otherBody.home_metrics);
    assert.equal(otherBody.home_metrics.traffic.touches.value, null);
    assert.equal(otherBody.home_metrics.traffic.touches.reason, "traffic_tenant_not_authorized");
    const staffToken = await createSession(env.DB, "day1-staff");
    assert.equal((await handleMobileCrm(req(`/api/mobile/analytics?start=${bounds.date}&end=${bounds.date}`, staffToken), env)).status, 403);
    const staffHome = await handleMobileCrm(req("/api/mobile/home", staffToken), env);
    assert.equal(staffHome.status, 200);
    assert.equal((await staffHome.json()).home_metrics, null);
  } finally { sqlite.close(); }
});

test('busy analytics lease keeps KST today counts correct and never substitutes old pending totals', async () => {
  const sqlite=makeDb();
  try {
    const bounds=homeKstBounds();
    sqlite.prepare('INSERT INTO Estimates(id,Name,CrmTenantId,Status,SubmittedAt) VALUES(?,?,?,?,?)').run('old-pending','Fixture','day1design','new',new Date(Date.parse(bounds.startUtc)-3600000).toISOString());
    sqlite.prepare('INSERT INTO Estimates(id,Name,CrmTenantId,Status,SubmittedAt) VALUES(?,?,?,?,?)').run('kst-early','Fixture','day1design','new',new Date(Date.parse(bounds.startUtc)+3600000).toISOString());
    const revision=sqlite.prepare("SELECT version FROM CrmDataRevisions WHERE tenant_id='day1design'").get()?.version||0;
    const start30=new Date(Date.parse(bounds.date+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);
    for(const start of [bounds.date,start30]){
      const raw=['day1design',start,bounds.date,String(revision)].join('\u0000');
      const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
      sqlite.prepare('INSERT INTO CrmAnalyticsCache(cache_key,tenant_id,start_date,end_date,expires_at,lease_until,lease_token,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(key,'day1design',start,bounds.date,0,Date.now()+60000,'held-fixture',new Date().toISOString());
    }
    const env={DB:openLocalD1(sqlite),CRM_ENABLED:'true'};
    const token=await createSession(env.DB,'day1-owner');
    const response=await handleMobileCrm(req('/api/mobile/home',token),env);
    assert.equal(response.status,200);
    const home=await response.json();
    assert.equal(home.intake.pending_count,2);
    assert.equal(home.home_metrics.submissions.today.value,1);
    assert.equal(home.home_metrics.submissions.recent30.value,2);
    assert.equal(home.today.consultation.count,0);
    assert.equal(home.today.measurement.count,0);
    assert.equal(home.marketing_flow,null);
  } finally {sqlite.close();}
});
