import { isAdminKpiGa4PayloadBinding, isReusableAdminKpiGa4Snapshot } from "./admin-kpi-ga4.js";

const KST = "+09:00";
const DAY = 86400000;
const TENANT = "day1design";
const MAX_SOURCE_DAYS = 732;
const MAX_RESPONSE_BYTES = 65536;
const MAX_ROLLUP_ROWS = 24000;
const CACHE_TTL_MS = 60000;
const CACHE_LIMIT = 128;
const SNAPSHOT_VERSION = "v2";

const PERIODS = Object.freeze({
  "7": { kind: "days", size: 7 },
  "15": { kind: "days", size: 15 },
  month: { kind: "months", size: 1 },
  "2months": { kind: "months", size: 2 },
  "3months": { kind: "months", size: 3 },
  "6months": { kind: "months", size: 6 },
  year: { kind: "months", size: 12 },
});

const BUSINESS_METRICS = Object.freeze([
  "inquiries", "metaReceived", "webReceived", "organic", "naverOrganic",
  "googleOrganic", "chatgptOrganic", "meetings", "contracts", "amount", "changes",
]);
const META_METRICS = Object.freeze(["spend", "impressions", "clicks", "linkClicks", "leads"]);
const GA4_METRICS = Object.freeze(["users", "sessions", "views"]);
const BUDGET_METRICS = Object.freeze(["budget0", "budget1", "budget2", "budget3", "budget4", "budget5", "budget6"]);
const COMPARISON_METRICS = Object.freeze([
  "users", "sessions", "views", "spend", "impressions", "clicks", "linkClicks", "ctr",
  "cpc", "leads", "cpl", "inquiries", "metaReceived", "webReceived", "organic",
  "naverOrganic", "googleOrganic", "chatgptOrganic", "meetings", "contracts", "amount", "changes",
]);
const ALL_STORED_METRICS = Object.freeze([...BUSINESS_METRICS, ...BUDGET_METRICS]);

const BUDGET_BANDS = Object.freeze([
  "3천만원 미만", "3천-5천만원 미만", "5천-7천만원 미만", "7천만원-1억원 미만",
  "1억-1억5천만원 미만", "1억5천만원 이상", "미기재·분류 불가",
]);

function pad(value) { return String(value).padStart(2, "0"); }
function validDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00Z`)) && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
}
function dateOnly(date) { return date.toISOString().slice(0, 10); }
function addDays(iso, amount) {
  const [year, month, day] = iso.split("-").map(Number);
  return dateOnly(new Date(Date.UTC(year, month - 1, day + amount)));
}
function addMonths(iso, amount) {
  const [year, month] = iso.split("-").map(Number);
  const index = year * 12 + month - 1 + amount;
  return `${Math.floor(index / 12)}-${pad(index % 12 + 1)}-01`;
}
function todayKst(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
function range(start, endExclusive) {
  const days = Math.max(0, Math.round((Date.parse(`${endExclusive}T00:00:00${KST}`) - Date.parse(`${start}T00:00:00${KST}`)) / DAY));
  return { start, endExclusive, end: addDays(endExclusive, -1), days };
}
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function optionalNumber(value) {
  if (value == null || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function rows(result) { return result?.results || []; }
function first(result) { return rows(result)[0] || null; }
function makeValues(keys) { return Object.fromEntries(keys.map((key) => [key, null])); }
function dotDate(value) { return String(value || "").replaceAll("-", "."); }
function monthNumber(value) { const [year, month] = value.slice(0, 7).split("-").map(Number); return year * 12 + month; }
function sanitizeBinding(value) { return String(value || "").trim(); }
function metaBindingCandidates(value) {
  const binding = sanitizeBinding(value);
  if (!binding) return [];
  const stripped = binding.replace(/^act_/, "");
  const candidates = binding.startsWith("act_") ? [binding, stripped] : [binding, `act_${binding}`];
  return [...new Set(candidates.filter(Boolean))];
}

function coverage(source, complete, reason = "") {
  return complete
    ? { available: true, complete: true, source }
    : { available: false, complete: false, source, reason };
}

function periodRowCount(period, monthly) {
  return monthly ? Math.max(1, monthNumber(period.endExclusive) - monthNumber(period.start)) : period.days;
}

function assertPeriodBound(resolved) {
  const total = resolved.current.days + resolved.previous.days;
  if (total > MAX_SOURCE_DAYS) throw new Error("kpi_period_too_large");
}

export function normalizeAnchor(value, now = new Date()) {
  if (value != null && value !== "" && !validDate(value)) throw new Error("kpi_anchor_invalid");
  const anchor = value == null || value === "" ? todayKst(now) : value;
  if (!validDate(anchor)) throw new Error("kpi_anchor_invalid");
  if (anchor > todayKst(now)) throw new Error("kpi_anchor_future");
  return anchor;
}

export function resolveKpiPeriod(period = "7", anchorValue, now = new Date()) {
  const spec = PERIODS[period];
  if (!spec) throw new Error("kpi_period_invalid");
  const anchor = normalizeAnchor(anchorValue, now);
  let current;
  if (spec.kind === "days") {
    current = range(addDays(anchor, -spec.size), anchor);
  } else {
    const currentEnd = addMonths(anchor, 0).slice(0, 7) + "-01";
    current = range(addMonths(currentEnd, -spec.size), currentEnd);
  }
  const previous = range(
    spec.kind === "days" ? addDays(current.start, -spec.size) : addMonths(current.start, -spec.size),
    current.start,
  );
  const resolved = { key: period, anchor, current, previous, timezone: "Asia/Seoul" };
  assertPeriodBound(resolved);
  return resolved;
}

export function classifyOrganicLead(row = {}) {
  const values = [row.FirstSource, row.Source, row.FirstUtmSource, row.FirstReferrer, row.Referral]
    .map((value) => String(value || "").trim().toLowerCase()).join(" ");
  const paidMedium = /(^|[ _-])(cpc|ppc|paid|display|ads?|광고)([ _-]|$)/.test(String(row.FirstUtmMedium || "").trim().toLowerCase());
  const paid = Boolean(String(row.MetaLeadId || row.MetaAdId || row.Fbclid || "").trim()) ||
    paidMedium || /(^|[ _-])(cpc|paid|ads?|광고)([ _-]|$)/.test(values);
  if (paid) return null;
  if (/chatgpt|openai/.test(values)) return "chatgpt";
  if (/naver|네이버/.test(values)) return "naver";
  if (/google|구글/.test(values)) return "google";
  return null;
}

export function parseBudgetWon(value) {
  const text = String(value || "").replace(/,/g, "").replace(/\s+/g, "");
  if (!text) return null;
  const eok = text.match(/(\d+(?:\.\d+)?)억/);
  const cheon = text.match(/(\d+(?:\.\d+)?)천/);
  const man = text.match(/(\d+(?:\.\d+)?)만/);
  if (eok || cheon || man) return number(eok?.[1]) * 10000 + number(cheon?.[1]) * 1000 + number(man?.[1]);
  const plain = text.match(/\d+(?:\.\d+)?/);
  return plain ? number(plain[0]) : null;
}

export function budgetBand(value) {
  const won = parseBudgetWon(value);
  if (won === null) return BUDGET_BANDS[6];
  if (won < 3000) return BUDGET_BANDS[0];
  if (won < 5000) return BUDGET_BANDS[1];
  if (won < 7000) return BUDGET_BANDS[2];
  if (won < 10000) return BUDGET_BANDS[3];
  if (won < 15000) return BUDGET_BANDS[4];
  return BUDGET_BANDS[5];
}

async function dirtyBusinessDays(db, period) {
  const result = await db.prepare(
    `SELECT day FROM AdminKpiDirtyDays
     WHERE tenant_id=? AND source='business' AND day>=? AND day<? ORDER BY day LIMIT 1`,
  ).bind(TENANT, period.start, period.endExclusive).all();
  return rows(result);
}

async function readStoredRows(db, period, metrics, { monthly = false } = {}) {
  const table = monthly ? "AdminKpiMonthly" : "AdminKpiDaily";
  const dateColumn = monthly ? "month" : "day";
  const start = monthly ? period.start.slice(0, 7) : period.start;
  const end = monthly ? period.endExclusive.slice(0, 7) : period.endExclusive;
  const result = await db.prepare(
    `SELECT ${dateColumn} AS period_key,metric,value,coverage_status,source_revision,updated_at
     FROM ${table} INDEXED BY ${monthly ? "idx_admin_kpi_monthly_metric_month" : "idx_admin_kpi_daily_metric_day"}
     WHERE tenant_id=? AND ${dateColumn}>=? AND ${dateColumn}<? AND metric IN (${metrics.map(() => "?").join(",")})
     ORDER BY ${dateColumn},metric LIMIT ${MAX_ROLLUP_ROWS + 1}`,
  ).bind(TENANT, start, end, ...metrics).all();
  const list = rows(result);
  if (list.length > MAX_ROLLUP_ROWS) throw new Error("kpi_rollup_limit");
  return list;
}

function foldStoredRows(list, metrics, expected) {
  const byMetric = Object.fromEntries(metrics.map((name) => [name, []]));
  for (const row of list) if (byMetric[row.metric]) byMetric[row.metric].push(row);
  const complete = metrics.every((metric) => {
    const metricRows = byMetric[metric];
    return metricRows.length >= expected && metricRows.every((row) => String(row.coverage_status || "complete") === "complete");
  });
  if (!complete) return { complete: false, values: makeValues(metrics) };
  return {
    complete: true,
    values: Object.fromEntries(metrics.map((metric) => [metric, byMetric[metric].reduce((sum, row) => sum + number(row.value), 0)])),
  };
}

async function readBusinessPeriod(db, period, { monthlyPreferred = false } = {}) {
  const dirty = await dirtyBusinessDays(db, period);
  const empty = { values: makeValues(BUSINESS_METRICS), budget: makeValues(BUDGET_METRICS) };
  if (dirty.length) return { ...empty, coverage: coverage("AdminKpiDaily", false, "dirty_business_days") };

  if (monthlyPreferred) {
    const expectedMonths = periodRowCount(period, true);
    const monthlyRows = await readStoredRows(db, period, ALL_STORED_METRICS, { monthly: true });
    const monthly = foldStoredRows(monthlyRows, ALL_STORED_METRICS, expectedMonths);
    if (monthly.complete) {
      return {
        values: Object.fromEntries(BUSINESS_METRICS.map((metric) => [metric, monthly.values[metric]])),
        budget: Object.fromEntries(BUDGET_METRICS.map((metric) => [metric, monthly.values[metric]])),
        coverage: coverage("AdminKpiMonthly", true),
        source: { name: "business", binding: TENANT, fetchedAt: latestUpdatedAt(monthlyRows) },
      };
    }
  }

  const expectedDays = periodRowCount(period, false);
  const dailyRows = await readStoredRows(db, period, ALL_STORED_METRICS);
  const daily = foldStoredRows(dailyRows, ALL_STORED_METRICS, expectedDays);
  if (!daily.complete) {
    return { ...empty, coverage: coverage("AdminKpiDaily", false, daily.values.inquiries == null ? "daily_rollup_missing" : "daily_rollup_incomplete") };
  }
  return {
    values: Object.fromEntries(BUSINESS_METRICS.map((metric) => [metric, daily.values[metric]])),
    budget: Object.fromEntries(BUDGET_METRICS.map((metric) => [metric, daily.values[metric]])),
    coverage: coverage("AdminKpiDaily", true),
    source: { name: "business", binding: TENANT, fetchedAt: latestUpdatedAt(dailyRows) },
  };
}

function latestUpdatedAt(list) {
  return list.map((row) => row.updated_at).filter(Boolean).sort().at(-1) || null;
}

async function readMetaPeriod(db, period, { accountId }) {
  const values = makeValues(META_METRICS);
  const binding = sanitizeBinding(accountId);
  const bindings = metaBindingCandidates(binding);
  if (!binding) return { values, coverage: coverage("MetaAdsDaily", false, "meta_account_binding_missing"), source: { name: "meta", binding, fetchedAt: null, definition: "MetaAdsDaily account rows: spend, impressions, clicks, linkClicks, leads" } };
  const placeholders = bindings.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT Date,EntityId,Impressions,Clicks,LinkClicks,Spend,Leads,FetchedAt
     FROM MetaAdsDaily INDEXED BY idx_meta_ads_daily_tenant_date
     WHERE CrmTenantId=? AND Date>=? AND Date<? AND Level='account' AND EntityId IN (${placeholders})
     ORDER BY EntityId,Date LIMIT ?`,
  ).bind(TENANT, period.start, period.endExclusive, ...bindings, period.days * bindings.length + 1).all().catch(async () => db.prepare(
    `SELECT Date,EntityId,Impressions,Clicks,LinkClicks,Spend,Leads FROM MetaAdsDaily INDEXED BY idx_meta_ads_daily_tenant_date
     WHERE CrmTenantId=? AND Date>=? AND Date<? AND Level='account' AND EntityId IN (${placeholders}) ORDER BY EntityId,Date LIMIT ?`,
  ).bind(TENANT, period.start, period.endExclusive, ...bindings, period.days * bindings.length + 1).all());
  const found = rows(result);
  if (found.length > period.days * bindings.length) throw new Error("kpi_meta_limit");
  const byBinding = new Map(bindings.map((candidate) => [candidate, []]));
  for (const row of found) if (byBinding.has(row.EntityId)) byBinding.get(row.EntityId).push(row);
  let selectedBinding = binding;
  let list = [];
  for (const candidate of bindings) {
    const candidateRows = byBinding.get(candidate) || [];
    if (candidateRows.length >= period.days) {
      selectedBinding = candidate;
      list = candidateRows;
      break;
    }
    if (candidateRows.length > list.length) {
      selectedBinding = candidate;
      list = candidateRows;
    }
  }
  const complete = list.length >= period.days;
  if (!complete) return { values, coverage: coverage("MetaAdsDaily", false, list.length ? "meta_daily_incomplete" : "meta_daily_missing"), source: { name: "meta", binding: selectedBinding, fetchedAt: null, definition: "MetaAdsDaily account rows: spend, impressions, clicks, linkClicks, leads" } };
  values.spend = list.reduce((sum, row) => sum + number(row.Spend), 0);
  values.impressions = list.reduce((sum, row) => sum + number(row.Impressions), 0);
  values.clicks = list.reduce((sum, row) => sum + number(row.Clicks), 0);
  values.linkClicks = list.reduce((sum, row) => sum + number(row.LinkClicks), 0);
  values.leads = list.reduce((sum, row) => sum + number(row.Leads), 0);
  return { values, coverage: coverage("MetaAdsDaily", true), source: { name: "meta", binding: selectedBinding, fetchedAt: list.map((row) => row.FetchedAt).filter(Boolean).sort().at(-1) || null, definition: "MetaAdsDaily account rows: spend, impressions, clicks, linkClicks, leads" } };
}

function parsePayload(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function ga4SummaryValues(summary) {
  return {
    users: optionalNumber(summary?.users ?? summary?.visitors ?? summary?.activeUsers),
    sessions: optionalNumber(summary?.sessions),
    views: optionalNumber(summary?.pageviews ?? summary?.views ?? summary?.screenPageViews),
  };
}

function ga4SummaryComplete(summary) {
  const values = ga4SummaryValues(summary);
  return GA4_METRICS.every((metric) => values[metric] != null && Number.isFinite(values[metric]) && values[metric] >= 0);
}

async function readGa4Period(db, period, { propertyId }) {
  const values = makeValues(GA4_METRICS);
  const binding = sanitizeBinding(propertyId).replace(/^properties\//, "");
  if (!/^\d+$/.test(binding)) return { values, coverage: coverage("CrmGa4AnalyticsSnapshots", false, "ga4_property_binding_missing") };
  const row = first(await db.prepare(
    `SELECT payload_json,created_at FROM CrmGa4AnalyticsSnapshots
     WHERE tenant_id=? AND source_kind='ga4' AND source_id=? AND start_date=? AND end_date=?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(TENANT, binding, period.start, period.end).all());
  if (!row) return { values, coverage: coverage("CrmGa4AnalyticsSnapshots", false, "ga4_snapshot_missing") };
  const payload = parsePayload(row.payload_json);
  if (!isAdminKpiGa4PayloadBinding(payload, { tenantId: TENANT, propertyId: binding, startDate: period.start, endDate: period.end })) {
    return { values, coverage: coverage("CrmGa4AnalyticsSnapshots", false, "ga4_snapshot_binding_mismatch") };
  }
  const parsed = ga4SummaryValues(payload.summary || {});
  if (!isReusableAdminKpiGa4Snapshot(payload, { tenantId: TENANT, propertyId: binding, startDate: period.start, endDate: period.end })) {
    return { values, coverage: coverage("CrmGa4AnalyticsSnapshots", false, "ga4_snapshot_metric_missing") };
  }
  return { values: parsed, coverage: coverage("CrmGa4AnalyticsSnapshots", true), source: { name: "ga4", binding, fetchedAt: row.created_at || null } };
}

function addDerivedMeta(values) {
  return {
    ...values,
    ctr: values.impressions != null && values.impressions > 0 && values.linkClicks != null ? values.linkClicks / values.impressions * 100 : null,
    cpc: values.linkClicks != null && values.linkClicks > 0 && values.spend != null ? values.spend / values.linkClicks : null,
    cpl: values.leads != null && values.leads > 0 && values.spend != null ? values.spend / values.leads : null,
  };
}

async function aggregatePeriod(db, period, options) {
  const monthlyPreferred = PERIODS[options.periodKey].kind === "months";
  const [business, meta, ga4] = await Promise.all([
    readBusinessPeriod(db, period, { monthlyPreferred }),
    readMetaPeriod(db, period, options),
    readGa4Period(db, period, options),
  ]);
  const values = addDerivedMeta({ ...business.values, ...meta.values, ...ga4.values });
  return { values, budget: business.budget, coverage: { business: business.coverage, meta: meta.coverage, ga4: ga4.coverage }, sources: [business.source || { name: "business", binding: TENANT, fetchedAt: null }, meta.source || { name: "meta", binding: sanitizeBinding(options.accountId), fetchedAt: null }, ga4.source || { name: "ga4", binding: sanitizeBinding(options.propertyId).replace(/^properties\//, ""), fetchedAt: null }] };
}

export function buildMetricComparison(current, previous) {
  return Object.fromEntries(COMPARISON_METRICS.map((key) => {
    const currentValue = current[key] ?? null;
    const previousValue = previous[key] ?? null;
    return [key, {
      current: currentValue,
      previous: previousValue,
      delta: currentValue == null || previousValue == null ? null : currentValue - previousValue,
      direction: currentValue == null || previousValue == null ? "unavailable" : currentValue > previousValue ? "increase" : currentValue < previousValue ? "decrease" : "same",
    }];
  }));
}

function buildBudgetBands(current, previous) {
  return BUDGET_METRICS.map((metric, index) => ({
    name: BUDGET_BANDS[index],
    current: current[metric] == null ? null : current[metric],
    previous: previous[metric] == null ? null : previous[metric],
  })).filter((band) => band.current != null || band.previous != null);
}

function statusFromCoverage(coverageMap) {
  const values = Object.values(coverageMap).flatMap((item) => item && typeof item === "object" ? Object.values(item) : []);
  return values.some((item) => item?.complete === false) ? "insufficient" : "complete";
}

async function readOrganicBasis(db, resolved, options) {
  const basis = range(addDays(resolved.anchor, -15), resolved.anchor);
  const meta = await readMetaPeriod(db, basis, options);
  if (!meta.coverage.complete) {
    return { unitValue: null, range: `${dotDate(basis.start)}-${dotDate(basis.end)}`, formula: "최근 15일 Meta 광고비 ÷ Meta 리드", coverage: "최근 15일 Meta 저장 지표 부족", complete: false };
  }
  const spend = number(meta.values.spend);
  const leads = number(meta.values.leads);
  return {
    unitValue: leads > 0 ? spend / leads : null,
    range: `${dotDate(basis.start)}-${dotDate(basis.end)}`,
    formula: "최근 15일 Meta 광고비 ÷ Meta 리드",
    coverage: leads > 0 ? `Meta 리드 ${leads.toLocaleString("ko-KR")}건 기준` : "최근 15일 Meta 리드가 없어 산정 불가",
    spend,
    leads, complete: true,
  };
}

function buildOrganic(organicBasis, currentValues, currentCoverage, previousCoverage) {
  const cpl = currentValues.cpl;
  const organicCount = currentValues.organic;
  const covered = statusFromCoverage({ period: currentCoverage }) === "complete" && statusFromCoverage({ period: previousCoverage }) === "complete" && organicBasis.complete !== false;
  const savings = !covered || cpl == null || organicCount == null ? null : cpl * organicCount;
  return { ...organicBasis, savings };
}

function sourceBindingKey(metaAccountId, ga4PropertyId) {
  return `${sanitizeBinding(metaAccountId) || "none"}_${sanitizeBinding(ga4PropertyId).replace(/^properties\//, "") || "none"}`;
}

async function readKpiSnapshot(db, bucket, { tenantId, role, resolved, revision, metaAccountId, ga4PropertyId }) {
  if (!bucket?.get) return null;
  const key = `admin-kpi/${SNAPSHOT_VERSION}/${tenantId}/${role}/${sourceBindingKey(metaAccountId, ga4PropertyId)}/${resolved.key}/${resolved.anchor}/${revision}.json`;
  const row = first(await db.prepare(
    `SELECT r2_key,revision,expires_at,byte_size FROM AdminKpiSnapshotMeta
     WHERE tenant_id=? AND anchor=? AND period=? AND revision=? AND r2_key=? LIMIT 1`,
  ).bind(tenantId, resolved.anchor, resolved.key, revision, key).all());
  if (row?.r2_key !== key || !Number.isSafeInteger(Number(row.byte_size)) || Number(row.byte_size) <= 0 || Number(row.byte_size) > MAX_RESPONSE_BYTES || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return null;
  const object = await bucket.get(row.r2_key).catch(() => null);
  if (!object) return null;
  try {
    const payload = await object.json();
    const actualBytes = object.size ?? object.contentLength ?? object.httpMetadata?.contentLength;
    if (actualBytes != null && Number(actualBytes) !== Number(row.byte_size)) return null;
    const sources = payload?.sourceStatus?.sources || [];
    const expected = { meta: metaBindingCandidates(metaAccountId), ga4: sanitizeBinding(ga4PropertyId).replace(/^properties\//, "") };
    if (payload?.tenantId !== tenantId || payload?.period?.key !== resolved.key || payload?.period?.anchor !== resolved.anchor || payload?.cache?.revision !== revision || !expected.meta.includes(sources.find((source) => source.name === "meta")?.binding) || sources.find((source) => source.name === "ga4")?.binding !== expected.ga4) return null;
    return { ...payload, cache: { ...(payload.cache || {}), snapshot: "hit" } };
  } catch {
    return null;
  }
}

async function writeKpiSnapshot(db, bucket, { tenantId, role, resolved, revision, payload, metaAccountId, ga4PropertyId }) {
  if (!bucket?.put) return;
  const key = `admin-kpi/${SNAPSHOT_VERSION}/${tenantId}/${role}/${sourceBindingKey(metaAccountId, ga4PropertyId)}/${resolved.key}/${resolved.anchor}/${revision}.json`;
  const body = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(body).byteLength;
  if (bytes > MAX_RESPONSE_BYTES) throw new Error("kpi_response_limit");
  await bucket.put(key, body, { httpMetadata: { contentType: "application/json" } }).catch(() => null);
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO AdminKpiSnapshotMeta(id,tenant_id,anchor,period,revision,r2_key,byte_size,created_at,expires_at)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(tenant_id,anchor,period,revision) DO UPDATE SET r2_key=excluded.r2_key,byte_size=excluded.byte_size,created_at=excluded.created_at,expires_at=excluded.expires_at`,
  ).bind(`${tenantId}:${role}:${resolved.key}:${resolved.anchor}:${revision}`, tenantId, resolved.anchor, resolved.key, revision, key, bytes, now, new Date(Date.now() + CACHE_TTL_MS).toISOString()).run();
}

export async function buildAdminKpi(db, {
  tenantId = TENANT, period = "7", anchor, now = new Date(), r2 = null,
  metaAccountId = "", ga4PropertyId = "", role = "owner", revision = null,
} = {}) {
  if (tenantId !== TENANT) throw new Error("kpi_tenant_not_authorized");
  const resolved = resolveKpiPeriod(period, anchor, now);
  const rev = revision == null ? await readAdminKpiRevision(db, tenantId) : revision;
  const snapshot = await readKpiSnapshot(db, r2, { tenantId, role, resolved, revision: rev, metaAccountId, ga4PropertyId });
  if (snapshot) return snapshot;
  const options = { periodKey: period, metaAccountId, accountId: metaAccountId, ga4PropertyId, propertyId: ga4PropertyId };
  const [current, previous, organicBasis] = await Promise.all([
    aggregatePeriod(db, resolved.current, options),
    aggregatePeriod(db, resolved.previous, options),
    readOrganicBasis(db, resolved, options),
  ]);
  const coverageMap = { current: current.coverage, previous: previous.coverage };
  const payload = {
    tenantId,
    timezone: "Asia/Seoul",
    period: resolved,
    range: { label: `현재 ${dotDate(resolved.current.start)}-${dotDate(resolved.current.end)} · 이전 ${dotDate(resolved.previous.start)}-${dotDate(resolved.previous.end)}` },
    metrics: buildMetricComparison(current.values, previous.values),
    organic: buildOrganic(organicBasis, current.values, current.coverage, previous.coverage),
    coverage: { ...coverageMap, status: statusFromCoverage(coverageMap) },
    sourceStatus: { label: "저장된 지표 기준", sources: current.sources || [] },
    budgetBands: buildBudgetBands(current.budget, previous.budget),
    limits: { maxSourceDays: MAX_SOURCE_DAYS, maxRollupRows: MAX_ROLLUP_ROWS, maxResponseBytes: MAX_RESPONSE_BYTES, cacheTtlSeconds: 60 },
    cache: { revision: rev, snapshot: "miss" },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bytes > MAX_RESPONSE_BYTES) throw new Error("kpi_response_limit");
  await writeKpiSnapshot(db, r2, { tenantId, role, resolved, revision: rev, payload, metaAccountId, ga4PropertyId });
  return payload;
}

const cacheByDb = new WeakMap();
function cacheFor(db) {
  let cache = cacheByDb.get(db);
  if (!cache) { cache = new Map(); cacheByDb.set(db, cache); }
  return cache;
}

export async function readAdminKpiRevision(db, tenant = TENANT) {
  const row = first(await db.prepare("SELECT version FROM CrmDataRevisions WHERE tenant_id=?").bind(tenant).all());
  return number(row?.version);
}

export async function readAdminKpiCached(db, options = {}) {
  const tenantId = options.tenantId || TENANT;
  const role = options.role || "owner";
  const rev = await readAdminKpiRevision(db, tenantId);
  const key = `${tenantId}:${role}:${options.period || "7"}:${options.anchor || ""}:${rev}:${sanitizeBinding(options.metaAccountId)}:${sanitizeBinding(options.ga4PropertyId)}`;
  const cache = cacheFor(db);
  const now = Date.now();
  for (const [entryKey, entry] of cache) if (entry.expires <= now) cache.delete(entryKey);
  const found = cache.get(key);
  if (found?.value) return { ...found.value, cache: { ...(found.value.cache || {}), hit: true, revision: rev } };
  if (found?.pending) return { ...(await found.pending), cache: { hit: false, coalesced: true, revision: rev } };
  while (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  const entry = { pending: buildAdminKpi(db, { ...options, tenantId, role, revision: rev }) };
  cache.set(key, entry);
  try {
    entry.value = await entry.pending;
    entry.expires = Date.now() + CACHE_TTL_MS;
    delete entry.pending;
    return { ...entry.value, cache: { ...(entry.value.cache || {}), hit: false, revision: rev } };
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export const ADMIN_KPI_CONTRACT = Object.freeze({
  tenant: TENANT,
  periods: Object.keys(PERIODS),
  timezone: "Asia/Seoul",
  currency: { ads: "USD", contracts: "KRW" },
  organic: "Naver/Google/ChatGPT search-originated homepage submissions; paid and Instagram excluded",
  data: {
    business: "AdminKpiDaily/AdminKpiMonthly produced by bounded jobs",
    meta: "MetaAdsDaily account rows for META_AD_ACCOUNT_ID",
    ga4: "CrmGa4AnalyticsSnapshots exact periods for GA4_PROPERTY_ID",
  },
  cache: { ttlSeconds: 60, maxEntries: CACHE_LIMIT, key: "tenant+role+anchor+period+revision+source-bindings" },
});
