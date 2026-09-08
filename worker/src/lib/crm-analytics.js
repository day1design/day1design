const MAX_WINDOW_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_COLUMNS = ["tenant_id", "TenantId", "TenantID", "CrmTenantId"];

const SOURCE_DEFINITIONS = {
  saved_estimates: {
    label: "저장 접수",
    table: "Estimates",
    date: ["SubmittedAt"],
    refreshed: ["SubmittedAt"],
    required: ["Source", "Platform"],
  },
  meta_ads: {
    label: "Meta 광고 집계",
    table: "MetaAdsDaily",
    date: ["Date"],
    refreshed: ["FetchedAt", "CreatedAt"],
    required: ["Level", "Impressions", "Clicks", "LinkClicks", "Spend", "Leads"],
  },
  pixel_events: {
    label: "Pixel/CAPI 이벤트",
    table: "pixel_events",
    date: ["created_at"],
    refreshed: ["created_at"],
    required: ["event_name"],
  },
  sessions: {
    label: "홈페이지 세션",
    table: "HeatmapEvents",
    date: ["CreatedAt"],
    refreshed: ["CreatedAt"],
    required: ["SessionId", "EventType", "IsBot"],
  },
};

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integer(value) {
  const number = finite(value);
  return number === null ? null : Math.trunc(number);
}

function safeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function dateRange(startDate, endDate) {
  if (!DATE_RE.test(String(startDate)) || !DATE_RE.test(String(endDate))) {
    throw new Error("analytics_invalid_date_range");
  }
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const startCheck = Number.isFinite(start) ? new Date(start).toISOString().slice(0, 10) : "";
  const endCheck = Number.isFinite(end) ? new Date(end).toISOString().slice(0, 10) : "";
  const days = Math.floor((end - start) / 86400000) + 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || startCheck !== startDate || endCheck !== endDate || days < 1 || days > MAX_WINDOW_DAYS) {
    throw new Error("analytics_date_window_exceeded");
  }
  const startUtc = new Date(Date.parse(`${startDate}T00:00:00+09:00`)).toISOString();
  const endExclusiveUtc = new Date(Date.parse(`${endDate}T00:00:00+09:00`) + 86400000).toISOString();
  return { startDate, endDate, days, startUtc, endExclusiveUtc };
}

function validCalendarDate(value) {
  if (!DATE_RE.test(String(value))) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function sourceMeta(definition, columns) {
  const find = (names) => names.find((name) => columns.has(name));
  const tenant = TENANT_COLUMNS.find((name) => columns.has(name));
  return {
    tenant,
    date: find(definition.date),
    refreshed: find(definition.refreshed),
    missing: (definition.required || []).filter((name) => !columns.has(name)),
  };
}

async function tableColumns(db, table) {
  const result = await db.prepare(`PRAGMA table_info(${safeIdentifier(table)})`).all();
  return new Set((result?.results || []).map((row) => String(row.name)));
}

async function hasTenantDateIndex(db, table, tenant, date) {
  const list = await db.prepare(`PRAGMA index_list(${safeIdentifier(table)})`).all();
  for (const index of list?.results || []) {
    const name = String(index.name || "");
    if (!name) continue;
    const info = await db.prepare(`PRAGMA index_info(${safeIdentifier(name)})`).all();
    const columns = (info?.results || []).map((row) => String(row.name));
    if (columns[0] === tenant && columns[1] === date) return true;
  }
  return false;
}

async function sourceAvailability(db, definition) {
  try {
    const columns = await tableColumns(db, definition.table);
    const meta = sourceMeta(definition, columns);
    if (!columns.size) return { available: false, reason: "source_table_missing" };
    if (!meta.tenant) return { available: false, reason: "tenant_column_missing" };
    if (meta.missing.length) return { available: false, reason: "required_column_missing", missing: meta.missing };
    if (!meta.date) return { available: false, reason: "date_column_missing" };
    if (!(await hasTenantDateIndex(db, definition.table, meta.tenant, meta.date))) return { available: false, reason: "tenant_date_index_missing" };
    return { available: true, ...meta };
  } catch (error) {
    return { available: false, reason: "schema_inspection_failed", error: String(error?.message || error) };
  }
}

function metric(value, denominator, method) {
  const numerator = finite(value);
  const base = finite(denominator);
  return {
    value: numerator !== null && base !== null && base > 0 ? numerator / base : null,
    numerator,
    denominator: base,
    method,
  };
}

export function calculateAdMetrics(row = {}) {
  const impressions = integer(row.impressions);
  const clicks = integer(row.clicks);
  const linkClicks = integer(row.linkClicks);
  const spend = finite(row.spend);
  const leads = integer(row.leads);
  return {
    impressions,
    clicks,
    linkClicks,
    spend,
    leads,
    ctr: metric(clicks, impressions, "clicks / impressions"),
    cpc: metric(spend, clicks, "spend / clicks"),
    cpcLink: metric(spend, linkClicks, "spend / link_clicks"),
    cpm: metric(spend === null ? null : spend * 1000, impressions, "spend * 1000 / impressions"),
    cpl: metric(spend, leads, "spend / Meta reported leads"),
  };
}

export function calculateCrmMetrics({ savedLeads = null, metaSavedLeads = null, sessions = null, ads = {} } = {}) {
  const saved = integer(savedLeads);
  const metaSaved = integer(metaSavedLeads);
  const sessionCount = integer(sessions);
  const ad = calculateAdMetrics(ads);
  return {
    savedLeads: saved,
    metaSavedLeads: metaSaved,
    sessions: sessionCount,
    savedLeadRate: metric(saved, sessionCount, "saved estimates / sessions"),
    metaSavedCpl: metric(ad.spend, metaSaved, "spend / saved Meta-attributed estimates"),
    ads: ad,
  };
}

function sourceEnvelope(key, definition, range, availability, metrics, refreshedAt = null) {
  return {
    key,
    label: definition.label,
    available: availability.available,
    reason: availability.reason || null,
    period: { start: range.startDate, end: range.endDate, timezone: "Asia/Seoul" },
    denominator: metrics?.denominator || null,
    refreshed_at: refreshedAt,
    metrics: metrics || null,
  };
}

async function queryOne(db, sql, binds) {
  const result = await db.prepare(sql).bind(...binds).all();
  return result?.results?.[0] || {};
}

async function queryMany(db, sql, binds) {
  const result = await db.prepare(sql).bind(...binds).all();
  return result?.results || [];
}

function analyticsChannel(value) {
  const channel = String(value ?? '').trim().toLowerCase();
  return channel ? channel.slice(0, 80) : 'unknown';
}

async function readSource(db, key, range, tenantId) {
  const definition = SOURCE_DEFINITIONS[key];
  const availability = await sourceAvailability(db, definition);
  if (!availability.available) return sourceEnvelope(key, definition, range, availability, null);
  const table = safeIdentifier(definition.table);
  const tenant = safeIdentifier(availability.tenant);
  const date = safeIdentifier(availability.date);
  const refreshed = availability.refreshed ? safeIdentifier(availability.refreshed) : date;
  const timestampBinds = [tenantId, range.startUtc, range.endExclusiveUtc];
  const dailyBinds = [tenantId, range.startDate, range.endDate];
  if (key === "saved_estimates") {
    const row = await queryOne(db, `SELECT COUNT(*) AS saved, SUM(CASE WHEN LOWER(COALESCE(Source, '')) IN ('meta','facebook','instagram','fb','ig') OR LOWER(COALESCE(Platform, '')) = 'meta' THEN 1 ELSE 0 END) AS meta_saved, MAX(${refreshed}) AS refreshed FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ?`, timestampBinds);
    const trendRows = await queryMany(db, `SELECT strftime('%Y-%m-%d', ${date}, '+9 hours') AS day, COUNT(*) AS saved, SUM(CASE WHEN LOWER(COALESCE(Source, '')) IN ('meta','facebook','instagram','fb','ig') OR LOWER(COALESCE(Platform, '')) = 'meta' THEN 1 ELSE 0 END) AS meta_saved FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? GROUP BY day ORDER BY day`, timestampBinds);
    const channelExpression = `LOWER(SUBSTR(COALESCE(NULLIF(TRIM(Source), ''), NULLIF(TRIM(Platform), ''), 'unknown'), 1, 80))`;
    const channelRows = await queryMany(db, `SELECT ${channelExpression} AS channel, COUNT(*) AS saved, SUM(CASE WHEN LOWER(COALESCE(Source, '')) IN ('meta','facebook','instagram','fb','ig') OR LOWER(COALESCE(Platform, '')) = 'meta' THEN 1 ELSE 0 END) AS meta_saved FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? GROUP BY ${channelExpression} ORDER BY saved DESC, channel ASC LIMIT 101`, timestampBinds);
    const shownChannels = channelRows.slice(0, 100);
    const shownLeads = shownChannels.reduce((sum, item) => sum + (integer(item.saved) || 0), 0);
    const shownMetaLeads = shownChannels.reduce((sum, item) => sum + (integer(item.meta_saved) || 0), 0);
    const saved = integer(row.saved) || 0;
    const metaSaved = integer(row.meta_saved) || 0;
    return sourceEnvelope(key, definition, range, availability, {
      saved,
      metaSaved,
      trend: trendRows.filter((item) => validCalendarDate(item.day)).map((item) => ({ date: String(item.day), saved: integer(item.saved) || 0, metaSaved: integer(item.meta_saved) || 0 })),
      channels: shownChannels.map((item) => ({ channel: analyticsChannel(item.channel), saved: integer(item.saved) || 0, metaSaved: integer(item.meta_saved) || 0 })),
      channelsHasMore: channelRows.length > 100,
      shownLeads,
      otherLeads: Math.max(0, saved - shownLeads),
      shownMetaLeads,
      otherMetaLeads: Math.max(0, metaSaved - shownMetaLeads),
      denominator: "saved rows",
    }, row.refreshed || null);
  }
  if (key === "meta_ads") {
    const row = await queryOne(db, `SELECT SUM(Impressions) AS impressions, SUM(Clicks) AS clicks, SUM(LinkClicks) AS link_clicks, SUM(Spend) AS spend, SUM(Leads) AS leads, MAX(${refreshed}) AS refreshed FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} <= ? AND Level = 'account'`, dailyBinds);
    const ads = calculateAdMetrics({ impressions: row.impressions, clicks: row.clicks, linkClicks: row.link_clicks, spend: row.spend, leads: row.leads });
    return sourceEnvelope(key, definition, range, availability, { ...ads, denominator: "account-level daily rows" }, row.refreshed || null);
  }
  if (key === "pixel_events") {
    const row = await queryOne(db, `SELECT COUNT(*) AS events, SUM(CASE WHEN event_name = 'PageView' THEN 1 ELSE 0 END) AS pageviews, SUM(CASE WHEN event_name = 'Lead' THEN 1 ELSE 0 END) AS leads, MAX(${refreshed}) AS refreshed FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ?`, timestampBinds);
    return sourceEnvelope(key, definition, range, availability, { events: integer(row.events) || 0, pageviews: integer(row.pageviews) || 0, leads: integer(row.leads) || 0, denominator: "event rows" }, row.refreshed || null);
  }
  const row = await queryOne(db, `SELECT COUNT(DISTINCT SessionId) AS sessions, COUNT(*) AS pageviews, MAX(${refreshed}) AS refreshed FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? AND EventType = 'page_view' AND IsBot = 0`, timestampBinds);
  return sourceEnvelope(key, definition, range, availability, { sessions: integer(row.sessions) || 0, pageviews: integer(row.pageviews) || 0, denominator: "distinct non-bot page_view sessions" }, row.refreshed || null);
}

export async function readCrmAnalytics(db, { tenantId, startDate, endDate, refreshedAt = null } = {}) {
  if (!db?.prepare) throw new Error("analytics_db_required");
  if (!tenantId) throw new Error("analytics_tenant_required");
  const range = dateRange(startDate, endDate);
  const entries = await Promise.all(Object.keys(SOURCE_DEFINITIONS).map((key) => readSource(db, key, range, tenantId)));
  const byKey = Object.fromEntries(entries.map((entry) => [entry.key, entry]));
  const saved = byKey.saved_estimates.metrics;
  const meta = byKey.meta_ads.metrics;
  const sessions = byKey.sessions.metrics;
  const metrics = calculateCrmMetrics({ savedLeads: saved?.saved ?? null, metaSavedLeads: saved?.metaSaved ?? null, sessions: sessions?.sessions ?? null, ads: meta || {} });
  return {
    tenant_id: String(tenantId),
    range: { ...range, timezone: "Asia/Seoul" },
    refreshed_at: refreshedAt || new Date().toISOString(),
    sources: entries,
    metrics,
    facts: composeFacts({ sources: entries, metrics }),
    hypotheses: [],
  };
}

export function composeFacts({ sources = [], metrics = {} } = {}) {
  return [
    ...sources.filter((source) => source.available).map((source) => ({ type: "fact", source: source.key, label: source.label, period: source.period, denominator: source.denominator, refreshed_at: source.refreshed_at })),
    ...(metrics.savedLeads !== null ? [{ type: "fact", key: "saved_leads", value: metrics.savedLeads, denominator: "saved Estimates rows" }] : []),
    ...(metrics.ads?.cpl?.value !== null ? [{ type: "fact", key: "meta_cpl", value: metrics.ads.cpl.value, denominator: "Meta reported leads" }] : []),
  ];
}

export function composeBriefing(analytics, { requestedAt = new Date().toISOString(), runDate } = {}) {
  const day = runDate || requestedAt.slice(0, 10);
  return {
    schedule: { key: dailyBriefingKey(day), timezone: "Asia/Seoul", local_time: "10:00", idempotent: true },
    requested_at: requestedAt,
    facts: analytics?.facts || [],
    hypotheses: analytics?.hypotheses || [],
    verdict: null,
    verdict_reason: "confirmed performance thresholds are not configured",
  };
}

export function dailyBriefingKey(date) {
  if (!validCalendarDate(date)) throw new Error("analytics_invalid_briefing_date");
  return `crm-briefing:${date}:10:00:Asia/Seoul`;
}

export const CRM_ANALYTICS_CONTRACT = Object.freeze({ maxWindowDays: MAX_WINDOW_DAYS, schedule: "10:00 Asia/Seoul", idempotencyKey: "crm-briefing:YYYY-MM-DD:10:00:Asia/Seoul" });
