const MAX_WINDOW_DAYS = 366;
const MAX_CHANNELS = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_COLUMNS = ["tenant_id", "TenantId", "TenantID", "CrmTenantId"];

function safeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCalendarDate(value) {
  if (!DATE_RE.test(String(value))) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function periodBounds(startDate, endDate) {
  if (!validCalendarDate(startDate) || !validCalendarDate(endDate)) throw new Error("flow_invalid_date_range");
  const calendarStart = Date.parse(`${startDate}T00:00:00Z`);
  const calendarEnd = Date.parse(`${endDate}T00:00:00Z`);
  const days = Math.floor((calendarEnd - calendarStart) / 86400000) + 1;
  if (days < 1 || days > MAX_WINDOW_DAYS) throw new Error("flow_date_window_exceeded");
  const previousEnd = calendarStart - 86400000;
  const previousStart = previousEnd - (days - 1) * 86400000;
  const make = (fromDate, toDate) => ({
    start: new Date(fromDate).toISOString().slice(0, 10),
    end: new Date(toDate).toISOString().slice(0, 10),
    startUtc: new Date(Date.parse(`${new Date(fromDate).toISOString().slice(0, 10)}T00:00:00+09:00`)).toISOString(),
    endExclusiveUtc: new Date(Date.parse(`${new Date(toDate).toISOString().slice(0, 10)}T00:00:00+09:00`) + 86400000).toISOString(),
  });
  return { current: make(calendarStart, calendarEnd), previous: make(previousStart, previousEnd), days };
}

async function tableInfo(db, table) {
  const result = await db.prepare(`PRAGMA table_info(${safeIdentifier(table)})`).all();
  return new Set((result?.results || []).map((row) => String(row.name)));
}

async function hasTenantDateIndex(db, table, tenant, date) {
  const indexes = await db.prepare(`PRAGMA index_list(${safeIdentifier(table)})`).all();
  for (const index of indexes?.results || []) {
    const name = String(index.name || "");
    if (!name) continue;
    const columns = await db.prepare(`PRAGMA index_info(${safeIdentifier(name)})`).all();
    const names = (columns?.results || []).map((row) => String(row.name));
    if (names[0] === tenant && names[1] === date) return true;
  }
  return false;
}

async function sourceMeta(db, table, required, dateCandidates) {
  const columns = await tableInfo(db, table);
  if (!columns.size) return { available: false, reason: "source_table_missing" };
  const tenant = TENANT_COLUMNS.find((name) => columns.has(name));
  if (!tenant) return { available: false, reason: "tenant_column_missing" };
  const missing = required.filter((name) => !columns.has(name));
  if (missing.length) return { available: false, reason: "required_column_missing", missing };
  const date = dateCandidates.find((name) => columns.has(name));
  if (!date) return { available: false, reason: "date_column_missing" };
  if (!(await hasTenantDateIndex(db, table, tenant, date))) return { available: false, reason: "tenant_date_index_missing" };
  return { available: true, tenant, date, columns };
}

function channel(value) {
  const normalized = String(value ?? "").trim().normalize("NFC").toLowerCase();
  if (["homepage", "meta", "instagram_mkt", "instagram_official", "naver", "google", "youtube", "kakao", "referral", "other", "unknown"].includes(normalized)) return normalized;
  if (["(none)", "(not set)", "(direct)", "direct"].includes(normalized)) return "homepage";
  if (/instagram[-_ ]*marketing|인스타그램[-_ ]*마케팅/.test(normalized)) return "instagram_mkt";
  if (/instagram[-_ ]*official|인스타그램[-_ ]*오피셜/.test(normalized)) return "instagram_official";
  if (/메타|facebook|instagram|fbclid|^fb$|^ig$|meta[-_ ]*ad|meta[-_ ]*traffic/.test(normalized)) return "meta";
  if (/naver|네이버/.test(normalized)) return "naver";
  if (/google|gclid|구글/.test(normalized)) return "google";
  if (/youtube|youtu\.be|유튜브/.test(normalized)) return "youtube";
  if (/kakao|daum|카카오|카톡/.test(normalized)) return "kakao";
  return normalized.slice(0, 80);
}

function rate(numerator, denominator, method) {
  const value = finite(numerator);
  const base = finite(denominator);
  return { value: value !== null && base !== null && base > 0 ? value / base : null, numerator: value, denominator: base, method };
}

function periodMetrics(row = {}) {
  const visits = integer(row.visits);
  const applicationStarts = row.application_starts === null || row.application_starts === undefined ? null : integer(row.application_starts);
  const savedLeads = integer(row.saved_leads);
  return {
    visits,
    applicationStarts,
    savedLeads,
    rates: {
      visitToApplicationStart: rate(applicationStarts, visits, "application starts / distinct non-bot page-view sessions"),
      applicationStartToSaved: rate(savedLeads, applicationStarts, "saved Estimates rows / application-start sessions"),
      visitToSaved: rate(savedLeads, visits, "saved Estimates rows / distinct non-bot page-view sessions"),
    },
  };
}

function mergePeriodMetrics(left, right) {
  const applicationStarts = left.applicationStarts === null && right.applicationStarts === null
    ? null
    : (left.applicationStarts || 0) + (right.applicationStarts || 0);
  return periodMetrics({
    visits: left.visits + right.visits,
    application_starts: applicationStarts,
    saved_leads: left.savedLeads + right.savedLeads,
  });
}

function change(current, previous) {
  const delta = current - previous;
  return { absolute: delta, relative: previous > 0 ? delta / previous : null, previousAvailable: true };
}

function unavailable(periods, reason, details = {}) {
  return {
    available: false,
    reason,
    ...details,
    periods: { current: { start: periods.current.start, end: periods.current.end }, previous: { start: periods.previous.start, end: periods.previous.end } },
    timezone: "Asia/Seoul",
    sources: [],
    facts: [],
    hypotheses: [],
    judgment: { status: "unavailable", reason: "threshold_policy_missing", color: null },
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

async function readPeriod(db, tables, period, tenantId) {
  const heatmap = safeIdentifier(tables.heatmap.table);
  const heatmapTenant = safeIdentifier(tables.heatmap.tenant);
  const heatmapDate = safeIdentifier(tables.heatmap.date);
  const estimates = safeIdentifier(tables.estimates.table);
  const estimateTenant = safeIdentifier(tables.estimates.tenant);
  const estimateDate = safeIdentifier(tables.estimates.date);
  const internalMetaLeadFilter = tables.estimates.columns?.has("MetaLeadId")
    ? "AND NOT (LOWER(COALESCE(Source, ''))='meta' AND TRIM(COALESCE(MetaLeadId, ''))<>'')"
    : "";
  const heatmapChannel = `LOWER(SUBSTR(COALESCE(NULLIF(TRIM(UtmSource), ''), NULLIF(TRIM(UtmMedium), ''), 'unknown'), 1, 80))`;
  const estimateSourceColumns = ["FirstSource", "Source", "FirstInflowApp", "Platform"].filter((name) => tables.estimates.columns?.has(name));
  const estimateChannel = `LOWER(SUBSTR(COALESCE(${estimateSourceColumns.map((name) => `NULLIF(TRIM(${safeIdentifier(name)}), '')`).join(",")}, 'unknown'), 1, 80))`;
  const eventsSql = `WITH events AS (
      SELECT SessionId, id, CreatedAt, ${heatmapChannel} AS channel
      FROM ${heatmap}
      WHERE ${heatmapTenant}=? AND ${heatmapDate}>=? AND ${heatmapDate}<?
        AND EventType='page_view' AND IsBot=0 AND TRIM(SessionId)<>''
    ), first_touch AS (
      SELECT SessionId, channel FROM (
        SELECT SessionId, channel, ROW_NUMBER() OVER (PARTITION BY SessionId ORDER BY CreatedAt,id) AS row_number
        FROM events
      ) WHERE row_number=1
    ), by_channel AS (
      SELECT first_touch.channel, COUNT(*) AS visits,
        NULL AS application_starts, 0 AS saved_leads
      FROM first_touch
      GROUP BY first_touch.channel
    ), saved_by_channel AS (
      SELECT ${estimateChannel} AS channel, 0 AS visits, 0 AS application_starts, COUNT(*) AS saved_leads
      FROM ${estimates}
      WHERE ${estimateTenant}=? AND ${estimateDate}>=? AND ${estimateDate}<? ${internalMetaLeadFilter}
      GROUP BY ${estimateChannel}
    )
    SELECT channel, SUM(visits) AS visits, SUM(application_starts) AS application_starts, SUM(saved_leads) AS saved_leads
    FROM (SELECT * FROM by_channel UNION ALL SELECT * FROM saved_by_channel)
    GROUP BY channel
    ORDER BY (SUM(visits)+SUM(application_starts)+SUM(saved_leads)) DESC, channel ASC
    LIMIT ${MAX_CHANNELS + 1}`;
  const totalsSql = `WITH events AS (
      SELECT SessionId
      FROM ${heatmap}
      WHERE ${heatmapTenant}=? AND ${heatmapDate}>=? AND ${heatmapDate}<?
        AND EventType='page_view' AND IsBot=0 AND TRIM(SessionId)<>''
    )
    SELECT COUNT(DISTINCT SessionId) AS visits, NULL AS application_starts,
      (SELECT COUNT(*) FROM ${estimates} WHERE ${estimateTenant}=? AND ${estimateDate}>=? AND ${estimateDate}<? ${internalMetaLeadFilter}) AS saved_leads
    FROM events`;
  const binds = [tenantId, period.startUtc, period.endExclusiveUtc, tenantId, period.startUtc, period.endExclusiveUtc];
  const formSql = tables.pixel ? `SELECT LOWER(SUBSTR(COALESCE(NULLIF(TRIM(source), ''), 'unknown'), 1, 80)) AS channel, COUNT(DISTINCT session_id) AS application_starts
    FROM ${safeIdentifier(tables.pixel.table)}
    WHERE ${safeIdentifier(tables.pixel.tenant)}=? AND ${safeIdentifier(tables.pixel.date)}>=? AND ${safeIdentifier(tables.pixel.date)}<?
      AND (event_name='FormStart' OR ga4_name='form_start') AND TRIM(session_id)<>''
    GROUP BY LOWER(SUBSTR(COALESCE(NULLIF(TRIM(source), ''), 'unknown'), 1, 80))
    ORDER BY application_starts DESC, channel ASC LIMIT ${MAX_CHANNELS + 1}` : null;
  const formTotalSql = tables.pixel ? `SELECT COUNT(DISTINCT session_id) AS application_starts FROM ${safeIdentifier(tables.pixel.table)}
    WHERE ${safeIdentifier(tables.pixel.tenant)}=? AND ${safeIdentifier(tables.pixel.date)}>=? AND ${safeIdentifier(tables.pixel.date)}<?
      AND (event_name='FormStart' OR ga4_name='form_start') AND TRIM(session_id)<>''` : null;
  const formBinds = [tenantId, period.startUtc, period.endExclusiveUtc];
  const [rows, totals, formRows, formTotals] = await Promise.all([
    queryMany(db, eventsSql, binds),
    queryOne(db, totalsSql, binds),
    formSql ? queryMany(db, formSql, formBinds) : Promise.resolve([]),
    formTotalSql ? queryOne(db, formTotalSql, formBinds) : Promise.resolve({}),
  ]);
  const rowsByChannel = new Map(rows.map((row) => [String(row.channel || 'unknown'), { ...row, application_starts: null }]));
  for (const formRow of formRows) {
    const key = String(formRow.channel || 'unknown');
    const current = rowsByChannel.get(key) || { channel: key, visits: 0, saved_leads: 0, application_starts: null };
    current.application_starts = integer(formRow.application_starts);
    rowsByChannel.set(key, current);
  }
  const totalRow = { ...totals, application_starts: tables.pixel ? integer(formTotals.application_starts) : null };
  return { rows: [...rowsByChannel.values()], totals: periodMetrics(totalRow) };
}

function sourceFacts(sources) {
  const facts = [];
  for (const source of sources) {
    for (const periodKey of ["current", "previous"]) {
      const metrics = source[periodKey];
      for (const [key, value] of [["visits", metrics.visits], ["application_starts", metrics.applicationStarts], ["saved_leads", metrics.savedLeads]]) {
        facts.push({ type: "fact", source: source.channel, period: periodKey, key, value, source_basis: source.basis });
      }
      for (const [key, metric] of Object.entries(metrics.rates)) {
        facts.push({ type: "fact", source: source.channel, period: periodKey, key, value: metric.value, numerator: metric.numerator, denominator: metric.denominator, method: metric.method, source_basis: source.basis });
      }
    }
    facts.push({ type: "fact", source: source.channel, key: "saved_leads_change", value: change(source.current.savedLeads, source.previous.savedLeads), source_basis: source.basis });
  }
  return facts;
}

export async function readCrmFlowAnalysis(db, { tenantId, startDate, endDate } = {}) {
  if (!db?.prepare) throw new Error("flow_db_required");
  if (!tenantId) throw new Error("flow_tenant_required");
  const periods = periodBounds(startDate, endDate);
  const [heatmapMeta, estimateMeta, pixelMeta] = await Promise.all([
    sourceMeta(db, "HeatmapEvents", ["EventType", "SessionId", "Page", "IsBot", "UtmSource", "UtmMedium"], ["CreatedAt"]),
    sourceMeta(db, "Estimates", ["Source", "Platform"], ["SubmittedAt"]),
    sourceMeta(db, "pixel_events", ["event_name", "ga4_name", "session_id", "source"], ["created_at"]),
  ]);
  if (!heatmapMeta.available) return unavailable(periods, `heatmap_${heatmapMeta.reason}`, { source: "HeatmapEvents" });
  if (!estimateMeta.available) return unavailable(periods, `estimates_${estimateMeta.reason}`, { source: "Estimates" });
  const tables = {
    heatmap: { table: "HeatmapEvents", ...heatmapMeta },
    estimates: { table: "Estimates", ...estimateMeta },
    pixel: pixelMeta.available ? { table: "pixel_events", ...pixelMeta } : null,
  };
  const [current, previous] = await Promise.all([
    readPeriod(db, tables, periods.current, tenantId),
    readPeriod(db, tables, periods.previous, tenantId),
  ]);
  const merged = new Map();
  for (const [periodKey, result] of [["current", current], ["previous", previous]]) {
    for (const row of result.rows) {
      const key = channel(row.channel);
      if (!merged.has(key)) merged.set(key, { channel: key, basis: "HeatmapEvents first-touch UtmSource/UtmMedium; Estimates FirstSource/Source/Platform", current: periodMetrics(), previous: periodMetrics() });
      merged.get(key)[periodKey] = mergePeriodMetrics(merged.get(key)[periodKey], periodMetrics(row));
    }
  }
  const sources = [...merged.values()].sort((a, b) => (b.current.visits + b.current.applicationStarts + b.current.savedLeads) - (a.current.visits + a.current.applicationStarts + a.current.savedLeads) || a.channel.localeCompare(b.channel));
  const shown = sources.slice(0, MAX_CHANNELS);
  const currentShown = shown.reduce((sum, item) => sum + item.current.savedLeads, 0);
  const previousShown = shown.reduce((sum, item) => sum + item.previous.savedLeads, 0);
  const currentOther = Math.max(0, current.totals.savedLeads - currentShown);
  const previousOther = Math.max(0, previous.totals.savedLeads - previousShown);
  const result = {
    available: true,
    tenant_id: String(tenantId),
    periods: { current: { start: periods.current.start, end: periods.current.end }, previous: { start: periods.previous.start, end: periods.previous.end }, timezone: "Asia/Seoul" },
    totals: { current: current.totals, previous: previous.totals },
    sources: shown,
    sourcesHasMore: sources.length > MAX_CHANNELS,
    otherSavedLeads: { current: currentOther, previous: previousOther },
    stageAvailability: { applicationStart: pixelMeta.available ? { available: true, source: "pixel_events FormStart/form_start" } : { available: false, reason: "form_start_event_not_tenant_bound" } },
    facts: sourceFacts(shown),
    hypotheses: [],
    judgment: { status: "unavailable", reason: "threshold_policy_missing", color: null },
  };
  return result;
}

export const CRM_FLOW_ANALYSIS_CONTRACT = Object.freeze({ maxWindowDays: MAX_WINDOW_DAYS, maxChannels: MAX_CHANNELS, judgment: "unavailable until an approved threshold policy exists" });
