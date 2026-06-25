// ─── 시스템 헬스 점검 ───
// 5개 핵심 기능을 진단해 HealthChecks 에 1행 기록 + 텔레그램 리포트.
//   1) 접수처리   2) GA4 연결성   3) Meta 데이터 연결성   4) SENS 홈페이지 문자   5) Meta 리드 작동성
// 각 체크는 자체완결(다른 라우트 의존 없음). 실패해도 다른 체크에 영향 없도록 개별 try/catch.

import { notifyTelegram } from "./telegram.js";

const DAY = 86400000;
const isoSince = (ms) => new Date(Date.now() - ms).toISOString();

async function first(env, sql, ...binds) {
  return env.DB.prepare(sql)
    .bind(...binds)
    .first();
}

// 1) 접수처리: D1 Estimates 쓰기/읽기 가능 + 최근 흐름 + '오류' 스파이크
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
    const cnt = r?.c ?? 0;
    const err = e?.c ?? 0;
    const status = err > 0 ? "warn" : "ok";
    return {
      status,
      metric: `최근 24h ${cnt}건 · 오류 ${err}건`,
      log: `intake: db=readable count24h=${cnt} errStatus24h=${err} last=${r?.last || "-"} → ${status}`,
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

// 4) SENS 홈페이지: 발신 자격증명 + 발신번호 등록 여부
function checkSens(env) {
  const accessKey = String(env.NCP_SENS_ACCESS_KEY || "").trim();
  const secretKey = String(env.NCP_SENS_SECRET_KEY || "").trim();
  const serviceId = String(env.NCP_SENS_SERVICE_ID || "").trim();
  const from = String(env.NCP_SENS_FROM_NUMBER || "").replace(/\D/g, "");
  if (!accessKey || !secretKey || !serviceId) {
    return {
      status: "fail",
      metric: "자격증명 미설정",
      log: "sens-home: access/secret/serviceId 미설정 → fail",
    };
  }
  if (!from) {
    return {
      status: "fail",
      metric: "발신번호 미등록",
      log: "sens-home: from-number 미등록(skip 발생) → fail",
    };
  }
  return {
    status: "ok",
    metric: `발신번호 ${from} 등록`,
    log: `sens-home: creds=complete from=${from} → ok`,
  };
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

const CHECK_DEFS = [
  { key: "intake", label: "접수처리 상태", run: (env) => checkIntake(env) },
  { key: "ga4", label: "GA4 연결성", run: (env) => checkGa4(env) },
  {
    key: "metadata",
    label: "Meta 데이터 연결성",
    run: (env) => checkMetaData(env),
  },
  { key: "sens", label: "SENS 홈페이지 문자", run: (env) => checkSens(env) },
  {
    key: "metalead",
    label: "Meta 리드 작동성",
    run: (env) => checkMetaLead(env),
  },
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

// 전용 채널로 텔레그램 리포트. cron=매일 다이제스트, 오류 시 강조.
export async function sendHealthReport(env, summary) {
  const botToken = env.HEALTHCHECK_BOT_TOKEN;
  const chatId = env.HEALTHCHECK_CHAT_ID;
  if (!botToken || !chatId) return; // 미설정 시 조용히 skip
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
