// 마케팅 효율 브리프 — 아이맥 봇이 한 번에 읽어 가는 읽기 전용 창구.
//
// 어드민 화면은 사람이 여러 카드를 눈으로 훑어 판단한다. 봇은 그걸 못 하므로
// 광고비·유입·접수를 한 응답에 모아 준다. 호출이 한 번이면 분석기 두 대에
// 같은 원본을 넣을 수 있고, 두 분석이 서로 다른 시점 데이터를 보고 엇갈리는 일이 없다.
//
// 어드민 인증(쿠키) 대신 시크릿 헤더만 받는다 — 서버-서버 호출이라 Origin 이 없다.
// 읽기 전용이고 쓰기 경로가 없으므로 이 창구로는 데이터를 바꿀 수 없다.
//
// 행은 자르지 않는다. 상위 몇 개만 넘기면 잘린 캠페인은 분석 대상에서 사라지고,
// 남은 것으로 내린 결론이 전체인 것처럼 보고된다. 자르는 순간 해석이 일반화된다.
// 전체를 넘겨도 70KB 안쪽이라 프롬프트에 충분히 들어간다. 덜어내는 것은 썸네일 URL 처럼
// 판단에 쓰이지 않는 긴 문자열뿐이다.

import { jsonOk, jsonError } from "../lib/response.js";
import { timingSafeEqual } from "../lib/auth.js";
import { briefOverview } from "./meta-ads.js";
import { briefSummary, briefFunnel } from "./analytics.js";

const MAX_DAYS = 180;

// KST 기준 날짜 문자열. 광고계정도 서울 시간대라 여기서 기준을 맞춰야
// "어제까지"가 어드민 화면과 같은 날을 가리킨다.
function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000);
  return now.toISOString().slice(0, 10);
}

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function shiftDate(ymd, deltaDays) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// 기간 해석 — days 하나로는 "이번 달"이나 "지난달"을 말할 수 없다.
//
// 사람은 "이번 주", "지난달"처럼 달력 단위로 묻는데 days=N 은 오늘에서 거꾸로 센 구간이라
// 그 요청을 담지 못한다. 그래서 하위 라우트가 이미 쓰고 있는 range 키를 그대로 받는다.
//
// 종료일은 기본이 어제다. 오늘은 광고 집계가 미완성이라 함께 넣으면 지출과 접수가
// 같은 날을 두고 다른 진행률로 잡혀 비교가 왜곡된다. today 만 예외로 오늘을 본다.
function resolveRange(url) {
  const key = String(url.searchParams.get("range") || "").trim();
  const yesterday = kstDate(1);
  const today = kstDate(0);

  const byDays = (n) => {
    const days = Math.min(Math.max(Math.round(n) || 30, 1), MAX_DAYS);
    return {
      key: days === 7 || days === 30 ? String(days) : "custom",
      startDate: kstDate(days),
      endDate: yesterday,
      days,
    };
  };

  if (key === "today") {
    return { key: "today", startDate: today, endDate: today, days: 1 };
  }

  if (key === "cur-month") {
    const start = `${today.slice(0, 7)}-01`;
    // 매월 1일에는 이번 달에 끝난 날이 없다. 그때는 어제(지난달 말일)까지 보여 준다
    const startDate = start > yesterday ? yesterday : start;
    return {
      key: "custom",
      startDate,
      endDate: yesterday,
      days: null,
      label: "cur-month",
    };
  }

  if (key === "prev-month") {
    const firstOfThis = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    const endDate = shiftDate(firstOfThis.toISOString().slice(0, 10), -1);
    const startDate = `${endDate.slice(0, 7)}-01`;
    return {
      key: "custom",
      startDate,
      endDate,
      days: null,
      label: "prev-month",
    };
  }

  if (key === "custom") {
    const s = url.searchParams.get("start");
    const e = url.searchParams.get("end");
    if (isDate(s) && isDate(e) && s <= e) {
      return {
        key: "custom",
        startDate: s,
        endDate: e,
        days: null,
        label: "custom",
      };
    }
    return byDays(30);
  }

  if (key === "7" || key === "30") return byDays(Number(key));

  return byDays(Number(url.searchParams.get("days") || 30));
}

async function readJson(res) {
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// 접수는 브리프의 결론 지표다. 광고비만으로는 효율을 말할 수 없고,
// 이 숫자가 있어야 리드 단가가 나온다.
async function collectLeads(env, period) {
  // SubmittedAt 은 UTC ISO 이고 구간은 KST 날짜다. 경계를 그대로 비교하면 하루가
  // 9시간씩 밀려 "이번 주"에 지난주 새벽 접수가 섞인다. 여기서 KST 경계를 UTC 로 옮긴다.
  const since = new Date(`${period.startDate}T00:00:00+09:00`).toISOString();
  const until = new Date(
    `${shiftDate(period.endDate, 1)}T00:00:00+09:00`,
  ).toISOString();

  const out = {
    since,
    until,
    startDate: period.startDate,
    endDate: period.endDate,
    total: 0,
    bySource: [],
    byStatus: [],
    daily: [],
    byCampaign: [],
    error: "",
  };

  try {
    const [totalRow, bySource, byStatus, daily, byCampaign] = await Promise.all(
      [
        env.DB.prepare(
          `SELECT COUNT(*) AS n FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?`,
        )
          .bind(since, until)
          .first(),
        env.DB.prepare(
          `SELECT COALESCE(NULLIF(Source, ''), '미상') AS source, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?
          GROUP BY source
          ORDER BY n DESC`,
        )
          .bind(since, until)
          .all(),
        env.DB.prepare(
          `SELECT COALESCE(NULLIF(Status, ''), '미상') AS status, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?
          GROUP BY status
          ORDER BY n DESC`,
        )
          .bind(since, until)
          .all(),
        // 일자는 KST 로 끊는다. UTC 로 자르면 09시 이전 접수가 전날로 잡혀
        // 광고 일자별 지표와 하루씩 어긋난다
        env.DB.prepare(
          `SELECT substr(datetime(SubmittedAt, '+9 hours'), 1, 10) AS day, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?
          GROUP BY day
          ORDER BY day ASC`,
        )
          .bind(since, until)
          .all(),
        // 캠페인별 접수. Estimates.Campaign 에 광고 캠페인명이 그대로 들어와 있어
        // 광고비와 이름으로 붙일 수 있다. 이걸 안 주면 "어느 캠페인이 돈값을 하는가"를
        // 아무도 말할 수 없고, 보고는 총계만 읊는 평면적인 글이 된다
        env.DB.prepare(
          `SELECT COALESCE(NULLIF(Campaign, ''), '(캠페인 없음)') AS campaign,
                COALESCE(NULLIF(Platform, ''), '(미상)') AS platform,
                COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?
          GROUP BY campaign, platform
          ORDER BY n DESC`,
        )
          .bind(since, until)
          .all(),
      ],
    );

    out.total = Number(totalRow?.n) || 0;
    out.bySource = bySource?.results || [];
    out.byStatus = byStatus?.results || [];
    out.daily = daily?.results || [];
    out.byCampaign = byCampaign?.results || [];
  } catch (e) {
    // 한 조각이 막혀도 브리프 전체를 죽이지 않는다. 대신 무엇이 빠졌는지 남긴다
    out.error = String(e?.message || "").slice(0, 120);
  }

  return out;
}

// overview 의 각 조각은 하위 핸들러의 Response 를 그대로 담은 것이라 {ok, range, <본체>}
// 로 한 겹 싸여 있다. 그 껍질을 안 벗기면 summary.spend 가 undefined 가 되어
// 광고비 0원짜리 브리프가 나간다(실제로 그렇게 나갔다).
function unwrap(node, key) {
  if (!node) return null;
  if (Array.isArray(node)) return node;
  if (key && node[key] !== undefined) return node[key];
  if (Array.isArray(node.rows)) return node.rows;
  if (Array.isArray(node.results)) return node.results;
  return node;
}

// 분석에 쓸 수 없는 열만 덜어낸다. 행은 자르지 않는다.
//
// 예전에는 캠페인·광고를 지출 상위 10개로 잘라서 넘겼다. 그러면 잘린 캠페인은 분석
// 대상에서 아예 사라지고, 남은 것만으로 내린 결론이 전체인 것처럼 보고된다. 즉 자르는
// 순간 해석이 일반화된다. 전체를 넘겨도 69KB 라 프롬프트에 충분히 들어간다.
//
// 대신 썸네일 URL 처럼 판단에 쓰이지 않으면서 긴 문자열은 덜어낸다.
const HEAVY_FIELDS = ["ThumbnailUrl", "thumbnailUrl", "thumbUrl", "imageUrl"];
function stripHeavy(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    if (!r || typeof r !== "object") return r;
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (HEAVY_FIELDS.includes(k)) continue;
      out[k] = v;
    }
    return out;
  });
}

function condenseAds(overview) {
  if (!overview || overview.ok === false) {
    return { available: false, reason: "광고 데이터를 읽지 못했습니다" };
  }
  const b = overview.breakdown || {};
  return {
    available: true,
    range: overview.range || null,
    summary: unwrap(overview.summary, "summary"),
    lastSyncedAt: overview.summary?.lastSyncedAt || "",
    campaigns: unwrap(overview.campaigns, "campaigns"),
    ads: stripHeavy(unwrap(overview.ads, "ads")),
    efficiency: overview.efficiency || null,
    // 일자별 지표. 이게 없으면 "언제부터 꺾였나"를 아무도 말할 수 없다
    daily: overview.efficiency?.daily || [],
    breakdown: {
      platform: unwrap(b.platform),
      position: unwrap(b.position),
      device: unwrap(b.device),
      ageGender: unwrap(b.age_gender),
      region: unwrap(b.region),
    },
    dow: unwrap(overview.dow, "rows"),
    // 168칸(요일 x 시간)이라 커 보이지만, 언제 사람이 반응하는지는 여기서만 나온다
    hourHeatmap: unwrap(overview.hourHeatmap, "cells"),
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
    // 유입 출처도 자르지 않는다. 꼬리에 있는 소수 경로가 접수로는 앞설 수 있다
    sources: Array.isArray(summary.sources) ? summary.sources : [],
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

  const period = resolveRange(url);
  const full = url.searchParams.get("full") === "1";

  // 하위 두 라우트는 같은 range 규칙을 쓴다 — "today"·"7"·"30" 은 기본 구간이고 그 밖은
  // custom 이다. 7·30 을 그대로 넘기는 이유는 어드민이 쓰는 캐시 키와 겹쳐 응답이 즉시
  // 나오기 때문이다. 여기서 임의 문자열을 만들면(예: "30d") 양쪽 모두 조용히 기본값으로 돌아간다.
  const rangeQuery =
    period.key === "custom"
      ? `range=custom&start=${period.startDate}&end=${period.endDate}`
      : `range=${period.key}`;

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
    collectLeads(env, period),
  ]);

  // 효율 계산은 언제나 껍질을 벗긴 쪽에서 한다. full=1 원본으로 계산하면
  // spend 를 못 찾아 광고비 0원으로 떨어진다
  const condensed = condenseAds(adsRaw);
  const ads = full ? { available: true, ...adsRaw } : condensed;
  const traffic = full
    ? { available: true, ...trafficRaw }
    : condenseTraffic(trafficRaw);

  return jsonOk({
    ok: true,
    generatedAt: new Date().toISOString(),
    range: {
      startDate: period.startDate,
      endDate: period.endDate,
      days: period.days,
      requested:
        url.searchParams.get("range") || url.searchParams.get("days") || "30",
    },
    efficiency: deriveEfficiency(condensed, leads),
    ads,
    traffic,
    funnel: funnelRaw || { available: false },
    leads,
  });
}
