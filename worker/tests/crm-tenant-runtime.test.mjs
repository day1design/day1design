import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { Miniflare, Response } = require('miniflare');

test('tenant SMS and Alimtalk run in workerd with valid signatures and no redirect forwarding', async () => {
  const bundled = await build({
    bundle: true, write: false, format: 'esm', platform: 'browser',
    stdin: {
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      contents: `
        import { encryptCredentials, createCrmTenantDeliveryAdapter } from './src/lib/crm-delivery.js';
        export default { async fetch(request, env) {
          const channel = new URL(request.url).searchParams.get('channel');
          const body = '{{name}} {{date}} {{time}} {{location}} {{address}} {{map}} {{contact_phone}}';
          const setting = {
            tenant_id:'runtime-tenant', enabled:1, channel,
            credentials_ciphertext:await encryptCredentials(env,{accessKey:'runtime-access',secretKey:'runtime-secret'},'runtime-tenant'),
            sms_service_id:'runtime-sms',from_number:'01000000000',contact_phone:'01000000000',
            alimtalk_service_id:'runtime-alimtalk',channel_id:'@runtime',visit_template_code:'runtime-visit',
            measurement_template_code:'runtime-measurement',visit_body:body,measurement_body:body
          };
          const db={prepare(sql){return {bind(){return {async first(){
            if(sql.includes('CrmTenantDeliverySettings'))return setting;
            if(sql.includes('CrmNotificationTemplates'))return {body,enabled:1};
            if(sql.includes('CrmTenants'))return {id:'runtime-tenant',suspended:0};
            throw new Error('Unexpected fixture query');
          }}}}}};
          const receipt=await createCrmTenantDeliveryAdapter(env,db).send({
            tenant_id:'runtime-tenant',appointment_id:'runtime-appointment',notification_type:'measurement_reminder',
            payload:{name:'QA',phone:'01000000000',location:'QA office',address:'QA address',starts_at:'2026-10-01T06:00:00Z'}
          });
          return Response.json(receipt);
        }};
      `,
    },
  });
  let redirect = false;
  const observed = [];
  const runtime = new Miniflare({
    modules: true, compatibilityDate: '2026-04-01', script: bundled.outputFiles[0].text,
    bindings: { CRM_INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64') },
    outboundService: async request => {
      const url = new URL(request.url);
      assert.equal(url.hostname, 'sens.apigw.ntruss.com');
      const signature = createHmac('sha256', 'runtime-secret')
        .update(`POST ${url.pathname}\n${request.headers.get('x-ncp-apigw-timestamp')}\nruntime-access`).digest('base64');
      assert.equal(request.headers.get('x-ncp-apigw-signature-v2'), signature);
      const payload = await request.json();
      const content = payload.content || payload.messages[0].content;
      assert.match(content, /15:00/);
      assert.match(content, /01000000000/);
      assert.match(content, /map\.naver\.com/);
      assert.doesNotMatch(content, /\{\{/);
      observed.push({ path: url.pathname, payload });
      return redirect ? new Response(null, { status: 302, headers: { location: 'https://untrusted.example.test/' } })
        : Response.json({ statusCode: '202', statusName: 'success', requestId: 'runtime-receipt' }, { status: 202 });
    },
  });
  try {
    for (const channel of ['sms', 'alimtalk']) {
      const response = await runtime.dispatchFetch(`https://runtime.test/?channel=${channel}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).accepted, true);
    }
    assert.equal(observed[1].payload.templateCode, 'runtime-measurement');
    assert.equal(observed[1].payload.plusFriendId, '@runtime');
    assert.equal(observed[0].payload.subject, '예약 일정 안내');
    redirect = true;
    for (const channel of ['sms', 'alimtalk']) {
      const response = await runtime.dispatchFetch(`https://runtime.test/?channel=${channel}`);
      assert.equal((await response.json()).accepted, false);
    }
    assert.equal(observed.length, 4);
  } finally { await runtime.dispose(); }
});
