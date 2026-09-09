import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleMobileManagement } from "../src/routes/mobile-management.js";

function db() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  for (const file of ["0041_consult_booking.sql", "0042_contract_fields.sql", "0043_consult_cancel.sql", "0045_mobile_crm.sql", "0046_crm_notifications.sql", "0055_crm_delivery_settings.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  const created = new Date().toISOString();
  sqlite.prepare("INSERT INTO Estimates(id,Name,Phone,Status,SubmittedAt,CrmTenantId) VALUES(?,?,?,?,?,?)").run("e1", "고객 A", "010", "new", created, "day1design");
  sqlite.prepare("INSERT INTO Estimates(id,Name,Phone,Status,SubmittedAt,CrmTenantId) VALUES(?,?,?,?,?,?)").run("e2", "고객 B", "011", "new", created, "day1design");
  sqlite.prepare("INSERT INTO CrmAppointments(id,tenant_id,estimate_id,kind,starts_at,location,address,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run("a1", "day1design", "e1", "visit", "2026-10-01T09:00:00Z", "서울", "주소", "day1-owner", created);
  sqlite.prepare("INSERT INTO CrmAppointments(id,tenant_id,estimate_id,kind,starts_at,location,address,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run("a2", "day1design", "e2", "measurement", "2026-10-02T09:00:00Z", "부산", "주소", "day1-owner", created);
  return sqlite;
}
function d1(sqlite) {
  const stmt = (sql, args = []) => ({ bind(...values) { return stmt(sql, values); }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } });
  return { prepare: (sql) => stmt(sql), async batch(items) { sqlite.exec("BEGIN"); try { const out = []; for (const item of items) out.push(await item.run()); sqlite.exec("COMMIT"); return out; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
}
const auth = { user_id: "platform-owner", id: "platform-owner", email: "mkt@polarad.co.kr", role: "owner", tenant_id: "platform" };
const owner = { user_id: "day1-owner", id: "day1-owner", email: "owner@day1.local", role: "owner", tenant_id: "day1design" };
function request(path, method = "GET", value) { return new Request(`https://test.local${path}`, { method, headers: { "content-type": "application/json" }, body: value === undefined ? undefined : JSON.stringify(value) }); }
function env(sqlite) { return { DB: d1(sqlite), CRM_PLATFORM_EMAILS: "mkt@polarad.co.kr", CRM_INTEGRATION_ENCRYPTION_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8" }; }

test("platform allowlist and tenant registration are scoped and atomic", async () => {
  const sqlite = db(); const e = env(sqlite);
  assert.equal((await handleMobileManagement(request("/api/mobile/platform/tenants"), e, { ...auth, email: "other@polarad.co.kr" })).status, 403);
  const created = await handleMobileManagement(request("/api/mobile/platform/tenants", "POST", { id: "tenant-two", name: "테넌트 2", brand: "day2", owner_email: "owner@day2.local" }), e, auth);
  assert.equal(created.status, 200); assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM CrmUsers WHERE tenant_id='tenant-two'").get().n, 1);
  const tenants = await handleMobileManagement(request("/api/mobile/platform/tenants"), e, auth);
  assert.equal((await tenants.json()).tenants.some((item) => item.id === "tenant-two"), true);
  sqlite.close();
});

test("suspension audits and revokes tenant sessions; platform cannot be suspended", async () => {
  const sqlite = db(); const e = env(sqlite);
  sqlite.exec("INSERT INTO CrmTenants(id,name) VALUES('tenant-two','T2'); INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('u2','tenant-two','u2@example.com','staff');");
  sqlite.prepare("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?,?)").run("s2", "hash", "u2", "2099-01-01T00:00:00Z", new Date().toISOString());
  assert.equal((await handleMobileManagement(request("/api/mobile/platform/tenants/platform", "PATCH", { suspended: true }), e, auth)).status, 400);
  assert.equal((await handleMobileManagement(request("/api/mobile/platform/tenants/tenant-two", "PATCH", { suspended: true }), e, auth)).status, 200);
  assert.equal(sqlite.prepare("SELECT revoked_at FROM CrmSessions WHERE id='s2'").get().revoked_at !== null, true);
  assert.equal(sqlite.prepare("SELECT action FROM CrmAuditLogs WHERE tenant_id='tenant-two'").get().action, "tenant.suspend");
  sqlite.close();
});

test("same-tenant owner can add and deactivate staff only", async () => {
  const sqlite = db(); const e = env(sqlite);
  const added = await handleMobileManagement(request("/api/mobile/tenants/day1design/members", "POST", { email: "staff2@example.com", role: "staff" }), e, owner);
  const member = await added.json(); assert.equal(added.status, 200); assert.equal(member.role, "staff");
  assert.equal((await handleMobileManagement(request(`/api/mobile/tenants/day1design/members/${member.id}`, "PATCH", { active: false }), e, owner)).status, 200);
  assert.equal((await handleMobileManagement(request("/api/mobile/tenants/day1design/members/day1-owner", "PATCH", { active: false }), e, owner)).status, 400);
  assert.equal((await handleMobileManagement(request("/api/mobile/tenants/day1design/members", "POST", { email: "x@example.com", role: "owner" }), e, owner)).status, 400);
  sqlite.close();
});

test("appointments filter by tenant and return customer names with cursor", async () => {
  const sqlite = db(); const e = env(sqlite);
  const first = await handleMobileManagement(request("/api/mobile/appointments?from=2026-10-01T00:00:00Z&to=2026-10-03T00:00:00Z&limit=1"), e, owner);
  const body = await first.json(); assert.equal(first.status, 200); assert.equal(body.appointments.length, 1); assert.equal(body.appointments[0].customer_name, "고객 A"); assert.ok(body.next_cursor);
  const second = await handleMobileManagement(request(`/api/mobile/appointments?from=2026-10-01T00:00:00Z&to=2026-10-03T00:00:00Z&cursor=${encodeURIComponent(body.next_cursor)}`), e, owner);
  assert.equal((await second.json()).appointments[0].customer_id, "e2");
  const denied = await handleMobileManagement(request("/api/mobile/appointments?tenant_id=platform"), e, owner); assert.equal(denied.status, 403);
  sqlite.close();
});


test('calendar includes web visits alongside measurements and observes KST month',async()=>{
 const sqlite=db(),e=env(sqlite);try{
 sqlite.prepare("UPDATE Estimates SET ConsultAt='2026-09-30T15:00:00.000Z',ConsultBranch='Web office',ConsultCancelledAt='cancel' WHERE id='e2'").run();
 const result=await handleMobileManagement(request('/api/mobile/appointments?month=2026-10'),e,owner);
 const items=(await result.json()).appointments;
 assert.equal(items.length,3);assert.equal(items[0].id,'legacy-visit-e2');assert.equal(items[0].status,'cancelled');
 const sep=await handleMobileManagement(request('/api/mobile/appointments?month=2026-09'),e,owner);assert.equal((await sep.json()).appointments.length,0);
 for(const query of ['month=2026-13','from=2026-10-01T00:00:00Z','limit=1.5','month=2026-10&cursor=bad','from=2025-01-01T00:00:00Z&to=2026-10-01T00:00:00Z'])assert.equal((await handleMobileManagement(request('/api/mobile/appointments?'+query),e,owner)).status,400);
 }finally{sqlite.close();}
});

test('platform list cursor advances instead of repeating first page',async()=>{
 const sqlite=db(),e=env(sqlite);try{
 for(let i=0;i<101;i++)sqlite.prepare('INSERT INTO CrmTenants(id,name) VALUES(?,?)').run('t'+String(i).padStart(3,'0'),'Local');
 const first=await(await handleMobileManagement(request('/api/mobile/platform/tenants'),e,auth)).json();
 const second=await(await handleMobileManagement(request('/api/mobile/platform/tenants?cursor='+first.next_cursor),e,auth)).json();
 assert.equal(first.tenants.length,100);assert.equal(second.tenants.length,2);assert.ok(second.tenants.every(x=>x.id>first.next_cursor));
 }finally{sqlite.close();}
});

test('platform tenant detail reads the legacy production tenant schema', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec("CREATE TABLE CrmTenants(id TEXT PRIMARY KEY,name TEXT NOT NULL,brand TEXT NOT NULL DEFAULT '',logo_url TEXT NOT NULL DEFAULT '',suspended INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT '')");
    sqlite.prepare("INSERT INTO CrmTenants(id,name,brand,logo_url,suspended,created_at) VALUES(?,?,?,?,?,?)").run('day1design', '데이원디자인', 'day1design', '', 0, '2026-09-09T00:00:00Z');
    const response = await handleMobileManagement(request('/api/mobile/platform/tenants/day1design'), env(sqlite), auth);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.tenant.id, 'day1design');
    assert.equal(body.tenant.name, '데이원디자인');
    assert.equal(body.tenant.onboarding_status, 'active');
    assert.equal(body.tenant.owner, null);
    assert.equal(body.security_audit.status, 'unknown');
  } finally {
    sqlite.close();
  }
});

test('platform delivery settings are tenant isolated, encrypted, and approve explicit templates', async () => {
  const sqlite = db(), e = env(sqlite);
  try {
    const body = { enabled: true, channel: 'sms', access_key: 'access-secret', secret_key: 'super-secret', sms_service_id: 'service-1', from_number: '01012345678', contact_phone: '01099998888', visit_body: '{{name}} {{date}} {{time}} {{address}} {{map}}', measurement_body: '{{name}} {{date}} {{time}} {{address}} {{map}}' };
    const saved = await handleMobileManagement(request('/api/mobile/platform/tenants/day1design/delivery-settings', 'PUT', body), e, auth);
    assert.equal(saved.status, 200);
    const settings = (await saved.json()).settings;
    assert.equal(settings.configured, true);
    assert.equal(settings.has_credentials, true);
    const raw = sqlite.prepare('SELECT credentials_ciphertext FROM CrmTenantDeliverySettings WHERE tenant_id=?').get('day1design').credentials_ciphertext;
    assert.equal(raw.includes('super-secret'), false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM CrmNotificationTemplates WHERE tenant_id='day1design' AND state='approved'").get().n, 2);
    const denied = await handleMobileManagement(request('/api/mobile/platform/tenants/tenant-two/delivery-settings'), e, { ...auth, email: 'other@polarad.co.kr' });
    assert.equal(denied.status, 403);
    const second = await handleMobileManagement(request('/api/mobile/platform/tenants/day1design/delivery-settings', 'PUT', { enabled: false, channel: 'sms' }), e, auth);
    assert.equal((await second.json()).settings.enabled, false);
    const before = sqlite.prepare("SELECT activation_at FROM CrmTenantDeliverySettings WHERE tenant_id='day1design'").get().activation_at;
    const reenabled = await handleMobileManagement(request('/api/mobile/platform/tenants/day1design/delivery-settings', 'PUT', { enabled: true, channel: 'sms' }), e, auth);
    assert.equal((await reenabled.json()).settings.enabled, true);
    assert.equal(sqlite.prepare("SELECT activation_at FROM CrmTenantDeliverySettings WHERE tenant_id='day1design'").get().activation_at !== before, true);
    const deniedWrite = await handleMobileManagement(request('/api/mobile/platform/tenants/day1design/delivery-settings', 'PUT', { enabled: false, channel: 'sms' }), e, { ...auth, user_id: 'missing-platform-user', id: 'missing-platform-user' });
    assert.equal(deniedWrite.status, 403);
    assert.equal((await handleMobileManagement(request('/api/mobile/platform/tenants/day1design/delivery-settings'), e, auth)).status, 200);
  } finally { sqlite.close(); }
});

test('overview coalesces reads and checks permission before cache', async () => {
  const sqlite=db(), e=env(sqlite); let queries=0;
  const prepare=e.DB.prepare;
  e.DB.prepare=(sql)=>{queries++;return prepare(sql);};
  try {
    const path='/api/mobile/platform/overview';
    const responses=await Promise.all(Array.from({length:8},()=>handleMobileManagement(request(path),e,auth)));
    for(const response of responses){assert.equal(response.status,200);assert.equal((await response.json()).tenants.registered,1);}
    assert.equal(queries,3);
    await handleMobileManagement(request(path),e,auth);assert.equal(queries,3);
    assert.equal((await handleMobileManagement(request(path),e,owner)).status,403);
    assert.equal((await handleMobileManagement(request(path),{...e,CRM_PLATFORM_EMAILS:''},auth)).status,403);
    assert.equal(queries,3);
  } finally {sqlite.close();}
});

test('overview distinguishes unavailable schema from zero counts',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  try {
    const response=await handleMobileManagement(request('/api/mobile/platform/overview'),env(sqlite),auth);
    assert.equal(response.status,200);const body=await response.json();
    assert.equal(body.tenants.status,'unknown');assert.equal(body.tenants.registered,null);
    assert.equal(body.dispatch.pending,null);assert.equal(body.security_audit.status,'unknown');
  } finally {sqlite.close();}
});
