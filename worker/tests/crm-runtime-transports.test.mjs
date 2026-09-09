import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';

const require = createRequire(import.meta.url);
const { Miniflare, Response } = require('miniflare');
const source = await readFile(new URL('../src/lib/crm-otp-delivery.js', import.meta.url), 'utf8');

test('OTP transport works in workerd and rejects redirects without forwarding credentials', async () => {
  let calls = 0;
  let redirect = false;
  const runtime = new Miniflare({
    modules: true,
    compatibilityDate: '2026-04-01',
    bindings: {
      CRM_OTP_RELAY_URL: 'https://relay.example.test/crm/otp',
      CRM_OTP_RELAY_TOKEN: 'test-token', CRM_OTP_RELAY_SECRET: 'test-secret',
      CRM_OTP_FROM_EMAIL: 'mkt@polarad.co.kr', CRM_OTP_REPLY_TO: 'mkt@polarad.co.kr',
    },
    script: `${source}
      export default { async fetch(request, env) {
        try {
          await deliverCrmOtp(env, {email:'owner@example.test', code:'123456', otp_id:'runtime-test', expires_at:new Date(Date.now()+300000).toISOString()});
          return new Response('accepted');
        } catch(error) { return new Response(error.message, {status:503}); }
      }};`,
    outboundService: async (request) => {
      calls += 1;
      assert.equal(new URL(request.url).hostname, 'relay.example.test');
      return redirect
        ? new Response(null, { status: 302, headers: { location: 'https://other.example.test/' } })
        : Response.json({ accepted: true });
    },
  });
  try {
    const accepted = await runtime.dispatchFetch('http://localhost/');
    assert.equal(accepted.status, 200, await accepted.text());
    redirect = true;
    const rejected = await runtime.dispatchFetch('http://localhost/');
    assert.equal(rejected.status, 503);
    assert.match(await rejected.text(), /relay HTTP 302/);
    assert.equal(calls, 2);
  } finally { await runtime.dispose(); }
});

test('FCM OAuth and push transport run inside workerd', async () => {
  const fcmSource = await readFile(new URL('../src/lib/crm-fcm.js', import.meta.url), 'utf8');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const hosts = [];
  const runtime = new Miniflare({
    modules: true, compatibilityDate: '2026-04-01',
    bindings: {
      CRM_PUSH_ENABLED: 'true', CRM_PUSH_TENANTS: 'day1design',
      CRM_FCM_PROJECT_ID: 'test-project', CRM_FCM_CLIENT_EMAIL: 'sender@example.test',
      CRM_FCM_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    },
    script: `${fcmSource}
      export default { async fetch(request, env) {
        const receipt = await sendFcmMessage(env, {tenantId:'day1design', token:'test-device', notificationId:'test-notification'});
        return Response.json(receipt);
      }};`,
    outboundService: async (request) => {
      const host = new URL(request.url).hostname;
      hosts.push(host);
      if (host === 'oauth2.googleapis.com') return Response.json({ access_token: 'test-access', token_type: 'Bearer' });
      assert.equal(host, 'fcm.googleapis.com');
      return Response.json({ name: 'projects/test-project/messages/1' });
    },
  });
  try {
    const response = await runtime.dispatchFetch('http://localhost/');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).accepted, true);
    assert.deepEqual(hosts, ['oauth2.googleapis.com', 'fcm.googleapis.com']);
  } finally { await runtime.dispose(); }
});
