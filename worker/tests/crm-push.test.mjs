import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { processPushBatch } from '../src/lib/crm-push.js';
import { fcmConfig, genericPushMessage, sendFcmMessage } from '../src/lib/crm-fcm.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_init.sql', '0041_consult_booking.sql', '0042_contract_fields.sql', '0043_consult_cancel.sql', '0044_consult_reminders.sql', '0045_mobile_crm.sql', '0046_crm_notifications.sql', '0052_crm_devices.sql', '0053_crm_push.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  class Statement {
    constructor(statement) { this.statement = statement; this.args = []; }
    bind(...args) { this.args = args; return this; }
    all() { return { results: this.statement.all(...this.args) }; }
    first() { return this.statement.get(...this.args) ?? null; }
    run() { const result = this.statement.run(...this.args); return { meta: { changes: Number(result.changes) } }; }
  }
  const db = { prepare(sql) { return new Statement(sqlite.prepare(sql)); } };
  db.close = () => sqlite.close();
  db.sqlite = sqlite;
  return db;
}

function seed(db) {
  db.sqlite.exec("INSERT INTO CrmUsers(id,tenant_id,email,role,active,created_at) VALUES('u1','day1design','staff@test','staff',1,'2026-09-09T00:00:00Z')");
  db.sqlite.exec("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES('s1','hash','u1','2099-01-01T00:00:00Z','2026-09-09T00:00:00Z')");
  db.sqlite.exec("INSERT INTO CrmDevices(id,tenant_id,user_id,session_id,push_token,notifications_enabled,preview_mode,updated_at) VALUES('00000000-0000-4000-8000-000000000001','day1design','u1','s1','local-token-000000000001',1,'generic','2026-09-09T00:00:00Z')");
}

function notification(db, id, created = '2026-09-09T01:00:00Z') {
  db.sqlite.exec(`INSERT INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at) VALUES('${id}','day1design','staff_message','day1-owner','{"message":"private"}','${created}')`);
  db.sqlite.exec(`INSERT INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) VALUES('${id}','day1design','u1','${created}')`);
}

test('push is fail closed and first enablement creates a current baseline', async () => {
  const db = fixture();
  try {
    seed(db);
    notification(db, 'old', '2026-09-09T01:00:00Z');
    assert.deepEqual(await processPushBatch(db, { env: {}, tenantId: 'day1design' }), { enabled: false, processed: 0, next_cursor: null });
    const missing = await processPushBatch(db, { env: { CRM_PUSH_ENABLED: 'true' }, tenantId: 'day1design' });
    assert.equal(missing.configured, false);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM CrmPushCursors').get().n, 0);
    const result = await processPushBatch(db, { env: { CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'test', CRM_FCM_CLIENT_EMAIL: 'test', CRM_FCM_PRIVATE_KEY: 'test' }, tenantId: 'day1design', now: '2026-09-09T02:00:00Z', send: () => { throw new Error('must not send'); } });
    assert.equal(result.baseline_initialized, true);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM CrmPushReceipts').get().n, 0);
  } finally { db.close(); }
});

test('push rechecks live membership, sends generic content, and is idempotent', async () => {
  const db = fixture();
  try {
    seed(db);
    const env = { CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'test', CRM_FCM_CLIENT_EMAIL: 'test', CRM_FCM_PRIVATE_KEY: 'test' };
    const baseline = await processPushBatch(db, { env, tenantId: 'day1design', now: '2026-09-09T02:00:00Z', send: () => ({ accepted: true }) });
    notification(db, 'new', '2026-09-09T03:00:00Z');
    const calls = [];
    const send = async (_env, payload) => { calls.push(payload); return { accepted: true, messageName: 'projects/test/messages/m1' }; };
    const result = await processPushBatch(db, { env, tenantId: 'day1design', cursor: baseline.next_cursor, now: '2026-09-09T04:00:00Z', send });
    assert.equal(result.accepted, 1);
    assert.equal(calls[0].token, 'local-token-000000000001');
    assert.equal(db.sqlite.prepare("SELECT status FROM CrmPushReceipts WHERE notification_id='new'").get().status, 'accepted');
    const again = await processPushBatch(db, { env, tenantId: 'day1design', cursor: baseline.next_cursor, now: '2026-09-09T04:01:00Z', send });
    assert.equal(again.skipped, 1);
    assert.equal(calls.length, 1);
    db.sqlite.exec("UPDATE CrmUsers SET active=0 WHERE id='u1'");
    notification(db, 'inactive', '2026-09-09T05:00:00Z');
    const inactive = await processPushBatch(db, { env, tenantId: 'day1design', cursor: result.next_cursor, now: '2026-09-09T06:00:00Z', send });
    assert.equal(inactive.processed, 0);
  } finally { db.close(); }
});

test('baseline uses the greatest recipient key so pre-existing recipients are all excluded', async () => {
  const db = fixture();
  try {
    seed(db);
    db.sqlite.exec("INSERT INTO CrmUsers(id,tenant_id,email,role,active,created_at) VALUES('u2','day1design','staff2@test','staff',1,'2026-09-09T00:00:00Z'); INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES('s2','hash2','u2','2099-01-01T00:00:00Z','2026-09-09T00:00:00Z'); INSERT INTO CrmDevices(id,tenant_id,user_id,session_id,push_token,notifications_enabled,preview_mode,updated_at) VALUES('00000000-0000-4000-8000-000000000002','day1design','u2','s2','local-token-000000000002',1,'generic','2026-09-09T00:00:00Z')");
    notification(db, 'existing', '2026-09-09T03:00:00Z');
    db.sqlite.exec("INSERT INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) VALUES('existing','day1design','u2','2026-09-09T03:00:00Z')");
    const result = await processPushBatch(db, { env: { CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'test', CRM_FCM_CLIENT_EMAIL: 'test', CRM_FCM_PRIVATE_KEY: 'test' }, tenantId: 'day1design', now: '2026-09-09T04:00:00Z', send: () => { throw new Error('must not send'); } });
    assert.equal(result.baseline_initialized, true);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM CrmPushReceipts').get().n, 0);
    assert.equal(db.sqlite.prepare('SELECT cursor_recipient_id FROM CrmPushCursors WHERE tenant_id=\'day1design\'').get().cursor_recipient_id, 'u2');
  } finally { db.close(); }
});

test('unknown provider outcome becomes terminal and is never retried automatically', async () => {
  const db = fixture();
  try {
    seed(db);
    const env = { CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'test', CRM_FCM_CLIENT_EMAIL: 'test', CRM_FCM_PRIVATE_KEY: 'test' };
    const baseline = await processPushBatch(db, { env, tenantId: 'day1design', now: '2026-09-09T02:00:00Z', send: () => ({ accepted: true }) });
    notification(db, 'crash', '2026-09-09T03:00:00Z');
    let attempts = 0;
    const send = async () => { attempts += 1; throw new Error('network_unknown'); };
    const result = await processPushBatch(db, { env, tenantId: 'day1design', cursor: baseline.next_cursor, now: '2026-09-09T04:00:00Z', send });
    assert.equal(result.unknown, 1);
    assert.equal(db.sqlite.prepare("SELECT status,error_code FROM CrmPushReceipts WHERE notification_id='crash'").get().status, 'unknown');
    await processPushBatch(db, { env, tenantId: 'day1design', cursor: baseline.next_cursor, now: '2026-09-09T04:01:00Z', send });
    assert.equal(attempts, 1);
  } finally { db.close(); }
});

test('cursor keeps recipients of the same notification in the bounded page stream', async () => {
  const db = fixture();
  try {
    seed(db);
    db.sqlite.exec("INSERT INTO CrmUsers(id,tenant_id,email,role,active,created_at) VALUES('u2','day1design','staff2@test','staff',1,'2026-09-09T00:00:00Z'); INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES('s2','hash2','u2','2099-01-01T00:00:00Z','2026-09-09T00:00:00Z'); INSERT INTO CrmDevices(id,tenant_id,user_id,session_id,push_token,notifications_enabled,preview_mode,updated_at) VALUES('00000000-0000-4000-8000-000000000002','day1design','u2','s2','local-token-000000000002',1,'generic','2026-09-09T00:00:00Z')");
    const env = { CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design', CRM_FCM_PROJECT_ID: 'test', CRM_FCM_CLIENT_EMAIL: 'test', CRM_FCM_PRIVATE_KEY: 'test' };
    const baseline = await processPushBatch(db, { env, tenantId: 'day1design', now: '2026-09-09T02:00:00Z', send: () => ({ accepted: true }) });
    notification(db, 'same', '2026-09-09T03:00:00Z');
    db.sqlite.exec("INSERT INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) VALUES('same','day1design','u2','2026-09-09T03:00:00Z')");
    const send = async () => ({ accepted: true });
    const first = await processPushBatch(db, { env, tenantId: 'day1design', cursor: baseline.next_cursor, limit: 1, now: '2026-09-09T04:00:00Z', send });
    const second = await processPushBatch(db, { env, tenantId: 'day1design', cursor: first.next_cursor, limit: 1, now: '2026-09-09T04:01:00Z', send });
    assert.equal(first.accepted + second.accepted, 2);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM CrmPushReceipts WHERE notification_id='same'").get().n, 2);
  } finally { db.close(); }
});

test('FCM message is generic and HTTP v1 sender validates OAuth and provider acceptance', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const config = { CRM_PUSH_ENABLED: 'true', CRM_FCM_PROJECT_ID: 'project-1', CRM_FCM_CLIENT_EMAIL: 'sender@test', CRM_FCM_PRIVATE_KEY: privateKey, CRM_PUSH_TENANTS: 'day1design' };
  assert.equal(fcmConfig({}, 'day1design'), null);
  assert.deepEqual(genericPushMessage('token', 'notification-1').message.notification, { title: '폴라애드 알림', body: '새 알림이 도착했습니다.' });
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'access', token_type: 'Bearer' }), { status: 200 });
    return new Response(JSON.stringify({ name: 'projects/project-1/messages/1' }), { status: 200 });
  };
  const result = await sendFcmMessage(config, { tenantId: 'day1design', token: 'token', notificationId: 'n1', fetchImpl, now: 1_757_392_800_000 });
  assert.equal(result.accepted, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[1].options.redirect, 'error');
  assert.match(requests[1].options.headers.authorization, /^Bearer access$/);
  assert.equal(JSON.parse(requests[1].options.body).message.notification.body, '새 알림이 도착했습니다.');
  const denied = await sendFcmMessage(config, { tenantId: 'day1design', token: 'token', notificationId: 'n2', fetchImpl, beforeSend: () => false });
  assert.equal(denied.errorCode, 'push_authorization_changed');
  assert.equal(requests.length, 3);
});
