import { dateRange } from "./crm-analytics.js";

const ALLOWED_TENANT = "day1design";
const TENANT_COLUMNS = ["tenant_id", "TenantId", "TenantID", "CrmTenantId"];
const DATE_COLUMN = "CreatedAt";
const GA4_SOURCE_KIND = "ga4";
const MAX_LEGACY_PAYLOAD_BYTES = 512 * 1024;

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
  if (typeof statement.get === "function") return statement.get(...bindings);
  if (typeof statement.bind === "function") statement = statement.bind(...bindings);
  if (typeof statement.first === "function") return statement.first();
  throw new Error("traffic_query_one_unsupported");
}

async function queryRun(statement, ...bindings) {
  if (typeof statement.run === "function" && typeof statement.first !== "function") return statement.run(...bindings);
  if (typeof statement.bind === "function") statement = statement.bind(...bindings);
  if (typeof statement.run === "function") return statement.run();
  throw new Error("traffic_query_run_unsupported");
}

function validPropertyId(value) {
  return /^\d{4,20}$/.test(String(value || ""));
}

function parsePayload(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function readGa4Snapshot(db, { tenantId, propertyId, startDate, endDate } = {}) {
  if (!validPropertyId(propertyId)) return { available: false, reason: "ga4_property_binding_missing" };
  try {
    const row = await queryOne(db.prepare(`
      SELECT payload_json,created_at
      FROM CrmGa4AnalyticsSnapshots
      WHERE tenant_id=? AND source_kind=? AND source_id=? AND start_date=? AND end_date=?
      ORDER BY created_at DESC LIMIT 1
    `), tenantId, GA4_SOURCE_KIND, String(propertyId), startDate, endDate);
    if (!row) return { available: false, reason: "ga4_tenant_snapshot_missing" };
    const payload = parsePayload(row.payload_json);
    const summary = payload?.summary;
    if (!payload || payload.tenant_id !== String(tenantId) || payload.source_id !== String(propertyId) || payload.source_kind !== GA4_SOURCE_KIND || !summary) {
      return { available: false, reason: "ga4_snapshot_binding_mismatch" };
    }
    return { available: true, createdAt: row.created_at || "", summary };
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) return { available: false, reason: "ga4_tenant_snapshot_table_missing" };
    return { available: false, reason: "ga4_snapshot_read_failed" };
  }
}

async function readLegacySelfSnapshot(db, { tenantId, propertyId, startDate, endDate } = {}) {
  if (String(tenantId) !== ALLOWED_TENANT || !validPropertyId(propertyId)) return null;
  try {
    const row = await queryOne(db.prepare(`SELECT Payload,CreatedAt FROM AnalyticsSnapshots WHERE RangeKey IN ('today','30','cur-month','custom') AND StartDate=? AND EndDate=? AND Source='self' AND length(Payload)<=? ORDER BY CreatedAt DESC LIMIT 1`), startDate, endDate, MAX_LEGACY_PAYLOAD_BYTES);
    const payload = parsePayload(row?.Payload);
    if (!payload || (payload.propertyId != null && String(payload.propertyId) !== String(propertyId))) return null;
    return { returningVisitors: payload.self?.returningVisitors, createdAt: row.CreatedAt || '' };
  } catch {
    return null;
  }
}

export async function persistCrmGa4Snapshot(db, { tenantId, propertyId, startDate, endDate, summary, createdAt = new Date().toISOString(), id = "" } = {}) {
  if (String(tenantId) !== ALLOWED_TENANT) throw new Error("ga4_snapshot_tenant_not_authorized");
  if (!validPropertyId(propertyId)) throw new Error("ga4_snapshot_property_invalid");
  dateRange(startDate, endDate);
  if (!summary || typeof summary !== "object") throw new Error("ga4_snapshot_summary_required");
  const payload = JSON.stringify({ tenant_id: ALLOWED_TENANT, source_kind: GA4_SOURCE_KIND, source_id: String(propertyId), summary });
  const recordId = String(id || `${ALLOWED_TENANT}:${propertyId}:${startDate}:${endDate}:${createdAt}`);
  await queryRun(db.prepare(`
    INSERT INTO CrmGa4AnalyticsSnapshots(id,tenant_id,source_kind,source_id,start_date,end_date,payload_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(tenant_id,source_kind,source_id,start_date,end_date) DO UPDATE SET payload_json=excluded.payload_json,created_at=excluded.created_at
  `), recordId, ALLOWED_TENANT, GA4_SOURCE_KIND, String(propertyId), startDate, endDate, payload, createdAt);
  return { id: recordId, tenant_id: ALLOWED_TENANT, source_kind: GA4_SOURCE_KIND, source_id: String(propertyId), startDate, endDate, createdAt };
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

export async function readCrmTrafficSummary(db, { tenantId, propertyId = null, startDate, endDate } = {}) {
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
    const ga4 = await readGa4Snapshot(db, { tenantId, propertyId, startDate, endDate });
    const ga4Summary = ga4.available ? ga4.summary : {};
    const legacySelf = ga4Summary.returningVisitors == null
      ? await readLegacySelfSnapshot(db, { tenantId, propertyId, startDate, endDate })
      : null;
    const returningVisitors = ga4Summary.returningVisitors ?? legacySelf?.returningVisitors;
    return {
      ...base,
      available: true,
      traffic: {
        visitors: metric(ga4Summary.visitors, ga4.reason || "traffic_visitors_ga4_unavailable"),
        touches: metric(touches, touches === null ? "traffic_touches_read_failed" : null),
        returningVisitors: metric(
          returningVisitors,
          returningVisitors !== null && returningVisitors !== undefined
            ? null
            : (ga4.reason === "ga4_property_binding_missing"
            ? "traffic_returning_visitors_tenant_history_unavailable"
            : (ga4.reason || "traffic_returning_visitors_ga4_unavailable")),
        ),
        pageviews: metric(ga4Summary.pageviews, ga4.reason || "traffic_pageviews_ga4_unavailable"),
        avgDurationSec: metric(ga4Summary.avgDurationSec, ga4.reason || "traffic_avg_duration_ga4_unavailable"),
        bounceRate: metric(ga4Summary.bounceRate, ga4.reason || "traffic_bounce_rate_ga4_unavailable"),
      },
      ga4: { available: ga4.available, reason: ga4.available ? null : ga4.reason, createdAt: ga4.createdAt || null, propertyId: ga4.available ? String(propertyId) : null },
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
