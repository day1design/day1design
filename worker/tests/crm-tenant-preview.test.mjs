import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hashToken } from '../src/lib/crm-auth.js';
import { authenticateTenantPreview, previewReadAllowed, startTenantPreview } from '../src/lib/crm-tenant-preview.js';
import { handleMobileCrm } from '../src/routes/mobile-crm.js';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_init.sql', '0045_mobile_crm.sql', '0054_crm_persistent_sessions.sql', '0070_crm_support_sessions.sql', '0080_crm_tenant_preview_sessions.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  sqlite.exec(`
    INSERT OR IGNORE INTO CrmTenants(id,name,brand) VALUES('day1design','데이원디자인','day1');
    UPDATE CrmUsers SET id='platform-owner' WHERE email='mkt@polarad.co.kr';
    INSERT OR IGNORE INTO Estimates(id,Name,CrmTenantId,CrmVersion) VALUES('customer-1','테스트 고객','day1design',1);
  `);
  const stmt = (sql) => ({ bind(...values) {
    return {
      first: async () => sqlite.prepare(sql).get(...values) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
    };
  }});
  return { sqlite, DB: { prepare: stmt, async batch(items) {
    sqlite.exec('BEGIN');
    try { const out = []; for (const item of items) out.push(await item.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }}};
}

function request(path, method, body, token) {
  return new Request(`https://test.local${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('preview binds active target owner to live platform session and returns real target identity', async () => {
  const env = setup();
  const platform = { user_id: 'platform-owner', id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform', session_id: 'platform-session' };
  env.sqlite.exec("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,persistent,created_at) VALUES('platform-session','parent-hash','platform-owner','2099-01-01T00:00:00Z',1,'2026-09-10T00:00:00Z')");
  const response = await startTenantPreview(request('/api/mobile/platform/tenants/day1design/preview-sessions', 'POST', {}), { DB: env.DB, CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' }, platform, 'day1design');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.target.user_id, 'day1-owner');
  assert.equal(payload.target.email, 'gahyun.co@gmail.com');
  const preview = await authenticateTenantPreview(env.DB, request('/api/mobile/me', 'GET', undefined, payload.token));
  assert.equal(preview.tenant_id, 'day1design');
  assert.equal(preview.user_id, 'day1-owner');
  assert.equal(preview.preview_readonly, true);
  for (const path of ['/me', '/home', '/notifications', '/analytics', '/briefings/latest']) assert.equal(previewReadAllowed('GET', path), true);
  assert.equal(previewReadAllowed('POST', '/notifications'), false);
  env.sqlite.prepare("UPDATE CrmUsers SET tenant_id='platform' WHERE id='day1-owner'").run();
  assert.equal(await authenticateTenantPreview(env.DB, request('/api/mobile/me', 'GET', undefined, payload.token)), null);
  env.sqlite.prepare("UPDATE CrmUsers SET tenant_id='day1design' WHERE id='day1-owner'").run();
  env.sqlite.prepare("UPDATE CrmSessions SET user_id='day1-owner' WHERE id='platform-session'").run();
  assert.equal(await authenticateTenantPreview(env.DB, request('/api/mobile/me', 'GET', undefined, payload.token)), null);
  env.sqlite.close();
});

test('preview rejects inactive target, revoked parent, and every write route', async () => {
  const env = setup();
  const platform = { user_id: 'platform-owner', id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform', session_id: 'platform-session' };
  env.sqlite.exec("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,persistent,created_at) VALUES('platform-session','parent-hash','platform-owner','2099-01-01T00:00:00Z',1,'2026-09-10T00:00:00Z')");
  const runtime = { DB: env.DB, CRM_ENABLED: 'true', CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' };
  const started = await startTenantPreview(request('/api/mobile/platform/tenants/day1design/preview-sessions', 'POST', {}), runtime, platform, 'day1design');
  const token = (await started.json()).token;
  assert.equal((await handleMobileCrm(request('/api/mobile/customers/customer-1', 'PATCH', { version: 1, name: '변경' }, token), runtime)).status, 403);
  assert.equal((await handleMobileCrm(request('/api/mobile/appointments', 'POST', { version: 1, customer_id: 'customer-1' }, token), runtime)).status, 403);
  assert.equal((await handleMobileCrm(request('/api/mobile/notifications', 'POST', { type: 'new_customer' }, token), runtime)).status, 403);
  env.sqlite.prepare("UPDATE CrmSessions SET revoked_at='2026-09-10T00:01:00Z' WHERE id='platform-session'").run();
  assert.equal(await authenticateTenantPreview(env.DB, request('/api/mobile/me', 'GET', undefined, token)), null);
  env.sqlite.close();
});

test('authenticated admin enters target account through the exact Android route and exits without OTP', async () => {
  const env=setup();
  try {
    const parentToken='parent-admin-fixture';
    env.sqlite.prepare("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,persistent,created_at) VALUES(?,?,?,?,?,?)").run('platform-session',await hashToken(parentToken),'platform-owner','2099-01-01T00:00:00Z',1,'2026-09-10T00:00:00Z');
    const runtime={DB:env.DB,CRM_ENABLED:'true',CRM_PLATFORM_EMAILS:'mkt@polarad.co.kr'};
    const path='/api/mobile/platform/tenants/day1design/preview-session';
    assert.equal((await handleMobileCrm(request(path,'POST',{}),runtime)).status,401);
    const start=await handleMobileCrm(request(path,'POST',{},parentToken),runtime);
    assert.equal(start.status,200);
    const issued=await start.json();
    const me=await handleMobileCrm(request('/api/mobile/me','GET',undefined,issued.preview_token),runtime);
    assert.equal(me.status,200);
    const identity=await me.json();
    assert.equal(identity.tenant.id,'day1design');
    assert.equal(identity.email,'gahyun.co@gmail.com');
    assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM CrmOtpRequests').get().n,0);
    const end=await handleMobileCrm(request('/api/mobile/platform/preview-session/end','POST',{},issued.preview_token),runtime);
    assert.equal(end.status,200);
    assert.equal((await handleMobileCrm(request('/api/mobile/me','GET',undefined,issued.preview_token),runtime)).status,401);
    assert.equal((await handleMobileCrm(request('/api/mobile/me','GET',undefined,parentToken),runtime)).status,200);
  } finally {env.sqlite.close();}
});
