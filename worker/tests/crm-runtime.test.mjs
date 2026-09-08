import test from 'node:test';
import assert from 'node:assert/strict';
import runtime from '../src/crm-runtime.js';

test('dedicated runtime isolates legacy paths and requires CRM authentication', async () => {
  assert.equal((await runtime.fetch(new Request('https://api.day1design.co.kr/api/estimates'), {CRM_ENABLED:'true'}, {})).status,404);
  const response=await runtime.fetch(new Request('https://api.day1design.co.kr/api/mobile/me'), {CRM_ENABLED:'true'}, {});
  assert.equal(response.status,401);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await runtime.fetch(new Request('https://api.day1design.co.kr/api/mobile/me'), {CRM_ENABLED:'false'}, {})).status,404);
});

test('dedicated minute trigger respects disabled gates without touching DB', async () => {
  const tasks=[];
  await runtime.scheduled({cron:'* * * * *'},{CRM_ENABLED:'false'},{waitUntil(promise){tasks.push(promise);}});
  assert.deepEqual(await Promise.all(tasks),[{enabled:false}]);
  await runtime.scheduled({cron:'0 * * * *'},{CRM_ENABLED:'true'},{waitUntil(){throw new Error('legacy trigger must not execute');}});
});
