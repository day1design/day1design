import { dateRange } from "./crm-analytics.js";
import { metaCreativeThumbKey } from "./crm-meta-preview.js";

const ALLOWED_TENANT = "day1design";
const MAX_DAYS = 31;
const MAX_LIMIT = 20;
const MAX_CURSOR = 64;
const CREATIVE_COLUMNS = Object.freeze({
  title: ["CreativeTitle", "TitleText"],
  body: ["CreativeBody", "BodyText"],
  callToAction: ["CreativeCallToAction", "CallToAction"],
  linkUrl: ["CreativeLinkUrl", "LinkUrl"],
  variants: ["CreativeVariants"],
  videoId: ["VideoId", "CreativeVideoId"],
});
const CACHE_TTL_MS = 300_000;
const CACHE_MAX_ENTRIES = 16;
const CACHE_MAX_INFLIGHT = 8;
const CACHE_MAX_BYTES = 512 * 1024;
const MAX_SOURCE_ROWS = 620;
const cacheStates = new WeakMap();

function id(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function rowsOf(result) { return result?.results || (Array.isArray(result) ? result : []); }
function finite(value) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { const s = String(value ?? "").trim(); return s ? s.slice(0, 2000) : null; }
function metric(numerator, denominator) {
  const n = finite(numerator); const d = finite(denominator);
  return n !== null && d !== null && d > 0 ? n / d : null;
}
function variants(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.slice(0, 32).map((item) => ({ type: text(item?.type), source: text(item?.source), title: text(item?.title), body: text(item?.body), callToAction: text(item?.callToAction), linkUrl: text(item?.linkUrl) })) : [];
  } catch (_) { return []; }
}

async function tableColumns(db) {
  const result = await db.prepare(`PRAGMA table_info("MetaAdsAd")`).all();
  return new Set(rowsOf(result).map((row) => String(row.name || "")));
}

async function queryAll(db, sql, bindings) {
  let statement = db.prepare(sql);
  if (typeof statement.bind === "function") return statement.bind(...bindings).all();
  return statement.all ? statement.all(...bindings) : [];
}

function selectedCreativeColumns(columns) {
  return Object.fromEntries(Object.entries(CREATIVE_COLUMNS).map(([key, candidates]) => [key, candidates.find((name) => columns.has(name)) || null]));
}

function validate({ tenantId, startDate, endDate, limit = 20, cursor = "", currency = "USD" }) {
  if (String(tenantId) !== ALLOWED_TENANT) throw new Error("meta_ad_cards_tenant_not_authorized");
  const range = dateRange(startDate, endDate);
  if (range.days > MAX_DAYS) throw new Error("meta_ad_cards_period_exceeded");
  const boundedLimit = Math.max(1, Math.min(MAX_LIMIT, Number.parseInt(limit, 10) || MAX_LIMIT));
  const normalizedCursor = String(cursor || "");
  if (normalizedCursor.length > MAX_CURSOR || (normalizedCursor && !/^\d+$/.test(normalizedCursor))) throw new Error("meta_ad_cards_cursor_invalid");
  const normalizedCurrency = /^[A-Z]{3}$/.test(String(currency)) ? String(currency) : "USD";
  return { range, limit: boundedLimit, cursor: normalizedCursor, currency: normalizedCurrency };
}

function card(row, daily, currency) {
  const creativeVariants = variants(row.creativeVariants);
  const impressions = finite(row.impressions);
  const clicks = finite(row.clicks);
  const linkClicks = finite(row.linkClicks);
  const spend = finite(row.spend);
  const leads = finite(row.leads);
  return {
    adId: String(row.adId || ""), adName: text(row.adName) || "미확인 광고",
    campaign: { id: text(row.campaignId), name: text(row.campaignName) },
    adset: { id: text(row.adsetId), name: text(row.adsetName) },
    status: text(row.status),
    creative: {
      id: text(row.creativeId), type: text(row.creativeType), thumbnailUrl: null,
      thumbnailRef: row.creativeId ? { creativeId: text(row.creativeId), key: metaCreativeThumbKey(row.creativeId) } : null,
      title: text(row.creativeTitle), body: text(row.creativeBody), callToAction: text(row.creativeCallToAction), linkUrl: text(row.creativeLinkUrl),
      videoId: text(row.creativeVideoId),
      variants: creativeVariants,
      contentAvailability: row.creativeTitle || row.creativeBody || row.creativeCallToAction || row.creativeLinkUrl || creativeVariants.length ? "stored" : "unavailable",
    },
    metrics: { impressions, clicks, linkClicks, spend, leads, currency, ctr: metric(linkClicks, impressions), cpc: metric(spend, linkClicks), cpl: metric(spend, leads), cpm: metric(spend === null ? null : spend * 1000, impressions) },
    daily,
  };
}

export async function readCrmMetaAdCards(db, options = {}) {
  if (!db?.prepare) throw new Error("meta_ad_cards_db_required");
  const { range, limit, cursor, currency } = validate(options);
  const tenantId = String(options.tenantId);
  const columns = await tableColumns(db);
  const required = ["CrmTenantId", "Date", "AdId", "AdName", "AdsetId", "AdsetName", "CampaignId", "CampaignName", "CreativeId", "CreativeType", "ThumbnailUrl", "Status", "Impressions", "Clicks", "LinkClicks", "Spend", "Leads"];
  const missing = required.filter((name) => !columns.has(name));
  if (missing.length) return { available: false, reason: "meta_ad_columns_missing", missing, cards: [], nextCursor: null };
  const creative = selectedCreativeColumns(columns);
  const dates = Array.from({ length: range.days }, (_, index) => new Date(Date.parse(`${range.startDate}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
  const candidateIds = new Set();
  for (let offset = 0; offset < dates.length; offset += 5) {
    const chunk = dates.slice(offset, offset + 5);
    const candidateCtes = chunk.map((_, index) => `d${index} AS (SELECT AdId AS adId FROM MetaAdsAd INDEXED BY idx_meta_ads_ad_tenant_date_adid WHERE CrmTenantId=? AND Date=? AND AdId>? ORDER BY AdId ASC LIMIT ${limit + 1})`).join(",");
    const candidateUnion = chunk.map((_, index) => `SELECT adId FROM d${index}`).join(" UNION ALL ");
    const rows = rowsOf(await queryAll(db, `WITH ${candidateCtes} SELECT DISTINCT adId FROM (${candidateUnion}) ORDER BY adId ASC LIMIT ${limit + 1}`, chunk.flatMap((date) => [tenantId, date, cursor || ""])));
    for (const row of rows) { const adId = String(row.adId || ""); if (adId) candidateIds.add(adId); }
  }
  const idRows = [...candidateIds].sort().slice(0, limit + 1).map((adId) => ({ adId }));
  const ids = idRows.slice(0, limit).map((row) => row.adId);
  const nextCursor = idRows.length > limit ? ids[ids.length - 1] : null;
  if (!ids.length) return { available: true, period: { start: range.startDate, end: range.endDate, timezone: "Asia/Seoul" }, limit, cards: [], nextCursor: null, creativeColumns: creative, currency };
  const selected = ids.map(() => "?").join(",");
  const sourceRows = rowsOf(await queryAll(db, `SELECT Date AS date,AdId AS adId,AdName AS adName,AdsetId AS adsetId,AdsetName AS adsetName,CampaignId AS campaignId,CampaignName AS campaignName,CreativeId AS creativeId,CreativeType AS creativeType,ThumbnailUrl AS thumbnailUrl,Status AS status,${Object.entries(creative).map(([key, column]) => column ? `${id(column)} AS creative_${key}` : `NULL AS creative_${key}`).join(",")},Impressions AS impressions,Clicks AS clicks,LinkClicks AS linkClicks,Spend AS spend,Leads AS leads FROM MetaAdsAd INDEXED BY idx_meta_ads_ad_tenant_adid_date WHERE CrmTenantId=? AND Date BETWEEN ? AND ? AND AdId IN (${selected}) ORDER BY AdId ASC,Date ASC LIMIT ${MAX_SOURCE_ROWS + 1}`, [tenantId, range.startDate, range.endDate, ...ids]));
  if (sourceRows.length > MAX_SOURCE_ROWS) return { available: false, reason: "meta_ad_source_cap_exceeded", period: { start: range.startDate, end: range.endDate, timezone: "Asia/Seoul" }, cards: [], nextCursor: null };
  const aggregates = new Map(ids.map((adId) => [adId, { adId, impressions: null, clicks: null, linkClicks: null, spend: null, leads: null, latest: null, daily: new Map(), missing: new Set() }]));
  for (const row of sourceRows) {
    const key = String(row.adId); const aggregate = aggregates.get(key); if (!aggregate) continue;
    const daily = { date: String(row.date) };
    if (aggregate.daily.has(daily.date)) return { available: false, reason: 'meta_ad_duplicate_day', cards: [], nextCursor: null };
    for (const field of ["impressions", "clicks", "linkClicks", "spend", "leads"]) {
      const value = finite(row[field]);
      daily[field] = value;
      if (value === null) aggregate.missing.add(field);
      else aggregate[field] = (aggregate[field] ?? 0) + value;
    }
    aggregate.daily.set(String(row.date), daily);
    if (!aggregate.latest || String(row.date) >= String(aggregate.latest.date)) aggregate.latest = row;
  }
  const page = ids.map((adId) => { const aggregate = aggregates.get(adId); for (const field of aggregate.missing) aggregate[field] = null; const latest = aggregate.latest || {}; return { ...latest, adId, ...aggregate }; });
  const dailyByAd = new Map(ids.map((adId) => [adId, [...aggregates.get(adId).daily.values()].map((row) => ({ ...row, impressions: finite(row.impressions), clicks: finite(row.clicks), linkClicks: finite(row.linkClicks), spend: finite(row.spend), leads: finite(row.leads) }))]));
  return { available: true, period: { start: range.startDate, end: range.endDate, timezone: "Asia/Seoul" }, limit, cards: page.map((row) => card({ ...row, creativeTitle: row.creative_title, creativeBody: row.creative_body, creativeCallToAction: row.creative_callToAction, creativeLinkUrl: row.creative_linkUrl, creativeVariants: row.creative_variants, creativeVideoId: row.creative_videoId }, dailyByAd.get(String(row.adId)) || [], currency)), nextCursor, creativeColumns: creative, currency };
}

export async function readCachedCrmMetaAdCards(db, options = {}) {
  const { now = Date.now(), ...query } = options;
  const normalized = validate(query);
  const cacheQuery = { tenantId: ALLOWED_TENANT, startDate: normalized.range.startDate, endDate: normalized.range.endDate, limit: normalized.limit, cursor: normalized.cursor, currency: normalized.currency };
  const state = cacheStates.get(db) || { entries: new Map(), inflight: new Map() };
  cacheStates.set(db, state);
  const key = JSON.stringify(cacheQuery);
  const hit = state.entries.get(key);
  if (hit && now - hit.createdAt < CACHE_TTL_MS) {
    state.entries.delete(key); state.entries.set(key, hit);
    return JSON.parse(hit.serialized);
  }
  if (hit) state.entries.delete(key);
  if (state.inflight.has(key)) return state.inflight.get(key);
  if (state.inflight.size >= CACHE_MAX_INFLIGHT) throw new Error("meta_ad_cards_cache_busy");
  const task = readCrmMetaAdCards(db, cacheQuery).then((value) => {
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > CACHE_MAX_BYTES) return { available: false, reason: "meta_ad_response_cap_exceeded", cards: [], nextCursor: null };
    state.entries.set(key, { serialized, createdAt: now });
    while (state.entries.size > CACHE_MAX_ENTRIES) state.entries.delete(state.entries.keys().next().value);
    return value;
  }).finally(() => state.inflight.delete(key));
  state.inflight.set(key, task);
  return task;
}

export const CRM_META_AD_CARDS_CONTRACT = Object.freeze({ tenant: ALLOWED_TENANT, maxDays: MAX_DAYS, maxLimit: MAX_LIMIT, maxSourceRows: MAX_SOURCE_ROWS, cursor: "AdId keyset", daily: "date × ad aggregate", cache: "5 minute TTL, 16-entry LRU, 8 inflight, 512KB serialized cap" });
