import { dateRange } from "./crm-analytics.js";

const ALLOWED_TENANT = "day1design";
const TENANT_COLUMNS = ["tenant_id", "TenantId", "TenantID", "CrmTenantId"];
const DATE_COLUMN = "CreatedAt";

function safeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metric(value, reason) {
  const normalized = numberOrNull(value);
  return normalized === null
    ? { value: null, reason: reason || "traffic_metric_missing" }
    : { value: normalized, reason: null };
}

function unavailable(reason) {
  return {
    visitors: metric(null, reason),
    touches: metric(null, reason),
    returningVisitors: metric(null, "traffic_returning_visitors_tenant_history_unavailable"),
    pageviews: metric(null, reason),
    avgDurationSec: metric(null, reason),
    bounceRate: metric(null, "traffic_bounce_rate_ga4_unavailable"),
  };
}

function rowsOf(result) {
  return Array.isArray(result) ? result : (result?.results || []);
}

async function queryOne(statement, ...bindings) {
  if (typeof statement.bind === "function") statement = statement.bind(...bindings);
  if (typeof statement.first === "function") return statement.first();
  if (typeof statement.get === "function") return statement.get(...bindings);
  throw new Error("traffic_query_one_unsupported");
}

async function tableColumns(db, table) {
  const result = await db.prepare(`PRAGMA table_info(${safeIdentifier(table)})`).all();
  return new Set(rowsOf(result).map((row) => String(row.name)));
}

async function hasTenantDateIndex(db, table, tenant, date) {
  const indexes = await db.prepare(`PRAGMA index_list(${safeIdentifier(table)})`).all();
  for (const index of rowsOf(indexes)) {
    const name = String(index.name || "");
    if (!name) continue;
    const columns = await db.prepare(`PRAGMA index_info(${safeIdentifier(name)})`).all();
    const names = rowsOf(columns).map((row) => String(row.name));
    if (names[0] === tenant && names[1] === date) return true;
  }
  return false;
}

async function sourceMeta(db) {
  const columns = await tableColumns(db, "HeatmapEvents");
  if (!columns.size) return { available: false, reason: "heatmap_source_table_missing" };
  const tenant = TENANT_COLUMNS.find((name) => columns.has(name));
  if (!tenant) return { available: false, reason: "heatmap_tenant_column_missing" };
  const required = ["SessionId", "EventType", "IsBot", DATE_COLUMN];
  const missing = required.filter((name) => !columns.has(name));
  if (missing.length) return { available: false, reason: "heatmap_required_column_missing", missing };
  if (!(await hasTenantDateIndex(db, "HeatmapEvents", tenant, DATE_COLUMN))) {
    return { available: false, reason: "heatmap_tenant_date_index_missing" };
  }
  return { available: true, tenant };
}

export async function readCrmTrafficSummary(db, { tenantId, startDate, endDate } = {}) {
  if (!tenantId) throw new Error("traffic_summary_tenant_required");
  const range = dateRange(startDate, endDate);
  const base = { tenant_id: String(tenantId), period: { start: startDate, end: endDate, timezone: "Asia/Seoul" }, source: "HeatmapEvents" };
  if (String(tenantId) !== ALLOWED_TENANT) {
    return { ...base, available: false, reason: "traffic_tenant_not_authorized", traffic: unavailable("traffic_tenant_not_authorized") };
  }
  let meta;
  try {
    meta = await sourceMeta(db);
  } catch {
    return { ...base, available: false, reason: "traffic_schema_inspection_failed", traffic: unavailable("traffic_schema_inspection_failed") };
  }
  if (!meta.available) return { ...base, available: false, reason: meta.reason, traffic: unavailable(meta.reason) };

  try {
    const table = safeIdentifier("HeatmapEvents");
    const tenant = safeIdentifier(meta.tenant);
    const date = safeIdentifier(DATE_COLUMN);
    const aggregate = await queryOne(db.prepare(`
      WITH sessions AS (
        SELECT SessionId,
          COUNT(*) AS event_count,
          (julianday(MAX(${date})) - julianday(MIN(${date}))) * 86400 AS dwell_seconds
        FROM ${table}
        WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ?
          AND EventType = 'page_view' AND IsBot = 0 AND SessionId IS NOT NULL
        GROUP BY SessionId
      )
      SELECT COUNT(*) AS touches,
        COALESCE(SUM(event_count), 0) AS pageviews,
        AVG(CASE WHEN event_count > 1 THEN dwell_seconds END) AS avg_duration
      FROM sessions
    `), tenantId, range.startUtc, range.endExclusiveUtc);
    const touches = numberOrNull(aggregate?.touches);
    const pageviews = numberOrNull(aggregate?.pageviews);
    const avgDuration = numberOrNull(aggregate?.avg_duration);
    return {
      ...base,
      available: true,
      traffic: {
        visitors: metric(null, "traffic_visitors_ga4_unavailable"),
        touches: metric(touches, touches === null ? "traffic_touches_read_failed" : null),
        returningVisitors: metric(null, "traffic_returning_visitors_tenant_history_unavailable"),
        pageviews: metric(pageviews, pageviews === null ? "traffic_pageviews_read_failed" : null),
        avgDurationSec: metric(avgDuration === null ? null : Math.round(avgDuration * 1000) / 1000, avgDuration === null ? "traffic_avg_duration_insufficient_events" : null),
        bounceRate: metric(null, "traffic_bounce_rate_ga4_unavailable"),
      },
      definitions: {
        touches: "distinct non-bot page_view SessionId in tenant/date range",
        pageviews: "non-bot page_view rows in tenant/date range",
        avgDurationSec: "mean first-to-last CreatedAt seconds for sessions with >1 page_view",
      },
    };
  } catch {
    return { ...base, available: false, reason: "traffic_query_failed", traffic: unavailable("traffic_query_failed") };
  }
}

export const CRM_TRAFFIC_SUMMARY_CONTRACT = Object.freeze({
  tenant: ALLOWED_TENANT,
  source: "tenant/date-indexed HeatmapEvents",
  ga4Fields: "null_until_authorized_snapshot",
  visitorHistory: "null_until_tenant_scoped_history_mapping",
});
