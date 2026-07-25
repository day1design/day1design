// ─── 시스템 헬스 점검 ───
// 6개 핵심 기능을 진단해 HealthChecks 에 1행 기록 + 인프라봇 리포트.
//   1) 접수처리   2) GA4 연결성   3) Meta 데이터 연결성
//   4) 고객문자 발송   5) Meta 리드 작동성   6) 리드 폴러 생존
// 각 체크는 자체완결(다른 라우트 의존 없음). 실패해도 다른 체크에 영향 없도록 개별 try/catch.

import { notifyTelegram } from "./telegram.js";

const DAY = 86400000;
const HOUR = 3600000;
const isoSince = (ms) => new Date(Date.now() - ms).toISOString();

async function first(env, sql, ...binds) {
  return env.DB.prepare(sql)
    .bind(...binds)
    .first();
}

// 접수 공백 판정 — 평소 유입량(14일 일평균) 대비 얼마나 오래 끊겼는지로 본다.
// 옛 판정식은 '오류 건수'만 봐서 폼이 완전히 죽어 0건이어도 ok 로 보고했다(사각지대).
export function judgeIntakeGap({ dailyAvg, gapHours, err }) {
  if (err > 0) return "warn";
  // 평소 유입이 거의 없는 계정이면 무접수를 이상으로 보지 않는다(오탐 방지)
  if (dailyAvg < 1) return "ok";
  if (gapHours >= 48) return "fail";
  if (gapHours >= 24) return "warn";
  return "ok";
}

// 1) 접수처리: D1 읽기 가능 + 최근 유입 흐름(끊김 감지) + '오류' 스파이크
async function checkIntake(env) {
  try {
    const r = await first(
      env,
      "SELECT COUNT(*) c, MAX(SubmittedAt) last FROM Estimates WHERE SubmittedAt >= ?",
      isoSince(DAY),
    );
    const e = await first(
      env,
      "SELECT COUNT(*) c FROM Estimates WHERE Status='오류' AND SubmittedAt >= ?",
      isoSince(DAY),
    );
    // 14일 평균 유입 = '평소 이 정도는 들어온다' 기준선
    const base = await first(
      env,
      "SELECT COUNT(*) c, MAX(SubmittedAt) last FROM Estimates WHERE SubmittedAt >= ?",
      isoSince(14 * DAY),
    );
    const cnt = r?.c ?? 0;
    const err = e?.c ?? 0;
    const dailyAvg = (base?.c ?? 0) / 14;
    const lastAt = Date.parse(base?.last || "");
    const gapHours = Number.isFinite(lastAt)
      ? Math.floor((Date.now() - lastAt) / HOUR)
      : 999;
    const status = judgeIntakeGap({ dailyAvg, gapHours, err });
    const gapText =
      gapHours >= 24
        ? `마지막 접수 ${Math.floor(gapHours / 24)}일 전`
        : `마지막 접수 ${gapHours}시간 전`;
    return {
      status,
      metric: `최근 24h ${cnt}건 · 오류 ${err}건 · ${gapText}`,
      log: `intake: db=readable count24h=${cnt} errStatus24h=${err} gapH=${gapHours} avg14d=${dailyAvg.toFixed(1)} last=${base?.last || "-"} → ${status}`,
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "D1 접근 실패",
      log: `intake: D1 query failed — ${(ex?.message || "").slice(0, 120)} → fail`,
    };
  }
}

// 2) GA4: OAuth refresh token 으로 access token 발급 가능한지
async function checkGa4(env) {
  const rt = String(
    env.GA4_REFRESH_TOKEN ||
      env.GOOGLE_ANALYTICS_REFRESH_TOKEN ||
      env.GOOGLE_REFRESH_TOKEN ||
      "",
  ).trim();
  if (!rt || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return {
      status: "fail",
      metric: "자격증명 미설정",
      log: "ga4: refresh_token/client 미설정 → fail",
    };
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: rt,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const b = (await res.text()).slice(0, 120);
      return {
        status: "fail",
        metric: `토큰 갱신 실패 (${res.status})`,
        log: `ga4: oauth ${res.status} ${b} → fail`,
      };
    }
    const body = await res.json();
    const ok = !!body.access_token;
    return {
      status: ok ? "ok" : "fail",
      metric: ok ? "OAuth 정상 · 토큰 발급" : "access_token 없음",
      log: `ga4: oauth=200 access_token=${ok} prop=${env.GA4_PROPERTY_ID || "-"} → ${ok ? "ok" : "fail"}`,
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "연결 오류",
      log: `ga4: fetch failed — ${(ex?.message || "").slice(0, 120)} → fail`,
    };
  }
}

// 3) Meta 데이터: Graph API 토큰으로 광고계정 접근 가능한지
async function checkMetaData(env) {
  const token = String(env.META_AD_ACCESS_TOKEN || "").trim();
  const acct = String(env.META_AD_ACCOUNT_ID || "").trim();
  if (!token || !acct) {
    return {
      status: "fail",
      metric: "토큰/계정 미설정",
      log: "meta-data: META_AD_* 미설정 → fail",
    };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/act_${acct}?fields=name,account_status&access_token=${encodeURIComponent(token)}`,
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body?.error?.message || `${res.status}`).slice(0, 120);
      return {
        status: "fail",
        metric: `계정 접근 실패`,
        log: `meta-data: act_${acct} ${res.status} ${msg} → fail`,
      };
    }
    return {
      status: "ok",
      metric: `${body.name || "계정"} 접근 정상`,
      log: `meta-data: act_${acct} name=${body.name || "-"} status=${body.account_status ?? "-"} → ok`,
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "연결 오류",
      log: `meta-data: fetch failed — ${(ex?.message || "").slice(0, 120)} → fail`,
    };
  }
}

// 실제 발송 결과 판정 — 자격증명이 있어도 '전건 미발송'이면 사고다.
//   intake  = 최근 7일 접수 건수(문자를 보냈어야 할 횟수)
//   ok/fail/skip = IntakeEvents 의 lms 단계 집계
export function judgeSmsDelivery({ intake, ok, fail, skip }) {
  if (fail > 0) return "warn";
  if (intake > 0 && ok === 0) return "fail"; // 접수는 있는데 발송 0 = 전면 중단
  if (skip > 0) return "warn"; // 발신번호 미등록 등으로 조용히 건너뛴 건
  return "ok";
}

// 4) 고객문자 발송: 자격증명 + 최근 7일 실제 발송 결과(홈페이지·Meta 양쪽)
//    ⚠ 실발송 테스트는 하지 않는다(비용·고객 문자). 남아있는 발송 로그로만 판정.
async function checkSmsDelivery(env) {
  const accessKey = String(env.NCP_SENS_ACCESS_KEY || "").trim();
  const secretKey = String(env.NCP_SENS_SECRET_KEY || "").trim();
  const serviceId = String(env.NCP_SENS_SERVICE_ID || "").trim();
  const from = String(env.NCP_SENS_FROM_NUMBER || "").replace(/\D/g, "");
  if (!accessKey || !secretKey || !serviceId) {
    return {
      status: "fail",
      metric: "자격증명 미설정",
      log: "sms: access/secret/serviceId 미설정 → fail",
    };
  }
  if (!from) {
    return {
      status: "fail",
      metric: "발신번호 미등록",
      log: "sms: from-number 미등록(전건 skip) → fail",
    };
  }
  try {
    const since = isoSince(7 * DAY);
    // IntakeEvents.Steps 는 JSON 문자열 — lms 단계 결과를 LIKE 로 집계(홈페이지+Meta 공통)
    const r = await first(
      env,
      `SELECT
         SUM(CASE WHEN Steps LIKE '%"lms":"ok"%' THEN 1 ELSE 0 END) okc,
         SUM(CASE WHEN Steps LIKE '%"lms":"fail"%' THEN 1 ELSE 0 END) failc,
         SUM(CASE WHEN Steps LIKE '%"lms":"skip"%' THEN 1 ELSE 0 END) skipc,
         COUNT(*) total
       FROM IntakeEvents WHERE At >= ?`,
      since,
    );
    const s = await first(
      env,
      "SELECT COUNT(*) c FROM SmsLogs WHERE Status='failed' AND SentAt >= ?",
      since,
    );
    const ok = r?.okc ?? 0;
    const fail = (r?.failc ?? 0) + (s?.c ?? 0);
    const skip = r?.skipc ?? 0;
    const intake = r?.total ?? 0;
    const status = judgeSmsDelivery({ intake, ok, fail, skip });
    return {
      status,
      metric: `최근 7일 발송 ${ok}건 · 실패 ${fail}건 · 건너뜀 ${skip}건`,
      log: `sms: from=${from} intake7d=${intake} ok=${ok} fail=${fail} skip=${skip} → ${status}`,
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "발송 로그 조회 실패",
      log: `sms: query failed — ${(ex?.message || "").slice(0, 120)} → fail`,
    };
  }
}

// 5) Meta 리드: 최근 리드 유입 + 동반 SMS 발송 (불일치 = 발송 누락)
async function checkMetaLead(env) {
  try {
    const since = isoSince(7 * DAY);
    const l = await first(
      env,
      "SELECT COUNT(*) c FROM Estimates WHERE Source='meta' AND SubmittedAt >= ?",
      since,
    );
    const s = await first(
      env,
      "SELECT COUNT(*) c FROM SmsLogs WHERE SentBy='system:meta-lead' AND SentAt >= ?",
      since,
    );
    const leads = l?.c ?? 0;
    const sms = s?.c ?? 0;
    const mismatch = leads > 0 && sms === 0;
    const status = mismatch ? "fail" : "ok";
    return {
      status,
      metric: `최근 7일 리드 ${leads}건 · SMS ${sms}건`,
      log: `meta-lead: leads7d=${leads} sms7d=${sms}${mismatch ? " MISMATCH" : ""} → ${status}`,
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "조회 실패",
      log: `meta-lead: query failed — ${(ex?.message || "").slice(0, 120)} → fail`,
    };
  }
}

// 6) 리드 폴러 생존: 아이맥 폴러가 남긴 하트비트 신선도.
//    맥 전원/네트워크/launchd 정지/토큰 만료를 리드가 0건인 시간대에도 잡는다.
//    하트비트가 한 번도 없으면 아직 폴링 미도입(Make 경유)이므로 오탐 없이 skip 처리.
const POLLER_STALE_MINUTES = 90; // 20분 주기 × 4회 연속 실패 여유
export function judgePollerFreshness({ lastAt, lastStatus, nowMs }) {
  if (!lastAt) return { status: "ok", stale: null, adopted: false };
  const ms = Date.parse(lastAt);
  if (!Number.isFinite(ms)) return { status: "fail", stale: null, adopted: true };
  const stale = Math.floor((nowMs - ms) / 60000);
  if (stale > POLLER_STALE_MINUTES) return { status: "fail", stale, adopted: true };
  if (lastStatus === "fail") return { status: "fail", stale, adopted: true };
  return { status: "ok", stale, adopted: true };
}

async function checkLeadPoller(env) {
  try {
    const row = await first(
      env,
      "SELECT At, Status, Detail FROM SystemHeartbeats WHERE Source='meta-lead-poller' ORDER BY At DESC LIMIT 1",
    );
    const j = judgePollerFreshness({
      lastAt: row?.At || "",
      lastStatus: row?.Status || "",
      nowMs: Date.now(),
    });
    if (!j.adopted) {
      return {
        status: "ok",
        metric: "미도입 (Make 경유 수신)",
        log: "lead-poller: heartbeat 없음(폴링 전환 전) → ok",
      };
    }
    return {
      status: j.status,
      metric:
        j.status === "ok"
          ? `${j.stale}분 전 정상 · ${row?.Detail || ""}`.trim()
          : `${j.stale}분간 신호 없음`,
      log: `lead-poller: last=${row?.At || "-"} status=${row?.Status || "-"} staleMin=${j.stale} → ${j.status}`,
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "하트비트 조회 실패",
      log: `lead-poller: query failed — ${(ex?.message || "").slice(0, 120)} → fail`,
    };
  }
}

const CHECK_DEFS = [
  { key: "intake", label: "접수처리 상태", run: (env) => checkIntake(env) },
  { key: "ga4", label: "GA4 연결성", run: (env) => checkGa4(env) },
  {
    key: "metadata",
    label: "Meta 데이터 연결성",
    run: (env) => checkMetaData(env),
  },
  { key: "sens", label: "고객문자 발송", run: (env) => checkSmsDelivery(env) },
  {
    key: "metalead",
    label: "Meta 리드 작동성",
    run: (env) => checkMetaLead(env),
  },
  { key: "leadpoll", label: "리드 폴러 생존", run: (env) => checkLeadPoller(env) },
];

function rollup(results) {
  const st = results.map((r) => r.status);
  if (st.includes("fail")) return "fail";
  if (st.includes("warn")) return "warn";
  return "ok";
}

// 점검 실행 + HealthChecks 기록. { overall, results, id } 반환.
export async function runHealthChecks(env, services, triggeredBy = "cron") {
  const results = [];
  for (const def of CHECK_DEFS) {
    let r;
    try {
      r = await def.run(env);
    } catch (ex) {
      r = {
        status: "fail",
        metric: "점검 오류",
        log: `${def.key}: ${(ex?.message || "").slice(0, 120)}`,
      };
    }
    results.push({ key: def.key, label: def.label, ...r });
  }
  const overall = rollup(results);
  const checkedAt = new Date().toISOString();
  let id = null;
  try {
    const rec = await services.healthChecks.create({
      CheckedAt: checkedAt,
      Overall: overall,
      Results: JSON.stringify(results),
      TriggeredBy: triggeredBy,
    });
    id = rec.id;
  } catch {
    // 기록 실패해도 결과는 반환
  }
  return { id, checkedAt, overall, results, triggeredBy };
}

const STATUS_ICON = { ok: "🟢", warn: "🟡", fail: "🔴" };
const OVERALL_LABEL = { ok: "정상", warn: "주의", fail: "오류" };

// 헬스 리포트 발송 대상 — 인프라봇 일원화(2026-07-25).
// 고객 접수 알림은 기존 채널 그대로. 미설정 시에만 옛 전용 헬스채널 → 관리자 채널로 폴백(알림 유실 금지).
export function healthReportTarget(env) {
  const infraToken = String(env.INFRA_BOT_TOKEN || "").trim();
  const infraChat = String(env.INFRA_CHAT_ID || "").trim();
  if (infraToken && infraChat) return { botToken: infraToken, chatId: infraChat };
  const hcToken = String(env.HEALTHCHECK_BOT_TOKEN || "").trim();
  const hcChat = String(env.HEALTHCHECK_CHAT_ID || "").trim();
  if (hcToken && hcChat) return { botToken: hcToken, chatId: hcChat };
  const adminToken = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const adminChat = String(env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  if (adminToken && adminChat) return { botToken: adminToken, chatId: adminChat };
  return null;
}

// 인프라봇 채널로 텔레그램 리포트. cron=매일 다이제스트, 오류 시 강조.
export async function sendHealthReport(env, summary) {
  const target = healthReportTarget(env);
  if (!target) return; // 어떤 채널도 없으면 조용히 skip
  const { botToken, chatId } = target;
  const { overall, results, triggeredBy } = summary;
  const head =
    overall === "ok"
      ? "✅ 전체 정상"
      : `${STATUS_ICON[overall]} ${OVERALL_LABEL[overall]} — 점검 필요`;
  const lines = results.map(
    (r) => `${STATUS_ICON[r.status]} ${r.label} — ${r.metric}`,
  );
  const kst = new Date(Date.now() + 9 * 3600000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const text = [
    `<b>[day1design/healthcheck]</b> 🩺 시스템 점검 (${triggeredBy === "manual" ? "수동" : "자동"})`,
    head,
    "",
    ...lines,
    "",
    `${kst} KST`,
  ].join("\n");
  await notifyTelegram(env, text, { botToken, chatId });
}

// cron/수동 공통: 점검 + 기록 + 리포트. 오류일 때만 알릴지(alertOnlyOnIssue) 옵션.
export async function runAndReportHealth(
  env,
  services,
  { triggeredBy = "cron", alertOnlyOnIssue = false } = {},
) {
  const summary = await runHealthChecks(env, services, triggeredBy);
  if (!alertOnlyOnIssue || summary.overall !== "ok") {
    await sendHealthReport(env, summary);
  }
  return summary;
}
