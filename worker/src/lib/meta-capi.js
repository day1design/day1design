// Meta Conversions API (CAPI) — 서버사이드 이벤트 재전송.
//
// 브라우저 픽셀(fbq)과 동일 event_id 로 보내 Meta 가 중복제거(deduplication).
// 광고차단기·iOS·쿠키제한으로 유실되는 이벤트(30~50%)를 서버에서 복원 → 리타겟팅
// 모수 정확도 향상.
//
// 토큰/픽셀ID 미설정 시 자동 skip (안전). 토큰: env.META_CAPI_TOKEN (wrangler secret),
// 픽셀ID: env.META_PIXEL_ID (wrangler.toml vars). 테스트: env.META_CAPI_TEST_CODE.

import { notifyTelegram } from "./telegram.js";

const API_VERSION = "v21.0";

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
  if (!pixelId || !token) return { skipped: true };

  const userData = {};
  const em = normEmail(info.email);
  if (em) userData.em = [await sha256Hex(em)];
  const ph = normPhone(info.phone);
  if (ph) userData.ph = [await sha256Hex(ph)];
  if (info.ip) userData.client_ip_address = info.ip;
  if (info.ua) userData.client_user_agent = info.ua;
  if (info.fbp) userData.fbp = info.fbp;
  if (info.fbc) userData.fbc = info.fbc;

  const event = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: info.sourceUrl || "https://day1design.co.kr/estimates",
    user_data: userData,
  };
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
        `[day1design/meta-capi] Lead 전송 실패 ${res.status}\n${body.slice(0, 200)}`,
      );
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    await notifyTelegram(
      env,
      `[day1design/meta-capi] 예외\n${(e?.message || "").slice(0, 200)}`,
    );
    return { ok: false, error: e?.message };
  }
}
