// Meta Conversions API (CAPI) — 서버사이드 이벤트 재전송.
//
// 브라우저 픽셀(fbq)과 동일 event_id 로 보내 Meta 가 중복제거(deduplication).
// 광고차단기·iOS·쿠키제한으로 유실되는 이벤트(30~50%)를 서버에서 복원 → 리타겟팅
// 모수 정확도 향상.
//
// 토큰/픽셀ID 미설정 시 자동 skip (안전). 토큰: env.META_CAPI_TOKEN (wrangler secret),
// 픽셀ID: env.META_PIXEL_ID (wrangler.toml vars). 테스트: env.META_CAPI_TEST_CODE.

import { notifyTelegram } from "./telegram.js";
import { logPixelEvent } from "../routes/pixel-events.js";
import {
  BUDGET_BANDS,
  budgetBandIndex,
  estimateBudget,
} from "./estimate-budget.js";

const API_VERSION = "v21.0";

// Lead 1건을 pixel_events 에 기록.
// 홈페이지(웹) Lead: 브라우저 픽셀도 같은 event_id 발사 → channel=both.
// Meta 인스턴트폼 Lead: 사이트 미방문(브라우저 픽셀 없음) → channel=capi (info.channel 지정).
function logLead(env, info, capiStatus, matched) {
  return logPixelEvent(env, {
    event_name: "Lead",
    ga4_name: info.gaName || "generate_lead",
    channel: info.channel || (capiStatus === "skipped" ? "pixel" : "both"),
    event_id: info.eventId || "",
    page_path: info.pagePath || "/estimates",
    source: info.source || "",
    session_id: info.sessionId || "",
    campaign: info.campaign || "",
    adset: info.adset || "",
    ad: info.ad || "",
    ad_id: info.adId || "",
    fbclid: info.fbclid || "",
    estimate_id: info.estimateId || "",
    capi_status: capiStatus,
    matched_fields: matched || "",
    ip: info.ip || "",
    ua: info.ua || "",
  });
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normEmail(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

// 이름은 Meta 규격대로 공백·구두점을 털고 소문자로 눕힌 뒤 해싱한다.
// 한국 이름은 성과 이름을 나누기 어려워 통째로 fn 에 넣는다 — Meta 는 fn 만
// 와도 신호로 받아들이며, ln 을 억지로 쪼개면 오히려 틀린 값이 들어간다.
function normName(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[\s.,'"-]/g, "");
}

// 한국 번호 → 국가코드 포함 숫자(E.164 형식의 숫자부). 010xxxx → 8210xxxx
function normPhone(v) {
  const d = String(v || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("82")) return d;
  if (d.startsWith("0")) return "82" + d.slice(1);
  return d;
}

/**
 * Lead 전환을 Meta CAPI 로 전송. fire-and-forget 으로 호출(반환 await 불필요).
 * @param {*} env
 * @param {*} ctx  waitUntil 용 (선택)
 * @param {{eventId?:string, email?:string, phone?:string, ip?:string, ua?:string, fbp?:string, fbc?:string, sourceUrl?:string}} info
 */
export async function sendMetaCapiLead(env, ctx, info = {}) {
  const pixelId = String(env.META_PIXEL_ID || "").trim();
  const token = String(env.META_CAPI_TOKEN || "").trim();
  if (!pixelId || !token) {
    // 토큰 미설정이어도 브라우저 픽셀 Lead 는 발사됨 → pixel 채널로 기록
    await logLead(env, info, "skipped", "");
    return { skipped: true };
  }

  const userData = await buildUserData(info);
  const matched = Object.keys(userData).join(",");

  const actionSource = info.actionSource || "website";
  const event = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: userData,
  };
  // event_source_url 은 action_source=website 일 때만 필수(인스턴트폼=system_generated 은 생략)
  if (actionSource === "website") {
    event.event_source_url =
      info.sourceUrl || "https://day1design.co.kr/estimates";
  }
  if (info.eventId) event.event_id = info.eventId;

  const payload = { data: [event] };
  if (env.META_CAPI_TEST_CODE)
    payload.test_event_code = env.META_CAPI_TEST_CODE;

  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await logLead(env, info, "failed", matched);
      await notifyTelegram(
        env,
        `[day1design/meta-capi] Lead 전송 실패 ${res.status}\n${body.slice(0, 200)}`,
      );
      return { ok: false, status: res.status };
    }
    await logLead(env, info, "sent", matched);
    return { ok: true };
  } catch (e) {
    await logLead(env, info, "failed", matched);
    await notifyTelegram(
      env,
      `[day1design/meta-capi] 예외\n${(e?.message || "").slice(0, 200)}`,
    );
    return { ok: false, error: e?.message };
  }
}

async function buildUserData(info) {
  const userData = {};
  const em = normEmail(info.email);
  if (em) userData.em = [await sha256Hex(em)];
  const ph = normPhone(info.phone);
  if (ph) userData.ph = [await sha256Hex(ph)];
  // 이름과 접수 식별자를 함께 보내 매칭 신호를 늘린다. Meta 인스턴트폼 리드는
  // 브라우저 신호(fbp·fbc·ua)가 아예 없어 전화번호 하나로만 매칭되던 상태였다.
  const fn = normName(info.name);
  if (fn) userData.fn = [await sha256Hex(fn)];
  // external_id 는 우리 쪽 접수 식별자다. 같은 사람이 다시 접수해도 같은 값이
  // 아니므로 사람 식별이 아니라 이벤트 대조용으로 쓰인다.
  if (info.externalId)
    userData.external_id = [await sha256Hex(String(info.externalId))];
  if (info.ip) userData.client_ip_address = info.ip;
  if (info.ua) userData.client_user_agent = info.ua;
  if (info.fbp) userData.fbp = info.fbp;
  if (info.fbc) userData.fbc = info.fbc;
  return userData;
}

// 가용예산 1억원 이상 접수에만 하나 더 보내는 사용자 정의 이벤트(2026-10-27 사용자 결정).
// Lead 는 모든 접수에서 그대로 나가므로 Lead 로 최적화하는 광고세트와 기존 집계
// (pixel_events·Meta 전달 상태)는 달라지지 않는다. 예산 판정 규칙이 워커에만 있어
// 브라우저 픽셀은 이 이벤트를 보내지 않는다.
export const QUALIFIED_LEAD_EVENT = "QualifiedLead";
const QUALIFIED_BAND = budgetBandIndex(10000); // 만원 단위, '1억~1억5천' 구간부터

/** 1억원 이상이면 예산 판정 결과, 아니면(미기재·'1억 이하' 포함) null. */
export function qualifiedLeadBudget(row) {
  const budget = estimateBudget(row);
  return budget.band >= QUALIFIED_BAND ? budget : null;
}

/**
 * 1억원 이상 접수면 QualifiedLead 를 CAPI 로 보낸다. 예외를 던지지 않는다.
 * @param {*} info  sendMetaCapiLead 와 같은 매칭 정보 + leadSource(접수 경로)
 * @param {{Detail?:string, SpaceSize?:string, EstimateAmount?:number}} row  예산을 읽을 접수 내용
 */
export async function sendMetaCapiQualifiedLead(env, info = {}, row = {}) {
  const budget = qualifiedLeadBudget(row);
  if (!budget) return { skipped: "below_threshold" };
  const pixelId = String(env.META_PIXEL_ID || "").trim();
  const token = String(env.META_CAPI_TOKEN || "").trim();
  if (!pixelId || !token) return { skipped: true };

  const actionSource = info.actionSource || "website";
  const event = {
    event_name: QUALIFIED_LEAD_EVENT,
    event_time: Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: await buildUserData(info),
    custom_data: {
      value: Math.round(budget.amount * 10000),
      currency: "KRW",
      budget_band: BUDGET_BANDS[budget.band].label,
      lead_source: info.leadSource || "",
    },
  };
  if (actionSource === "website") {
    event.event_source_url =
      info.sourceUrl || "https://day1design.co.kr/estimates";
  }
  // Lead 와 같은 event_id 를 쓴다. Meta 는 이벤트 이름과 event_id 가 모두 같을
  // 때만 한 건으로 묶으므로 Lead 와 섞이지 않고, 같은 접수끼리 대조할 수 있다.
  if (info.eventId) event.event_id = info.eventId;

  const payload = { data: [event] };
  if (env.META_CAPI_TEST_CODE)
    payload.test_event_code = env.META_CAPI_TEST_CODE;

  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await notifyTelegram(
        env,
        `[day1design/meta-capi] QualifiedLead 전송 실패 ${res.status}\n${body.slice(0, 200)}`,
      );
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    await notifyTelegram(
      env,
      `[day1design/meta-capi] QualifiedLead 예외\n${(e?.message || "").slice(0, 200)}`,
    ).catch(() => null);
    return { ok: false, error: e?.message };
  }
}
