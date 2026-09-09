import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hashToken } from '../src/lib/crm-auth.js';
import { handleMobileCrm } from '../src/routes/mobile-crm.js';
import { authenticateSupport, endSupportSession, isSupportAdmin, renewSupportSession, supportBlocksExternalSend, startSupportSession } from '../src/lib/crm-support.js';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_init.sql', '0045_mobile_crm.sql', '0054_crm_persistent_sessions.sql', '0070_crm_support_sessions.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  sqlite.exec("INSERT INTO CrmTenants(id,name) VALUES('tenant-b','B'); UPDATE CrmUsers SET id='platform-owner' WHERE email='mkt@polarad.co.kr';");
  const stmt = (sql) => ({ bind(...values) { return { first: async () => sqlite.prepare(sql).get(...values) || null, run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }) }; } });
  return { sqlite, DB: { prepare: stmt, async batch(items) { sqlite.exec('BEGIN'); try { const out = []; for (const item of items) out.push(await item.run()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } };
}

function request(path, method, body, token) {
  return new Request(`https://test.local${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('support session requires allowlisted platform actor without a reason, expires separately, and audits start/end', async () => {
  const env = setup();
  const platform = { user_id: 'platform-owner', id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform' };
  const runtime = { DB: env.DB, CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' };
  const started = await startSupportSession(request('/api/mobile/platform/tenants/tenant-b/support-sessions', 'POST', {}), runtime, platform, 'tenant-b');
  assert.equal(started.status, 200);
  const payload = await started.json();
  assert.equal(payload.support_session.mode, 'admin');
  assert.equal(env.sqlite.prepare('SELECT reason FROM CrmSupportSessions').get().reason, '');
  const support = await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, payload.token));
  assert.equal(support.tenant_id, 'tenant-b');
  assert.equal(isSupportAdmin(support), true);
  assert.equal(support.support_readonly, true);
  assert.equal(supportBlocksExternalSend(support), true);
  const ended = await endSupportSession(request('/api/mobile/support/end', 'POST', undefined, payload.token), runtime, support);
  assert.equal(ended.status, 200);
  assert.equal((await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, payload.token))), null);
  assert.deepEqual(env.sqlite.prepare("SELECT action,tenant_id FROM CrmAuditLogs WHERE tenant_id='tenant-b' ORDER BY id").all().map((row) => ({ action: row.action, tenant_id: row.tenant_id })), [
    { action: 'tenant.support.read_start', tenant_id: 'tenant-b' }, { action: 'tenant.support.read_end', tenant_id: 'tenant-b' },
  ]);
  env.sqlite.close();
});

test('support authentication revalidates the current active platform owner', async () => {
  const env = setup();
  const platform = { user_id: 'platform-owner', id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform' };
  const runtime = { DB: env.DB, CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' };
  const started = await startSupportSession(request('/api/mobile/platform/tenants/tenant-b/support-sessions', 'POST', {}), runtime, platform, 'tenant-b');
  const token = (await started.json()).token;
  env.sqlite.prepare("UPDATE CrmUsers SET active=0 WHERE id='platform-owner'").run();
  assert.equal(await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, token)), null);
  env.sqlite.close();
});

test('support start denies other actor and unknown tenant, accepts no reason, and expiry is rejected', async () => {
  const env = setup();
  const path = '/api/mobile/platform/tenants/tenant-b/support-sessions';
  const base = { DB: env.DB, CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' };
  assert.equal((await startSupportSession(request(path, 'POST', { reason: 'x' }), base, { user_id: 'platform-owner', email: 'other@example.com', role: 'owner', tenant_id: 'platform' }, 'tenant-b')).status, 403);
  assert.equal((await startSupportSession(request(path, 'POST', {},), base, { user_id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform' }, 'tenant-b')).status, 200);
  assert.equal((await startSupportSession(request('/api/mobile/platform/tenants/missing/support-sessions', 'POST', { reason: 'x' }), base, { user_id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform' }, 'missing')).status, 404);
  env.sqlite.exec("INSERT INTO CrmSupportSessions(id,token_hash,tenant_id,actor_id,reason,expires_at,created_at) VALUES('expired','expiredhash','tenant-b','platform-owner','x','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z')");
  const expired = await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, 'expired-token'));
  assert.equal(expired, null);
  env.sqlite.close();
});

test('support renewal requires the live originating platform session and rotates the token', async () => {
  const env = setup();
  const platform = { user_id: 'platform-owner', id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform', session_id: 'platform-session' };
  const runtime = { DB: env.DB, CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' };
  env.sqlite.exec("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,persistent,created_at) VALUES('platform-session','platform-hash','platform-owner','2099-01-01T00:00:00Z',1,'2026-09-10T00:00:00Z')");
  const started = await startSupportSession(request('/api/mobile/platform/tenants/tenant-b/support-sessions', 'POST', {}), runtime, platform, 'tenant-b');
  const oldToken = (await started.json()).token;
  const renewals = await Promise.all([
    renewSupportSession(env.DB, request('/api/mobile/support/renew', 'POST', undefined, oldToken), platform),
    renewSupportSession(env.DB, request('/api/mobile/support/renew', 'POST', undefined, oldToken), platform),
  ]);
  assert.deepEqual(renewals.map((response) => response.status).sort(), [200, 409]);
  const nextToken = (await renewals.find((response) => response.status === 200).json()).token;
  assert.notEqual(nextToken, oldToken);
  assert.equal(await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, oldToken)), null);
  assert.equal((await authenticateSupport(env.DB, request('/api/mobile/me', 'GET', undefined, nextToken))).tenant_id, 'tenant-b');
  env.sqlite.prepare("UPDATE CrmSessions SET revoked_at='2026-09-10T00:01:00Z' WHERE id='platform-session'").run();
  assert.equal((await renewSupportSession(env.DB, request('/api/mobile/support/renew', 'POST', undefined, nextToken), platform)).status, 403);
  env.sqlite.close();
});

test('support renewal route authenticates platform bearer and verifies body support token', async () => {
  const env = setup();
  const platformToken = 'platform-session-token';
  const platform = { user_id: 'platform-owner', id: 'platform-owner', email: 'mkt@polarad.co.kr', role: 'owner', tenant_id: 'platform', session_id: 'platform-session' };
  const runtime = { DB: env.DB, CRM_ENABLED: 'true', CRM_PLATFORM_EMAILS: 'mkt@polarad.co.kr' };
  env.sqlite.exec("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,persistent,created_at) VALUES('platform-session','platform-hash','platform-owner','2099-01-01T00:00:00Z',1,'2026-09-10T00:00:00Z')");
  env.sqlite.prepare("UPDATE CrmSessions SET token_hash=? WHERE id='platform-session'").run(await hashToken(platformToken));
  const started = await startSupportSession(new Request('https://test.local/api/mobile/platform/tenants/tenant-b/support-sessions', { method: 'POST' }), runtime, platform, 'tenant-b');
  const supportToken = (await started.json()).token;
  const response = await handleMobileCrm(new Request('https://test.local/api/mobile/support/renew', { method: 'POST', headers: { authorization: `Bearer ${platformToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ support_token: supportToken }) }), runtime);
  assert.equal(response.status, 200);
  assert.notEqual((await response.json()).token, supportToken);
  env.sqlite.close();
});
