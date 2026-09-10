const DAY_MS = 86400000;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metric(value, reason = "metric_missing") {
  const normalized = finite(value);
  return normalized === null
    ? { value: null, reason }
    : { value: normalized, reason: null };
}

function firstMetric(sources, keys, missingReason) {
  for (const source of sources) {
    for (const key of keys) {
      const value = finite(source?.[key]);
      if (value !== null) return metric(value);
    }
  }
  return metric(null, missingReason);
}

function dateOnly(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("home_metrics_invalid_date");
  const parsed = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== text) {
    throw new Error("home_metrics_invalid_date");
  }
  return text;
}

export function homeMetricPeriods(todayDate) {
  const date = dateOnly(todayDate);
  const todayUtc = Date.parse(`${date}T00:00:00+09:00`);
  const previous = new Date(todayUtc - 29 * DAY_MS + 9 * 3600000).toISOString().slice(0, 10);
  return {
    today: { start: date, end: date, timezone: "Asia/Seoul" },
    recent30: { start: previous, end: date, timezone: "Asia/Seoul" },
  };
}

function savedMetric(analytics, missingReason) {
  const source = analytics?.sources?.find((item) => item?.key === "saved_estimates");
  const value = analytics?.metrics?.savedLeads ?? source?.metrics?.saved;
  if (source && source.available === false && value == null) {
    return metric(null, source.reason || missingReason);
  }
  return metric(value, value === null || value === undefined ? missingReason : null);
}

function scopedPayload(payload, tenantId, expectedPeriod = null) {
  if (!payload || !tenantId) return payload;
  if (String(payload.tenant_id || "") !== String(tenantId)) return null;
  if (!expectedPeriod) return payload;
  const period = payload.period || payload.range;
  if (!period) return payload;
  const start = period.start ?? period.startDate;
  const end = period.end ?? period.endDate;
  return (start && start !== expectedPeriod.start) || (end && end !== expectedPeriod.end) ? null : payload;
}

function trafficMetrics(analytics) {
  const summary = analytics?.summary || {};
  const self = analytics?.self || analytics?.data?.self || {};
  const summarySources = [summary];
  const selfSources = [self];
  return {
    visitors: firstMetric(summarySources, ["visitors"], "traffic_visitors_missing"),
    touches: firstMetric([...summarySources, ...selfSources], ["touches"], "traffic_touches_missing"),
    returningVisitors: firstMetric([...summarySources, ...selfSources], ["returningVisitors"], "traffic_returning_visitors_missing"),
    pageviews: firstMetric([...summarySources, ...selfSources], ["pageviews"], "traffic_pageviews_missing"),
    avgDurationSec: firstMetric([...summarySources, ...selfSources], ["avgDurationSec", "avgDwellSec"], "traffic_avg_duration_missing"),
    bounceRate: firstMetric(summarySources, ["bounceRate"], "traffic_bounce_rate_missing"),
  };
}

function mergeTrafficMetrics(primary, fallback) {
  const keys = ["visitors", "touches", "returningVisitors", "pageviews", "avgDurationSec", "bounceRate"];
  return Object.fromEntries(keys.map((key) => {
    const preferred = primary[key];
    const backup = fallback[key];
    if (preferred?.value !== null && preferred?.value !== undefined) return [key, preferred];
    if (backup?.value !== null && backup?.value !== undefined) return [key, backup];
    return [key, preferred || backup];
  }));
}

export function buildCrmHomeMetrics({ tenantId, todayAnalytics, recent30Analytics, trafficAnalytics = todayAnalytics, trafficSummary = null, todayDate } = {}) {
  const periods = homeMetricPeriods(todayDate);
  const scopedToday = scopedPayload(todayAnalytics, tenantId);
  const scopedRecent30 = scopedPayload(recent30Analytics, tenantId);
  const scopedTraffic = scopedPayload(trafficAnalytics, tenantId, periods.today);
  const scopedSubmission = (payload, scoped, missingReason) => {
    if (payload == null) return metric(null, missingReason);
    if (!scoped) return metric(null, "tenant_mismatch");
    return savedMetric(scoped, missingReason);
  };
  const scopedTrafficSummary = scopedPayload(trafficSummary, tenantId, periods.today);
  return {
    periods,
    submissions: {
      today: scopedSubmission(todayAnalytics, scopedToday, "today_submissions_missing"),
      recent30: scopedSubmission(recent30Analytics, scopedRecent30, "recent30_submissions_missing"),
    },
    traffic: scopedTrafficSummary?.traffic
      ? mergeTrafficMetrics(scopedTrafficSummary.traffic, trafficMetrics(scopedTraffic))
      : (scopedTraffic ? trafficMetrics(scopedTraffic) : trafficMetrics(null)),
    source: "cached_crm_analytics",
  };
}

export const CRM_HOME_METRICS_CONTRACT = Object.freeze({
  periods: ["today", "recent30"],
  submissions: ["today", "recent30"],
  traffic: ["visitors", "touches", "returningVisitors", "pageviews", "avgDurationSec", "bounceRate"],
  missingValue: "null_with_reason",
  cacheRule: "reuse_existing_analytics_payload",
});
