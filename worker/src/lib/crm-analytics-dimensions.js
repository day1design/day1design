const MAX_WINDOW_DAYS = 366;
const TOP_LIMIT = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_COLUMNS = ["tenant_id", "TenantId", "TenantID", "CrmTenantId"];

const META_METRICS = ["Impressions", "Clicks", "LinkClicks", "Spend", "Leads"];

function identifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function label(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 120) : "미확인";
}

function validateRange(startDate, endDate) {
  if (!DATE_RE.test(String(startDate)) || !DATE_RE.test(String(endDate))) throw new Error("analytics_invalid_date_range");
  const startParts = String(startDate).split("-").map(Number);
  const endParts = String(endDate).split("-").map(Number);
  const startCalendar = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const endCalendar = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
  if (startCalendar.getUTCFullYear() !== startParts[0] || startCalendar.getUTCMonth() !== startParts[1] - 1 || startCalendar.getUTCDate() !== startParts[2] || endCalendar.getUTCFullYear() !== endParts[0] || endCalendar.getUTCMonth() !== endParts[1] - 1 || endCalendar.getUTCDate() !== endParts[2]) throw new Error("analytics_invalid_date_range");
  const start = Date.parse(`${startDate}T00:00:00+09:00`);
  const end = Date.parse(`${endDate}T00:00:00+09:00`);
  const days = Math.floor((end - start) / 86400000) + 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || days < 1 || days > MAX_WINDOW_DAYS) throw new Error("analytics_date_window_exceeded");
  return { startDate, endDate, startUtc: new Date(start).toISOString(), endExclusiveUtc: new Date(end + 86400000).toISOString() };
}

function rowsOf(result) {
  return result?.results || (Array.isArray(result) ? result : []) || [];
}

async function all(db, sql, binds = []) {
  const statement = db.prepare(sql);
  const result = binds.length ? await statement.bind(...binds).all() : await statement.all();
  return rowsOf(result);
}

async function columns(db, table) {
  try {
    return new Set((await all(db, `PRAGMA table_info(${identifier(table)})`)).map((row) => String(row.name || "")));
  } catch {
    return new Set();
  }
}

async function hasTenantDateIndex(db, table, tenant, date) {
  try {
    const indexes = await all(db, `PRAGMA index_list(${identifier(table)})`);
    for (const index of indexes) {
      if (!index.name) continue;
      const info = await all(db, `PRAGMA index_info(${identifier(index.name)})`);
      const names = info.map((row) => String(row.name || ""));
      if (names[0] === tenant && names[1] === date) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function availability(db, table, required, dates = ["CreatedAt", "created_at", "Date", "DayKey", "At"]) {
  const present = await columns(db, table);
  if (!present.size) return { available: false, reason: "source_table_missing" };
  const tenant = TENANT_COLUMNS.find((name) => present.has(name));
  if (!tenant) return { available: false, reason: "tenant_column_missing" };
  const date = dates.find((name) => present.has(name));
  if (!date) return { available: false, reason: "date_column_missing" };
  const missing = required.filter((name) => !present.has(name));
  if (missing.length) return { available: false, reason: "required_column_missing", missing };
  if (!(await hasTenantDateIndex(db, table, tenant, date))) return { available: false, reason: "tenant_date_index_missing" };
  return { available: true, table, columns: present, tenant, date };
}

function unavailable(reason) {
  return { available: false, reason };
}

function values(rows) {
  return rows.slice(0, TOP_LIMIT).map((row) => ({ value: label(row.value), count: integer(row.count) }));
}

async function visitorGrouped(db, heatmap, tenantId, range, expression, where = "1=1", countExpression = "COUNT(DISTINCT h.SessionId)") {
  const rows = await all(db, `SELECT ${expression} AS value, ${countExpression} AS count FROM ${identifier("HeatmapEvents")} h WHERE h.${identifier(heatmap.tenant)}=? AND h.${identifier(heatmap.date)}>=? AND h.${identifier(heatmap.date)}<? AND h.${identifier("EventType")}='page_view' AND h.${identifier("IsBot")} = 0 AND ${where} GROUP BY ${expression} ORDER BY count DESC, value ASC LIMIT ${TOP_LIMIT + 1}`, [tenantId, range.startUtc, range.endExclusiveUtc]);
  return { available: true, values: values(rows), hasMore: rows.length > TOP_LIMIT, top: TOP_LIMIT, unit: "sessions" };
}

async function readTraffic(db, tenantId, range) {
  const heatmap = await availability(db, "HeatmapEvents", ["SessionId", "EventType", "IsBot"], ["CreatedAt"]);
  const heatmapColumns = heatmap.columns || new Set();
  const baseReason = heatmap.available ? null : heatmap.reason;
  const result = { available: !baseReason, dimensions: {} };
  const unavailableDimensions = ["page", "source", "device", "campaign", "form_events"];
  if (baseReason) {
    for (const dimension of unavailableDimensions) result.dimensions[dimension] = unavailable(baseReason);
    return result;
  }
  const pageColumn = heatmapColumns.has("Page") ? "Page" : heatmapColumns.has("Path") ? "Path" : null;
  const sourceColumns = ["UtmSource", "InflowApp", "Source", "Referrer"].filter((name) => heatmapColumns.has(name));
  const sourceExpression = sourceColumns.length
    ? `COALESCE(${sourceColumns.map((name) => `NULLIF(TRIM(h.${identifier(name)}),'')`).join(",")},'미확인')`
    : null;
  const campaignColumn = heatmapColumns.has("UtmCampaign") ? "UtmCampaign" : heatmapColumns.has("Campaign") ? "Campaign" : null;
  result.dimensions.page = pageColumn ? await visitorGrouped(db, heatmap, tenantId, range, `COALESCE(NULLIF(TRIM(h.${identifier(pageColumn)}),''),'미확인')`) : unavailable("column_missing");
  result.dimensions.source = sourceExpression ? await visitorGrouped(db, heatmap, tenantId, range, sourceExpression) : unavailable("column_missing");
  result.dimensions.device = heatmapColumns.has("Device") ? await visitorGrouped(db, heatmap, tenantId, range, `COALESCE(NULLIF(TRIM(h.${identifier("Device")}),''),'미확인')`) : unavailable("column_missing");
  result.dimensions.campaign = campaignColumn ? await visitorGrouped(db, heatmap, tenantId, range, `COALESCE(NULLIF(TRIM(h.${identifier(campaignColumn)}),''),'미확인')`) : unavailable("column_missing");
  const formRows = await all(db, `SELECT h.${identifier("EventType")} AS value, COUNT(DISTINCT h.${identifier("SessionId")}) AS count FROM ${identifier("HeatmapEvents")} h WHERE h.${identifier(heatmap.tenant)}=? AND h.${identifier(heatmap.date)}>=? AND h.${identifier(heatmap.date)}<? AND h.${identifier("IsBot")} = 0 AND h.${identifier("EventType")} IN ('form_start','form_success') GROUP BY h.${identifier("EventType")} ORDER BY count DESC, value ASC`, [tenantId, range.startUtc, range.endExclusiveUtc]);
  result.dimensions.form_events = { available: true, values: values(formRows), hasMore: false, top: TOP_LIMIT, unit: "sessions", events: ["form_start", "form_success"] };
  result.available = Object.values(result.dimensions).some((dimension) => dimension.available);
  return result;
}

function adMetrics(row) {
  const impressions = integer(row.impressions);
  const clicks = integer(row.clicks);
  const linkClicks = integer(row.linkClicks);
  const leads = integer(row.leads);
  const spend = numberOrNull(row.spend);
  return {
    impressions, clicks, linkClicks, leads, spend,
    cpc: spend !== null && linkClicks > 0 ? spend / linkClicks : null,
    cpcClick: spend !== null && clicks > 0 ? spend / clicks : null,
    cpl: spend !== null && leads > 0 ? spend / leads : null,
    cpm: spend !== null && impressions > 0 ? spend * 1000 / impressions : null,
  };
}

async function groupedAds(db, table, info, tenantId, range, where, idColumn, nameColumn) {
  const parent = table === "MetaAdsAd" && idColumn === "AdId" ? `, MAX(${identifier("AdsetId")}) AS adsetId, MAX(${identifier("CampaignId")}) AS campaignId` : table === "MetaAdsAd" && idColumn === "AdsetId" ? `, MAX(${identifier("CampaignId")}) AS campaignId` : "";
  const rows = await all(db, `SELECT ${identifier(idColumn)} AS id, MAX(${identifier(nameColumn)}) AS name${parent}, SUM(${identifier("Impressions")}) AS impressions, SUM(${identifier("Clicks")}) AS clicks, SUM(${identifier("LinkClicks")}) AS linkClicks, SUM(${identifier("Spend")}) AS spend, SUM(${identifier("Leads")}) AS leads FROM ${identifier(table)} WHERE ${identifier(info.tenant)}=? AND ${identifier(info.date)}>=? AND ${identifier(info.date)}<=? AND ${where} GROUP BY ${identifier(idColumn)} ORDER BY spend DESC, name ASC LIMIT ${TOP_LIMIT + 1}`, [tenantId, range.startDate, range.endDate]);
  const values = rows.slice(0, TOP_LIMIT).map((row) => ({ id: String(row.id || ""), name: label(row.name), ...(row.adsetId === undefined ? {} : { adsetId: String(row.adsetId || "") }), ...(row.campaignId === undefined ? {} : { campaignId: String(row.campaignId || "") }), ...adMetrics(row) }));
  if (table !== "MetaAdsAd" || !values.length) return { available: true, values, hasMore: rows.length > TOP_LIMIT, top: TOP_LIMIT };
  try {
    const catalog = await columns(db, "MetaAdsCreativeCatalog");
    if (!["CrmTenantId", "SnapshotDate", idColumn, "Status"].every((name) => catalog.has(name))) return { available: true, values: values.map((row) => ({ ...row, status: null })), hasMore: rows.length > TOP_LIMIT, top: TOP_LIMIT };
    const latest = await all(db, `SELECT SnapshotDate AS snapshotDate FROM MetaAdsCreativeCatalog WHERE CrmTenantId=? ORDER BY SnapshotDate DESC LIMIT 1`, [tenantId]);
    const snapshotDate = String(latest[0]?.snapshotDate || "");
    if (!snapshotDate) return { available: true, values: values.map((row) => ({ ...row, status: null })), hasMore: rows.length > TOP_LIMIT, top: TOP_LIMIT };
    const placeholders = values.map(() => "?").join(",");
    const statusRows = await all(db, `SELECT ${identifier(idColumn)} AS id, MAX(CASE WHEN UPPER(Status) IN ('ACTIVE','ON') THEN 1 ELSE 0 END) AS active, MIN(CASE WHEN TRIM(Status)<>'' THEN 1 ELSE 0 END) AS authoritative FROM MetaAdsCreativeCatalog WHERE CrmTenantId=? AND SnapshotDate=? AND ${identifier(idColumn)} IN (${placeholders}) GROUP BY ${identifier(idColumn)}`, [tenantId, snapshotDate, ...values.map((row) => row.id)]);
    const statusById = new Map(statusRows.map((row) => [String(row.id), Number(row.active) > 0 ? "ACTIVE" : Number(row.authoritative) === 1 ? "OFF" : null]));
    return { available: true, values: values.map((row) => ({ ...row, status: statusById.get(row.id) ?? null })), hasMore: rows.length > TOP_LIMIT, top: TOP_LIMIT };
  } catch (_) {
    return { available: true, values: values.map((row) => ({ ...row, status: null })), hasMore: rows.length > TOP_LIMIT, top: TOP_LIMIT };
  }
}

async function groupedBreakdown(db, info, tenantId, range, dimension) {
  const rows = await all(db, `SELECT ${identifier("DimensionValue")} AS value, MAX(${identifier("DimensionSub")}) AS sub, SUM(${identifier("Impressions")}) AS impressions, SUM(${identifier("Clicks")}) AS clicks, SUM(${identifier("LinkClicks")}) AS linkClicks, SUM(${identifier("Spend")}) AS spend, SUM(${identifier("Leads")}) AS leads FROM ${identifier("MetaAdsBreakdown")} WHERE ${identifier(info.tenant)}=? AND ${identifier(info.date)}>=? AND ${identifier(info.date)}<=? AND ${identifier("Dimension")}=? GROUP BY ${identifier("DimensionValue")} ORDER BY spend DESC, value ASC LIMIT ${TOP_LIMIT + 1}`, [tenantId, range.startDate, range.endDate, dimension]);
  return { available: true, values: rows.slice(0, TOP_LIMIT).map((row) => ({ value: label(row.value), sub: label(row.sub), ...adMetrics(row) })), hasMore: rows.length > TOP_LIMIT, top: TOP_LIMIT };
}

async function groupedVideoBreakdown(db, info, tenantId, range, dimension, { combineAgeGender = false } = {}) {
  if (!info.columns?.has("VideoPlays")) return unavailable("column_missing");
  const baseWhere = `${identifier(info.tenant)}=? AND ${identifier(info.date)}>=? AND ${identifier(info.date)}<=? AND ${identifier("Dimension")}=?`;
  const binds = [tenantId, range.startDate, range.endDate, dimension];
  const coverage = (await all(db, `SELECT COUNT(*) AS rows, SUM(CASE WHEN ${identifier("VideoPlays")} IS NULL THEN 1 ELSE 0 END) AS missing_rows, SUM(COALESCE(${identifier("VideoPlays")}, 0)) AS video_plays FROM ${identifier("MetaAdsBreakdown")} WHERE ${baseWhere}`, binds))[0] || {};
  const rowCount = integer(coverage.rows);
  const missingRows = integer(coverage.missing_rows);
  const totalVideoPlays = numberOrNull(coverage.video_plays) ?? 0;
  if (!rowCount) return unavailable("video_breakdown_not_collected");
  if (missingRows > 0) return unavailable(missingRows === rowCount ? "video_breakdown_not_collected" : "partial_video_breakdown");
  const valueExpression = combineAgeGender
    ? `CASE WHEN instr(${identifier("DimensionValue")}, '_') > 0 THEN substr(${identifier("DimensionValue")}, 1, instr(${identifier("DimensionValue")}, '_') - 1) ELSE ${identifier("DimensionValue")} END`
    : identifier("DimensionValue");
  const rows = await all(db, `SELECT ${valueExpression} AS value, MAX(${identifier("DimensionSub")}) AS sub, SUM(${identifier("VideoPlays")}) AS video_plays FROM ${identifier("MetaAdsBreakdown")} WHERE ${baseWhere} GROUP BY ${valueExpression} ORDER BY video_plays DESC, value ASC LIMIT ${TOP_LIMIT + 1}`, binds);
  if (rows.length > TOP_LIMIT) return unavailable("video_breakdown_group_limit_exceeded");
  return {
    available: true,
    values: rows.slice(0, TOP_LIMIT).map((row) => {
      const videoPlays = numberOrNull(row.video_plays) ?? 0;
      const sub = String(row.sub ?? "").trim();
      return { value: label(row.value), ...(sub ? { sub: label(sub) } : {}), videoPlays, share: totalVideoPlays > 0 ? videoPlays / totalVideoPlays : null };
    }),
    hasMore: rows.length > TOP_LIMIT,
    top: TOP_LIMIT,
    unit: "video plays",
    basis: "VideoPlays",
    totalVideoPlays,
  };
}

async function readMeta(db, tenantId, range) {
  const daily = await availability(db, "MetaAdsDaily", ["Level", "EntityId", "EntityName", ...META_METRICS], ["Date"]);
  const ad = await availability(db, "MetaAdsAd", ["AdId", "AdName", "AdsetId", "AdsetName", "CampaignId", "CampaignName", ...META_METRICS], ["Date"]);
  const breakdown = await availability(db, "MetaAdsBreakdown", ["Dimension", "DimensionValue", "DimensionSub", ...META_METRICS], ["Date"]);
  const result = { available: daily.available || ad.available || breakdown.available, dimensions: {} };
  if (daily.available) {
    result.dimensions.accounts = await groupedAds(db, "MetaAdsDaily", daily, tenantId, range, `${identifier("Level")}='account'`, "EntityId", "EntityName");
    result.dimensions.campaigns = await groupedAds(db, "MetaAdsDaily", daily, tenantId, range, `${identifier("Level")}='campaign'`, "EntityId", "EntityName");
  } else {
    result.dimensions.accounts = unavailable(daily.reason);
    result.dimensions.campaigns = unavailable(daily.reason);
  }
  if (ad.available) {
    result.dimensions.adsets = await groupedAds(db, "MetaAdsAd", ad, tenantId, range, "1=1", "AdsetId", "AdsetName");
    result.dimensions.ads = await groupedAds(db, "MetaAdsAd", ad, tenantId, range, "1=1", "AdId", "AdName");
  } else {
    result.dimensions.adsets = unavailable(ad.reason);
    result.dimensions.ads = unavailable(ad.reason);
  }
  for (const [key, dimension] of [["age_gender", "age_gender"], ["regions", "region"], ["placements", "position"]]) {
    result.dimensions[key] = breakdown.available ? await groupedBreakdown(db, breakdown, tenantId, range, dimension) : unavailable(breakdown.reason);
  }
  result.dimensions.video_platform = breakdown.available ? await groupedVideoBreakdown(db, breakdown, tenantId, range, "platform") : unavailable(breakdown.reason);
  result.dimensions.video_age_gender = breakdown.available ? await groupedVideoBreakdown(db, breakdown, tenantId, range, "age_gender", { combineAgeGender: true }) : unavailable(breakdown.reason);
  if (!result.available) result.reason = [daily, ad, breakdown].find((source) => source.reason === "tenant_column_missing")?.reason || [daily, ad, breakdown].find((source) => source.reason)?.reason || "source_table_missing";
  return result;
}

export async function readCrmAnalyticsDimensions(db, { tenantId, startDate, endDate } = {}) {
  if (!db?.prepare) throw new Error("analytics_db_required");
  if (!tenantId) throw new Error("analytics_tenant_required");
  const range = validateRange(startDate, endDate);
  return {
    tenant_id: String(tenantId),
    period: { start: range.startDate, end: range.endDate, timezone: "Asia/Seoul", max_days: MAX_WINDOW_DAYS },
    traffic: await readTraffic(db, tenantId, range),
    meta: await readMeta(db, tenantId, range),
  };
}

export const CRM_ANALYTICS_DIMENSIONS_CONTRACT = Object.freeze({ maxWindowDays: MAX_WINDOW_DAYS, topLimit: TOP_LIMIT, timezone: "Asia/Seoul" });
