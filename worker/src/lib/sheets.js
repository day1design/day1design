// ─── 구글시트 리드 미러링 ───
// 접수 1건이 D1 에 확정 저장된 뒤, 같은 내용을 영업용 구글시트에 1행 append 한다.
// D1 이 SoT 이고 시트는 사본이다 — 시트 실패가 접수를 막으면 안 되므로 항상 호출부에서
// waitUntil + catch 로 감싼다(단계 결과는 IntakeEvents.steps.sheet 로 남는다).
//
// 인증: GA4/GSC 와 동일한 OAuth refresh_token 방식(GOOGLE_CLIENT_ID/SECRET 공용).
//       시트 쓰기는 스코프가 다르므로 전용 refresh token 이 필요하다
//       (https://www.googleapis.com/auth/spreadsheets).
// 주입: wrangler secret put GOOGLE_SHEETS_REFRESH_TOKEN
//       wrangler.toml [vars] LEADS_SHEET_ID / (선택) LEADS_SHEET_TAB

const TIMEOUT_MS = 8000;

// 시트 컬럼 순서 — A~L 은 Make 시절부터 쌓인 기존 5천여 행의 컬럼이다.
// **순서·문구를 바꾸면 기존 행과 어긋난다. 절대 중간 삽입/이름변경 금지, 추가는 맨 뒤에만.**
// M~O 는 홈페이지 접수까지 한 시트에 담으면서 추가(기존 행은 빈칸으로 남음).
export const LEAD_SHEET_HEADER = [
  "접수시간", // A — ISO UTC (기존 행과 동일 포맷)
  "캠페인", // B
  "플랫폼", // C — 기존 표기 유지: ig / fb
  "지역", // D
  "이름", // E
  "연락처", // F
  "공간유형", // G
  "면적", // H
  "가용예산", // I
  "시공예정일", // J
  "상담내용", // K
  "메일발송", // L — Make 시절 컬럼. 워커는 채우지 않는다(발송 결과는 접수관리/작동로그).
  "출처", // M — homepage / meta
  "이메일", // N
  "접수ID", // O — D1 Estimates.id (어드민 대조용)
];

export const LEGACY_COLUMN_COUNT = 12;

// 기존 행이 instagram/facebook 이 아니라 ig/fb 로 쌓여 있다 — 표기를 맞춘다.
export function platformCode(platform) {
  const v = String(platform || "").toLowerCase();
  if (v === "instagram" || v === "ig") return "ig";
  if (v === "facebook" || v === "fb") return "fb";
  return v;
}

export function sheetsRefreshToken(env) {
  return env.GOOGLE_SHEETS_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN || "";
}

// refresh token 은 그것을 발급한 OAuth 클라이언트로만 교환된다. 시트 토큰을 GA4 와
// 다른 클라이언트로 발급했을 수 있으므로 시트 전용 키를 먼저 보고 없으면 공용 키로 폴백한다.
// (GA4 쪽 GOOGLE_CLIENT_ID/SECRET 을 덮어쓰지 않기 위한 분리)
export function sheetsClient(env) {
  return {
    id: env.GOOGLE_SHEETS_CLIENT_ID || env.GOOGLE_CLIENT_ID || "",
    secret: env.GOOGLE_SHEETS_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || "",
  };
}

// 미러링 on/off 스위치. 2026-08-24 사용자 요청으로 시트 기록을 중단했다
// (wrangler.toml LEADS_SHEET_ENABLED="0"). 자격증명·시트 ID 는 그대로 두고 이 값만
// "1" 로 되돌리면 다시 기록된다. 값이 없으면 기본은 켜짐이다.
export function isSheetEnabled(env) {
  const v = String(env?.LEADS_SHEET_ENABLED ?? "1")
    .trim()
    .toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}

export function isSheetConfigured(env) {
  const client = env ? sheetsClient(env) : { id: "", secret: "" };
  return Boolean(
    env &&
    isSheetEnabled(env) &&
    env.LEADS_SHEET_ID &&
    client.id &&
    client.secret &&
    sheetsRefreshToken(env),
  );
}

// 접수시간은 기존 행과 같은 ISO UTC 로 적는다(2025-04-24T17:12:19.000Z 형식).
export function toSheetStamp(iso) {
  const ms = Date.parse(String(iso || ""));
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
}

export function buildLeadRow(lead = {}) {
  const cell = (v) =>
    String(v ?? "")
      .replace(/\r/g, "")
      .slice(0, 2000);
  return [
    toSheetStamp(lead.submittedAt),
    cell(lead.campaign),
    platformCode(lead.platform),
    cell(lead.address),
    cell(lead.name),
    cell(lead.phone),
    cell(lead.spaceType),
    cell(lead.spaceSize),
    cell(lead.budget),
    cell(lead.schedule),
    cell(lead.detail),
    "", // 메일발송 — Make 시절 컬럼. append 시점엔 발송 결과를 모르므로 비운다.
    cell(lead.source),
    cell(lead.email),
    cell(lead.id),
  ];
}

async function accessToken(env, fetchImpl) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: sheetsClient(env).id,
      client_secret: sheetsClient(env).secret,
      refresh_token: sheetsRefreshToken(env),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    // 스코프 부족(analytics 전용 토큰 등)도 여기서 드러난다.
    throw new Error(
      `sheets_oauth_${res.status}${body?.error ? `_${body.error}` : ""}`,
    );
  }
  return body.access_token;
}

// 탭 이름이 틀리면 append 가 400 이다. 실패했을 때만 첫 번째 탭 제목을 조회해 재시도한다
// (평상시 서브리퀘스트는 토큰 1 + append 1 = 2회로 유지).
async function firstSheetTitle(env, token, fetchImpl) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    env.LEADS_SHEET_ID,
  )}?fields=sheets.properties.title`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  const title = body?.sheets?.[0]?.properties?.title;
  if (!res.ok || !title) throw new Error(`sheets_meta_${res.status}`);
  return title;
}

async function appendValues(env, token, tab, values, fetchImpl) {
  const range = `${tab}!A:${String.fromCharCode(64 + LEAD_SHEET_HEADER.length)}`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      env.LEADS_SHEET_ID,
    )}/values/${encodeURIComponent(range)}:append` +
    // RAW: '=' 로 시작하는 입력이 수식으로 실행되지 않게(수식 인젝션 차단)
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`sheets_append_${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return true;
}

// 리드 1건 append. 꺼져 있거나 미설정이면 조용히 skip 한다
// (연동 전에도, 미러링을 끈 뒤에도 접수는 정상 동작해야 한다).
export async function appendLeadToSheet(env, lead, { fetchImpl = fetch } = {}) {
  if (!isSheetEnabled(env)) return { skipped: true, reason: "disabled" };
  if (!isSheetConfigured(env)) return { skipped: true, reason: "unconfigured" };
  const token = await accessToken(env, fetchImpl);
  const values = [buildLeadRow(lead)];
  const tab = String(env.LEADS_SHEET_TAB || "고객정보").trim();
  try {
    await appendValues(env, token, tab, values, fetchImpl);
  } catch (e) {
    if (e.status !== 400) throw e;
    const resolved = await firstSheetTitle(env, token, fetchImpl);
    await appendValues(env, token, resolved, values, fetchImpl);
  }
  return { ok: true };
}
