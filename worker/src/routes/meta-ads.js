// Meta Ads — D1 영속화 + cron 백필
//
// 핵심 원칙:
// - 어드민 페이지 = D1 read-only (Meta API 직접 호출 X)
// - Meta API 호출은 cron 또는 명시적 backfill 만
// - 같은 날짜·엔티티는 UPSERT (UNIQUE INDEX 기반 REPLACE)
// - rate limit 도달 시 텔레그램 + MetaSyncLog 기록 후 종료
//
// 광고계정 timezone = Asia/Seoul, 데이터는 광고계정 timezone 기준 일자
// 따라서 별도 timezone 변환 불필요 (Meta가 date_start 기준으로 보냄)

import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin, timingSafeEqual } from "../lib/auth.js";
import { notifyTelegram } from "../lib/telegram.js";
import { generateId, d1Create, d1Update } from "../lib/d1.js";

const META_API_VERSION = "v18.0";
const CAMPAIGN_FIELDS = "campaign_id,campaign_name";
const AD_FIELDS = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name";
const INSIGHT_METRICS = [
  "impressions",
  "clicks",
  "spend",
  "ctr",
  "cpc",
  "reach",
  "frequency",
  "actions",
  "inline_link_clicks",
  "unique_clicks",
  "unique_inline_link_clicks",
  "cost_per_inline_link_click",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
  "video_thruplay_watched_actions",
].join(",");
const CAMPAIGN_META_FIELDS =
  "id,name,status,objective,daily_budget,lifetime_budget";
const AD_META_FIELDS =
  "id,name,status,creative{id,thumbnail_url,object_type,video_id,image_url}";

// ─── 어드민 라우터 ────────────────────────────────────────
export async function handleMetaAds(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/meta-ads/, "") || "/";

  // 백필은 internal secret 으로도 호출 가능 (수동 백필·cron 보조용)
  // verifyAdmin 우회 조건: X-Internal-Secret 헤더가 env.META_INTERNAL_SECRET 와 일치
  const isBackfillRoute = path === "/backfill" && request.method === "POST";
  const internalSecret = request.headers.get("x-internal-secret") || "";
  const internalOk =
    isBackfillRoute &&
    env.META_INTERNAL_SECRET &&
    timingSafeEqual(internalSecret, env.META_INTERNAL_SECRET);

  if (!internalOk && !(await verifyAdmin(request, env))) {
    return jsonError(401, "Unauthorized");
  }

  // GET /api/meta-ads/summary?days=30 — D1 read-only
  if (path === "/summary" && request.method === "GET") {
    return getSummary(request, env);
  }

  // GET /api/meta-ads/campaigns?days=30 — 캠페인별 집계
  if (path === "/campaigns" && request.method === "GET") {
    return listCampaigns(request, env);
  }

  // GET /api/meta-ads/daily?days=30 — 일별 추이
  if (path === "/daily" && request.method === "GET") {
    return listDaily(request, env);
  }

  // GET /api/meta-ads/sync-log — 최근 동기화 이력
  if (path === "/sync-log" && request.method === "GET") {
    return listSyncLog(env);
  }

  // GET /api/meta-ads/ads?range=30&sort=spend&order=top — 광고별 효율
  if (path === "/ads" && request.method === "GET") {
    return listAds(request, env);
  }

  // GET /api/meta-ads/breakdown?range=30&dim=platform — 분해 통계
  if (path === "/breakdown" && request.method === "GET") {
    return listBreakdown(request, env);
  }

  // GET /api/meta-ads/dow?range=30 — 요일별 집계
  if (path === "/dow" && request.method === "GET") {
    return listDow(request, env);
  }

  // GET /api/meta-ads/hour-heatmap?range=30 — 요일×시간대 히트맵
  if (path === "/hour-heatmap" && request.method === "GET") {
    return listHourHeatmap(request, env);
  }

  // GET /api/meta-ads/efficiency?range=30 — 효율 변화 추이 (CPM·CPC·CPL)
  if (path === "/efficiency" && request.method === "GET") {
    return getEfficiency(request, env);
  }

  // POST /api/meta-ads/backfill — 초기 백필 (2026-02-02 ~ 어제)
  if (path === "/backfill" && request.method === "POST") {
    return runBackfill(request, env, ctx);
  }

  return jsonError(404, "Not Found");
}

// ─── Cron 자동 sync — 최근 3일치 (attribution window 보정) ──
// Meta 광고는 며칠 뒤에 전환이 소급 추가될 수 있어서 매일 3일치 UPSERT.
// 같은 (Date, Level, EntityId) 는 덮어쓰기라 row 수 안 늘어남, 수치만 보정.
// API 호출은 time_range 한 번에 처리라 비용 동일.
export async function runScheduledSync(env, ctx) {
  const end = kstYesterday();
  const start = kstDaysAgo(3);
  return syncRange(env, ctx, start, end, "cron");
}

// ─── 사용자 응답 (D1 read-only) ───────────────────────────
async function getSummary(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;

  try {
    // account 레벨 일별 합계 (영상 메트릭 포함)
    const totals = await env.DB.prepare(
      `SELECT
         COALESCE(SUM(Impressions), 0) AS Impressions,
         COALESCE(SUM(Clicks), 0) AS Clicks,
         COALESCE(SUM(LinkClicks), 0) AS LinkClicks,
         COALESCE(SUM(Spend), 0) AS Spend,
         COALESCE(SUM(Reach), 0) AS Reach,
         COALESCE(SUM(Leads), 0) AS Leads,
         COALESCE(SUM(VideoP25Watched), 0) AS VideoP25,
         COALESCE(SUM(VideoP50Watched), 0) AS VideoP50,
         COALESCE(SUM(VideoP75Watched), 0) AS VideoP75,
         COALESCE(SUM(VideoP100Watched), 0) AS VideoP100,
         COALESCE(SUM(ThruPlay), 0) AS ThruPlay,
         COALESCE(AVG(NULLIF(VideoAvgWatchSec, 0)), 0) AS AvgWatchSec,
         COUNT(DISTINCT Date) AS Days
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?`,
    )
      .bind(startDate, endDate)
      .first();

    // 마지막 동기화 시각
    const lastSync = await env.DB.prepare(
      `SELECT CompletedAt FROM MetaSyncLog
       WHERE Status = 'success'
       ORDER BY CompletedAt DESC LIMIT 1`,
    ).first();

    const imps = Number(totals?.Impressions || 0);
    const clicks = Number(totals?.Clicks || 0);
    const spend = Number(totals?.Spend || 0);
    return jsonOk({
      range,
      summary: {
        impressions: imps,
        clicks,
        linkClicks: Number(totals?.LinkClicks || 0),
        spend,
        reach: Number(totals?.Reach || 0),
        leads: Number(totals?.Leads || 0),
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: Number(totals?.Leads || 0) > 0 ? spend / Number(totals.Leads) : 0,
        videoP25: Number(totals?.VideoP25 || 0),
        videoP50: Number(totals?.VideoP50 || 0),
        videoP75: Number(totals?.VideoP75 || 0),
        videoP100: Number(totals?.VideoP100 || 0),
        thruPlay: Number(totals?.ThruPlay || 0),
        avgWatchSec: Number(totals?.AvgWatchSec || 0),
      },
      lastSyncedAt: lastSync?.CompletedAt || "",
    });
  } catch (e) {
    return jsonError(500, "summary failed: " + (e.message || "").slice(0, 100));
  }
}

async function listCampaigns(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;

  try {
    const res = await env.DB.prepare(
      `SELECT
         EntityId,
         MAX(EntityName) AS EntityName,
         MAX(Status) AS Status,
         MAX(Objective) AS Objective,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(LinkClicks) AS LinkClicks,
         SUM(Spend) AS Spend,
         SUM(Reach) AS Reach,
         SUM(Leads) AS Leads,
         COUNT(*) AS DayCount
       FROM MetaAdsDaily
       WHERE Level = 'campaign' AND Date BETWEEN ? AND ?
       GROUP BY EntityId
       ORDER BY Spend DESC`,
    )
      .bind(startDate, endDate)
      .all();
    const campaigns = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        id: r.EntityId,
        name: r.EntityName || "",
        status: r.Status || "",
        objective: r.Objective || "",
        impressions: imps,
        clicks,
        linkClicks: Number(r.LinkClicks || 0),
        spend,
        reach: Number(r.Reach || 0),
        leads,
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0,
      };
    });
    return jsonOk({ range, campaigns });
  } catch (e) {
    return jsonError(
      500,
      "campaigns failed: " + (e.message || "").slice(0, 100),
    );
  }
}

async function listDaily(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;

  try {
    const res = await env.DB.prepare(
      `SELECT
         Date,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(Spend) AS Spend,
         SUM(Leads) AS Leads
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?
       GROUP BY Date
       ORDER BY Date ASC`,
    )
      .bind(startDate, endDate)
      .all();
    return jsonOk({
      range,
      rows: (res.results || []).map((r) => ({
        date: r.Date,
        impressions: Number(r.Impressions || 0),
        clicks: Number(r.Clicks || 0),
        spend: Number(r.Spend || 0),
        leads: Number(r.Leads || 0),
      })),
    });
  } catch (e) {
    return jsonError(500, "daily failed: " + (e.message || "").slice(0, 100));
  }
}

async function listSyncLog(env) {
  try {
    const res = await env.DB.prepare(
      `SELECT SyncType, Status, DateRangeStart, DateRangeEnd,
              ApiCallsUsed, RecordsUpdated, ErrorCode, ErrorMessage,
              StartedAt, CompletedAt
       FROM MetaSyncLog
       ORDER BY CreatedAt DESC LIMIT 30`,
    ).all();
    return jsonOk({ logs: res.results || [] });
  } catch (e) {
    return jsonError(500, "sync log failed");
  }
}

// ─── 광고별 효율 (Ad Level) ────────────────────────────
async function listAds(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const sortField = (url.searchParams.get("sort") || "spend").toLowerCase();
  const order = (url.searchParams.get("order") || "top").toLowerCase();
  const limit = Math.max(
    1,
    Math.min(100, parseInt(url.searchParams.get("limit") || "20", 10)),
  );
  const sortMap = {
    spend: "Spend",
    cpl: "CPL",
    ctr: "Ctr",
    impressions: "Impressions",
    leads: "Leads",
  };
  const sortCol = sortMap[sortField] || "Spend";
  const direction = order === "bottom" ? "ASC" : "DESC";

  try {
    const res = await env.DB.prepare(
      `SELECT
         AdId,
         MAX(AdName) AS AdName,
         MAX(AdsetId) AS AdsetId,
         MAX(AdsetName) AS AdsetName,
         MAX(CampaignId) AS CampaignId,
         MAX(CampaignName) AS CampaignName,
         MAX(CreativeId) AS CreativeId,
         MAX(CreativeType) AS CreativeType,
         MAX(ThumbnailUrl) AS ThumbnailUrl,
         MAX(Status) AS Status,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(LinkClicks) AS LinkClicks,
         SUM(Spend) AS Spend,
         SUM(Reach) AS Reach,
         SUM(Leads) AS Leads,
         SUM(ThruPlay) AS ThruPlay,
         CASE WHEN SUM(Impressions) > 0
              THEN CAST(SUM(Clicks) AS REAL) / SUM(Impressions) * 100
              ELSE 0 END AS Ctr,
         CASE WHEN SUM(LinkClicks) > 0
              THEN SUM(Spend) / SUM(LinkClicks)
              ELSE 0 END AS Cpc,
         CASE WHEN SUM(Leads) > 0
              THEN SUM(Spend) / SUM(Leads)
              ELSE 0 END AS CPL
       FROM MetaAdsAd
       WHERE Date BETWEEN ? AND ?
       GROUP BY AdId
       HAVING Impressions > 0
       ORDER BY ${sortCol} ${direction}
       LIMIT ?`,
    )
      .bind(range.startDate, range.endDate, limit)
      .all();

    const ads = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        adId: String(r.AdId || ""),
        adName: String(r.AdName || ""),
        adsetId: String(r.AdsetId || ""),
        adsetName: String(r.AdsetName || ""),
        campaignId: String(r.CampaignId || ""),
        campaignName: String(r.CampaignName || ""),
        creativeId: String(r.CreativeId || ""),
        creativeType: String(r.CreativeType || ""),
        thumbnailUrl: String(r.ThumbnailUrl || ""),
        status: String(r.Status || ""),
        impressions: imps,
        clicks,
        linkClicks: Number(r.LinkClicks || 0),
        spend,
        reach: Number(r.Reach || 0),
        leads,
        thruPlay: Number(r.ThruPlay || 0),
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0,
      };
    });
    return jsonOk({ range, ads });
  } catch (e) {
    return jsonError(500, "ads failed: " + (e.message || "").slice(0, 100));
  }
}

// ─── breakdown (5종) 통계 ──────────────────────────────
async function listBreakdown(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const dim = String(url.searchParams.get("dim") || "platform");
  const limit = Math.max(
    1,
    Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)),
  );
  try {
    const res = await env.DB.prepare(
      `SELECT
         DimensionValue,
         MAX(DimensionSub) AS DimensionSub,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(LinkClicks) AS LinkClicks,
         SUM(Spend) AS Spend,
         SUM(Reach) AS Reach,
         SUM(Leads) AS Leads
       FROM MetaAdsBreakdown
       WHERE Date BETWEEN ? AND ? AND Dimension = ?
       GROUP BY DimensionValue
       ORDER BY Spend DESC
       LIMIT ?`,
    )
      .bind(range.startDate, range.endDate, dim, limit)
      .all();
    const rows = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        value: String(r.DimensionValue || ""),
        sub: String(r.DimensionSub || ""),
        impressions: imps,
        clicks,
        linkClicks: Number(r.LinkClicks || 0),
        spend,
        reach: Number(r.Reach || 0),
        leads,
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0,
      };
    });
    return jsonOk({ range, dimension: dim, rows });
  } catch (e) {
    return jsonError(
      500,
      "breakdown failed: " + (e.message || "").slice(0, 100),
    );
  }
}

// ─── 요일별 집계 (account 일별 → strftime 요일 추출) ───
async function listDow(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  try {
    const res = await env.DB.prepare(
      `SELECT
         strftime('%w', Date) AS Dow,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(Spend) AS Spend,
         SUM(Leads) AS Leads,
         COUNT(*) AS Days
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?
       GROUP BY Dow
       ORDER BY Dow`,
    )
      .bind(range.startDate, range.endDate)
      .all();
    const rows = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        dow: Number(r.Dow), // 0=일, 1=월, ...
        impressions: imps,
        clicks,
        spend,
        leads,
        days: Number(r.Days || 0),
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0,
      };
    });
    return jsonOk({ range, rows });
  } catch (e) {
    return jsonError(500, "dow failed: " + (e.message || "").slice(0, 100));
  }
}

// ─── 시간대 × 요일 히트맵 (hour breakdown × date의 요일) ───
async function listHourHeatmap(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  try {
    const res = await env.DB.prepare(
      `SELECT
         strftime('%w', Date) AS Dow,
         DimensionValue AS Hour,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(Spend) AS Spend,
         SUM(Leads) AS Leads
       FROM MetaAdsBreakdown
       WHERE Dimension = 'hour' AND Date BETWEEN ? AND ?
       GROUP BY Dow, Hour
       ORDER BY Dow, Hour`,
    )
      .bind(range.startDate, range.endDate)
      .all();
    const cells = (res.results || []).map((r) => ({
      dow: Number(r.Dow),
      hour: Number(r.Hour),
      impressions: Number(r.Impressions || 0),
      clicks: Number(r.Clicks || 0),
      spend: Number(r.Spend || 0),
      leads: Number(r.Leads || 0),
    }));
    return jsonOk({ range, cells });
  } catch (e) {
    return jsonError(
      500,
      "hour heatmap failed: " + (e.message || "").slice(0, 100),
    );
  }
}

// ─── 효율 변화 추이 (CPM/CPC/CPL + 전기 대비) ───────────
async function getEfficiency(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;

  // 이전 동일 기간 (전기) 계산
  const days = daysBetween(startDate, endDate);
  const prevEnd = addDays(startDate, -1);
  const prevStart = addDays(prevEnd, -(days - 1));

  try {
    const curr = await aggregateAccount(env, startDate, endDate);
    const prev = await aggregateAccount(env, prevStart, prevEnd);

    // 일별 시계열 (CPM/CPC/CPL)
    const seriesRes = await env.DB.prepare(
      `SELECT
         Date,
         Impressions,
         Clicks,
         LinkClicks,
         Spend,
         Leads
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?
       ORDER BY Date ASC`,
    )
      .bind(startDate, endDate)
      .all();
    const daily = (seriesRes.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const linkClicks = Number(r.LinkClicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        date: r.Date,
        cpm: imps > 0 ? (spend / imps) * 1000 : 0,
        cpc: linkClicks > 0 ? spend / linkClicks : 0,
        cpl: leads > 0 ? spend / leads : 0,
        impressions: imps,
        clicks,
        spend,
        leads,
      };
    });

    return jsonOk({
      range,
      previous: { startDate: prevStart, endDate: prevEnd },
      current: curr,
      prevTotals: prev,
      daily,
    });
  } catch (e) {
    return jsonError(
      500,
      "efficiency failed: " + (e.message || "").slice(0, 100),
    );
  }
}

async function aggregateAccount(env, startDate, endDate) {
  const row = await env.DB.prepare(
    `SELECT
       SUM(Impressions) AS Impressions,
       SUM(Clicks) AS Clicks,
       SUM(LinkClicks) AS LinkClicks,
       SUM(Spend) AS Spend,
       SUM(Leads) AS Leads
     FROM MetaAdsDaily
     WHERE Level = 'account' AND Date BETWEEN ? AND ?`,
  )
    .bind(startDate, endDate)
    .first();
  const imps = Number(row?.Impressions || 0);
  const clicks = Number(row?.Clicks || 0);
  const linkClicks = Number(row?.LinkClicks || 0);
  const spend = Number(row?.Spend || 0);
  const leads = Number(row?.Leads || 0);
  return {
    impressions: imps,
    clicks,
    linkClicks,
    spend,
    leads,
    cpm: imps > 0 ? (spend / imps) * 1000 : 0,
    cpc: linkClicks > 0 ? spend / linkClicks : 0,
    cpl: leads > 0 ? spend / leads : 0,
    ctr: imps > 0 ? clicks / imps : 0,
  };
}

function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((db - da) / 86400000) + 1);
}
function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── 백필 / Cron sync 공통 ───────────────────────────────
async function runBackfill(request, env, ctx) {
  let body = {};
  try {
    body = await request.json();
  } catch {}
  const startDate = String(body.startDate || "2026-02-02");
  const endDate = String(body.endDate || kstYesterday());
  return syncRange(env, ctx, startDate, endDate, "backfill");
}

async function syncRange(env, ctx, startDate, endDate, syncType) {
  const startedAt = new Date().toISOString();
  const log = {
    SyncType: syncType,
    Status: "running",
    DateRangeStart: startDate,
    DateRangeEnd: endDate,
    ApiCallsUsed: 0,
    RecordsUpdated: 0,
    ErrorCode: "",
    ErrorMessage: "",
    StartedAt: startedAt,
    CompletedAt: "",
    CreatedAt: startedAt,
  };

  try {
    const token = String(env.META_AD_ACCESS_TOKEN || "").trim();
    const accountId = String(env.META_AD_ACCOUNT_ID || "").trim();
    if (!token || !accountId) throw new Error("META_AD_* env not configured");

    // 1) account 레벨 일별 인사이트
    const accountRows = await fetchInsights(
      token,
      accountId,
      startDate,
      endDate,
      "account",
    );
    log.ApiCallsUsed++;

    // 2) campaign 레벨 일별 인사이트
    const campaignRows = await fetchInsights(
      token,
      accountId,
      startDate,
      endDate,
      "campaign",
    );
    log.ApiCallsUsed++;

    // 3) campaign 메타 (status·objective) — 1회 호출, 전부 가져옴
    const campaignMeta = await fetchCampaignMeta(token, accountId);
    log.ApiCallsUsed++;

    // 4) ad 레벨 인사이트
    const adRows = await fetchInsights(
      token,
      accountId,
      startDate,
      endDate,
      "ad",
    );
    log.ApiCallsUsed++;

    // 5) ad 메타 (status, creative thumbnail)
    const adMeta = await fetchAdMeta(token, accountId);
    log.ApiCallsUsed++;

    // 6-10) breakdown 5종 + 시간대 (각 1회)
    const brkPlatform = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "publisher_platform",
    );
    log.ApiCallsUsed++;
    const brkPosition = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "publisher_platform,platform_position",
    );
    log.ApiCallsUsed++;
    const brkDevice = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "impression_device",
    );
    log.ApiCallsUsed++;
    const brkAgeGender = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "age,gender",
    );
    log.ApiCallsUsed++;
    const brkRegion = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "region",
    );
    log.ApiCallsUsed++;
    const brkHour = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "hourly_stats_aggregated_by_advertiser_time_zone",
    );
    log.ApiCallsUsed++;

    // UPSERT — D1 batch로 묶어 subrequest 절약 (수백 statement → 몇 subrequest)
    const fetchedAt = new Date().toISOString();
    const stmts = [];

    for (const row of accountRows) {
      stmts.push(
        buildDailyStmt(env, {
          Date: row.date_start,
          Level: "account",
          EntityId: `act_${accountId}`,
          EntityName: "day1design_marketing",
          Status: "",
          Objective: "",
          ...mapInsight(row),
          FetchedAt: fetchedAt,
        }),
      );
    }

    for (const row of campaignRows) {
      const meta = campaignMeta[row.campaign_id] || {};
      stmts.push(
        buildDailyStmt(env, {
          Date: row.date_start,
          Level: "campaign",
          EntityId: String(row.campaign_id || ""),
          EntityName: String(row.campaign_name || meta.name || ""),
          Status: String(meta.status || ""),
          Objective: String(meta.objective || ""),
          ...mapInsight(row),
          FetchedAt: fetchedAt,
        }),
      );
    }

    for (const row of adRows) {
      const meta = adMeta[row.ad_id] || {};
      const creative = meta.creative || {};
      stmts.push(
        buildAdStmt(env, {
          Date: row.date_start,
          AdId: String(row.ad_id || ""),
          AdName: String(row.ad_name || meta.name || ""),
          AdsetId: String(row.adset_id || ""),
          AdsetName: String(row.adset_name || ""),
          CampaignId: String(row.campaign_id || ""),
          CampaignName: String(row.campaign_name || ""),
          CreativeId: String(creative.id || ""),
          CreativeType: String(creative.object_type || ""),
          ThumbnailUrl: String(
            creative.thumbnail_url || creative.image_url || "",
          ),
          Status: String(meta.status || ""),
          ...mapInsight(row),
          FetchedAt: fetchedAt,
        }),
      );
    }

    const breakdowns = [
      ["platform", brkPlatform, (r) => [r.publisher_platform || "", ""]],
      [
        "position",
        brkPosition,
        (r) => [r.platform_position || "", r.publisher_platform || ""],
      ],
      ["device", brkDevice, (r) => [r.impression_device || "", ""]],
      [
        "age_gender",
        brkAgeGender,
        (r) => [`${r.age || ""}_${r.gender || ""}`, ""],
      ],
      ["region", brkRegion, (r) => [r.region || "", ""]],
      [
        "hour",
        brkHour,
        (r) => [
          String(
            r.hourly_stats_aggregated_by_advertiser_time_zone || "",
          ).replace(/:.*$/, ""),
          "",
        ],
      ],
    ];

    for (const [dim, rows, keyFn] of breakdowns) {
      for (const row of rows) {
        const [val, sub] = keyFn(row);
        if (!val) continue;
        stmts.push(
          buildBreakdownStmt(env, {
            Date: row.date_start,
            Dimension: dim,
            DimensionValue: val,
            DimensionSub: sub,
            ...mapInsight(row),
            FetchedAt: fetchedAt,
          }),
        );
      }
    }

    await runBatch(env, stmts);
    const updated = stmts.length;

    log.Status = "success";
    log.RecordsUpdated = updated;
    log.CompletedAt = new Date().toISOString();
    await writeLog(env, log);
    return jsonOk({
      status: "success",
      syncType,
      range: { startDate, endDate },
      apiCalls: log.ApiCallsUsed,
      recordsUpdated: updated,
    });
  } catch (e) {
    const msg = String(e.message || "unknown").slice(0, 400);
    log.Status = isRateLimit(e) ? "rate_limited" : "failed";
    log.ErrorCode = isRateLimit(e) ? "rate_limit" : "api_error";
    log.ErrorMessage = msg;
    log.CompletedAt = new Date().toISOString();
    await writeLog(env, log);

    // rate limit / sync 실패 → 별도 텔레그램 채널로 알림
    // (env.META_RATE_TELEGRAM_BOT_TOKEN + META_RATE_TELEGRAM_CHAT_ID)
    const text = `[day1design/meta-ads] ${log.Status} (${syncType})\n${startDate} ~ ${endDate}\nAPI 호출: ${log.ApiCallsUsed}\n${msg}`;
    ctx?.waitUntil(
      notifyTelegram(env, text, {
        botToken: env.META_RATE_TELEGRAM_BOT_TOKEN,
        chatId: env.META_RATE_TELEGRAM_CHAT_ID,
      }),
    );
    return jsonError(500, msg, { code: log.ErrorCode });
  }
}

// ─── Meta API 호출 ────────────────────────────────────────
async function fetchInsights(token, accountId, startDate, endDate, level) {
  let levelFields = "";
  if (level === "campaign") levelFields = "," + CAMPAIGN_FIELDS;
  else if (level === "ad") levelFields = "," + AD_FIELDS;
  const params = new URLSearchParams({
    fields: INSIGHT_METRICS + levelFields,
    level,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: "1",
    limit: "500",
    access_token: token,
  });
  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      `Meta API ${res.status}: ${data?.error?.message || "unknown"}`,
    );
    err.metaError = data?.error;
    throw err;
  }
  return data.data || [];
}

async function fetchCampaignMeta(token, accountId) {
  const params = new URLSearchParams({
    fields: CAMPAIGN_META_FIELDS,
    limit: "200",
    access_token: token,
  });
  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/campaigns?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      `Meta campaigns ${res.status}: ${data?.error?.message || "unknown"}`,
    );
    err.metaError = data?.error;
    throw err;
  }
  const map = {};
  for (const c of data.data || []) {
    map[c.id] = c;
  }
  return map;
}

async function fetchAdMeta(token, accountId) {
  const params = new URLSearchParams({
    fields: AD_META_FIELDS,
    limit: "500",
    access_token: token,
  });
  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      `Meta ads ${res.status}: ${data?.error?.message || "unknown"}`,
    );
    err.metaError = data?.error;
    throw err;
  }
  const map = {};
  for (const a of data.data || []) {
    map[a.id] = a;
  }
  return map;
}

async function fetchBreakdown(
  token,
  accountId,
  startDate,
  endDate,
  breakdowns,
) {
  // 페이지네이션 지원 — Meta API limit=500/페이지, paging.next로 추가 호출
  // 차원값이 많은 분해(age_gender / region / hour)는 일자 × 차원값 조합 수천 row 발생
  const params = new URLSearchParams({
    fields: "impressions,clicks,spend,ctr,cpc,reach,actions,inline_link_clicks",
    breakdowns,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: "1",
    limit: "500",
    access_token: token,
  });
  let url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params}`;
  const all = [];
  const MAX_PAGES = 10; // 안전망 (subrequest 한도 보호)
  for (let i = 0; i < MAX_PAGES && url; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(
        `Meta breakdown(${breakdowns}) ${res.status}: ${data?.error?.message || "unknown"}`,
      );
      err.metaError = data?.error;
      throw err;
    }
    all.push(...(data.data || []));
    url = data?.paging?.next || null;
  }
  return all;
}

function isRateLimit(e) {
  const code = e?.metaError?.code;
  return code === 4 || code === 17 || code === 32 || code === 613;
}

// ─── insight row → D1 컬럼 매핑 ───────────────────────────
function firstActionValue(arr, types) {
  if (!Array.isArray(arr)) return 0;
  for (const a of arr) {
    if (types.includes(a.action_type)) return Number(a.value || 0);
  }
  return 0;
}
function sumActionValue(arr, types) {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const a of arr)
    if (types.includes(a.action_type)) s += Number(a.value || 0);
  return s;
}

function mapInsight(row) {
  const actions = Array.isArray(row.actions) ? row.actions : [];
  let leads = 0;
  for (const a of actions) {
    if (
      a.action_type === "offsite_complete_registration_add_meta_leads" ||
      a.action_type === "lead"
    ) {
      leads += Number(a.value || 0);
    }
  }
  return {
    Impressions: Number(row.impressions || 0),
    Clicks: Number(row.clicks || 0),
    LinkClicks: Number(row.inline_link_clicks || 0),
    Spend: Number(row.spend || 0),
    Ctr: Number(row.ctr || 0),
    Cpc: Number(row.cpc || 0),
    Reach: Number(row.reach || 0),
    Frequency: Number(row.frequency || 0),
    Leads: leads,
    ActionsJson: JSON.stringify(actions),
    VideoP25Watched: firstActionValue(row.video_p25_watched_actions, [
      "video_view",
    ]),
    VideoP50Watched: firstActionValue(row.video_p50_watched_actions, [
      "video_view",
    ]),
    VideoP75Watched: firstActionValue(row.video_p75_watched_actions, [
      "video_view",
    ]),
    VideoP100Watched: firstActionValue(row.video_p100_watched_actions, [
      "video_view",
    ]),
    VideoAvgWatchSec: firstActionValue(row.video_avg_time_watched_actions, [
      "video_view",
    ]),
    ThruPlay: firstActionValue(row.video_thruplay_watched_actions, [
      "video_view",
    ]),
    UniqueClicks: Number(row.unique_clicks || 0),
    UniqueLinkClicks: Number(row.unique_inline_link_clicks || 0),
    CostPerLinkClick: Number(row.cost_per_inline_link_click || 0),
  };
}

// ─── D1 UPSERT (UNIQUE INDEX 활용) ────────────────────────
// ON CONFLICT UPSERT statement 빌더 — D1 batch 친화적 (subrequest 절약)
// UNIQUE INDEX(idx_meta_ads_daily_dedupe / idx_meta_ads_ad_dedupe / idx_meta_breakdown_dedupe)
// 기반으로 동일 키 시 UPDATE, 신규 키 시 INSERT.

const DAILY_COLS = [
  "EntityName",
  "Status",
  "Objective",
  "Impressions",
  "Clicks",
  "LinkClicks",
  "Spend",
  "Ctr",
  "Cpc",
  "Reach",
  "Frequency",
  "Leads",
  "ActionsJson",
  "VideoP25Watched",
  "VideoP50Watched",
  "VideoP75Watched",
  "VideoP100Watched",
  "VideoAvgWatchSec",
  "ThruPlay",
  "UniqueClicks",
  "UniqueLinkClicks",
  "CostPerLinkClick",
  "FetchedAt",
];
function buildDailyStmt(env, fields) {
  const id = generateId();
  const now = new Date().toISOString();
  const setClause = DAILY_COLS.map((c) => `${c}=excluded.${c}`).join(", ");
  const placeholders = [
    "?",
    "?",
    "?",
    "?",
    ...DAILY_COLS.map(() => "?"),
    "?",
  ].join(",");
  const sql = `INSERT INTO MetaAdsDaily
      (id, Date, Level, EntityId, ${DAILY_COLS.join(",")}, CreatedAt)
     VALUES (${placeholders})
     ON CONFLICT(Date, Level, EntityId) DO UPDATE SET ${setClause}`;
  const values = [id, fields.Date, fields.Level, fields.EntityId];
  for (const c of DAILY_COLS)
    values.push(fields[c] ?? (typeof fields[c] === "number" ? 0 : ""));
  values.push(now);
  return env.DB.prepare(sql).bind(...values);
}

const AD_COLS = [
  "AdName",
  "AdsetId",
  "AdsetName",
  "CampaignId",
  "CampaignName",
  "CreativeId",
  "CreativeType",
  "ThumbnailUrl",
  "Status",
  "Impressions",
  "Clicks",
  "LinkClicks",
  "Spend",
  "Ctr",
  "Cpc",
  "Reach",
  "Leads",
  "ThruPlay",
  "VideoAvgWatchSec",
  "FetchedAt",
];
function buildAdStmt(env, fields) {
  const id = generateId();
  const now = new Date().toISOString();
  const setClause = AD_COLS.map((c) => `${c}=excluded.${c}`).join(", ");
  const placeholders = ["?", "?", "?", ...AD_COLS.map(() => "?"), "?"].join(
    ",",
  );
  const sql = `INSERT INTO MetaAdsAd
      (id, Date, AdId, ${AD_COLS.join(",")}, CreatedAt)
     VALUES (${placeholders})
     ON CONFLICT(Date, AdId) DO UPDATE SET ${setClause}`;
  const values = [id, fields.Date, fields.AdId];
  for (const c of AD_COLS) values.push(fields[c] ?? "");
  values.push(now);
  return env.DB.prepare(sql).bind(...values);
}

const BRK_COLS = [
  "Impressions",
  "Clicks",
  "LinkClicks",
  "Spend",
  "Ctr",
  "Cpc",
  "Reach",
  "Leads",
  "FetchedAt",
];
function buildBreakdownStmt(env, fields) {
  const id = generateId();
  const now = new Date().toISOString();
  const setClause = BRK_COLS.map((c) => `${c}=excluded.${c}`).join(", ");
  const placeholders = [
    "?",
    "?",
    "?",
    "?",
    "?",
    ...BRK_COLS.map(() => "?"),
    "?",
  ].join(",");
  const sql = `INSERT INTO MetaAdsBreakdown
      (id, Date, Dimension, DimensionValue, DimensionSub, ${BRK_COLS.join(",")}, CreatedAt)
     VALUES (${placeholders})
     ON CONFLICT(Date, Dimension, DimensionValue, DimensionSub) DO UPDATE SET ${setClause}`;
  const values = [
    id,
    fields.Date,
    fields.Dimension,
    fields.DimensionValue,
    fields.DimensionSub || "",
  ];
  for (const c of BRK_COLS) values.push(fields[c] ?? "");
  values.push(now);
  return env.DB.prepare(sql).bind(...values);
}

// batch 분할 실행 — D1 batch는 statement 수 한도 있음 (안전하게 100개씩)
async function runBatch(env, stmts) {
  const CHUNK = 100;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await env.DB.batch(stmts.slice(i, i + CHUNK));
  }
}

async function writeLog(env, fields) {
  try {
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO MetaSyncLog
         (id, SyncType, Status, DateRangeStart, DateRangeEnd,
          ApiCallsUsed, RecordsUpdated, ErrorCode, ErrorMessage,
          StartedAt, CompletedAt, CreatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        fields.SyncType,
        fields.Status,
        fields.DateRangeStart,
        fields.DateRangeEnd,
        fields.ApiCallsUsed,
        fields.RecordsUpdated,
        fields.ErrorCode,
        fields.ErrorMessage,
        fields.StartedAt,
        fields.CompletedAt,
        fields.CreatedAt,
      )
      .run();
  } catch {}
}

// ─── 날짜 헬퍼 (Asia/Seoul KST 기준) ──────────────────────
function kstNow() {
  // UTC + 9h
  return new Date(Date.now() + 9 * 3600 * 1000);
}
function kstYesterday() {
  const d = kstNow();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function kstDaysAgo(n) {
  const d = kstNow();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function kstToday() {
  return kstNow().toISOString().slice(0, 10);
}
function rangeDays(days) {
  const end = kstYesterday(); // 오늘은 제외 (사용자 요구)
  const endDt = new Date(end + "T00:00:00Z");
  const startDt = new Date(endDt);
  startDt.setUTCDate(startDt.getUTCDate() - (days - 1));
  // 광고 시작일 2026-02-02 이전은 자동 클램프
  const minStart = "2026-02-02";
  const startStr = startDt.toISOString().slice(0, 10);
  return {
    startDate: startStr < minStart ? minStart : startStr,
    endDate: end,
  };
}

// 유입통계와 동일한 키: today / 7 / 30 / cur-month / prev-month / all / custom
// Meta 광고는 KST 기준 광고계정 timezone, 광고 시작일 2026-02-02 클램프
function resolveRangeFromQuery(url) {
  const key = String(url.searchParams.get("range") || "30");
  const minStart = "2026-02-02";
  const todayStr = kstToday();
  const yesterdayStr = kstYesterday();

  const clampStart = (s) => (s < minStart ? minStart : s);

  if (key === "today") {
    return { key, startDate: todayStr, endDate: todayStr };
  }
  if (key === "7" || key === "30") {
    return rangeDays(Number(key));
  }
  if (key === "cur-month") {
    const now = kstNow();
    const start = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { key, startDate: clampStart(start), endDate: yesterdayStr };
  }
  if (key === "prev-month") {
    const now = kstNow();
    const prev = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const start = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
    );
    const end = lastDay.toISOString().slice(0, 10);
    return { key, startDate: clampStart(start), endDate: end };
  }
  if (key === "all") {
    return { key, startDate: minStart, endDate: yesterdayStr };
  }
  if (key === "custom") {
    const qsStart = String(url.searchParams.get("start") || "").trim();
    const qsEnd = String(url.searchParams.get("end") || "").trim();
    const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const startDate = validDate(qsStart) ? clampStart(qsStart) : minStart;
    const endDate = validDate(qsEnd) ? qsEnd : yesterdayStr;
    return { key, startDate, endDate };
  }
  // fallback: 30일
  return rangeDays(30);
}
