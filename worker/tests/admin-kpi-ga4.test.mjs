import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAdminKpiGa4, isReusableAdminKpiGa4Snapshot } from '../src/lib/admin-kpi-ga4.js';
const env = { GA4_PROPERTY_ID: '12345', GOOGLE_CLIENT_ID: 'fixture', GOOGLE_CLIENT_SECRET: 'fixture', GA4_REFRESH_TOKEN: 'fixture' };
const range = { startDate: '2026-08-01', endDate: '2026-08-31' };
const now = new Date('2026-09-11T00:00:00Z');
const report = () => ({ metadata: { timeZone: 'Asia/Seoul' }, rowCount: 1,
  metricHeaders: ['activeUsers', 'sessions', 'screenPageViews'].map(name => ({ name })),
  rows: [{ metricValues: ['100', '150', '300'].map(value => ({ value })) }] });
function transport(payload) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return Response.json(calls.length === 1 ? { access_token: 'fixture' } : payload);
  } };
}
test('one exact-period totals report, no daily unique summation, bounded transport', async () => {
  const mock = transport(report());
  const result = await collectAdminKpiGa4(env, range, { ...mock, now });
  assert.deepEqual(result.summary, { users: 100, visitors: 100, sessions: 150, pageviews: 300 });
  assert.equal(mock.calls.length, 2);
  const body = JSON.parse(mock.calls[1].init.body);
  assert.deepEqual(body.dateRanges, [range]);
  assert.equal(body.dimensions, undefined);
  assert.equal(body.limit, '1');
  assert(mock.calls.every(call => call.init.signal && call.init.redirect === 'error'));
});
test('rejects timezone, partial reports, missing totals and malformed metrics', async () => {
  for (const change of [
    r => r.metadata.timeZone = 'America/Los_Angeles',
    r => r.metadata.subjectToThresholding = true,
    r => r.metadata.samplingMetadatas = [{}],
    r => r.metadata.emptyReason = 'NO_DATA',
    r => r.rows = [],
    r => r.rows[0].metricValues[0].value = 'NaN',
    r => r.rows[0].metricValues[0].value = '-1',
  ]) {
    const data = report(); change(data);
    await assert.rejects(collectAdminKpiGa4(env, range, { ...transport(data), now }), /kpi_ga4_/);
  }
});
test('invalid dates, future days, oversized ranges and property IDs fail before transport', async () => {
  let count = 0;
  const fetchImpl = () => { count++; throw new Error('unexpected'); };
  for (const bad of [{ startDate: '2026-02-30', endDate: '2026-03-01' },
    { startDate: '2026-09-01', endDate: '2026-09-12' },
    { startDate: '2024-01-01', endDate: '2026-01-01' }])
    await assert.rejects(collectAdminKpiGa4(env, bad, { fetchImpl, now }));
  await assert.rejects(collectAdminKpiGa4({ ...env, GA4_PROPERTY_ID: 'https://example.com' }, range, { fetchImpl, now }));
  assert.equal(count, 0);
});

test('today is collected as a provisional exact-period total', async () => {
  const mock = transport(report());
  const result = await collectAdminKpiGa4(env, { startDate: '2026-09-05', endDate: '2026-09-11' }, { ...mock, now });
  assert.equal(result.endDate, '2026-09-11');
  assert.equal(result.complete, false);
  assert.equal(result.provisional, true);
  assert.equal(mock.calls.length, 2);
});

test('today snapshot reuse expires after the bounded freshness window', () => {
  const payload = { tenant_id:'day1design', source_kind:'ga4', source_id:'12345', start_date:'2026-09-05', end_date:'2026-09-11', summary:{ visitors:1, sessions:1, pageviews:1 } };
  const fresh = isReusableAdminKpiGa4Snapshot(payload,{ tenantId:'day1design', propertyId:'12345', startDate:'2026-09-05', endDate:'2026-09-11', createdAt:'2026-09-10T12:00:00.000Z', now:new Date('2026-09-11T11:59:59.000Z') });
  const stale = isReusableAdminKpiGa4Snapshot(payload,{ tenantId:'day1design', propertyId:'12345', startDate:'2026-09-05', endDate:'2026-09-11', createdAt:'2026-09-10T12:00:00.000Z', now:new Date('2026-09-11T12:00:01.000Z') });
  assert.equal(fresh,true);
  assert.equal(stale,false);
});
test('zero totals remain zero only with a valid complete report', async () => {
  const data = report(); data.rows[0].metricValues.forEach(v => v.value = '0');
  const result = await collectAdminKpiGa4(env, range, { ...transport(data), now });
  assert.equal(result.summary.users, 0);
});
test('oversized and failed external response stops without automatic retry', async () => {
  let calls = 0;
  await assert.rejects(collectAdminKpiGa4(env, range, { now, fetchImpl: async () => {
    calls++; return new Response('x'.repeat(32769));
  } }), /kpi_ga4_oauth_size/);
  assert.equal(calls, 1);
  await assert.rejects(collectAdminKpiGa4(env, range, { now, fetchImpl: async () => new Response('secret', { status: 401 }) }), /^Error: kpi_ga4_oauth_401$/);
});
