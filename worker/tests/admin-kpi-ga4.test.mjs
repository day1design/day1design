import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAdminKpiGa4 } from '../src/lib/admin-kpi-ga4.js';
const env = { GA4_PROPERTY_ID: '12345', GOOGLE_CLIENT_ID: 'fixture', GOOGLE_CLIENT_SECRET: 'fixture', GA4_REFRESH_TOKEN: 'fixture' };
const range = { startDate: '2026-08-01', endDate: '2026-08-31' };
const now = new Date('2026-09-10T00:00:00Z');
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
    { startDate: '2026-09-01', endDate: '2026-09-10' },
    { startDate: '2024-01-01', endDate: '2026-01-01' }])
    await assert.rejects(collectAdminKpiGa4(env, bad, { fetchImpl, now }));
  await assert.rejects(collectAdminKpiGa4({ ...env, GA4_PROPERTY_ID: 'https://example.com' }, range, { fetchImpl, now }));
  assert.equal(count, 0);
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
