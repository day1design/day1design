import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrmTenantDeliveryAdapter, decryptCredentials, encryptCredentials } from '../src/lib/crm-delivery.js';
import { sendNcpSens } from '../src/lib/sens.js';

const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const env = { CRM_INTEGRATION_ENCRYPTION_KEY: key };
const body = '{{name}} {{date}} {{time}} {{address}} {{map}}';

test('encrypted credentials are bound to their tenant', async () => {
  const ciphertext = await encryptCredentials(env, { accessKey: 'a', secretKey: 's' }, 'tenant-one');
  await assert.rejects(() => decryptCredentials(env, ciphertext, 'tenant-two'));
});

function db(rows) {
  return { prepare(sql) { return { bind(tenantId) { return { async first() { const row = rows.get(tenantId); if (sql.includes('CrmNotificationTemplates')) return row?.enabled === 1 ? { body: row.visit_body } : null; return row?.enabled === 1 ? row : null; } }; } }; } };
}
async function setting(channel, tenantId, enabled = 1) {
  return { tenant_id: tenantId, enabled, channel, credentials_ciphertext: await encryptCredentials(env, { accessKey: `${tenantId}-access`, secretKey: `${tenantId}-secret` }, tenantId), sms_service_id: 'sms-service', from_number: '01012345678', contact_phone: '01099998888', alimtalk_service_id: 'alim-service', channel_id: 'channel-id', visit_template_code: 'visit-code', measurement_template_code: 'measurement-code', visit_body: body, measurement_body: body };
}

function row(tenantId, kind = 'visit') {
  return { tenant_id: tenantId, notification_type: `${kind}_reminder`, payload: { name: '고객', phone: '01011112222', address: '서울시 강남구', starts_at: '2026-10-01T09:00:00Z' } };
}

test('delivery adapter isolates tenants, redacts credentials, and accepts SMS receipt', async () => {
  const rows = new Map([['one', await setting('sms', 'one')], ['two', await setting('sms', 'two')]]);
  const adapter = createCrmTenantDeliveryAdapter(env, db(rows));
  const original = globalThis.fetch;
  let seen = '';
  globalThis.fetch = async (_url, request) => { seen = request.body; return new Response(JSON.stringify({ requestId: 'req-sms', statusCode: '202', statusName: 'success' }), { status: 202 }); };
  try {
    assert.deepEqual(await adapter.send(row('one')), { accepted: true, provider: 'ncp', requestId: 'req-sms', statusCode: '202' });
    assert.match(seen, /서울시%20강남구|서울시 강남구/);
    assert.equal(seen.includes('one-secret'), false);
    assert.equal((await adapter.send(row('missing'))).reason, 'tenant_delivery_disabled');
  } finally { globalThis.fetch = original; }
});

test('disabled tenants fail closed and Alimtalk uses its own endpoint/template', async () => {
  const disabled = await setting('sms', 'disabled', 0);
  const alimtalk = await setting('alimtalk', 'alimtalk');
  const rows = new Map([['disabled', disabled], ['alimtalk', alimtalk]]);
  const adapter = createCrmTenantDeliveryAdapter(env, db(rows));
  const original = globalThis.fetch;
  let called = null;
  globalThis.fetch = async (url, request) => { called = { url, body: JSON.parse(request.body), headers: request.headers }; return new Response(JSON.stringify({ requestId: 'req-talk', statusCode: '202', statusName: 'success' }), { status: 202 }); };
  try {
    assert.equal((await adapter.send(row('disabled'))).reason, 'tenant_delivery_disabled');
    const result = await adapter.send(row('alimtalk', 'measurement'));
    assert.equal(result.accepted, true);
    assert.match(called.url, /\/alimtalk\/v2\/services\/alim-service\/messages$/);
    assert.equal(called.body.templateCode, 'measurement-code');
    assert.equal(called.body.plusFriendId, 'channel-id');
    const timestamp = called.headers['x-ncp-apigw-timestamp'];
    const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode('alimtalk-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBytes = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`POST /alimtalk/v2/services/alim-service/messages\n${timestamp}\nalimtalk-access`));
    let signature = ''; for (const byte of new Uint8Array(signatureBytes)) signature += String.fromCharCode(byte);
    assert.equal(called.headers['x-ncp-apigw-signature-v2'], btoa(signature));
  } finally { globalThis.fetch = original; }
});

test('provider redirects are rejected without following or forwarding credentials', async () => {
  const settingRow = await setting('alimtalk', 'redirect');
  const adapter = createCrmTenantDeliveryAdapter(env, db(new Map([['redirect', settingRow]])));
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('', { status: 302, headers: { location: 'https://attacker.example' } }); };
  try {
    const result = await adapter.send(row('redirect'));
    assert.equal(result.accepted, false);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('SMS transport uses manual redirect handling', async () => {
  const original = globalThis.fetch; let init = null;
  globalThis.fetch = async (_url, requestInit) => { init = requestInit; return new Response('', { status: 302, headers: { location: 'https://attacker.example' } }); };
  try {
    const result = await sendNcpSens({ NCP_SENS_ACCESS_KEY: 'access', NCP_SENS_SECRET_KEY: 'secret', NCP_SENS_SERVICE_ID: 'service', NCP_SENS_FROM_NUMBER: '01012345678' }, { to: '01011112222', content: 'test' });
    assert.equal(result.ok, false);
    assert.equal(init.redirect, 'manual');
  } finally { globalThis.fetch = original; }
});
