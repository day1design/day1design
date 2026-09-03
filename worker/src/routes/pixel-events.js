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
  "FormStart",
  "SubmitAttempt",
  "ValidationError",
  "SubmitError",
  "FormSuccess",
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
          campaign, adset, ad, ad_id, fbclid, event_detail, estimate_id, ip, ua)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, 'pixel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        s(body.event_detail, 160),
        s(body.estimate_id, 40),
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
          campaign, adset, ad, ad_id, fbclid, event_detail, estimate_id, capi_status, matched_fields, ip, ua)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        s(row.event_detail, 160),
        s(row.estimate_id, 40),
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
       GROUP BY d, event_name ORDER BY d ASC LIMIT 4000`,
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

  // CAPI 매칭 신호 진단 — Meta 가 전환을 광고에 붙일 수 있느냐는 사람을 알아볼
  // 신호를 몇 개나 실어 보냈는지에 달려 있다. 전화번호 하나만 보내던 경로가
  // 있는지 여기서 드러난다.
  const matchRows = await env.DB.prepare(
    `SELECT channel,
            COALESCE(NULLIF(matched_fields,''),'(없음)') matched_fields,
            capi_status,
            COUNT(*) n
       FROM pixel_events
      WHERE created_at >= ${since} AND event_name='Lead'
      GROUP BY channel, matched_fields, capi_status
      ORDER BY n DESC LIMIT 30`,
  ).all();

  // 홈페이지 접수(브라우저를 거친 경로)와 실제 접수 레코드 수를 맞대어
  // 계측이 새는지 본다. Meta 인스턴트폼은 브라우저를 안 거치므로 뺀다.
  const leadReconcile = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM pixel_events
         WHERE created_at >= ${since} AND event_name='Lead' AND channel <> 'capi') tracked,
       (SELECT COUNT(*) FROM Estimates
         WHERE SubmittedAt >= ${since} AND Status NOT IN ('작성중','오류')
           AND Source <> 'meta') recorded`,
  ).first();

  const items = await env.DB.prepare(
    `SELECT created_at, event_name, channel, event_id, page_path, source, campaign, ad, ad_id,
            event_detail, estimate_id, capi_status
       FROM pixel_events WHERE created_at >= ${since}
       ORDER BY created_at DESC LIMIT 200`,
  ).all();

  const outcome = await env.DB.prepare(
    `SELECT COUNT(*) inquiries,
            SUM(CASE WHEN ContactedAt <> '' OR Status IN ('상담중','견적완료','계약완료','전화상담 후 미진행','전화상담 후 미팅예약','전화상담 후 대기중') THEN 1 ELSE 0 END) contacted,
            SUM(CASE WHEN Status='전화상담 후 미팅예약' THEN 1 ELSE 0 END) meetings,
            SUM(CASE WHEN Status IN ('견적완료','계약완료') THEN 1 ELSE 0 END) quoted,
            SUM(CASE WHEN Status='계약완료' THEN 1 ELSE 0 END) contracted,
            SUM(CASE WHEN Status='계약완료' THEN COALESCE(NULLIF(ContractAmount,0), EstimateAmount, 0) ELSE 0 END) contract_value
       FROM Estimates
       WHERE SubmittedAt >= ${since} AND Status NOT IN ('작성중','오류')`,
  ).first();

  const byOutcome = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(MetaAd,''), NULLIF(MetaAdId,''), NULLIF(Campaign,''), '(미지정)') label,
            MetaAdId ad_id,
            COALESCE(NULLIF(MetaCampaign,''), NULLIF(UtmCampaign,''), NULLIF(Campaign,''), '') campaign,
            COUNT(*) inquiries,
            SUM(CASE WHEN ContactedAt <> '' OR Status IN ('상담중','견적완료','계약완료','전화상담 후 미진행','전화상담 후 미팅예약','전화상담 후 대기중') THEN 1 ELSE 0 END) contacted,
            SUM(CASE WHEN Status IN ('견적완료','계약완료') THEN 1 ELSE 0 END) quoted,
            SUM(CASE WHEN Status='계약완료' THEN 1 ELSE 0 END) contracted,
            SUM(CASE WHEN Status='계약완료' THEN COALESCE(NULLIF(ContractAmount,0), EstimateAmount, 0) ELSE 0 END) contract_value
       FROM Estimates
       WHERE SubmittedAt >= ${since} AND Status NOT IN ('작성중','오류')
       GROUP BY label, ad_id, campaign
       ORDER BY inquiries DESC, contract_value DESC LIMIT 30`,
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
      formStart: nameCount.FormStart || 0,
      submitAttempt: nameCount.SubmitAttempt || 0,
      validationError: nameCount.ValidationError || 0,
      submitError: nameCount.SubmitError || 0,
      formSuccess: nameCount.FormSuccess || 0,
      lead,
      dedupRate: leadTotal ? Math.round((leadDedup / leadTotal) * 100) : 0,
      cr: nameCount.PageView ? (lead / nameCount.PageView) * 100 : 0,
    },
    funnel: {
      pageview: nameCount.PageView || 0,
      viewcontent: nameCount.ViewContent || 0,
      cta_contact: (nameCount.InitiateCheckout || 0) + (nameCount.Contact || 0),
      form_start: nameCount.FormStart || 0,
      submit_attempt: nameCount.SubmitAttempt || 0,
      validation_error: nameCount.ValidationError || 0,
      submit_error: nameCount.SubmitError || 0,
      form_success: nameCount.FormSuccess || 0,
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
    match: {
      rows: (matchRows.results || []).map((r) => {
        const fields = String(r.matched_fields || "");
        return {
          channel: r.channel || "",
          capiStatus: r.capi_status || "",
          fields,
          signals: fields && fields !== "(없음)" ? fields.split(",").length : 0,
          count: Number(r.n || 0),
        };
      }),
      tracked: Number(leadReconcile?.tracked || 0),
      recorded: Number(leadReconcile?.recorded || 0),
      missing: Math.max(
        0,
        Number(leadReconcile?.recorded || 0) -
          Number(leadReconcile?.tracked || 0),
      ),
    },
    outcome: {
      inquiries: Number(outcome?.inquiries || 0),
      contacted: Number(outcome?.contacted || 0),
      meetings: Number(outcome?.meetings || 0),
      quoted: Number(outcome?.quoted || 0),
      contracted: Number(outcome?.contracted || 0),
      contractValue: Number(outcome?.contract_value || 0),
    },
    byOutcome: (byOutcome.results || []).map((r) => ({
      label: r.label || "(미지정)",
      ad_id: r.ad_id || "",
      campaign: r.campaign || "",
      inquiries: Number(r.inquiries || 0),
      contacted: Number(r.contacted || 0),
      quoted: Number(r.quoted || 0),
      contracted: Number(r.contracted || 0),
      contractValue: Number(r.contract_value || 0),
    })),
    items: items.results || [],
  });
}
