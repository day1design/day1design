import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { listPlatformNotificationSubscriptions, upsertPlatformNotificationSubscription, disablePlatformNotificationSubscription, relayPlatformNotification, processPlatformSubscriptionPushBatch } from '../src/lib/crm-platform-notifications.js';
import { listMyNotifications, getMyNotification, markNotificationRead } from '../src/lib/crm-notification-store.js';

const migration = await readFile(new URL('../migrations/0090_crm_platform_notification_subscriptions.sql', import.meta.url), 'utf8');
function db() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE CrmAuditLogs(id INTEGER PRIMARY KEY,tenant_id TEXT,actor_id TEXT,estimate_id TEXT,action TEXT,created_at TEXT);');
  sqlite.exec('CREATE TABLE CrmNotificationReadAll(tenant_id TEXT,user_id TEXT,last_read_notification_id TEXT,updated_at TEXT,PRIMARY KEY(tenant_id,user_id));');
  sqlite.exec(`CREATE TABLE CrmTenants(id TEXT PRIMARY KEY,suspended INTEGER DEFAULT 0); CREATE TABLE CrmUsers(id TEXT PRIMARY KEY,tenant_id TEXT,email TEXT,role TEXT,active INTEGER DEFAULT 1); CREATE TABLE CrmNotifications(id TEXT PRIMARY KEY,tenant_id TEXT,type TEXT,actor_id TEXT,payload_json TEXT,created_at TEXT,event_key TEXT); CREATE TABLE CrmNotificationRecipients(notification_id TEXT,tenant_id TEXT,recipient_id TEXT,created_at TEXT,read_at TEXT,PRIMARY KEY(notification_id,recipient_id)); CREATE TABLE CrmDevices(id TEXT PRIMARY KEY,tenant_id TEXT,user_id TEXT,session_id TEXT,push_token TEXT,notifications_enabled INTEGER,preview_mode TEXT); CREATE TABLE CrmSessions(id TEXT PRIMARY KEY,user_id TEXT,expires_at TEXT,persistent INTEGER,revoked_at TEXT); CREATE TABLE CrmPushReceipts(id TEXT PRIMARY KEY,tenant_id TEXT,notification_id TEXT,recipient_id TEXT,device_id TEXT,idempotency_key TEXT UNIQUE,status TEXT,provider_message_name TEXT,error_code TEXT,created_at TEXT,updated_at TEXT);`);
  sqlite.exec(migration);
  const db = { prepare(sql) { const s = sqlite.prepare(sql); return { bind(...args) { return { first: async () => s.get(...args), all: async () => ({ results: s.all(...args) }), run: async () => ({ meta: { changes: s.run(...args).changes } }) }; } }; }, batch: async (statements) => { sqlite.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  db.sqlite = sqlite; return db;
}

test('platform subscription is explicit, skips history, relays once, and sends only to the subscribed platform account', async () => {
  const d = db();
  d.sqlite.exec("INSERT INTO CrmTenants VALUES ('platform',0),('day1design',0); INSERT INTO CrmUsers VALUES ('platform-owner','platform','owner@test','owner',1),('day1-owner','day1design','day1@test','owner',1); INSERT INTO CrmNotifications VALUES ('old','day1design','new_customer','day1-owner','{\"name\":\"old\"}','2026-09-09T00:00:00Z','new_customer:day1design:old');");
  const actor = { id: 'platform-owner', email: 'owner@test', role: 'owner', tenant_id: 'platform' };
  const env = { CRM_PLATFORM_EMAILS: 'owner@test', CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'p', CRM_FCM_CLIENT_EMAIL: 'e', CRM_FCM_PRIVATE_KEY: 'k' };
  const created = await upsertPlatformNotificationSubscription(d, { actor, env, createdAt: '2026-09-10T00:00:00Z' });
  assert.equal(created.enabled, 1);
  assert.equal((await listPlatformNotificationSubscriptions(d, { actor, env }))[0].source_tenant_id, 'day1design');
  d.sqlite.exec("INSERT INTO CrmNotifications VALUES ('new','day1design','new_customer','day1-owner','{\"name\":\"new\"}','2026-09-10T00:01:00Z','new_customer:day1design:new'); INSERT INTO CrmNotificationRecipients VALUES ('new','day1design','day1-owner','2026-09-10T00:01:00Z',NULL); INSERT INTO CrmSessions VALUES ('ps','platform-owner','2099-01-01T00:00:00Z',1,NULL); INSERT INTO CrmDevices VALUES ('device','platform','platform-owner','ps','token-12345678901234567890',1,'generic');");
  assert.deepEqual(await relayPlatformNotification(d, { env, sourceNotificationId: 'new', createdAt: '2026-09-10T00:01:00Z' }), { relayed: 1 });
  assert.deepEqual(await relayPlatformNotification(d, { env, sourceNotificationId: 'new', createdAt: '2026-09-10T00:01:00Z' }), { relayed: 0 });
  const sent = [];
  const result = await processPlatformSubscriptionPushBatch(d, { env, now: '2026-09-10T00:02:00Z', send: async (_env, request) => { sent.push(request); return { accepted: true, messageName: 'm' }; } });
  assert.equal(result.accepted, 1); assert.equal(sent[0].tenantId, 'day1design'); assert.equal(sent[0].payload.source_tenant_id, 'day1design');
  assert.equal(d.sqlite.prepare("SELECT COUNT(*) n FROM CrmPlatformNotificationRelays").get().n, 1);
  d.sqlite.close();
});

test('allowlist removal and disable stop delivery, reenable starts after activation without replay', async () => {
  const d = db(); const actor = { id: 'platform-owner', email: 'owner@test', role: 'owner', tenant_id: 'platform' };
  const env = { CRM_PLATFORM_EMAILS: 'owner@test', CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'p', CRM_FCM_CLIENT_EMAIL: 'e', CRM_FCM_PRIVATE_KEY: 'k' };
  d.sqlite.exec("INSERT INTO CrmTenants VALUES ('platform',0),('day1design',0); INSERT INTO CrmUsers VALUES ('platform-owner','platform','owner@test','owner',1),('day1-owner','day1design','day1@test','owner',1); INSERT INTO CrmNotifications VALUES ('old','day1design','new_customer','day1-owner','{}','2026-09-09T00:00:00Z','old');");
  await upsertPlatformNotificationSubscription(d, { actor, env, createdAt: '2026-09-10T00:00:00Z' });
  await disablePlatformNotificationSubscription(d, { actor, env, updatedAt: '2026-09-10T00:01:00Z' });
  env.CRM_PLATFORM_EMAILS = 'other@test';
  await assert.rejects(() => listPlatformNotificationSubscriptions(d, { actor, env }), /platform_access_required/);
  env.CRM_PLATFORM_EMAILS = 'owner@test';
  d.sqlite.exec("INSERT INTO CrmNotifications VALUES ('during-disable','day1design','new_customer','day1-owner','{}','2026-09-10T00:02:00Z','during-disable');");
  assert.deepEqual(await relayPlatformNotification(d, { env, sourceNotificationId: 'during-disable' }), { relayed: 0 });
  await upsertPlatformNotificationSubscription(d, { actor, env, createdAt: '2026-09-10T00:03:00Z' });
  assert.equal((await relayPlatformNotification(d, { env, sourceNotificationId: 'during-disable' })).relayed, 0);
  d.sqlite.close();
});

test('relay batch rolls back on mapping failure and can retry atomically', async () => {
  const d = db(); const actor = { id: 'platform-owner', email: 'owner@test', role: 'owner', tenant_id: 'platform' };
  const env = { CRM_PLATFORM_EMAILS: 'owner@test' };
  d.sqlite.exec("INSERT INTO CrmTenants VALUES ('platform',0),('day1design',0); INSERT INTO CrmUsers VALUES ('platform-owner','platform','owner@test','owner',1); INSERT INTO CrmNotifications VALUES ('new','day1design','new_customer','x','{}','2026-09-10T00:01:00Z','new');");
  await upsertPlatformNotificationSubscription(d, { actor, env, createdAt: '2026-09-10T00:00:00Z' });
  d.sqlite.exec("CREATE TRIGGER fail_relay BEFORE INSERT ON CrmPlatformNotificationRelays BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(() => relayPlatformNotification(d, { env, sourceNotificationId: 'new' }), /fixture failure/);
  assert.equal(d.sqlite.prepare("SELECT COUNT(*) n FROM CrmNotifications WHERE tenant_id='platform'").get().n, 0);
  d.sqlite.exec('DROP TRIGGER fail_relay');
  assert.equal((await relayPlatformNotification(d, { env, sourceNotificationId: 'new' })).relayed, 1);
  d.sqlite.close();
});

test('delivery rechecks authorization before provider handoff and rejects a revoked subscription', async () => {
  const d = db(); const actor = { id: 'platform-owner', email: 'owner@test', role: 'owner', tenant_id: 'platform' };
  const env = { CRM_PLATFORM_EMAILS: 'owner@test', CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'p', CRM_FCM_CLIENT_EMAIL: 'e', CRM_FCM_PRIVATE_KEY: 'k' };
  d.sqlite.exec("INSERT INTO CrmTenants VALUES ('platform',0),('day1design',0); INSERT INTO CrmUsers VALUES ('platform-owner','platform','owner@test','owner',1); INSERT INTO CrmSessions VALUES ('s','platform-owner','2099-01-01T00:00:00Z',1,NULL); INSERT INTO CrmDevices VALUES ('d','platform','platform-owner','s','token-12345678901234567890',1,'generic'); INSERT INTO CrmNotifications VALUES ('n','day1design','new_customer','platform-owner','{}','2026-09-10T00:01:00Z','n');");
  await upsertPlatformNotificationSubscription(d, { actor, env, createdAt: '2026-09-10T00:00:00Z' });
  await relayPlatformNotification(d, { env, sourceNotificationId: 'n' });
  let firstCheck = false;
  const result = await processPlatformSubscriptionPushBatch(d, { env, now: '2026-09-10T00:02:00Z', send: async (_env, request) => { firstCheck = await request.beforeSend(); await disablePlatformNotificationSubscription(d, { actor, env, updatedAt: '2026-09-10T00:02:01Z' }); return { accepted: firstCheck && await request.beforeSend() }; } });
  assert.equal(firstCheck, true); assert.equal(result.accepted, 0); assert.equal(result.failed, 1);
  assert.equal(d.sqlite.prepare("SELECT status FROM CrmPushReceipts").get().status, 'failed');
  d.sqlite.close();
});

test('delivery is capped at twenty sends and resumes the bounded cursor exactly once', async () => {
  const d = db(); const actor = { id: 'platform-owner', email: 'owner@test', role: 'owner', tenant_id: 'platform' };
  const env = { CRM_PLATFORM_EMAILS: 'owner@test', CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'p', CRM_FCM_CLIENT_EMAIL: 'e', CRM_FCM_PRIVATE_KEY: 'k' };
  d.sqlite.exec("INSERT INTO CrmTenants VALUES ('platform',0),('day1design',0); INSERT INTO CrmUsers VALUES ('platform-owner','platform','owner@test','owner',1); INSERT INTO CrmSessions VALUES ('s','platform-owner','2099-01-01T00:00:00Z',1,NULL); INSERT INTO CrmDevices VALUES ('d','platform','platform-owner','s','token-12345678901234567890',1,'generic');");
  await upsertPlatformNotificationSubscription(d, { actor, env, createdAt: '2026-09-10T00:00:00Z' });
  for (let i = 1; i <= 21; i++) d.sqlite.prepare("INSERT INTO CrmNotifications VALUES (?,?,?,?,?,?,?)").run(`n${String(i).padStart(2,'0')}`,'day1design','new_customer','platform-owner','{}',`2026-09-10T00:${String(i).padStart(2,'0')}:00Z`,`n${i}`);
  const send = async (_env, request) => ({ accepted: await request.beforeSend(), messageName: 'm' });
  const first = await processPlatformSubscriptionPushBatch(d, { env, now: '2026-09-10T01:00:00Z', send });
  const second = await processPlatformSubscriptionPushBatch(d, { env, now: '2026-09-10T01:01:00Z', send });
  const third = await processPlatformSubscriptionPushBatch(d, { env, now: '2026-09-10T01:02:00Z', send });
  assert.equal(first.accepted, 20); assert.equal(second.accepted, 1); assert.equal(third.accepted, 0);
  assert.equal(d.sqlite.prepare("SELECT COUNT(*) n FROM CrmPushReceipts WHERE status='accepted'").get().n, 21);
  assert.equal(d.sqlite.prepare('SELECT COUNT(*) n FROM CrmPushReceipts').get().n, 21);
  d.sqlite.close();
});

test('multiple devices crossing the cap eventually receive every relay once', async () => {
  const d = db(); const actor = { id: 'platform-owner', email: 'owner@test', role: 'owner', tenant_id: 'platform' };
  const env = { CRM_PLATFORM_EMAILS: 'owner@test', CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'p', CRM_FCM_CLIENT_EMAIL: 'e', CRM_FCM_PRIVATE_KEY: 'k' };
  d.sqlite.exec("INSERT INTO CrmTenants VALUES ('platform',0),('day1design',0); INSERT INTO CrmUsers VALUES ('platform-owner','platform','owner@test','owner',1); INSERT INTO CrmSessions VALUES ('s','platform-owner','2099-01-01T00:00:00Z',1,NULL); INSERT INTO CrmDevices VALUES ('d1','platform','platform-owner','s','token-12345678901234567890',1,'generic'),('d2','platform','platform-owner','s','token-22345678901234567890',1,'generic');");
  await upsertPlatformNotificationSubscription(d, { actor, env, createdAt: '2026-09-10T00:00:00Z' });
  for (let i = 1; i <= 11; i++) d.sqlite.prepare("INSERT INTO CrmNotifications VALUES (?,?,?,?,?,?,?)").run(`m${i}`,'day1design','new_customer','platform-owner','{}',`2026-09-10T00:${String(i).padStart(2,'0')}:00Z`,`m${i}`);
  const send = async (_env, request) => ({ accepted: await request.beforeSend(), messageName: 'm' });
  const first = await processPlatformSubscriptionPushBatch(d, { env, now: '2026-09-10T01:00:00Z', send });
  const second = await processPlatformSubscriptionPushBatch(d, { env, now: '2026-09-10T01:01:00Z', send });
  const third = await processPlatformSubscriptionPushBatch(d, { env, now: '2026-09-10T01:02:00Z', send });
  assert.equal(first.accepted, 20); assert.equal(second.accepted, 2); assert.equal(third.accepted, 0);
  assert.equal(d.sqlite.prepare("SELECT COUNT(*) n FROM CrmPushReceipts WHERE status='accepted'").get().n, 22);
  assert.equal(d.sqlite.prepare('SELECT COUNT(*) n FROM CrmPushReceipts').get().n, 22);
  d.sqlite.close();
});

test('notification inbox, detail, and read reject a removed platform allowlist entry', async () => {
  const d = db(); const actor = { id: 'platform-owner', email: 'owner@test', role: 'owner', tenant_id: 'platform' };
  const env = { CRM_PLATFORM_EMAILS: 'owner@test' };
  d.sqlite.exec("INSERT INTO CrmTenants VALUES ('platform',0); INSERT INTO CrmUsers VALUES ('platform-owner','platform','owner@test','owner',1); INSERT INTO CrmNotifications VALUES ('platform-note','platform','new_customer','platform-owner','{}','2026-09-10T00:00:00Z','platform-note'); INSERT INTO CrmNotificationRecipients VALUES ('platform-note','platform','platform-owner','2026-09-10T00:00:00Z',NULL);");
  assert.equal((await listMyNotifications(d, { actor, env })).notifications.length, 1);
  env.CRM_PLATFORM_EMAILS = 'other@test';
  await assert.rejects(() => listMyNotifications(d, { actor, env }), /platform_access_required/);
  await assert.rejects(() => getMyNotification(d, { actor, env, notificationId: 'platform-note' }), /platform_access_required/);
  await assert.rejects(() => markNotificationRead(d, { actor, env, notificationId: 'platform-note' }), /platform_access_required/);
  d.sqlite.close();
});
