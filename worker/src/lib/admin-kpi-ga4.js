// Exact-period totals only. Called by a budgeted persisted job, never by KPI GET.
const MAX_BYTES = 32768;
const METRICS = ['activeUsers', 'sessions', 'screenPageViews'];

function validMetricValue(value) {
  return value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function isReusableAdminKpiGa4Snapshot(payload, { tenantId, propertyId, startDate, endDate } = {}) {
  const binding = String(propertyId || '').replace(/^properties\//, '');
  if (!isAdminKpiGa4PayloadBinding(payload, { tenantId, propertyId, startDate, endDate })) return false;
  const summary = payload.summary;
  return Boolean(summary && [summary.users ?? summary.visitors ?? summary.activeUsers, summary.sessions, summary.pageviews ?? summary.screenPageViews].every(validMetricValue));
}

export function isAdminKpiGa4PayloadBinding(payload, { tenantId, propertyId, startDate, endDate } = {}) {
  const binding = String(propertyId || '').replace(/^properties\//, '');
  return Boolean(payload && payload.tenant_id === String(tenantId) && payload.source_kind === 'ga4' && String(payload.source_id) === binding && (payload.start_date == null || payload.start_date === startDate) && (payload.end_date == null || payload.end_date === endDate));
}

function dateValid(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

async function boundedJson(response, code) {
  if (!response.ok) throw new Error(`${code}_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${code}_empty`);
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error(`${code}_size`);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally { await reader.cancel().catch(() => {}); }
}

export async function collectAdminKpiGa4(env, { startDate, endDate }, { fetchImpl = fetch, now = new Date() } = {}) {
  if (!dateValid(startDate) || !dateValid(endDate) || startDate > endDate ||
      (Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 366) throw new Error('kpi_ga4_range');
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  if (endDate >= today) throw new Error('kpi_ga4_incomplete_day');
  const propertyId = String(env.GA4_PROPERTY_ID || '').replace(/^properties\//, '');
  const refreshToken = env.GA4_REFRESH_TOKEN || env.GOOGLE_ANALYTICS_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN;
  if (!/^\d+$/.test(propertyId) || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !refreshToken)
    throw new Error('kpi_ga4_not_configured');
  const oauth = await boundedJson(await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4500),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: 'refresh_token' }),
  }), 'kpi_ga4_oauth');
  if (typeof oauth.access_token !== 'string' || !oauth.access_token || oauth.access_token.length > 8192)
    throw new Error('kpi_ga4_oauth_invalid');
  const report = await boundedJson(await fetchImpl(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4500),
    headers: { authorization: `Bearer ${oauth.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate, endDate }], metrics: METRICS.map(name => ({ name })),
      limit: '1', keepEmptyRows: true, returnPropertyQuota: true }),
  }), 'kpi_ga4_report');
  const meta = report.metadata || {};
  if (meta.timeZone !== 'Asia/Seoul') throw new Error('kpi_ga4_timezone_mismatch');
  if (meta.emptyReason || meta.subjectToThresholding || meta.dataLossFromOtherRow ||
      meta.samplingMetadatas?.length || meta.schemaRestrictionResponse?.activeMetricRestrictions?.length)
    throw new Error('kpi_ga4_incomplete_report');
  const rows = report.rows || [];
  if (rows.length !== 1 || Number(report.rowCount) !== 1 || report.dimensionHeaders?.length)
    throw new Error('kpi_ga4_missing_totals');
  const values = {};
  for (const name of METRICS) {
    const index = (report.metricHeaders || []).findIndex(header => header.name === name);
    const raw = rows[0].metricValues?.[index]?.value;
    const value = Number(raw);
    if (index < 0 || !validMetricValue(raw) || !Number.isSafeInteger(value))
      throw new Error('kpi_ga4_invalid_metric');
    values[name] = value;
  }
  return { source: 'ga4', propertyId, startDate, endDate, timezone: meta.timeZone,
    fetchedAt: now.toISOString(), complete: true,
    summary: { users: values.activeUsers, visitors: values.activeUsers, sessions: values.sessions,
      pageviews: values.screenPageViews }, requestCount: 2 };
}
