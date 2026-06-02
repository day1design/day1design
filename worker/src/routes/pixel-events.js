// 픽셀 이벤트 — Meta 픽셀 기준 상호작용 로그 (pixel_events)
//
// POST /api/pixel-events        : 브라우저 비콘 적재(공개, main origin). channel=pixel.
// GET  /api/admin/pixel-events  : 어드민 집계(verifyAdmin). KPI·일별·퍼널·소스·광고별·최근.
//
// Lead 는 서버 CAPI(meta-capi.js)가 channel=both 로 기록하므로 비콘에선 제외(중복방지).
// 광고별: 광고 URL 동적 파라미터(utm_campaign/content/term/id, fbclid)를 캡처해 ad_id 로 귀속.

import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { clientIP } from "../lib/security.js";
import { generateId } from "../lib/d1.js";

// 공개 비콘이 적재할 수 있는 표준 이벤트 화이트리스트 (Lead 제외 — 서버 전용)
const ALLOWED = new Set([
  "PageView",
  "ViewContent",
  "Contact",
  "InitiateCheckout",
  "Search",
]);

const s = (v, n) => String(v || "").slice(0, n);

export async function handlePixelEvents(request, env, ctx) {
  if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
  let body;
  try {
    body = JSON.parse(await request.text()); // sendBeacon → text/plain
  } catch {
    return jsonError(400, "invalid json");
  }
  const eventName = s(body.event_name, 40);
  if (!ALLOWED.has(eventName)) return jsonOk({ skipped: true });
  try {
    await env.DB.prepare(
      `INSERT INTO pixel_events
         (id, created_at, event_name, ga4_name, channel, event_id, page_path, source, session_id,
          campaign, adset, ad, ad_id, fbclid, ip, ua)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, 'pixel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        generateId(),
        eventName,
        s(body.ga4_name, 60),
        s(body.event_id, 100),
        s(body.page_path, 300),
        s(body.source, 40),
        s(body.session_id, 64),
        s(body.campaign, 120),
        s(body.adset, 120),
        s(body.ad, 120),
        s(body.ad_id, 40),
        s(body.fbclid, 200),
        clientIP(request),
        s(request.headers.get("user-agent"), 400),
      )
      .run();
  } catch {
    // 고빈도 경로 → 알림 없이 무시
  }
  return jsonOk({ received: true });
}

// 서버측(CAPI 등)에서 직접 1건 기록 — meta-capi.js 에서 호출
export async function logPixelEvent(env, row = {}) {
  try {
    await env.DB.prepare(
      `INSERT INTO pixel_events
         (id, created_at, event_name, ga4_name, channel, event_id, page_path, source, session_id,
          campaign, adset, ad, ad_id, fbclid, capi_status, matched_fields, ip, ua)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        generateId(),
        s(row.event_name || "Lead", 40),
        s(row.ga4_name, 60),
        s(row.channel || "capi", 10),
        s(row.event_id, 100),
        s(row.page_path, 300),
        s(row.source, 40),
        s(row.session_id, 64),
        s(row.campaign, 120),
        s(row.adset, 120),
        s(row.ad, 120),
        s(row.ad_id, 40),
        s(row.fbclid, 200),
        s(row.capi_status, 20),
        s(row.matched_fields, 120),
        s(row.ip, 60),
        s(row.ua, 400),
      )
      .run();
  } catch {}
}

// ─── 어드민 집계 ───
export async function handlePixelEventsAdmin(request, env) {
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1),
    365,
  );
  const since = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${days} days')`;

  const byName = await env.DB.prepare(
    `SELECT event_name, COUNT(*) c FROM pixel_events WHERE created_at >= ${since} GROUP BY event_name`,
  ).all();
  const nameCount = {};
  for (const r of byName.results || []) nameCount[r.event_name] = r.c;

  const daily = await env.DB.prepare(
    `SELECT substr(created_at,1,10) d, event_name, COUNT(*) c
       FROM pixel_events WHERE created_at >= ${since}
       GROUP BY d, event_name ORDER BY d ASC`,
  ).all();

  const bySource = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(source,''),'homepage') source, COUNT(*) c
       FROM pixel_events WHERE created_at >= ${since}
       GROUP BY source ORDER BY c DESC LIMIT 12`,
  ).all();

  // 광고별 상호작용 (ad_id/ad 있는 것만), Lead 수 포함
  const byAd = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(ad,''), NULLIF(ad_id,''), NULLIF(campaign,'')) label,
            ad_id, campaign,
            COUNT(*) total,
            SUM(CASE WHEN event_name='Lead' THEN 1 ELSE 0 END) leads
       FROM pixel_events
       WHERE created_at >= ${since} AND (ad_id <> '' OR ad <> '' OR campaign <> '')
       GROUP BY label ORDER BY total DESC LIMIT 20`,
  ).all();

  const leadStat = await env.DB.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN event_id <> '' THEN 1 ELSE 0 END) dedup
       FROM pixel_events WHERE created_at >= ${since} AND event_name='Lead'`,
  ).first();

  const items = await env.DB.prepare(
    `SELECT created_at, event_name, channel, event_id, page_path, source, campaign, ad, ad_id, capi_status
       FROM pixel_events WHERE created_at >= ${since}
       ORDER BY created_at DESC LIMIT 200`,
  ).all();

  const dailyMap = {};
  for (const r of daily.results || []) {
    const b = (dailyMap[r.d] = dailyMap[r.d] || {
      date: r.d,
      pageview: 0,
      interaction: 0,
      lead: 0,
    });
    if (r.event_name === "PageView") b.pageview += r.c;
    else if (r.event_name === "Lead") b.lead += r.c;
    else b.interaction += r.c;
  }

  const total = Object.values(nameCount).reduce((a, b) => a + b, 0);
  const lead = nameCount.Lead || 0;
  const leadTotal = Number(leadStat?.total || 0);
  const leadDedup = Number(leadStat?.dedup || 0);

  return jsonOk({
    days,
    kpi: {
      total,
      pageview: nameCount.PageView || 0,
      viewcontent: nameCount.ViewContent || 0,
      contact: nameCount.Contact || 0,
      cta: nameCount.InitiateCheckout || 0,
      lead,
      dedupRate: leadTotal ? Math.round((leadDedup / leadTotal) * 100) : 0,
      cr: nameCount.PageView ? (lead / nameCount.PageView) * 100 : 0,
    },
    funnel: {
      pageview: nameCount.PageView || 0,
      viewcontent: nameCount.ViewContent || 0,
      cta_contact: (nameCount.InitiateCheckout || 0) + (nameCount.Contact || 0),
      lead,
    },
    daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    bySource: (bySource.results || []).map((r) => ({
      source: r.source,
      count: r.c,
    })),
    byAd: (byAd.results || []).map((r) => ({
      label: r.label || "(미지정)",
      ad_id: r.ad_id || "",
      campaign: r.campaign || "",
      total: r.total,
      leads: r.leads,
    })),
    items: items.results || [],
  });
}
