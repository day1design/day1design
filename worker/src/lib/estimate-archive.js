// 견적 접수 안전망 — "접수 누락 0".
// 모든 접수 시도(성공/거부/오류)를 R2(estimates-attempts/...)에 원문 보관하고,
// 사람으로 보이는 거부/오류는 D1 Estimates 에도 Status='오류' 로 남겨 유실 0 을 보장한다.
//
// 회귀 이력: 이 안전망은 2026-05-22~26 라이브 가동했으나 git 미커밋 상태로
// 2026-05-29 폼 간소화 배포(7a35a85)에 덮여 유실됐다. stash@{0} 원본을 기준으로
// 현재 모듈 구조에 맞춰 외과적으로 재구현 + 보강(origin 가드 앞 캡처/봇 구분/D1 양면 기록).
import { clientIP } from "./security.js";
import { notifyTelegram } from "./telegram.js";

const RAW_MAX = 4000;
const DETAIL_MAX = 400;

// 모든 접수 시도를 R2 estimates-attempts/{Y}/{M}/{D}/{ISO}-{ip}-{outcome}.json 에 저장.
// 실패가 본 요청 흐름을 막지 않도록 항상 try/catch + (가능하면) ctx.waitUntil.
export async function archiveAttemptToR2(
  env,
  ctx,
  { ip, ua, fields, outcome, error, rawText } = {},
) {
  if (!env || !env.IMAGES) return;
  try {
    const at = new Date();
    const y = at.getUTCFullYear();
    const m = String(at.getUTCMonth() + 1).padStart(2, "0");
    const d = String(at.getUTCDate()).padStart(2, "0");
    const ts = at.toISOString().replace(/[:.]/g, "-");
    const safeIp = String(ip || "unknown").replace(/[^A-Za-z0-9.:_-]/g, "_");
    const key = `estimates-attempts/${y}/${m}/${d}/${ts}-${safeIp}-${outcome}.json`;
    const archive = {
      at: at.toISOString(),
      ip: ip || "",
      ua: ua || "",
      outcome,
      error: error || "",
      fields: fields || null,
      rawText: rawText ? String(rawText).slice(0, RAW_MAX) : "",
    };
    const task = Promise.resolve(
      env.IMAGES.put(key, JSON.stringify(archive, null, 2), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      }),
    ).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  } catch {
    /* 안전망 자체 실패는 본 흐름에 영향 없음 */
  }
}

// 사람으로 보이는 시도인지 — 이름(2자+, URL 아님) 또는 휴대폰(9~11자리)이 채워졌는지.
export function looksHuman({ name, phone } = {}) {
  const n = String(name || "").trim();
  const p = String(phone || "").replace(/\D/g, "");
  const namey = n.length >= 2 && !/(https?:\/\/|www\.)/i.test(n);
  const phoney = p.length >= 9 && p.length <= 11;
  return namey || phoney;
}

// 거부/오류건도 D1 Estimates 에 Status='오류' 로 남겨 '누락 0' 보장.
// 정상건(Status='접수대기')과 구분된다. outcome/사유는 Detail 프리픽스에 기록
// → 스키마 변경(ALTER) 없이 동작. (정규화 컬럼은 migrations/0023 준비만)
export async function recordRejectToD1(
  services,
  ctx,
  {
    name,
    phone,
    email,
    fields = {},
    ip,
    outcome,
    error,
    source = "homepage",
  } = {},
) {
  if (!services || !services.estimates) return;
  const run = (async () => {
    try {
      await services.estimates.create({
        Name: String(name || "").slice(0, 50),
        Phone: String(phone || "").slice(0, 30),
        Email: String(email || "").slice(0, 100),
        SpaceType: fields.space_type || "",
        SpaceSize: fields.space_size || "",
        Postcode: fields.postcode || "",
        Address: fields.address || "",
        AddressDetail: fields.address_detail || "",
        Schedule: fields.schedule || "",
        Referral: fields.referral || "",
        Branch: fields.branch || "",
        Detail: `[오류:${outcome}${error ? ` ${error}` : ""}] ${String(
          fields.detail || "",
        ).slice(0, DETAIL_MAX)}`,
        Status: "오류",
        SubmittedAt: new Date().toISOString(),
        IP: ip || "",
        Source: source,
      });
    } catch {
      /* D1 자체가 막혀도 R2 원문은 이미 보관됨 */
    }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(run);
  else await run;
}

// 사람으로 보이는 차단/오류 1건 텔레그램 경고. 명백한 봇/허니팟 스팸은 호출부에서 제외.
export async function notifyBlockedAttempt(
  env,
  ctx,
  { ip, ua, reasonCode, name, phone } = {},
) {
  const p = String(phone || "").replace(/\D/g, "");
  const tail4 = p.length >= 4 ? p.slice(-4) : "";
  const text =
    `[day1design/estimates] 차단감지\n` +
    `사유: ${reasonCode || "-"}\n` +
    `IP: ${ip || "-"}\n` +
    `이름: ${String(name || "").slice(0, 40) || "-"}\n` +
    `연락처: ****${tail4}\n` +
    `UA: ${String(ua || "").slice(0, 120)}`;
  const task = Promise.resolve(notifyTelegram(env, text)).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(task);
  else await task;
}

// ★보강A: origin 가드(403)처럼 라우트 핸들러 '이전'에 막힌 공개 견적폼 POST 를
// 캡처. 가드 뒤(submitEstimate 내부)에선 도달 못 하므로 라우터에서 호출한다.
// body 를 clone 해서 이름/전화/허니팟을 추출 → R2 보관 + (사람이면) D1 '오류' + 텔레그램.
export async function captureRejectedSubmission(
  request,
  env,
  services,
  ctx,
  { outcome = "origin_denied", error = "" } = {},
) {
  try {
    const ip = clientIP(request);
    const ua = request.headers.get("user-agent") || "";
    const f = {};
    let rawText = "";
    try {
      const form = await request.clone().formData();
      for (const [k, v] of form.entries()) if (typeof v === "string") f[k] = v;
    } catch {
      try {
        rawText = await request.clone().text();
      } catch {
        /* body 소비 불가 — 메타만 보관 */
      }
    }
    const hp = f._hp ?? f.website ?? "";
    await archiveAttemptToR2(env, ctx, {
      ip,
      ua,
      fields: Object.keys(f).length ? f : null,
      outcome,
      error,
      rawText,
    });
    // 봇(허니팟 채워짐)은 R2만. 사람으로 보이는 거부만 D1 '오류' + 텔레그램.
    if (hp === "" && looksHuman({ name: f.name, phone: f.phone })) {
      await recordRejectToD1(services, ctx, {
        name: f.name,
        phone: f.phone,
        email: f.email,
        fields: f,
        ip,
        outcome,
        error,
      });
      await notifyBlockedAttempt(env, ctx, {
        ip,
        ua,
        reasonCode: `${outcome}${error ? `(${error})` : ""}`,
        name: f.name,
        phone: f.phone,
      });
    }
  } catch {
    /* 캡처 실패는 본 응답(거부)에 영향 없음 */
  }
}
