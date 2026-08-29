// 마케팅 효율 브리프 — 아이맥 봇이 한 번에 읽어 가는 읽기 전용 창구.
//
// 어드민 화면은 사람이 여러 카드를 눈으로 훑어 판단한다. 봇은 그걸 못 하므로
// 광고비·유입·접수를 한 응답에 모아 준다. 호출이 한 번이면 분석기 두 대에
// 같은 원본을 넣을 수 있고, 두 분석이 서로 다른 시점 데이터를 보고 엇갈리는 일이 없다.
//
// 어드민 인증(쿠키) 대신 시크릿 헤더만 받는다 — 서버-서버 호출이라 Origin 이 없다.
// 읽기 전용이고 쓰기 경로가 없으므로 이 창구로는 데이터를 바꿀 수 없다.
//
// 응답은 기본적으로 "요약본"이다. 광고 전체 원본은 캠페인·광고·시간대까지 합쳐
// 수백 KB가 되어 분석기 프롬프트에 그대로 넣을 수 없다. 원본이 필요하면 full=1.

import { jsonOk, jsonError } from "../lib/response.js";
import { timingSafeEqual } from "../lib/auth.js";
import { briefOverview } from "./meta-ads.js";
import { briefSummary, briefFunnel } from "./analytics.js";

const MAX_DAYS = 180;
const TOP_N = 10;

function resolveDays(url) {
  const n = Number(url.searchParams.get("days") || 30);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.round(n), MAX_DAYS);
}

// KST 기준 날짜 문자열. 광고계정도 서울 시간대라 여기서 기준을 맞춰야
// "어제까지"가 어드민 화면과 같은 날을 가리킨다.
function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000);
  return now.toISOString().slice(0, 10);
}

async function readJson(res) {
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function topRows(rows, key = "spend", n = TOP_N) {
  if (!Array.isArray(rows)) return [];
  return [...rows]
    .sort((a, b) => (Number(b?.[key]) || 0) - (Number(a?.[key]) || 0))
    .slice(0, n);
}

// 접수는 브리프의 결론 지표다. 광고비만으로는 효율을 말할 수 없고,
// 이 숫자가 있어야 리드 단가가 나온다.
async function collectLeads(env, days) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const out = {
    since,
    total: 0,
    bySource: [],
    byStatus: [],
    daily: [],
    error: "",
  };

  try {
    const [totalRow, bySource, byStatus, daily] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM Estimates WHERE SubmittedAt >= ?`,
      )
        .bind(since)
        .first(),
      env.DB.prepare(
        `SELECT COALESCE(NULLIF(Source, ''), '미상') AS source, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ?
          GROUP BY source
          ORDER BY n DESC`,
      )
        .bind(since)
        .all(),
      env.DB.prepare(
        `SELECT COALESCE(NULLIF(Status, ''), '미상') AS status, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ?
          GROUP BY status
          ORDER BY n DESC`,
      )
        .bind(since)
        .all(),
      env.DB.prepare(
        `SELECT substr(SubmittedAt, 1, 10) AS day, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ?
          GROUP BY day
          ORDER BY day ASC`,
      )
        .bind(since)
        .all(),
    ]);

    out.total = Number(totalRow?.n) || 0;
    out.bySource = bySource?.results || [];
    out.byStatus = byStatus?.results || [];
    out.daily = daily?.results || [];
  } catch (e) {
    // 한 조각이 막혀도 브리프 전체를 죽이지 않는다. 대신 무엇이 빠졌는지 남긴다
    out.error = String(e?.message || "").slice(0, 120);
  }

  return out;
}

// 광고 원본에서 브리프가 실제로 쓰는 부분만 남긴다
function condenseAds(overview) {
  if (!overview || overview.ok === false) {
    return { available: false, reason: "광고 데이터를 읽지 못했습니다" };
  }
  const b = overview.breakdown || {};
  return {
    available: true,
    range: overview.range || null,
    summary: overview.summary || null,
    campaigns: topRows(overview.campaigns),
    ads: topRows(overview.ads),
    efficiency: overview.efficiency || null,
    breakdown: {
      platform: b.platform || [],
      position: topRows(b.position),
      device: b.device || [],
    },
    dow: overview.dow || [],
    syncedAt: overview.cachedAt || "",
  };
}

function condenseTraffic(summary) {
  if (!summary || summary.ok === false) {
    return { available: false, reason: "유입 데이터를 읽지 못했습니다" };
  }
  return {
    available: true,
    summary: summary.summary || null,
    sources: Array.isArray(summary.sources) ? summary.sources.slice(0, 20) : [],
    trend: Array.isArray(summary.trend) ? summary.trend : [],
    freshness: summary.freshness || null,
  };
}

// 지출과 접수를 한 줄로 묶는다. 두 숫자를 따로 주면 분석기마다 다르게 계산해
// 같은 기간을 두고 리드 단가가 엇갈린다.
function deriveEfficiency(ads, leads) {
  const spend = Number(ads?.summary?.spend) || 0;
  const total = Number(leads?.total) || 0;
  const clicks = Number(ads?.summary?.clicks) || 0;
  return {
    spend,
    leads: total,
    costPerLead: total > 0 ? Math.round(spend / total) : null,
    clickToLeadRate:
      clicks > 0 ? Number(((total / clicks) * 100).toFixed(2)) : null,
    note:
      "costPerLead 는 전체 접수 기준이라 Meta 외 유입도 분모에 들어간다. " +
      "광고만의 단가는 leads.bySource 에서 Meta 계열만 골라 다시 계산해야 한다.",
  };
}

export async function handleBrief(request, env, ctx, services) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/brief/, "") || "/";

  // 시크릿이 없으면 열어 두지 않고 막는다. 조건부 인증은 사고의 지름길이다
  if (!env.BRIEF_SECRET) {
    return jsonError(500, "brief not configured");
  }
  const given = request.headers.get("x-brief-secret") || "";
  if (!timingSafeEqual(given, env.BRIEF_SECRET)) {
    return jsonError(401, "Unauthorized");
  }

  if (path !== "/marketing" || request.method !== "GET") {
    return jsonError(404, "Not Found");
  }

  const days = resolveDays(url);
  const full = url.searchParams.get("full") === "1";

  // 두 라우트는 같은 range 규칙을 쓴다 — "7"·"30" 은 기본 구간이고 그 밖은 custom 이다.
  // 7·30 을 그대로 넘기는 이유는 어드민이 쓰는 캐시 키와 겹쳐 응답이 즉시 나오기 때문이다.
  // 여기서 days 를 임의 문자열로 만들면(예: "30d") 양쪽 모두 조용히 기본값으로 돌아간다.
  const rangeQuery =
    days === 7 || days === 30
      ? `range=${days}`
      : `range=custom&start=${kstDate(days)}&end=${kstDate(1)}`;

  const origin = url.origin;
  const sub = (p) => new Request(`${origin}${p}`, { headers: request.headers });
  const adsReq = sub(`/api/meta-ads/overview?${rangeQuery}`);
  const trafficReq = sub(`/api/analytics/summary?${rangeQuery}`);
  const funnelReq = sub(`/api/analytics/funnel?${rangeQuery}`);

  const [adsRaw, trafficRaw, funnelRaw, leads] = await Promise.all([
    briefOverview(adsReq, env, ctx)
      .then(readJson)
      .catch(() => null),
    briefSummary(trafficReq, env, services, ctx)
      .then(readJson)
      .catch(() => null),
    briefFunnel(funnelReq, env)
      .then(readJson)
      .catch(() => null),
    collectLeads(env, days),
  ]);

  const ads = full ? { available: true, ...adsRaw } : condenseAds(adsRaw);
  const traffic = full
    ? { available: true, ...trafficRaw }
    : condenseTraffic(trafficRaw);

  return jsonOk({
    ok: true,
    generatedAt: new Date().toISOString(),
    range: { days, since: kstDate(days), until: kstDate(1) },
    efficiency: deriveEfficiency(ads, leads),
    ads,
    traffic,
    funnel: funnelRaw || { available: false },
    leads,
  });
}
