import assert from 'node:assert/strict';
import test from 'node:test';
import { createCrmSensDeliveryAdapter, renderCustomerReminder } from '../src/lib/crm-sens.js';

const row = {
  tenant_id: 'day1design',
  payload: {
    template_body: '[데이원] {{name}}님\n{{date}} {{time}} {{location}}\n{{address}}\n{{map}}\n{{phone}}\n문의 {{contact_phone}}',
    name: '고객', phone: '010-1234-5678', email: 'customer@example.test', contact_phone: '02-1234-5678', map: 'https://naver.me/example',
    starts_at: '2026-09-10T06:30:00.000Z', location: '강남본점', address: '서울시 강남구',
  },
};

test('renders approved reminder with KST appointment and contact fields', () => {
  const result = renderCustomerReminder(row.payload.template_body, row.payload);
  assert.equal(result.ok, true);
  assert.match(result.content, /2026-09-10 15:30/);
  assert.match(result.content, /고객님/);
  assert.match(result.content, /010-1234-5678/);
});

test('fails closed when template is empty or has an unknown placeholder', () => {
  assert.deepEqual(renderCustomerReminder('', row.payload), { ok: false, reason: 'approved_template_body_missing' });
  assert.deepEqual(renderCustomerReminder('{{unknown}}', row.payload), { ok: false, reason: 'approved_template_placeholder_invalid' });
  assert.deepEqual(renderCustomerReminder('{{foo-bar}}', row.payload), { ok: false, reason: 'approved_template_placeholder_invalid' });
  assert.deepEqual(renderCustomerReminder('{{map}}', { ...row.payload, map: '' }), { ok: false, reason: 'approved_template_value_missing' });
});

test('requires tenant sender config and approved body before calling SENS', async () => {
  let calls = 0;
  const send = async () => { calls += 1; return { ok: true, status: 202, body: JSON.stringify({ requestId: 'r1', statusCode: '202', statusName: 'success' }) }; };
  const missing = createCrmSensDeliveryAdapter({ NCP_SENS_SERVICE_ID: 'global' }, { send });
  assert.deepEqual(await missing.send(row), { accepted: false, reason: 'tenant_sens_config_missing' });
  assert.equal(calls, 0);
  const noTemplate = createCrmSensDeliveryAdapter({ CRM_SENS_TENANTS_JSON: JSON.stringify({ day1design: { from: '0212345678', serviceId: 'tenant-service' } }) }, { send });
  assert.deepEqual(await noTemplate.send({ ...row, payload: { ...row.payload, template_body: '' } }), { accepted: false, reason: 'approved_template_body_missing' });
  assert.equal(calls, 0);
});

test('accepts only a successful SENS 202 response with requestId', async () => {
  const env = {
    NCP_SENS_ACCESS_KEY: 'access', NCP_SENS_SECRET_KEY: 'secret',
    CRM_SENS_TENANTS_JSON: JSON.stringify({ day1design: { from: '0212345678', serviceId: 'tenant-service', contactPhone: '02-1234-5678' } }),
  };
  const accepted = createCrmSensDeliveryAdapter(env, { send: async (requestEnv, request) => {
    assert.equal(requestEnv.NCP_SENS_FROM_NUMBER, '0212345678');
    assert.equal(requestEnv.NCP_SENS_SERVICE_ID, 'tenant-service');
    assert.equal(request.to, '010-1234-5678');
    assert.match(request.content, /2026-09-10 15:30/);
    assert.match(request.content, /https:\/\/naver\.me\/example/);
    assert.match(request.content, /문의 02-1234-5678/);
    return { ok: true, status: 202, body: JSON.stringify({ requestId: 'request-1', statusCode: '202', statusName: 'success' }) };
  } });
  assert.deepEqual(await accepted.send(row), { accepted: true, provider: 'ncp-sens', requestId: 'request-1', statusCode: '202' });
  const unknown = createCrmSensDeliveryAdapter(env, { send: async () => ({ ok: true, status: 202, body: '{}' }) });
  assert.deepEqual(await unknown.send(row), { accepted: false, reason: 'delivery_unknown' });
});
