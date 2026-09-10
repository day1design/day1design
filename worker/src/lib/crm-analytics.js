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
    optional: ["EstimateAmount", "Detail", "MetaLeadId", "Address", "Status", "Assignee", "Branch", "ConsultAt", "ContractAt", "ContractAmount"],
  },
  meta_ads: {
    label: "Meta 광고 집계",
    table: "MetaAdsDaily",
    date: ["Date"],
    refreshed: ["FetchedAt", "CreatedAt"],
    required: ["Level", "Impressions", "Clicks", "LinkClicks", "Spend", "Leads"],
    optional: ["VideoAvgWatchSec", "VideoPlays"],
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

export function dateRange(startDate, endDate) {
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

function dailyDates(range) {
  const start = Date.parse(`${range.startDate}T00:00:00Z`);
  return Array.from({ length: range.days }, (_, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
}

function zeroFilledDailyTrend(range, rows, mapRow) {
  const byDate = new Map(rows.filter((row) => validCalendarDate(row.day)).map((row) => [String(row.day), row]));
  return dailyDates(range).map((date) => mapRow(date, byDate.get(date) || {}));
}

function sourceMeta(definition, columns) {
  const find = (names) => names.find((name) => columns.has(name));
  const tenant = TENANT_COLUMNS.find((name) => columns.has(name));
  return {
    tenant,
    date: find(definition.date),
    refreshed: find(definition.refreshed),
    missing: (definition.required || []).filter((name) => !columns.has(name)),
    optional: (definition.optional || []).filter((name) => columns.has(name)),
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
    return { available: true, ...meta, columns };
  } catch (error) {
    return { available: false, reason: "schema_inspection_failed", error: String(error?.message || error) };
  }
}

async function relatedTableAvailability(db, table, required) {
  try {
    const columns = await tableColumns(db, table);
    if (!columns.size) return { available: false, reason: "source_table_missing" };
    const missing = required.filter((name) => !columns.has(name));
    if (missing.length) return { available: false, reason: "required_column_missing", missing };
    return { available: true, columns };
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
  const currency = typeof row.account_currency === "string" && row.account_currency.trim()
    ? row.account_currency.trim().toUpperCase()
    : null;
  return {
    impressions,
    clicks,
    linkClicks,
    spend,
    leads,
    account_currency: currency,
    currency,
    ...(row.videoViewing ? { videoViewing: row.videoViewing } : {}),
    ctr: metric(clicks, impressions, "clicks / impressions"),
    ctrLink: metric(linkClicks, impressions, "link_clicks / impressions"),
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

function analyticsDimension(value, fallback = "미확인") {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 80) : fallback;
}

function analyticsRegion(value) {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "미확인";
  const first = parts[0].replace(/특별자치시|특별시|광역시|자치시|자치도|특별자치도/g, "");
  if (/도$/.test(parts[0]) && parts[1]) return parts[1].replace(/[시군구]$/, "");
  return first.replace(/[시군구]$/, "") || analyticsDimension(parts[0]);
}

function budgetAmount(value) {
  let text = String(value ?? "").trim().replace(/,/g, "").replace(/\s/g, "");
  if (!text || /평당|1평|한평/.test(text) || (/미정|상의|협의|결정|모르|문의|추후|생각중|고민/.test(text) && !/\d/.test(text))) return null;
  const range = text.split(/[~\-–—]/);
  if (range.length > 1) {
    const rightUnit = range[1].match(/억|천만?|만원?/);
    text = range[0] + (range[0].match(/억|천만?|만원?/) ? "" : rightUnit?.[0] || "");
  }
  text = text.replace(/일억/g, "1억").replace(/이억/g, "2억").replace(/삼억/g, "3억")
    .replace(/일천/g, "1천").replace(/이천/g, "2천").replace(/삼천/g, "3천")
    .replace(/사천/g, "4천").replace(/오천/g, "5천").replace(/육천/g, "6천")
    .replace(/칠천/g, "7천").replace(/팔천/g, "8천").replace(/구천/g, "9천");
  let match = text.match(/(\d+(?:\.\d+)?)억(?:([0-9]+)(천|백)?)?/);
  if (match) return Math.round(Number(match[1]) * 10000 + (match[2] ? Number(match[2]) * (match[3] === "천" ? 1000 : 100) : 0));
  match = text.match(/(\d+(?:\.\d+)?)천/);
  if (match) return Math.round(Number(match[1]) * 1000);
  match = text.match(/(\d+)만/);
  if (match) return Number(match[1]);
  match = text.match(/(\d{3,})원$/);
  if (match) return Number(match[1]) / 10000;
  match = text.match(/(\d{3,})/);
  if (match) {
    const number = Number(match[1]);
    return number >= 100 && number <= 200000 ? number : null;
  }
  return null;
}

function budgetCounts(rows) {
  const counts = { below_30m: 0, from_30m_to_50m: 0, from_50m_to_70m: 0, from_70m: 0, unknown: 0 };
  for (const row of rows) {
    const stored = finite(row.EstimateAmount);
    const detailText = String(row.budget_text ?? "").trim();
    const hasBudgetLabel = Number(row.budget_has_label) > 0;
    const amount = hasBudgetLabel ? budgetAmount(detailText) : (stored !== null && stored > 0 ? stored / 10000 : null);
    const count = Math.max(0, Math.floor(Number(row.count) || 0));
    if (!count) continue;
    if (amount === null || amount <= 0) { counts.unknown += count; continue; }
    if (amount < 3000) counts.below_30m += count;
    else if (amount < 5000) counts.from_30m_to_50m += count;
    else if (amount < 7000) counts.from_50m_to_70m += count;
    else counts.from_70m += count;
  }
  return counts;
}

async function cohortEstimateDimension(db, table, tenant, date, range, tenantId, column, transform = analyticsDimension) {
  const rows = await queryMany(db, `SELECT ${safeIdentifier(column)} AS value, COUNT(*) AS count FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? GROUP BY ${safeIdentifier(column)}`, [tenantId, range.startUtc, range.endExclusiveUtc]);
  const grouped = new Map();
  for (const row of rows) {
    const value = transform(row.value);
    grouped.set(value, (grouped.get(value) || 0) + (integer(row.count) || 0));
  }
  return {
    values: [...grouped.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 100).map(([value, count]) => ({ value, count })),
    hasMore: grouped.size > 100,
  };
}

async function readIntakeDetails(db, availability, range, tenantId, saved) {
  const optional = new Set(availability.optional || []);
  const table = safeIdentifier("Estimates");
  const tenant = safeIdentifier(availability.tenant);
  const date = safeIdentifier(availability.date);
  const detail = { cohort: { available: true, saved }, dimensions: {} };
  const dimension = async (key, column, transform = analyticsDimension) => {
    if (!optional.has(column)) {
      detail.dimensions[key] = { available: false, reason: "column_missing" };
      return;
    }
    detail.dimensions[key] = { available: true, ...(await cohortEstimateDimension(db, table, tenant, date, range, tenantId, column, transform)) };
  };
  await dimension("regions", "Address", analyticsRegion);
  await dimension("statuses", "Status");
  await dimension("assignees", "Assignee");
  await dimension("branches", "Branch");
  if (optional.has("EstimateAmount") || optional.has("Detail")) {
    const amountColumn = optional.has("EstimateAmount") ? safeIdentifier("EstimateAmount") : "NULL";
    const detailColumn = safeIdentifier("Detail");
    // Historical intake paths used both `가용예산 :` and `가용 예산:`.
    // Normalize those label variants before extracting the stored answer.
    const normalizedDetail = `replace(replace(replace(${detailColumn}, '가용 예산', '가용예산'), '가용예산 :', '가용예산:'), '가용예산：', '가용예산:')`;
    const afterLabel = `substr(${normalizedDetail}, instr(${normalizedDetail}, '가용예산:') + length('가용예산:'))`;
    const budgetText = optional.has("Detail")
      ? `trim(CASE WHEN instr(${normalizedDetail}, '가용예산:') > 0 THEN CASE WHEN instr(${afterLabel}, char(10)) > 0 THEN substr(${afterLabel}, 1, instr(${afterLabel}, char(10)) - 1) ELSE ${afterLabel} END ELSE '' END)`
      : "''";
    const budgetLabel = optional.has("Detail") ? `CASE WHEN instr(${normalizedDetail}, '가용예산:') > 0 THEN 1 ELSE 0 END` : "0";
    const budgetRows = await queryMany(db, `SELECT ${amountColumn} AS EstimateAmount, ${budgetText} AS budget_text, ${budgetLabel} AS budget_has_label, COUNT(*) AS count FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? GROUP BY ${amountColumn}, ${budgetText} LIMIT 501`, [tenantId, range.startUtc, range.endExclusiveUtc]);
    if (budgetRows.length > 500) {
      detail.dimensions.budget = { available: false, reason: "budget_group_limit_exceeded", max_groups: 500 };
    } else {
      const counts = budgetCounts(budgetRows);
      const known = counts.below_30m + counts.from_30m_to_50m + counts.from_50m_to_70m + counts.from_70m;
      detail.dimensions.budget = {
        available: true,
        known,
        unknown: counts.unknown,
        values: [
          { label: "3천만 미만", count: counts.below_30m },
          { label: "3~5천만", count: counts.from_30m_to_50m },
          { label: "5~7천만", count: counts.from_50m_to_70m },
          { label: "7천만 이상", count: counts.from_70m },
          { label: "미확인", count: counts.unknown },
        ],
        hasMore: false,
      };
    }
  } else {
    detail.dimensions.budget = { available: false, reason: "column_missing" };
  }
  if (optional.has("ConsultAt")) {
    const row = await queryOne(db, `SELECT COUNT(DISTINCT id) AS scheduled, SUM(CASE WHEN ${safeIdentifier("ConsultAt")} IS NOT NULL AND TRIM(${safeIdentifier("ConsultAt")}) <> '' THEN 1 ELSE 0 END) AS scheduled_with_time FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? AND ${safeIdentifier("ConsultAt")} IS NOT NULL AND TRIM(${safeIdentifier("ConsultAt")}) <> ''`, [tenantId, range.startUtc, range.endExclusiveUtc]);
    detail.cohort.legacyConsultation = { available: true, scheduled: integer(row.scheduled) || 0 };
  } else {
    detail.cohort.legacyConsultation = { available: false, reason: "column_missing" };
  }
  const appointments = await relatedTableAvailability(db, "CrmAppointments", ["tenant_id", "estimate_id", "kind", "status"]);
  if (appointments.available) {
    const rows = await queryMany(db, `SELECT a.kind AS kind, COUNT(DISTINCT a.estimate_id) AS customers, COUNT(*) AS events, SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled FROM CrmAppointments a INNER JOIN (SELECT id FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ?) c ON c.id = a.estimate_id WHERE a.tenant_id = ? AND a.kind IN ('visit', 'measurement') GROUP BY a.kind`, [tenantId, range.startUtc, range.endExclusiveUtc, tenantId]);
    detail.cohort.appointments = { available: true, values: rows.map((row) => ({ kind: row.kind, customers: integer(row.customers) || 0, events: integer(row.events) || 0, cancelled: integer(row.cancelled) || 0 })) };
  } else {
    detail.cohort.appointments = { available: false, reason: appointments.reason };
  }
  const contracts = await relatedTableAvailability(db, "CrmContracts", ["tenant_id", "estimate_id", "status", "amount"]);
  if (contracts.available) {
    const rows = await queryMany(db, `SELECT c.status AS status, COUNT(DISTINCT c.estimate_id) AS customers, COUNT(*) AS events, SUM(c.amount) AS amount FROM CrmContracts c INNER JOIN (SELECT id FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ?) cohort ON cohort.id = c.estimate_id WHERE c.tenant_id = ? GROUP BY c.status ORDER BY c.status ASC`, [tenantId, range.startUtc, range.endExclusiveUtc, tenantId]);
    const legacyAmount = optional.has("ContractAmount") ? `SUM(CASE WHEN ${safeIdentifier("ContractAmount")} > 0 THEN ${safeIdentifier("ContractAmount")} ELSE 0 END)` : "NULL";
    const legacy = optional.has("ContractAt") ? await queryOne(db, `SELECT COUNT(DISTINCT e.id) AS customers, ${legacyAmount} AS amount FROM ${table} e WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? AND ${safeIdentifier("ContractAt")} IS NOT NULL AND TRIM(${safeIdentifier("ContractAt")}) <> '' AND NOT EXISTS (SELECT 1 FROM CrmContracts existing WHERE existing.tenant_id = ? AND existing.estimate_id = e.id)`, [tenantId, range.startUtc, range.endExclusiveUtc, tenantId]) : {};
    const values = rows.map((row) => ({ status: analyticsDimension(row.status), customers: integer(row.customers) || 0, events: integer(row.events) || 0, amount: finite(row.amount) }));
    if ((integer(legacy.customers) || 0) > 0) {
      const signed = values.find((row) => row.status === "signed");
      if (signed) {
        signed.customers += integer(legacy.customers) || 0;
        signed.events += integer(legacy.customers) || 0;
        signed.amount = (signed.amount || 0) + (finite(legacy.amount) || 0);
      } else values.push({ status: "signed", customers: integer(legacy.customers) || 0, events: integer(legacy.customers) || 0, amount: finite(legacy.amount) });
    }
    detail.cohort.contracts = { available: true, values };
  } else if (optional.has("ContractAt")) {
    const contractAmount = optional.has("ContractAmount") ? `SUM(CASE WHEN ${safeIdentifier("ContractAmount")} > 0 THEN ${safeIdentifier("ContractAmount")} ELSE 0 END)` : "NULL";
    const row = await queryOne(db, `SELECT COUNT(DISTINCT id) AS customers, ${contractAmount} AS amount FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? AND ${safeIdentifier("ContractAt")} IS NOT NULL AND TRIM(${safeIdentifier("ContractAt")}) <> ''`, [tenantId, range.startUtc, range.endExclusiveUtc]);
    detail.cohort.contracts = { available: true, source: "Estimates", values: [{ status: "계약완료", customers: integer(row.customers) || 0, events: integer(row.customers) || 0, amount: finite(row.amount) }] };
  } else {
    detail.cohort.contracts = { available: false, reason: contracts.reason };
  }
  return detail;
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
    const internalFormExpression = availability.optional.includes("MetaLeadId")
      ? `(NULLIF(TRIM(${safeIdentifier("MetaLeadId")}), '') IS NOT NULL OR LOWER(TRIM(COALESCE(${safeIdentifier("Source")}, ''))) = 'meta')`
      : `LOWER(TRIM(COALESCE(${safeIdentifier("Source")}, ''))) = 'meta'`;
    const row = await queryOne(db, `SELECT COUNT(*) AS saved, SUM(CASE WHEN LOWER(COALESCE(Source, '')) IN ('meta','facebook','instagram','fb','ig') OR LOWER(COALESCE(Platform, '')) = 'meta' THEN 1 ELSE 0 END) AS meta_saved, SUM(CASE WHEN ${internalFormExpression} THEN 1 ELSE 0 END) AS internal_form_saved, MAX(${refreshed}) AS refreshed FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ?`, timestampBinds);
    const trendRows = await queryMany(db, `SELECT strftime('%Y-%m-%d', ${date}, '+9 hours') AS day, COUNT(*) AS saved, SUM(CASE WHEN LOWER(COALESCE(Source, '')) IN ('meta','facebook','instagram','fb','ig') OR LOWER(COALESCE(Platform, '')) = 'meta' THEN 1 ELSE 0 END) AS meta_saved, SUM(CASE WHEN NOT (${internalFormExpression}) THEN 1 ELSE 0 END) AS homepage_saved FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? GROUP BY day ORDER BY day`, timestampBinds);
    const channelExpression = `LOWER(SUBSTR(COALESCE(NULLIF(TRIM(Source), ''), NULLIF(TRIM(Platform), ''), 'unknown'), 1, 80))`;
    const channelRows = await queryMany(db, `SELECT ${channelExpression} AS channel, COUNT(*) AS saved, SUM(CASE WHEN LOWER(COALESCE(Source, '')) IN ('meta','facebook','instagram','fb','ig') OR LOWER(COALESCE(Platform, '')) = 'meta' THEN 1 ELSE 0 END) AS meta_saved FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? GROUP BY ${channelExpression} ORDER BY saved DESC, channel ASC LIMIT 101`, timestampBinds);
    const shownChannels = channelRows.slice(0, 100);
    const shownLeads = shownChannels.reduce((sum, item) => sum + (integer(item.saved) || 0), 0);
    const shownMetaLeads = shownChannels.reduce((sum, item) => sum + (integer(item.meta_saved) || 0), 0);
    const saved = integer(row.saved) || 0;
    const metaSaved = integer(row.meta_saved) || 0;
    const internalFormSaved = Math.min(saved, Math.max(0, integer(row.internal_form_saved) || 0));
    const intake = await readIntakeDetails(db, availability, range, tenantId, saved);
    return sourceEnvelope(key, definition, range, availability, {
      saved,
      metaSaved,
      trend: zeroFilledDailyTrend(range, trendRows, (dateValue, item) => ({ date: dateValue, saved: integer(item.saved) || 0, metaSaved: integer(item.meta_saved) || 0, homepageSaved: integer(item.homepage_saved) || 0 })),
      channels: shownChannels.map((item) => ({ channel: analyticsChannel(item.channel), saved: integer(item.saved) || 0, metaSaved: integer(item.meta_saved) || 0 })),
      channelsHasMore: channelRows.length > 100,
      shownLeads,
      otherLeads: Math.max(0, saved - shownLeads),
      shownMetaLeads,
      otherMetaLeads: Math.max(0, metaSaved - shownMetaLeads),
      intakeChannels: [
        { channel: "홈페이지", saved: saved - internalFormSaved },
        { channel: "Meta 내부폼", saved: internalFormSaved },
      ],
      denominator: "saved rows",
      intake,
    }, row.refreshed || null);
  }
  if (key === "meta_ads") {
    const hasVideoAvg = availability.optional.includes("VideoAvgWatchSec");
    const hasVideoPlays = availability.optional.includes("VideoPlays");
    const videoSelect = hasVideoAvg && hasVideoPlays
      ? `, COUNT(*) AS video_rows, COUNT(VideoPlays) AS video_observed_play_rows, SUM(CASE WHEN VideoPlays IS NULL THEN 1 ELSE 0 END) AS video_missing_play_rows, SUM(CASE WHEN VideoPlays > 0 THEN VideoAvgWatchSec * VideoPlays ELSE 0 END) AS video_watch_numerator, SUM(VideoPlays) AS video_plays, SUM(CASE WHEN VideoPlays > 0 AND VideoAvgWatchSec IS NULL THEN VideoPlays ELSE 0 END) AS video_missing_avg_plays`
      : "";
    const row = await queryOne(db, `SELECT SUM(Impressions) AS impressions, SUM(Clicks) AS clicks, SUM(LinkClicks) AS link_clicks, SUM(Spend) AS spend, SUM(Leads) AS leads${videoSelect}, MAX(${refreshed}) AS refreshed FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} <= ? AND Level = 'account'`, dailyBinds);
    const accountCurrency = tenantId === "day1design" ? "USD" : null;
    const ads = calculateAdMetrics({ impressions: row.impressions, clicks: row.clicks, linkClicks: row.link_clicks, spend: row.spend, leads: row.leads, account_currency: accountCurrency });
    ads.videoViewing = !hasVideoAvg || !hasVideoPlays
      ? { available: false, reason: "column_missing", missing: [hasVideoAvg ? null : "VideoAvgWatchSec", hasVideoPlays ? null : "VideoPlays"].filter(Boolean), basis: "video plays" }
      : Number(row.video_rows) === 0
        ? { available: false, reason: "video_not_collected", avgWatchSec: null, videoPlays: null, denominator: "VideoPlays", basis: "video plays" }
      : Number(row.video_observed_play_rows) === 0
        ? { available: false, reason: "video_not_collected", avgWatchSec: null, videoPlays: null, denominator: "VideoPlays", basis: "video plays" }
      : Number(row.video_missing_play_rows) > 0
        ? { available: false, reason: "partial_video_metrics", missingVideoRows: integer(row.video_missing_play_rows), denominator: "VideoPlays", basis: "video plays" }
      : Number(row.video_missing_avg_plays) > 0
        ? { available: false, reason: "partial_video_metrics", missingVideoPlays: integer(row.video_missing_avg_plays), denominator: "VideoPlays", basis: "video plays" }
      : Number(row.video_plays) > 0
        ? { available: true, avgWatchSec: Number(row.video_watch_numerator) / Number(row.video_plays), videoPlays: integer(row.video_plays), denominator: "VideoPlays", basis: "video plays" }
        : { available: false, reason: "no_video_plays", avgWatchSec: null, videoPlays: 0, denominator: "VideoPlays", basis: "video plays" };
    return sourceEnvelope(key, definition, range, availability, { ...ads, denominator: "account-level daily rows" }, row.refreshed || null);
  }
  if (key === "pixel_events") {
    const row = await queryOne(db, `SELECT COUNT(*) AS events, SUM(CASE WHEN event_name = 'PageView' THEN 1 ELSE 0 END) AS pageviews, SUM(CASE WHEN event_name = 'Lead' THEN 1 ELSE 0 END) AS leads, MAX(${refreshed}) AS refreshed FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ?`, timestampBinds);
    return sourceEnvelope(key, definition, range, availability, { events: integer(row.events) || 0, pageviews: integer(row.pageviews) || 0, leads: integer(row.leads) || 0, denominator: "event rows" }, row.refreshed || null);
  }
  const row = await queryOne(db, `SELECT COUNT(DISTINCT SessionId) AS sessions, COUNT(*) AS pageviews, MAX(${refreshed}) AS refreshed FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? AND EventType = 'page_view' AND IsBot = 0`, timestampBinds);
  const trendRows = await queryMany(db, `SELECT strftime('%Y-%m-%d', ${date}, '+9 hours') AS day, COUNT(DISTINCT SessionId) AS sessions FROM ${table} WHERE ${tenant} = ? AND ${date} >= ? AND ${date} < ? AND EventType = 'page_view' AND IsBot = 0 GROUP BY day ORDER BY day`, timestampBinds);
  return sourceEnvelope(key, definition, range, availability, { sessions: integer(row.sessions) || 0, pageviews: integer(row.pageviews) || 0, trend: zeroFilledDailyTrend(range, trendRows, (dateValue, item) => ({ date: dateValue, sessions: integer(item.sessions) || 0 })), denominator: "distinct non-bot page_view sessions" }, row.refreshed || null);
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

export function composeBriefing(analytics, { requestedAt = new Date().toISOString(), runDate, flow = null } = {}) {
  const day = runDate || requestedAt.slice(0, 10);
  const ads = analytics?.metrics?.ads || {};
  const currency = ads.currency ?? null;
  return {
    schedule: { key: dailyBriefingKey(day), timezone: "Asia/Seoul", local_time: "10:00", idempotent: true },
    requested_at: requestedAt,
    period: analytics?.range || null,
    metrics: {
      spend: ads.spend ?? null,
      leads: ads.leads ?? null,
      impressions: ads.impressions ?? null,
      linkClicks: ads.linkClicks ?? null,
      currency,
      cpl: ads.cpl?.value ?? null,
      cpc: ads.cpcLink?.value ?? null,
      cpm: ads.cpm?.value ?? null,
      ...(ads.videoViewing?.available ? { videoAvgWatchSec: ads.videoViewing.avgWatchSec, videoPlays: ads.videoViewing.videoPlays } : {}),
      ctr: ads.ctrLink?.value ?? null,
      methods: {
        cpl: ads.cpl?.method ?? null,
        cpc: ads.cpcLink?.method ?? null,
        cpm: ads.cpm?.method ?? null,
        ctr: ads.ctrLink?.method ?? null,
        ...(ads.videoViewing?.available ? { videoAvgWatchSec: "SUM(VideoAvgWatchSec * VideoPlays) / SUM(VideoPlays)" } : {}),
      },
    },
    flow: flow || null,
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
