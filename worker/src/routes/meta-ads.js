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
  // 후킹 성능은 이 둘로 본다. 노출 대비 2초를 넘긴 비율이 첫 화면이 붙잡았는지를 말한다
  "video_play_actions",
  "video_continuous_2_sec_watched_actions",
].join(",");
const CAMPAIGN_META_FIELDS =
  "id,name,status,objective,daily_budget,lifetime_budget";
const AD_META_FIELDS =
  "id,name,status,creative{id,thumbnail_url,object_type,video_id,image_url}";

// ─── 어드민 라우터 ────────────────────────────────────────
export async function handleMetaAds(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/meta-ads/, "") || "/";

  // internal secret 으로 verifyAdmin 우회 (수동 백필·cron self-fetch 프리워밍용)
  // 허용 경로: POST /backfill(기존) + GET /overview(cron 프리워밍 refresh=1).
  // overview 는 read-only 이고 secret 은 서버 내부에만 존재 → 노출 위험 없음.
  const internalSecret = request.headers.get("x-internal-secret") || "";
  const internalSecretOk =
    !!env.META_INTERNAL_SECRET &&
    timingSafeEqual(internalSecret, env.META_INTERNAL_SECRET);
  const isBackfillRoute = path === "/backfill" && request.method === "POST";
  const isOverviewGet = path === "/overview" && request.method === "GET";
  const internalOk = internalSecretOk && (isBackfillRoute || isOverviewGet);

  if (!internalOk && !(await verifyAdmin(request, env))) {
    return jsonError(401, "Unauthorized");
  }

  // GET /api/meta-ads/overview?days=30 — 12개 분리 호출을 1회로 통합(서버측 병합)
  // + 30분 엣지 캐시. Meta 데이터는 하루 1회 cron 동기화라 캐시 안전.
  // 어드민 로드 시 12 round-trip(이중 홉 Vercel→Worker) → 1 round-trip 으로 단축.
  if (path === "/overview" && request.method === "GET") {
    return getOverview(request, env, ctx);
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

  // GET /api/meta-ads/thumbs?ids=a,b,c — 크리에이티브 썸네일의 R2 공개 URL
  // D1 의 fbcdn URL 은 서명 URL(oe, 발급 ~7일)이라 며칠이면 전부 깨진다.
  // R2 로 한 번 복사해 고정하고, 어드민은 R2 공개 URL 을 <img src> 로 쓴다.
  //
  // 왜 이미지 프록시가 아니라 URL 목록인가: <img> 는 Authorization 헤더를 못 보내고
  // 어드민 인증은 localStorage 토큰 경로에 의존한다. 인증이 필요한 URL 을 src 로
  // 쓰면 이미지 요청만 401 로 떨어져 아무것도 안 보인다. 그래서 인증이 되는
  // fetch 로 URL 만 받아오고 이미지는 공개 버킷에서 읽는다.
  if (path === "/thumbs" && request.method === "GET") {
    return getAdThumbUrls(request, env);
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

// 동일 request 를 쿼리파라미터만 바꿔 복제 (breakdown dim 별 핸들러 재사용용)
function withQuery(request, extra) {
  const u = new URL(request.url);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, String(v));
  return new Request(u.toString(), request);
}

// ─── 통합 개요 (12개 분리 호출 → 1회) + SWR 엣지 캐시 ──────
// 기존 핸들러 로직을 그대로 재사용(쿼리 중복/회귀 위험 0)하고 서버측에서 한 번에
// 병합. 각 하위 응답을 키별로 담아 프론트가 기존 필드(.campaigns/.rows/.cells/.logs)
// 를 그대로 쓰도록 형태 보존.
//
// SWR(stale-while-revalidate): 캐시가 논리적으로 만료(30분)됐어도 물리 보관(24h)된
// 옛 응답이 있으면 즉시 반환하고 재계산은 ctx.waitUntil 로 백그라운드 이연.
// → range=all(73KB) 콜드 첫 로드(~1초+, 완전콜드+부하 시 수초)를 사용자 체감에서 제거.
// cron sync 직후 prewarmOverviewCache 로 refresh=1 self-fetch → 완전 콜드도 없앰.
const OVERVIEW_FRESH_MS = 30 * 60 * 1000; // 이 안이면 즉시반환, 넘으면 stale+백그라운드갱신
const OVERVIEW_CACHE_TTL_S = 24 * 60 * 60; // 물리 보관 24h (stale 서빙 위해 길게)

function overviewCacheKey(range, sort, order) {
  return `https://meta-overview.internal/v2/${encodeURIComponent(range.startDate)}/${encodeURIComponent(range.endDate)}/${encodeURIComponent(sort)}/${encodeURIComponent(order)}`;
}
function overviewJsonResponse(body) {
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
async function putOverviewCache(cache, cacheKey, body) {
  try {
    await cache.put(
      cacheKey,
      new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `max-age=${OVERVIEW_CACHE_TTL_S}`,
        },
      }),
    );
  } catch {}
}

async function getOverview(request, env, ctx) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const sort = url.searchParams.get("sort") || "spend";
  const order = url.searchParams.get("order") || "top";
  // refresh=1 (cron prewarm) → 캐시 무시하고 동기 재계산+저장. 캐시 키엔 미반영.
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const cache = caches.default;
  const cacheKey = overviewCacheKey(range, sort, order);

  if (forceRefresh) {
    try {
      const body = await computeOverview(request, env, range);
      await putOverviewCache(cache, cacheKey, body);
      return overviewJsonResponse(body);
    } catch (e) {
      return jsonError(
        500,
        "overview failed: " + (e.message || "").slice(0, 100),
      );
    }
  }

  // SWR — 캐시에 뭐라도 있으면 신선도 판정
  let staleBody = null;
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      staleBody = await hit.text();
      let cachedAt = 0;
      try {
        cachedAt = Date.parse(JSON.parse(staleBody)?.cachedAt || "") || 0;
      } catch {}
      const isFresh = cachedAt && Date.now() - cachedAt < OVERVIEW_FRESH_MS;
      if (isFresh) return overviewJsonResponse(staleBody);
      // stale → 옛값 즉시 반환 + 백그라운드 갱신
      if (ctx?.waitUntil) {
        ctx.waitUntil(
          computeOverview(request, env, range)
            .then((body) => putOverviewCache(cache, cacheKey, body))
            .catch(() => {}),
        );
        return overviewJsonResponse(staleBody);
      }
      // ctx 없으면 아래 동기 경로로 진행
    }
  } catch {}

  // 완전 콜드 (또는 ctx 없는 stale) → 동기 계산
  try {
    const body = await computeOverview(request, env, range);
    await putOverviewCache(cache, cacheKey, body);
    return overviewJsonResponse(body);
  } catch (e) {
    if (staleBody) return overviewJsonResponse(staleBody); // 갱신 실패 시 옛값 폴백
    return jsonError(
      500,
      "overview failed: " + (e.message || "").slice(0, 100),
    );
  }
}

// 12개 하위 핸들러를 서버측 Promise.all 1회 병합 → JSON 문자열 반환.
// sort/order/limit 등은 request.url 에 이미 반영되어 하위 핸들러가 그대로 읽음.
async function computeOverview(request, env, range) {
  const j = (resp) => resp.json();
  const [
    summary,
    campaigns,
    ads,
    efficiency,
    platform,
    position,
    device,
    ageGender,
    region,
    dow,
    hourHeatmap,
    syncLog,
  ] = await Promise.all([
    getSummary(request, env).then(j),
    listCampaigns(request, env).then(j),
    listAds(request, env).then(j),
    getEfficiency(request, env).then(j),
    listBreakdown(withQuery(request, { dim: "platform" }), env).then(j),
    listBreakdown(withQuery(request, { dim: "position" }), env).then(j),
    listBreakdown(withQuery(request, { dim: "device" }), env).then(j),
    listBreakdown(
      withQuery(request, { dim: "age_gender", limit: "30" }),
      env,
    ).then(j),
    listBreakdown(withQuery(request, { dim: "region" }), env).then(j),
    listDow(request, env).then(j),
    listHourHeatmap(request, env).then(j),
    listSyncLog(env).then(j),
  ]);

  return JSON.stringify({
    ok: true,
    range,
    summary,
    campaigns,
    ads,
    efficiency,
    breakdown: { platform, position, device, age_gender: ageGender, region },
    dow,
    hourHeatmap,
    syncLog,
    cachedAt: new Date().toISOString(),
  });
}

// ─── cron sync 직후 캐시 프리워밍 (완전 콜드 제거) ──────────
// 주요 필터의 overview 를 self-fetch(refresh=1) 로 미리 채운다. self-fetch 라
// 각 요청이 독립 subrequest 예산을 가져(콜드 계산은 하위 invocation에서 소비),
// cron invocation 은 fetch 개수(≈6)만 소비 → Free plan subrequest 한도(50) 안전.
export async function prewarmOverviewCache(env) {
  if (!env.META_INTERNAL_SECRET) return { ok: false, reason: "no secret" };
  const ranges = ["all", "30", "today", "cur-month", "7", "prev-month"];
  const origin = "https://admin.day1design.co.kr";
  let done = 0;
  for (const rg of ranges) {
    const u = `${origin}/api/meta-ads/overview?range=${rg}&sort=spend&order=top&limit=20&refresh=1`;
    try {
      const r = await fetch(u, {
        headers: { "x-internal-secret": env.META_INTERNAL_SECRET },
      });
      if (r.ok) done++;
    } catch {}
  }
  return { ok: true, prewarmed: done, total: ranges.length };
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
// 영상 유지 곡선을 비율까지 계산해 돌려준다.
//
// 원수치만 주면 화면과 분석기가 각자 나눗셈을 해서 서로 다른 값을 말한다.
// 재생 대비 25% 도달률이 후킹 성능을 가장 잘 드러낸다 — 첫 구간을 못 넘기면
// 그 뒤 지표는 볼 필요가 없다.
function buildVideoBlock(r, impressions) {
  const plays = Number(r.VideoPlays || 0);
  const p25 = Number(r.VideoP25 || 0);
  const p50 = Number(r.VideoP50 || 0);
  const p75 = Number(r.VideoP75 || 0);
  const p100 = Number(r.VideoP100 || 0);
  if (!plays && !p25 && !Number(r.ThruPlay || 0)) return null;
  const rate = (a, b) => (b > 0 ? Number((a / b).toFixed(4)) : null);
  // 길이를 알면 "25% 지점"을 초로 말할 수 있다. 길이가 다른 소재를 같은 칸에 놓고
  // 비교하는 것을 막아 주고, 평균 시청초가 영상의 어디까지인지도 드러난다
  const lengthSec = Number(r.VideoLengthSec || 0);
  const avgWatchSec = Number(Number(r.VideoAvgWatchSec || 0).toFixed(2));
  const atSec = (ratio) =>
    lengthSec > 0 ? Number((lengthSec * ratio).toFixed(1)) : null;

  return {
    plays,
    twoSecViews: Number(r.Video2SecViews || 0),
    p25,
    p50,
    p75,
    p100,
    thruPlay: Number(r.ThruPlay || 0),
    avgWatchSec,
    lengthSec: lengthSec > 0 ? Number(lengthSec.toFixed(1)) : null,
    p25Sec: atSec(0.25),
    p50Sec: atSec(0.5),
    p75Sec: atSec(0.75),
    // 평균 시청이 영상의 몇 %까지인지. 길이가 없으면 초만으로는 판단할 수 없다
    avgWatchRatio:
      lengthSec > 0 ? Number((avgWatchSec / lengthSec).toFixed(4)) : null,
    playRate: rate(plays, impressions),
    p25OfPlays: rate(p25, plays),
    p50OfPlays: rate(p50, plays),
    p75OfPlays: rate(p75, plays),
    completionRate: rate(p100, plays),
  };
}

async function listAds(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const sortField = (url.searchParams.get("sort") || "spend").toLowerCase();
  const order = (url.searchParams.get("order") || "top").toLowerCase();
  const limit = Math.max(
    1,
    Math.min(200, parseInt(url.searchParams.get("limit") || "20", 10)),
  );
  // 페이지네이션. 광고가 늘어도 한 번에 다 긁지 않도록 offset 을 받는다
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") || "0", 10),
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
         MAX(a.VideoId) AS VideoId,
         MAX(v.LengthSec) AS VideoLengthSec,
         MAX(ThumbnailUrl) AS ThumbnailUrl,
         MAX(Status) AS Status,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(LinkClicks) AS LinkClicks,
         SUM(Spend) AS Spend,
         SUM(Reach) AS Reach,
         SUM(Leads) AS Leads,
         SUM(ThruPlay) AS ThruPlay,
         SUM(VideoPlays) AS VideoPlays,
         SUM(Video2SecViews) AS Video2SecViews,
         SUM(VideoP25Watched) AS VideoP25,
         SUM(VideoP50Watched) AS VideoP50,
         SUM(VideoP75Watched) AS VideoP75,
         SUM(VideoP100Watched) AS VideoP100,
         -- 평균 시청초는 단순 평균이 아니라 재생 수로 가중해야 한다.
         -- 재생 10회짜리 날과 1000회짜리 날을 같은 무게로 더하면 값이 왜곡된다
         CASE WHEN SUM(VideoPlays) > 0
              THEN SUM(VideoAvgWatchSec * VideoPlays) / SUM(VideoPlays)
              ELSE 0 END AS VideoAvgWatchSec,
         CASE WHEN SUM(Impressions) > 0
              THEN CAST(SUM(Clicks) AS REAL) / SUM(Impressions) * 100
              ELSE 0 END AS Ctr,
         CASE WHEN SUM(LinkClicks) > 0
              THEN SUM(Spend) / SUM(LinkClicks)
              ELSE 0 END AS Cpc,
         CASE WHEN SUM(Leads) > 0
              THEN SUM(Spend) / SUM(Leads)
              ELSE 0 END AS CPL
       FROM MetaAdsAd a
       LEFT JOIN MetaVideos v ON v.VideoId = a.VideoId
       WHERE Date BETWEEN ? AND ?
       GROUP BY AdId
       HAVING Impressions > 0
       ORDER BY ${sortCol} ${direction}
       LIMIT ? OFFSET ?`,
    )
      .bind(range.startDate, range.endDate, limit, offset)
      .all();

    // 총 개수를 함께 준다. 이게 없으면 호출한 쪽이 마지막 페이지인지 알 수 없다
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT AdId FROM MetaAdsAd
          WHERE Date BETWEEN ? AND ?
          GROUP BY AdId
         HAVING SUM(Impressions) > 0
       )`,
    )
      .bind(range.startDate, range.endDate)
      .first();

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
        videoId: String(r.VideoId || ""),
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
        // 영상 유지 곡선. 어디서 사람이 떠나는지는 이 값들로만 보인다.
        // 비율까지 여기서 내주면 화면과 분석기가 같은 기준으로 읽는다
        video: buildVideoBlock(r, imps),
      };
    });
    return jsonOk({
      range,
      ads,
      page: {
        limit,
        offset,
        total: Number(countRow?.n || 0),
        hasMore: offset + ads.length < Number(countRow?.n || 0),
      },
    });
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

// 리드 이중 계상 교정 백필 — 한 번만 돈다.
//
// 2026-09-03 이전에 저장된 리드는 두 action_type 을 더한 값이라 실측 2.02 배로
// 부풀어 있다. MetaAdsDaily 는 ActionsJson 원문이 있어 되돌릴 수 있지만
// MetaAdsAd·MetaAdsBreakdown 은 원문이 없어 Meta 에서 다시 받아야 한다.
// 화면 버튼은 사람이 눌러야 하므로, 아직 안 돌았으면 cron 이 대신 한 번 돌린다.
//
// 멱등성은 MetaSyncLog 가 맡는다 — 성공 기록이 있으면 건너뛰고, 실패했으면
// 다음 cron 이 다시 시도한다.
const LEAD_RECOUNT_SYNC_TYPE = "lead-recount";
const BACKFILL_CHUNK_TYPE = "backfill-chunk";
const BACKFILL_START_DATE = "2026-02-02";
const BACKFILL_CHUNK_DAYS = 31;

// 백필 기간을 한 달씩 잘라 목록으로 만든다. 전 기간을 한 번에 요청하면 페이지가
// 수십 장이 되어 subrequest 한도에 부딪히고, 한 번 실패하면 통째로 날아간다.
function buildBackfillChunks(startDate, endDate) {
  const chunks = [];
  const end = new Date(`${endDate}T00:00:00Z`);
  let cursor = new Date(`${startDate}T00:00:00Z`);
  while (cursor <= end && chunks.length < 60) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + BACKFILL_CHUNK_DAYS - 1);
    chunks.push({
      start: cursor.toISOString().slice(0, 10),
      end: (chunkEnd > end ? end : chunkEnd).toISOString().slice(0, 10),
    });
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

// 아직 안 받은 구간을 한 번에 하나씩 받는다. 남은 구간은 다음 호출이 이어받으므로
// cron 이 매시 돌면서 스스로 끝까지 채운다.
// 마지막 구간은 어제까지 이어지며 날마다 늘어나므로, 끝 구간은 완료로 못박지 않고
// 늘 다시 받는다(같은 키는 덮어쓰기라 행이 늘지 않는다).
// D1 무료 플랜은 하루 읽기 행 수에 한도가 있다. 백필은 UPSERT 마다 인덱스를
// 읽어 한도를 크게 먹는데, 한도에 걸린 뒤에도 cron 이 매시 재시도하면 접수·조회에
// 쓸 몫까지 태운다. 같은 UTC 날짜 안에는 다시 시도하지 않고, 자정이 지나면 스스로
// 재개한다.
function isD1QuotaError(message) {
  return /daily row read limit|exceeded .*(limit|quota)/i.test(
    String(message || ""),
  );
}

export async function runBackfillChunk(env, ctx) {
  if (!env?.DB) return { skipped: "no_db" };
  const lastFail = await env.DB.prepare(
    `SELECT ErrorMessage, CreatedAt FROM MetaSyncLog
      WHERE SyncType = ? AND Status <> 'success'
      ORDER BY CreatedAt DESC LIMIT 1`,
  )
    .bind(BACKFILL_CHUNK_TYPE)
    .first();
  if (
    lastFail &&
    isD1QuotaError(lastFail.ErrorMessage) &&
    String(lastFail.CreatedAt).slice(0, 10) ===
      new Date().toISOString().slice(0, 10)
  ) {
    return { skipped: "d1_quota", retryAfter: "다음 UTC 자정" };
  }
  const endDate = kstYesterday();
  const chunks = buildBackfillChunks(BACKFILL_START_DATE, endDate);
  const doneRows = await env.DB.prepare(
    `SELECT DateRangeStart FROM MetaSyncLog
      WHERE SyncType = ? AND Status = 'success'`,
  )
    .bind(BACKFILL_CHUNK_TYPE)
    .all();
  const done = new Set((doneRows.results || []).map((r) => r.DateRangeStart));
  const pending = chunks.filter((c) => !done.has(c.start));
  if (!pending.length) {
    return { skipped: "all_done", chunks: chunks.length };
  }
  const chunk = pending[0];
  const res = await syncRange(
    env,
    ctx,
    chunk.start,
    chunk.end,
    BACKFILL_CHUNK_TYPE,
  );
  const ok = res.status === 200;
  if (ok) {
    try {
      await prewarmOverviewCache(env);
    } catch {}
  }
  return {
    ran: true,
    ok,
    chunk,
    remaining: pending.length - (ok ? 1 : 0),
    total: chunks.length,
  };
}

// 한 번 실행에 몇 구간까지 이어서 받을지. 구간 하나가 Meta API 를 대략 10~20회
// 부르므로 세 구간이면 50 안쪽이다(Cloudflare subrequest 한도). 이 값을 올리면
// 백필은 빨라지지만 한도에 부딪힐 위험이 커진다.
const BACKFILL_CHUNKS_PER_RUN = 3;
export async function runBackfillChunks(
  env,
  ctx,
  limit = BACKFILL_CHUNKS_PER_RUN,
) {
  const processed = [];
  let last = null;
  for (let i = 0; i < limit; i++) {
    last = await runBackfillChunk(env, ctx);
    if (!last?.ran) break;
    processed.push(last.chunk);
    if (!last.ok) break; // 실패하면 멈춘다 — 다음 cron 이 같은 구간부터 다시 잡는다
    if (last.remaining === 0) break;
  }
  return {
    ran: processed.length > 0,
    processed,
    remaining: last?.remaining ?? 0,
    total: last?.total ?? 0,
    ok: last?.ok !== false,
  };
}

export async function runLeadRecountBackfill(env, ctx) {
  if (!env?.DB) return { skipped: "no_db" };
  const done = await env.DB.prepare(
    `SELECT 1 FROM MetaSyncLog
      WHERE SyncType = ? AND Status = 'success' LIMIT 1`,
  )
    .bind(LEAD_RECOUNT_SYNC_TYPE)
    .first();
  if (done) return { skipped: "already_done" };

  const res = await syncRange(
    env,
    ctx,
    "2026-02-02",
    kstYesterday(),
    LEAD_RECOUNT_SYNC_TYPE,
  );
  if (res.status === 200) {
    try {
      await prewarmOverviewCache(env);
    } catch {}
  }
  return { ran: true, ok: res.status === 200 };
}

// ─── 백필 / Cron sync 공통 ───────────────────────────────
async function runBackfill(request, env, ctx) {
  let body = {};
  try {
    body = await request.json();
  } catch {}
  // 기간을 안 주면 한 구간씩 이어받는다 — 전 기간을 한 번에 요청하면 페이지가
  // 수십 장이 되어 subrequest 한도에 걸리고, 실패하면 통째로 날아간다.
  if (!body.startDate && !body.endDate) {
    const r = await runBackfillChunk(env, ctx);
    return jsonOk({
      status: r.ok === false ? "failed" : "success",
      mode: "chunk",
      ...r,
    });
  }
  const startDate = String(body.startDate || BACKFILL_START_DATE);
  const endDate = String(body.endDate || kstYesterday());
  const res = await syncRange(env, ctx, startDate, endDate, "backfill");
  // 개요는 30분 엣지 캐시를 탄다. 다시 받아 놓고 캐시를 그대로 두면 화면이
  // 옛 수치를 계속 보여줘서 "눌러도 안 바뀐다"가 된다. cron 과 같은 방식으로
  // 캐시를 새 값으로 덮는다(백그라운드라 응답은 기다리지 않는다).
  if (res.status === 200) {
    ctx?.waitUntil(prewarmOverviewCache(env).catch(() => null));
  }
  return res;
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
          VideoId: String(creative.video_id || ""),
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

    // 영상 길이는 지표와 함께 오지 않는다. 광고 메타의 video_id 로 따로 받아 둔다
    try {
      const videoIds = Object.values(adMeta || {})
        .map((m) => m?.creative?.video_id)
        .filter(Boolean);
      await fillVideoLengths(env, token, videoIds, log);
    } catch (e) {
      // 길이를 못 채워도 나머지 지표는 이미 저장됐다. 다음 동기화가 다시 시도한다
      console.error("[day1design/meta-ads] video length fill", e?.message);
    }

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
  // 페이지네이션 — limit=500 은 한 페이지 크기일 뿐이라 그냥 두면 첫 500 행에서
  // 잘린다. ad 레벨은 (일수 × 광고 수) 라 한 달만 넘어도 500 을 우습게 넘는다.
  // fetchBreakdown 은 진작 페이지를 따라가고 있었는데 이쪽만 빠져 있었다.
  let url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params}`;
  const all = [];
  const MAX_PAGES = 12; // subrequest 한도 보호. 기간은 청크로 잘라 들어온다
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(
        `Meta API ${res.status}: ${data?.error?.message || "unknown"}`,
      );
      err.metaError = data?.error;
      throw err;
    }
    all.push(...(data.data || []));
    url = data?.paging?.next || null;
  }
  return all;
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

// ─── 광고 썸네일 영구 보관 ───
// Meta 의 thumbnail_url 은 서명 URL 이다(oe=만료 타임스탬프, 발급 ~7일).
// 동기화 시점에 D1 에 박아두면 일주일 뒤 전부 깨진다 — 실제로 2026-03~07 행이
// 전부 만료 상태였다. 그래서 URL 을 저장하지 않고 이미지를 R2 에 복사해 고정한다.
// 크리에이티브는 32개뿐이라 미스는 크리에이티브당 최초 1회만 발생한다.
const THUMB_R2_PREFIX = "meta-ads/thumbs/";
const THUMB_MAX_BYTES = 3 * 1024 * 1024;
const THUMB_CACHE_CONTROL = "public, max-age=604800, immutable";

function imageContentType(value) {
  const ct = String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  // 원본 헤더를 그대로 믿지 않는다 — 이미지 외 타입은 서빙하지 않는다
  return /^image\/(jpeg|png|webp|gif|avif)$/.test(ct) ? ct : "image/jpeg";
}

const THUMB_MAX_IDS = 40;
// 미스 1건당 외부요청 2회(Graph + 원본). CF Free subrequest 50 한도를 넘지 않도록 제한.
const THUMB_MAX_FETCH_PER_CALL = 15;

// 크리에이티브 1건을 R2 로 복사. 성공하면 true.
async function mirrorCreativeThumb(env, creativeId, key) {
  const token = String(env.META_AD_ACCESS_TOKEN || "").trim();
  if (!token) return false;
  let srcUrl = "";
  try {
    const params = new URLSearchParams({
      fields: "thumbnail_url,image_url",
      access_token: token,
    });
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${creativeId}?${params}`,
    );
    const data = await res.json();
    if (res.ok) srcUrl = String(data?.thumbnail_url || data?.image_url || "");
  } catch {}
  if (!/^https:\/\//.test(srcUrl)) return false;
  try {
    const img = await fetch(srcUrl);
    if (!img.ok) return false;
    const contentType = imageContentType(img.headers.get("content-type"));
    const buf = await img.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > THUMB_MAX_BYTES) return false;
    await env.IMAGES.put(key, buf, {
      httpMetadata: { contentType, cacheControl: THUMB_CACHE_CONTROL },
    });
    return true;
  } catch {
    return false;
  }
}

async function getAdThumbUrls(request, env) {
  const base = String(env.R2_PUBLIC_BASE || "").replace(/\/$/, "");
  if (!env?.IMAGES || !base) return jsonError(500, "Server misconfigured");
  const raw = new URL(request.url).searchParams.get("ids") || "";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s)),
    ),
  ].slice(0, THUMB_MAX_IDS);

  const urls = {};
  let fetched = 0;
  for (const id of ids) {
    const key = `${THUMB_R2_PREFIX}${id}`;
    let exists = false;
    try {
      exists = !!(await env.IMAGES.head(key));
    } catch {}
    if (exists) {
      urls[id] = `${base}/${key}`;
      continue;
    }
    // 한 번에 다 받지 않는다 — 남은 건 다음 호출에서 채워진다
    if (fetched >= THUMB_MAX_FETCH_PER_CALL) {
      urls[id] = null;
      continue;
    }
    fetched += 1;
    urls[id] = (await mirrorCreativeThumb(env, id, key))
      ? `${base}/${key}`
      : null;
  }
  return jsonOk({ urls });
}

// 영상 길이를 채운다.
//
// p25/p50/p75 는 시간이 아니라 영상 길이 대비 비율이라, 길이가 없으면 "25% 지점"이
// 몇 초인지 말할 수 없다. 그러면 길이가 다른 소재를 같은 칸에 놓고 비교하게 된다.
//
// 길이는 광고가 아니라 영상에 붙는 속성이고 바뀌지 않는다. 그래서 한 번 조회한 영상은
// MetaVideos 에 남겨 두고 다시 묻지 않는다 — Graph 호출은 subrequest 한도를 먹는다.
async function fillVideoLengths(env, token, videoIds, log) {
  const wanted = [...new Set((videoIds || []).filter(Boolean))];
  if (!wanted.length) return 0;

  let known = new Set();
  try {
    const rows = await env.DB.prepare(
      `SELECT VideoId FROM MetaVideos WHERE LengthSec > 0`,
    ).all();
    known = new Set((rows?.results || []).map((r) => String(r.VideoId)));
  } catch (_) {
    // 테이블이 아직 없으면 전부 새로 받는다
  }

  const missing = wanted.filter((id) => !known.has(String(id)));
  if (!missing.length) return 0;

  // 한 번에 너무 많이 부르면 subrequest 한도에 걸린다. 남은 것은 다음 동기화가 채운다
  const batch = missing.slice(0, 20);
  const now = new Date().toISOString();
  const stmts = [];

  for (const id of batch) {
    try {
      const url =
        `https://graph.facebook.com/${META_API_VERSION}/${id}` +
        `?fields=length,title&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (log) log.ApiCallsUsed = Number(log.ApiCallsUsed || 0) + 1;
      const data = await res.json();
      if (!res.ok) continue;
      const len = Number(data?.length || 0);
      if (!len) continue;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO MetaVideos (VideoId, LengthSec, Title, FetchedAt, CreatedAt)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(VideoId) DO UPDATE SET
             LengthSec=excluded.LengthSec,
             Title=excluded.Title,
             FetchedAt=excluded.FetchedAt`,
        ).bind(String(id), len, String(data?.title || ""), now, now),
      );
    } catch (_) {
      // 영상 하나를 못 받아도 동기화 전체를 멈추지 않는다
    }
  }

  if (stmts.length) await runBatch(env, stmts);
  return stmts.length;
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

function preferredActionValue(arr, types) {
  if (!Array.isArray(arr)) return 0;
  for (const type of types) {
    const action = arr.find((item) => item.action_type === type);
    if (action) return Number(action.value || 0) || 0;
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

export function mapInsight(row) {
  const actions = Array.isArray(row.actions) ? row.actions : [];
  const leads = preferredActionValue(actions, [
    "offsite_complete_registration_add_meta_leads",
    "lead",
  ]);
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
    VideoPlays: firstActionValue(row.video_play_actions, ["video_view"]),
    Video2SecViews: firstActionValue(
      row.video_continuous_2_sec_watched_actions,
      ["video_view"],
    ),
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
  "VideoPlays",
  "Video2SecViews",
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
  "VideoId",
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
  "VideoPlays",
  "Video2SecViews",
  "VideoP25Watched",
  "VideoP50Watched",
  "VideoP75Watched",
  "VideoP100Watched",
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

// 마케팅 브리프 창구용. 어드민 인증은 brief.js 가 시크릿으로 대신한다
export { getOverview as briefOverview };
