import { jsonOk, jsonError } from "../lib/response.js";
import {
  botSignals,
  clientIP,
  escapeHtml,
  hasUrl,
  isLinkSpam,
  isValidEmail,
  isValidPhone,
  rateLimit,
  safeInflowApp,
} from "../lib/security.js";
import { verifyAdmin } from "../lib/auth.js";
import { safeFileName, datePrefix, randomId } from "../lib/r2.js";
import { createServices } from "../lib/services.js";
import {
  assertUploadPolicy,
  fileExt,
  isImageUpload,
} from "../lib/upload-policy.js";
import { notifyTelegram } from "../lib/telegram.js";
import { sendMetaCapiLead } from "../lib/meta-capi.js";
import { notifyEmail, sendEmail } from "../lib/email.js";
import {
  sendNcpSens,
  buildCustomerSms,
  CUSTOMER_SMS_SUBJECT,
} from "../lib/sens.js";
import { logIntakeEvent } from "../lib/intake-log.js";
import { queueAudit } from "../lib/audit-log.js";
import { appendLeadToSheet } from "../lib/sheets.js";
import {
  edgeCacheGet,
  edgeCachePut,
  edgeCacheDeleteMany,
} from "../lib/edge-cache.js";
import {
  archiveAttemptToR2,
  looksHuman,
  notifyBlockedAttempt,
  recordRejectToD1,
} from "../lib/estimate-archive.js";

const CACHE_TTL = 30;
const ESTIMATE_RATE_LIMIT_PER_HOUR = 60;
function listCacheNs(status) {
  return `estimates:list:${status || "all"}`;
}

// 상담 캘린더 — 예약은 담당자가 저장할 때만 바뀌므로 목록보다 조금 길게 둔다.
// 저장·삭제 시 아래 calendarCacheNs 범위를 통째로 지우므로 옛 값이 남지 않는다.
const CALENDAR_CACHE_TTL = 60;
const CALENDAR_PAGE_SIZE = 200;
const CALENDAR_MAX_PAGE_SIZE = 500;
const CALENDAR_CACHE_PREFIX = "estimates:calendar";
function calendarCacheNs(from, to, limit) {
  return `${CALENDAR_CACHE_PREFIX}:${from}:${to}:${limit}`;
}
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];
const SOURCE_LABELS = {
  homepage: "Homepage",
  instagram_official: "IG오피셜",
  instagram_mkt: "IG마케팅",
  meta: "Meta",
  google: "Google",
  naver: "Naver",
  youtube: "YouTube",
  kakao: "Kakao",
  referral: "Referral",
  other: "Other",
};

function sanitizeText(value, max = 120) {
  return String(value || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, max);
}

function normalizeEstimateAttribution(fields) {
  const raw = [
    fields.source,
    fields.platform,
    fields.campaign,
    fields.utm_source,
    fields.utm_medium,
  ]
    .filter(Boolean)
    .join(" ")
    // NFC 로 합쳐야 한글 낱말이 걸린다 — deriveUtm 이 `normalize("NFKD")` 를
    // 걸어 UtmSource 에는 자모가 분해된 값이 들어온다("메타" → ㅁㅔㅌㅏ).
    // 조합형 정규식은 분해형에 안 걸려 아래 한글 키워드가 전부 헛돈다.
    .normalize("NFC")
    .toLowerCase();
  // 한글 키워드도 같이 본다 — 마케팅 슬러그의 UtmSource 는 SourceLabel 을 그대로
  // 슬러그화한 값이라 "네이버-블로그-견적문의"처럼 한글로 들어온다(marketing.js
  // deriveUtm). 영문만 매칭하던 동안 슬러그 유입이 전부 'other'(기타)로 떨어졌다.
  let source = "homepage";
  // 인스타 프로필(리틀리) 링크는 Meta 유료광고와 완전히 다른 채널이고, 오피셜
  // 계정과 마케팅 계정도 성과를 따로 봐야 해서 계정 단위로 가른다. 아래 meta
  // 분기의 /instagram|인스타/ 가 이 값을 먼저 삼켜 "끝 Meta"로 찍히던 오분류
  // 방지 — 판별 토큰은 ig-organic-* / ig-mkt-* 슬러그가 심는 utm 값이다.
  if (/(instagram-official|인스타그램 오피셜)/.test(raw)) {
    source = "instagram_official";
  } else if (/(instagram-marketing|인스타그램 마케팅)/.test(raw)) {
    source = "instagram_mkt";
  } else if (
    /(facebook|instagram|meta|fbclid|fb\.|ig\.|threads|메타|페이스북|페북|인스타)/.test(
      raw,
    )
  ) {
    source = "meta";
  } else if (/(youtube|youtu\.be|유튜브)/.test(raw)) {
    source = "youtube";
  } else if (/(naver|nclid|네이버)/.test(raw)) {
    source = "naver";
  } else if (/(google|gclid|doubleclick|adwords|구글)/.test(raw)) {
    source = "google";
  } else if (/(kakao|daum|tistory|카카오|카톡|다음)/.test(raw)) {
    source = "kakao";
  } else if (/(referral|social|search)/.test(raw)) {
    source = "referral";
  } else if (raw && !/(homepage|direct)/.test(raw)) {
    source = "other";
  }

  return {
    source,
    platform: SOURCE_LABELS[source],
    campaign: sanitizeText(fields.campaign || fields.utm_campaign || "", 160),
  };
}

// 방문 경계 — 30분 이상 활동이 끊기면 다른 방문으로 본다(GA 관행과 동일).
const VISIT_GAP_MS = 30 * 60 * 1000;

// First-touch 출처 — 자체 트래커 SessionId로 D1 HeatmapEvents 에서 추출·정규화.
// 범위는 "접수 시점이 속한 방문" 하나다. SessionId 는 30일 TTL 을 방문마다
// 갱신하는 슬라이딩이라 재방문자는 ID 가 사실상 영구다. 세션 전체를 훑으면
// 몇 달 전 진입이 오늘 접수의 첫 유입으로 찍힌다(2026-08-14 실측: 85일 전
// 구글 방문이 "첫 google" 로 기록).
async function fetchFirstTouch(env, sessionId) {
  const empty = {
    source: "",
    platform: "",
    campaign: "",
    referrer: "",
    refPath: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    inflowApp: "",
  };
  if (!sessionId || !env?.DB) return empty;
  try {
    // 최신순으로 받아 30분 공백이 나오는 지점까지가 "이번 방문"이다.
    // 방문 경계 계산은 JS 로 한다 — D1(SQLite)에서 CTE·윈도우 함수로 짜면
    // silent fail 이 나기 쉬워 결과가 조용히 비는 사고가 있었다.
    const recent = await env.DB.prepare(
      `SELECT Referrer, RefPath, UtmSource, UtmMedium, UtmCampaign, InflowApp, CreatedAt
       FROM HeatmapEvents
       WHERE SessionId = ? AND EventType = 'page_view'
       ORDER BY CreatedAt DESC
       LIMIT 200`,
    )
      .bind(sessionId)
      .all();
    const rows = recent?.results || [];
    if (!rows.length) return empty;

    const visitDesc = [];
    let prevTs = null;
    for (const r of rows) {
      const ts = Date.parse(r.CreatedAt || "");
      if (!Number.isFinite(ts)) continue;
      if (prevTs !== null && prevTs - ts > VISIT_GAP_MS) break;
      visitDesc.push(r);
      prevTs = ts;
    }
    const visitAsc = visitDesc.reverse();
    // 이번 방문 안에서 "출처가 실린" 가장 이른 진입. 방문 중간 페이지의 referrer
    // 는 트래커가 같은 호스트면 빈값으로 남기므로 사실상 진입 행만 걸린다.
    // 하나도 없으면(=꼬리표 없는 직접 진입) 방문의 첫 행을 그대로 써서 기존처럼
    // homepage(직접)로 떨어지게 둔다 — 빈값으로 반환하면 채널 집계가 끝(Source)
    // 기준으로 넘어가 의미가 달라진다.
    const row =
      visitAsc.find(
        (r) =>
          String(r.Referrer || "") !== "" || String(r.UtmSource || "") !== "",
      ) || visitAsc[0];
    if (!row) return empty;
    const norm = normalizeEstimateAttribution({
      utm_source: row.UtmSource || "",
      utm_medium: row.UtmMedium || "",
      campaign: row.UtmCampaign || "",
      source: row.Referrer || "",
    });
    // 유입 앱 단서는 진입 행에만 실리는 게 아니라 방문 내내 같은 값이 따라온다.
    // 출처가 실린 행이 비어 있어도 같은 방문의 다른 행에서 주워 온다.
    const inflowApp =
      String(row.InflowApp || "") ||
      String(
        visitAsc.find((r) => String(r.InflowApp || "") !== "")?.InflowApp || "",
      );
    return {
      source: norm.source,
      platform: norm.platform,
      campaign: norm.campaign,
      referrer: String(row.Referrer || ""),
      refPath: String(row.RefPath || ""),
      utmSource: String(row.UtmSource || ""),
      utmMedium: String(row.UtmMedium || ""),
      utmCampaign: String(row.UtmCampaign || ""),
      inflowApp,
    };
  } catch {
    return empty;
  }
}

function textValue(value, fallback = "—") {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function htmlValue(value, fallback = "—") {
  return escapeHtml(textValue(value, fallback));
}

function htmlMultiline(value, fallback = "작성 내용 없음") {
  return escapeHtml(textValue(value, fallback)).replace(/\n/g, "<br>");
}

function compactJoin(values, separator = " ") {
  return values
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(separator);
}

function detailWithBudget(detail, budget) {
  const budgetText = sanitizeText(budget, 80);
  const detailText = String(detail || "").trim();
  return compactJoin(
    [budgetText ? `가용예산: ${budgetText}` : "", detailText],
    "\n",
  );
}

function formatKstMinute(value) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(safeDate);
}

function emailShell({ eyebrow, banner, body, footer }) {
  return `
<div style="font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;max-width:580px;margin:0 auto;background:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr>
      <td style="padding:18px 32px;font-size:15px;font-weight:300;color:#ffffff;letter-spacing:5px;text-transform:uppercase;">Day One Design</td>
      <td style="padding:18px 32px;font-size:10px;color:#666666;letter-spacing:2px;text-transform:uppercase;text-align:right;white-space:nowrap;">${escapeHtml(eyebrow)}</td>
    </tr>
  </table>
  <div style="background:#f5f0e8;border-left:3px solid #c8a96e;padding:9px 24px;font-size:12px;color:#6b5b3e;letter-spacing:.3px;">${escapeHtml(banner)}</div>
  <div style="padding:24px 28px 20px;">${body}</div>
  <div style="background:#fafafa;border-top:1px solid #f0f0f0;padding:12px 28px;text-align:center;">
    <p style="font-size:10px;color:#888888;margin:0;line-height:1.6;letter-spacing:.3px;">${escapeHtml(footer)}</p>
  </div>
</div>`.trim();
}

function emailSectionLabel(label) {
  return `<p style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#777777;margin:0 0 10px 0;padding-bottom:7px;border-bottom:1px solid #f0f0f0;">${escapeHtml(label)}</p>`;
}

function emailGridCell(label, value, width, accent = false) {
  return `
        <td width="${width}" style="background:#ffffff;padding:10px 14px;">
          <p style="font-size:9px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#888888;margin:0 0 3px 0;">${escapeHtml(label)}</p>
          <p style="font-size:13px;color:${accent ? "#c8a96e" : "#1a1a1a"};font-weight:${accent ? "500" : "400"};margin:0;">${value}</p>
        </td>`.trim();
}

// Meta 리드(routes/meta-lead.js)도 같은 템플릿을 쓴다 — 내부 알림 메일 스타일 일원화.
export function internalEstimateEmailHtml(env, details) {
  const { fields, attribution, conceptCount, planCount, submittedAt } = details;
  const receivedAt = formatKstMinute(submittedAt);
  const location =
    compactJoin([fields.address, fields.address_detail]) || fields.branch;
  const adminUrl = String(
    env.ADMIN_ESTIMATES_URL || "https://admin.day1design.co.kr/estimates",
  ).trim();
  const campaign = attribution.campaign || "direct / estimate_form";
  // 값이 있는 항목만 렌더 — 간소화 폼은 공간유형·첨부를 수집하지 않으므로 빈 셀 노출 방지.
  // (옛 데이터/파일 첨부 케이스는 값이 있으면 그대로 표시되어 하위호환 유지)
  const projectCells = [
    ["면적", htmlValue(fields.space_size), false],
    ["예산", htmlValue(fields.budget), true],
    ["희망일정", htmlValue(fields.schedule), false],
    ["지점", htmlValue(fields.branch), false],
  ];
  if (fields.space_type)
    projectCells.unshift(["공간유형", htmlValue(fields.space_type), false]);
  if (conceptCount || planCount)
    projectCells.push([
      "첨부",
      `컨셉 ${conceptCount} / 도면 ${planCount}`,
      false,
    ]);
  const cellWidth = `${Math.floor(100 / projectCells.length)}%`;
  const projectCellsHtml = projectCells
    .map(([label, value, accent]) =>
      emailGridCell(label, value, cellWidth, accent),
    )
    .join("\n        ");
  const body = `
    ${emailSectionLabel("Client")}
    <p style="margin:0 0 18px 0;line-height:1.4;">
      <span style="font-size:20px;font-weight:400;color:#1a1a1a;letter-spacing:.5px;">${htmlValue(fields.name)}</span>
      &nbsp;&nbsp;
      <span style="font-size:14px;color:#c8a96e;font-weight:500;letter-spacing:.5px;">${htmlValue(fields.phone)}</span>
      &nbsp;&nbsp;
      <span style="font-size:12px;color:#666666;letter-spacing:.3px;">${htmlValue(location, "지역 미입력")}</span>
    </p>

    ${emailSectionLabel("Project")}
    <table width="100%" cellpadding="0" cellspacing="1" style="background:#f0f0f0;border-radius:2px;margin-bottom:16px;">
      <tr>
        ${projectCellsHtml}
      </tr>
    </table>

    ${emailSectionLabel("Request")}
    <p style="margin:0 0 16px;color:#333333;font-size:13px;line-height:1.7;">${htmlMultiline(fields.detail)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:2px;">
      <tr>
        <td style="padding:10px 14px;">
          <span style="display:block;color:#333333;font-size:12px;line-height:1.8;"><b style="color:#888888;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-right:6px;">Platform</b>${htmlValue(attribution.platform)}</span>
          <span style="display:block;color:#333333;font-size:12px;line-height:1.8;"><b style="color:#888888;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-right:6px;">Campaign</b>${htmlValue(campaign)}</span>
        </td>
        <td style="padding:10px 14px;text-align:right;white-space:nowrap;">
          <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:8px 18px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;border-radius:2px;">관리자 확인</a>
        </td>
      </tr>
    </table>`;
  return emailShell({
    eyebrow: "Consultation Alert",
    banner: `새로운 인테리어 상담 신청이 접수되었습니다 — ${receivedAt}`,
    body,
    footer: `데이원디자인 자동 알림 · ${env.GMAIL_USER || "day1design.co@gmail.com"}`,
  });
}

function customerReceiptHtml(env, fields, submittedAt) {
  const receivedAt = formatKstMinute(submittedAt);
  const space = compactJoin([fields.space_type, fields.space_size], " / ");
  const siteUrl = String(
    env.PUBLIC_SITE_URL || "https://day1design.co.kr",
  ).trim();
  const body = `
    ${emailSectionLabel("Message")}
    <p style="margin:0 0 18px;font-size:20px;font-weight:400;color:#1a1a1a;letter-spacing:.2px;line-height:1.45;">문의를 남겨주셔서 감사합니다.</p>
    <p style="margin:0 0 16px;color:#333333;font-size:13px;line-height:1.7;">담당 매니저가 접수 내용을 확인한 뒤 순차적으로 연락드리겠습니다. 공사 시작일 기준 최소 3개월 이전 상담을 권장드립니다.</p>

    ${emailSectionLabel("Submitted")}
    <table width="100%" cellpadding="0" cellspacing="1" style="background:#f0f0f0;border-radius:2px;margin-bottom:16px;">
      <tr>
        ${emailGridCell("성함", htmlValue(fields.name), "25%")}
        ${emailGridCell("공간", htmlValue(space), "25%")}
        ${emailGridCell("가용예산", htmlValue(fields.budget), "25%", true)}
        ${emailGridCell("희망일정", htmlValue(fields.schedule), "25%")}
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:2px;">
      <tr>
        <td style="padding:10px 14px;">
          <span style="display:block;color:#333333;font-size:12px;line-height:1.8;"><b style="color:#888888;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-right:6px;">Phone</b>070-7717-0030</span>
          <span style="display:block;color:#333333;font-size:12px;line-height:1.8;"><b style="color:#888888;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-right:6px;">Email</b>day1design.co@gmail.com</span>
        </td>
        <td style="padding:10px 14px;text-align:right;white-space:nowrap;">
          <a href="${escapeHtml(siteUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:8px 18px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;border-radius:2px;">홈페이지 보기</a>
        </td>
      </tr>
    </table>`;
  return emailShell({
    eyebrow: "Receipt",
    banner: `상담 신청이 정상 접수되었습니다 — ${receivedAt}`,
    body,
    footer: "DAYONE DESIGN · First space with Day One",
  });
}

function customerReceiptText(fields) {
  const lines = [
    "DAYONE DESIGN 상담 신청이 접수되었습니다.",
    "",
    "담당자가 접수 내용을 확인한 뒤 순차적으로 연락드리겠습니다.",
    "",
    `이름: ${fields.name || "—"}`,
    `연락처: ${fields.phone || "—"}`,
    `공간: ${fields.space_type || "—"}${fields.space_size ? ` / ${fields.space_size}` : ""}`,
    `가용예산: ${fields.budget || "—"}`,
    `지점: ${fields.branch || "—"}`,
    "",
    "문의: 070-7717-0030",
    "메일: day1design.co@gmail.com",
  ];
  return lines.join("\n");
}

function estimateRateLimitAllowlist(env) {
  return new Set(
    String(env.ESTIMATE_RATE_LIMIT_ALLOWLIST || "")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean),
  );
}

// 테스트 화이트리스트 — IP/이름(substring)/전화 중 하나라도 일치하면 true.
// 효과: 봇트랩 timing(3초 미만) 우회만. 허니팟/검증/저장/알림은 일반 고객과 동일.
// 목적: 운영팀이 실제 고객 흐름과 동일한 경로로 반복 테스트.
function isWhitelistedRequest(env, { ip, name, phone }) {
  if (ip && estimateRateLimitAllowlist(env).has(ip)) return true;
  const names = String(env.ESTIMATE_ALLOWLIST_NAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const normName = String(name || "").trim();
  if (normName && names.some((n) => normName.includes(n))) return true;
  const normPhone = String(phone || "").replace(/\D/g, "");
  const phones = new Set(
    String(env.ESTIMATE_ALLOWLIST_PHONES || "")
      .split(",")
      .map((s) => s.replace(/\D/g, "").trim())
      .filter(Boolean),
  );
  if (normPhone && phones.has(normPhone)) return true;
  return false;
}

export async function handleEstimates(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/estimates/, "") || "/";

  if (path === "/" && request.method === "POST") {
    return submitEstimate(request, env, ctx, services);
  }
  if (path === "/" && request.method === "GET") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return listEstimates(request, env, ctx, services);
  }
  // 상담 캘린더: 예약 일시가 잡힌 접수만 기간으로 훑는다. Estimates 를 그대로
  // 읽으므로 접수를 지우면 캘린더에서도 함께 사라진다(별도 일정 테이블 없음).
  // id 매칭보다 먼저 둔다 — 아래 정규식이 "calendar" 를 id 로 삼킨다.
  if (path === "/calendar" && request.method === "GET") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return listConsultCalendar(request, env, ctx);
  }
  const idMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (idMatch) {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    const id = idMatch[1];
    if (request.method === "PATCH")
      return patchEstimate(request, env, id, ctx, services);
    if (request.method === "DELETE")
      return deleteEstimate(env, id, ctx, services);
  }
  // 방문 히스토리: 해당 견적 SessionId 의 모든 page_view 이벤트 시간순
  const visitHistoryMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/visit-history$/);
  if (visitHistoryMatch && request.method === "GET") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return getVisitHistory(env, visitHistoryMatch[1], services);
  }
  return jsonError(404, "Not Found");
}

async function getVisitHistory(env, id, services) {
  if (!/^rec[a-zA-Z0-9]{14}$/.test(id)) return jsonError(400, "Invalid id");
  let record;
  try {
    record = await services.estimates.get(id);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Estimate not found");
    return jsonError(500, "Lookup failed");
  }
  const sessionId = String(record?.fields?.SessionId || "");
  if (!sessionId) {
    return jsonOk({ sessionId: "", events: [] });
  }
  try {
    const res = await env.DB.prepare(
      `SELECT Page, EventType, Device, Referrer, UtmSource, UtmMedium, UtmCampaign,
              Country, City, CreatedAt
       FROM HeatmapEvents
       WHERE SessionId = ? AND EventType = 'page_view'
       ORDER BY CreatedAt ASC
       LIMIT 200`,
    )
      .bind(sessionId)
      .all();
    const events = (res.results || []).map((r) => ({
      page: r.Page,
      device: r.Device,
      referrer: r.Referrer || "",
      utmSource: r.UtmSource || "",
      utmMedium: r.UtmMedium || "",
      utmCampaign: r.UtmCampaign || "",
      country: r.Country || "",
      city: r.City || "",
      createdAt: r.CreatedAt,
    }));
    return jsonOk({ sessionId, events });
  } catch {
    return jsonOk({ sessionId, events: [] });
  }
}

// ─── 상담 캘린더 ───
// 기간 안에 예약이 잡힌 접수를 시간순으로 돌려준다. 어드민이 KST 로 계산한
// 월 경계를 ISO(UTC)로 넘기고, 여기서는 문자열 비교만 한다
// (ConsultAt 은 항상 ISO 문자열로 저장된다 — site/admin/estimates.js doPatch).
async function listConsultCalendar(request, env, ctx) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  // 형식이 어긋난 값은 인덱스를 못 타고 전 구간을 훑는다 → 400 으로 끊는다
  const isIso = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  if (!isIso(from) || !isIso(to)) return jsonError(400, "Invalid range");
  if (from >= to) return jsonError(400, "Invalid range");

  // 페이지네이션 — 한 달치는 한 번에 오지만 90일 조회나 예약이 몰린 구간에서
  // 상한에 걸릴 수 있다. cursor 는 마지막으로 읽은 ConsultAt 이다.
  const cursor = url.searchParams.get("cursor") || "";
  if (cursor && !isIso(cursor)) return jsonError(400, "Invalid cursor");
  const limitRaw = Number(url.searchParams.get("limit") || CALENDAR_PAGE_SIZE);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), CALENDAR_MAX_PAGE_SIZE)
      : CALENDAR_PAGE_SIZE;
  const start = cursor > from ? cursor : from;

  // 목록과 같은 edge cache 를 쓴다. 다만 캐시 키가 기간·쪽 조합마다 달라
  // 쓰기 시점에 전부 지울 수가 없다. 그래서 두 가지로 나눈다.
  //   - 담당자가 방금 저장·취소한 직후에는 fresh=1 로 캐시를 건너뛴다
  //     (자기가 바꾼 값이 화면에 바로 보여야 한다)
  //   - 다른 사람이 바꾼 경우는 TTL(60초) 안에 따라잡는다
  const fresh = url.searchParams.get("fresh") === "1";
  const ns = calendarCacheNs(start, to, limit);
  if (!fresh) {
    const cached = await edgeCacheGet(ns);
    if (cached) return jsonOk(cached);
  }

  try {
    const res = await env.DB.prepare(
      `SELECT id AS Id, Name, Phone, Status, Assignee, ConsultAt, ConsultBranch,
              ConsultCancelledAt, Branch, SpaceType, SpaceSize, Address,
              AddressDetail, Source
       FROM Estimates
       WHERE ConsultAt >= ? AND ConsultAt < ?
       ORDER BY ConsultAt ASC
       LIMIT ?`,
    )
      // 다음 쪽이 있는지 알아야 하므로 한 건 더 읽는다
      .bind(start, to, limit + 1)
      .all();
    const rows = res.results || [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const records = page.map((r) => ({
      id: r.Id,
      name: r.Name || "",
      phone: r.Phone || "",
      status: r.Status || "",
      assignee: r.Assignee || "",
      consultAt: r.ConsultAt || "",
      // 표시 지점은 ConsultBranch 다. Branch 는 접수 때 고른 희망 지점이라
      // 실제 상담 지점과 다를 수 있다(마이그 0041 주석).
      consultBranch: r.ConsultBranch || "",
      // 취소해도 일정은 지우지 않는다. 값이 있으면 취소된 예약이고 캘린더에는
      // '취소' 로 남는다(마이그 0043).
      consultCancelledAt: r.ConsultCancelledAt || "",
      branch: r.Branch || "",
      spaceType: r.SpaceType || "",
      spaceSize: r.SpaceSize || "",
      address: [r.Address || "", r.AddressDetail || ""]
        .filter(Boolean)
        .join(" "),
      source: r.Source || "",
    }));
    // 다음 쪽 시작점. 같은 시각에 여러 건이 몰려도 마지막 건을 포함해 다시
    // 읽으므로 빠지는 예약이 없다(중복은 클라이언트가 id 로 걸러낸다).
    const nextCursor =
      hasMore && records.length ? records[records.length - 1].consultAt : "";
    const payload = { records, nextCursor, hasMore };
    await edgeCachePut(ns, payload, CALENDAR_CACHE_TTL, ctx);
    return jsonOk(payload);
  } catch {
    return jsonError(500, "Calendar lookup failed");
  }
}

async function deleteEstimate(env, id, ctx, services) {
  if (!/^rec[a-zA-Z0-9]{14}$/.test(id)) {
    return jsonError(400, "Invalid id");
  }
  let existing;
  try {
    existing = await services.estimates.get(id);
    await services.estimates.delete(id);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Estimate not found");
    ctx.waitUntil(
      notifyTelegram(
        env,
        `[day1design/estimates] DELETE 실패\nid: ${id}\n${(e.message || "").slice(0, 200)}`,
      ),
    );
    return jsonError(500, "Delete failed");
  }
  // 예약이 잡혀 있던 접수를 지우면 캘린더에서도 사라진다. 상담 인력이 모르고
  // 나가는 일이 없도록 취소를 알린다(예약이 없던 접수는 알리지 않는다).
  if (existing?.fields?.ConsultAt) {
    notifyConsult(
      env,
      ctx,
      consultNotifyText(
        "deleted",
        existing.fields,
        {
          at: existing.fields.ConsultAt,
          branch: existing.fields.ConsultBranch || "",
        },
        env,
        id,
      ),
    );
  }
  const fileUrls = [
    ...safeJsonParse(existing?.fields?.ConceptFiles),
    ...safeJsonParse(existing?.fields?.FloorPlans),
  ];
  if (fileUrls.length && services.media?.deleteMany) {
    ctx.waitUntil(services.media.deleteMany(fileUrls));
  }
  await edgeCacheDeleteMany(
    [
      listCacheNs(null),
      listCacheNs("New"),
      listCacheNs("InProgress"),
      listCacheNs("Done"),
      listCacheNs("Cancelled"),
    ],
    ctx,
  );
  return jsonOk({ deleted: true, id });
}

async function submitEstimate(request, env, ctx, services) {
  const ip = clientIP(request);
  const ua = request.headers.get("user-agent") || "";
  // formData 파싱 실패 대비 raw body 백업 (body 소비 전에 clone)
  let rawBackup = "";
  try {
    rawBackup = await request.clone().text();
  } catch {}

  if (!estimateRateLimitAllowlist(env).has(ip)) {
    const rl = await rateLimit(
      `estimate-submit-v2:${ip}`,
      ESTIMATE_RATE_LIMIT_PER_HOUR,
    );
    if (!rl.allowed) {
      ctx.waitUntil(
        notifyTelegram(
          env,
          `[day1design/estimates] rate-limit 초과\nIP: ${ip} (${rl.count}회)`,
        ),
      );
      // 안전망: rate-limit 거부도 R2 보관 (명백한 스팸이라 D1/텔레그램 경고는 제외)
      await archiveAttemptToR2(env, ctx, {
        ip,
        ua,
        outcome: "rate_limited",
        error: `count=${rl.count}`,
        rawText: rawBackup,
      });
      return jsonError(429, "Too many requests");
    }
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    // 안전망: 파싱 실패도 raw 원문 R2 보관 + 텔레그램
    await archiveAttemptToR2(env, ctx, {
      ip,
      ua,
      outcome: "parse_failed",
      error: e?.message || "parse",
      rawText: rawBackup,
    });
    ctx.waitUntil(
      notifyTelegram(
        env,
        `[day1design/estimates] formData 파싱 실패\nIP: ${ip}\n${(e?.message || "").slice(0, 200)}`,
      ),
    );
    return jsonError(400, "Invalid form data");
  }

  const fields = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") fields[k] = v;
  }
  fields.space_type = sanitizeText(fields.space_type || "", 50);
  fields.space_size = sanitizeText(fields.space_size || "", 50);
  fields.postcode = sanitizeText(fields.postcode || "", 20);
  fields.address = sanitizeText(fields.address || "", 160);
  fields.address_detail = sanitizeText(fields.address_detail || "", 120);
  fields.schedule = sanitizeText(fields.schedule || "", 80);
  fields.referral = sanitizeText(fields.referral || "", 50);
  fields.branch = sanitizeText(fields.branch || "", 50);
  fields.budget = sanitizeText(fields.budget || "", 80);

  // 화이트리스트(테스트 우회) — 봇트랩 timing(3초)만 우회, 알림/검증/저장은 동일
  const isTesterBypass = isWhitelistedRequest(env, {
    ip,
    name: fields.name,
    phone: fields.phone,
  });

  // ★봇 트랩 — 복합신호 판정. 브라우저 자동완성이 허니팟을 채운 '정상고객'은
  // 버리지 않고 일반 접수와 동일하게 살린다(고객 리드 보존). 진짜 봇만 드롭한다.
  const sig = botSignals(fields);
  const phoneOk = isValidPhone(fields.phone || "");
  const nameOk = !!(fields.name && fields.name.trim().length >= 2);
  // 이름의 URL(봇) 또는 문의내용의 링크 스팸/HTML 삽입만 봇 신호로 본다.
  // 문의내용의 단순 참고링크(1~2개)는 정상 고객 패턴이라 봇 신호에서 제외.
  const urlInjected = hasUrl(fields.name) || isLinkSpam(fields.detail);
  const humanShape =
    looksHuman({ name: fields.name, phone: fields.phone }) && phoneOk;

  // 허니팟이 비었는데 초고속(_ts<3s) 제출 — 봇 패턴(테스터는 우회).
  if (!sig.honeypotFilled && sig.tooFast && !isTesterBypass) {
    await archiveAttemptToR2(env, ctx, {
      ip,
      ua,
      fields,
      outcome: "bot_too_fast",
      error: "ts<3s",
      rawText: rawBackup,
    });
    return jsonError(429, "Please try again");
  }

  // 허니팟이 채워진 경우 — 복합신호로 '진짜 봇' vs '자동완성 오탐' 구분.
  let autofillHoneypot = false;
  if (sig.honeypotFilled) {
    // 진짜 봇 신호: 초고속 제출 / URL 삽입 / 이름·연락처 둘 다 형식 깨짐.
    const realBot = sig.tooFast || urlInjected || (!phoneOk && !nameOk);
    if (realBot || !humanShape) {
      // 명백한 봇 → 조용히 드롭(가짜 200) + R2 보관(D1 미저장, 접수관리 오염 방지).
      await archiveAttemptToR2(env, ctx, {
        ip,
        ua,
        fields,
        outcome: "honeypot_bot",
        error: `hp${sig.tooFast ? "+fast" : ""}${urlInjected ? "+url" : ""}${
          !phoneOk && !nameOk ? "+broken" : ""
        }`,
        rawText: rawBackup,
      });
      return jsonOk({ queued: true }); // 봇 기만
    }
    // 사람 + 타이밍 정상 + 형식 정상 → 자동완성 오탐. 정상 접수로 그대로 진행.
    autofillHoneypot = true;
  }

  // 이탈 방지 팝업(exit guard) 경유 접수 — 이름·연락처·동의 세 가지만 받는다.
  // 나머지 항목은 이어지는 견적 폼에서 채워 같은 LeadKey 로 승격된다.
  // 기존 견적 폼의 검증은 그대로 두고, 이 경로에서만 필수 범위를 좁힌다.
  const isExitGuard = fields.form_type === "exit_guard";
  const leadKey = sanitizeText(fields.lead_key || "", 40);

  // 기본 검증 — 간소화 폼 필수: 이름·연락처·평형대·현장주소·희망일정·지점·가용예산 + 개인정보 동의
  // (공간유형·문의경로는 폼에서 제거되어 선택값. 이메일은 2026-08-28 부터 견적
  //  폼의 필수 항목이지만, 이탈 팝업 접수·옛 재전송 큐에는 없으므로 워커는
  //  값이 있을 때만 형식을 본다 — 여기서 필수로 막으면 그 경로가 전부 거부된다)
  const errors = [];
  if (!fields.name || fields.name.length > 50) errors.push("name");
  if (!isValidPhone(fields.phone || "")) errors.push("phone");
  if (fields.email && !isValidEmail(fields.email)) errors.push("email");
  if (fields.privacy_agreed !== "true") errors.push("privacy_agreed");
  if (!isExitGuard) {
    if (!fields.space_size) errors.push("space_size");
    if (!fields.address) errors.push("address");
    if (!fields.schedule) errors.push("schedule");
    if (!fields.branch) errors.push("branch");
    if (!fields.budget) errors.push("budget");
  }
  if ((fields.detail || "").length > 2000) errors.push("detail-too-long");
  // URL 정책: 이름엔 URL 금지(봇). 문의내용엔 단순 참고링크 허용,
  // 링크 스팸(3개+)·HTML/스크립트 삽입만 차단. (정상 고객 링크 첨부 보존)
  if (hasUrl(fields.name)) errors.push("url-in-name");
  if (isLinkSpam(fields.detail)) errors.push("link-spam");
  if (errors.length) {
    // ★누락 0: 검증 실패도 (1) R2 원문 (2) D1 Status='오류' 레코드 (3) 사람이면 텔레그램.
    // 2026-05 사고(budget 누락 silent drop) 재발 방지 — 거부건도 추적/복구 가능해야 한다.
    await archiveAttemptToR2(env, ctx, {
      ip,
      ua,
      fields,
      outcome: "validation_failed",
      error: errors.join(","),
      rawText: rawBackup,
    });
    await recordRejectToD1(services, ctx, {
      name: fields.name,
      phone: fields.phone,
      email: fields.email,
      fields,
      ip,
      outcome: "validation_failed",
      error: errors.join(","),
    });
    if (looksHuman({ name: fields.name, phone: fields.phone })) {
      await notifyBlockedAttempt(env, ctx, {
        ip,
        ua,
        reasonCode: `validation_failed(${errors.join(",")})`,
        name: fields.name,
        phone: fields.phone,
      });
    }
    return jsonError(400, "Validation failed", { errors });
  }
  const attribution = normalizeEstimateAttribution(fields);
  // 팝업 접수는 상세 항목이 비어 있다. 담당자가 통화 전에 상황을 알 수 있게
  // 그 사실을 본문에 남긴다(빈 카드를 받으면 왜 비었는지 알 수 없다).
  const detail = isExitGuard
    ? "이탈 방지 팝업 접수 · 이름·연락처만 입력됨 (상세 항목 미작성)"
    : detailWithBudget(fields.detail, fields.budget);

  // ★검증 통과 시점에 R2 원문 보관 — 이후 업로드/D1 실패에 대비.
  // 자동완성 허니팟 오탐 건은 'accepted_autofill' 로 구분 보관(접수는 정상).
  await archiveAttemptToR2(env, ctx, {
    ip,
    ua,
    fields,
    outcome: autofillHoneypot ? "accepted_autofill" : "accepted",
    rawText: rawBackup,
  });

  // 파일 업로드 (R2)
  const folder = `estimates/${datePrefix()}-${randomId()}`;
  let conceptUrls;
  let planUrls;
  try {
    conceptUrls = await uploadField(
      form,
      "concept_files",
      folder,
      "concept",
      services,
      { allowDocuments: false },
    );
    planUrls = await uploadField(
      form,
      "floor_plans",
      folder,
      "plan",
      services,
      { allowDocuments: true },
    );
  } catch (e) {
    await archiveAttemptToR2(env, ctx, {
      ip,
      ua,
      fields,
      outcome: "upload_failed",
      error: e?.message || "",
      rawText: rawBackup,
    });
    ctx.waitUntil(
      notifyTelegram(
        env,
        `[day1design/estimates] 파일 업로드 실패\nIP: ${ip}\n${(e?.message || "").slice(0, 200)}`,
      ),
    );
    if (e.status) return jsonError(e.status, e.message);
    throw e;
  }

  // D1 레코드 생성
  const submittedAt = fields.submittedAt || new Date().toISOString();
  // First-touch 출처: 자체 트래커 SessionId로 D1 HeatmapEvents의 최초 page_view 조회
  const sessionId = sanitizeText(fields.session_id, 64);
  const firstTouch = await fetchFirstTouch(env, sessionId);

  // ★팝업 → 폼 승격. 팝업이 먼저 저장해 둔 '작성중' 레코드를 LeadKey 로 찾아
  // 새 카드를 만들지 않고 그 레코드를 채운다. 이 대조가 없으면 같은 사람이
  // 카드 두 장(팝업 1 + 폼 1)으로 갈라져 담당자가 같은 고객에게 두 번 전화한다.
  const issuedLeadKey = isExitGuard
    ? leadKey || `${datePrefix()}-${randomId()}`
    : leadKey;
  let promoteId = "";
  if (leadKey) {
    try {
      const found = await services.estimates.listAll({
        where: { LeadKey: leadKey },
      });
      if (found.length) promoteId = found[0].id;
    } catch {
      // 조회 실패는 승격만 포기한다. 접수 자체를 막지 않는다(새 레코드로 저장).
    }
  }

  // ★성공(200)은 D1 저장 확정 후에만 반환. throw 시 1회 재시도 → 그래도 실패면
  // R2 d1_failed 보관 + 텔레그램 + 500(재시도 유도). 가짜 성공 절대 금지.
  const createPayload = {
    Name: fields.name,
    Phone: fields.phone,
    Email: fields.email || "",
    SpaceType: fields.space_type || "",
    SpaceSize: fields.space_size || "",
    Postcode: fields.postcode || "",
    Address: fields.address || "",
    AddressDetail: fields.address_detail || "",
    Schedule: fields.schedule || "",
    Referral: fields.referral || "",
    Branch: fields.branch || "",
    Detail: detail,
    PrivacyAgreed: true,
    ConceptFiles: JSON.stringify(conceptUrls),
    FloorPlans: JSON.stringify(planUrls),
    SubmittedAt: submittedAt,
    // 팝업 접수는 아직 완성된 문의가 아니다. '작성중' 으로 두어 접수관리 기본
    // 목록에서 빠지게 하고, 견적 폼을 마치면 같은 레코드가 '접수대기' 로 승격된다.
    Status: isExitGuard ? "작성중" : "접수대기",
    LeadKey: issuedLeadKey,
    FormType: isExitGuard ? "exit_guard" : leadKey ? "exit_guard" : "",
    IP: ip,
    Source: attribution.source,
    Platform: attribution.platform,
    Campaign: attribution.campaign,
    UtmSource: fields.utm_source || "",
    UtmMedium: fields.utm_medium || "",
    UtmCampaign: fields.utm_campaign || "",
    MetaCampaign: fields._fb_campaign || "",
    MetaCampaignId: fields._fb_campaign_id || "",
    MetaAdset: fields._fb_adset || "",
    MetaAdsetId: fields._fb_adset_id || "",
    MetaAd: fields._fb_ad || "",
    MetaAdId: fields._fb_adid || "",
    Fbclid: fields._fbclid || "",
    Fbp: fields._fbp || "",
    Fbc: fields._fbc || "",
    SessionId: sessionId,
    FirstSource: firstTouch.source,
    FirstPlatform: firstTouch.platform,
    FirstCampaign: firstTouch.campaign,
    FirstReferrer: firstTouch.referrer,
    FirstRefPath: firstTouch.refPath,
    FirstUtmSource: firstTouch.utmSource,
    FirstUtmMedium: firstTouch.utmMedium,
    FirstUtmCampaign: firstTouch.utmCampaign,
    // 방문 이력에 단서가 없으면 접수 폼이 보낸 값을 폴백으로 쓴다(첫 페이지 즉시 접수).
    FirstInflowApp: firstTouch.inflowApp || safeInflowApp(fields.inflow_app),
  };
  const saveRecord = () =>
    promoteId
      ? services.estimates.update(promoteId, createPayload)
      : services.estimates.create(createPayload);
  let record;
  try {
    record = await saveRecord();
  } catch (dbErr1) {
    try {
      record = await saveRecord(); // 1회 재시도
    } catch (dbErr2) {
      await archiveAttemptToR2(env, ctx, {
        ip,
        ua,
        fields: { ...fields, conceptUrls, planUrls },
        outcome: "d1_failed",
        error: (dbErr2 && dbErr2.message) || (dbErr1 && dbErr1.message) || "",
        rawText: rawBackup,
      });
      ctx.waitUntil(
        notifyTelegram(
          env,
          `[day1design/estimates] D1 저장 실패 (R2에 복구가능)\nIP: ${ip}\nName: ${(fields.name || "").slice(0, 40)}\nPhone: ${(fields.phone || "").slice(0, 20)}\n${((dbErr2 && dbErr2.message) || "").slice(0, 200)}`,
        ),
      );
      return jsonError(500, "Save failed, please retry");
    }
  }
  fields.detail = detail;

  // ★자동완성 허니팟 오탐 → 정상 접수 처리됨. 운영 인지용 1줄만 발송(접수는 정상).
  if (autofillHoneypot) {
    const hpPhone = String(fields.phone || "").replace(/\D/g, "");
    ctx.waitUntil(
      notifyTelegram(
        env,
        `[day1design/estimates] 자동완성 허니팟 감지→정상접수 처리\nIP: ${ip}\n이름: ${(fields.name || "").slice(0, 40)}\n연락처: ****${hpPhone.length >= 4 ? hpPhone.slice(-4) : ""}`,
      ),
    );
  }

  // ★이탈 팝업 접수는 여기서 끝낸다. 아직 문의가 완성되지 않았으므로
  // 고객 문자·접수확인 메일·시트 기록·CAPI 는 보내지 않는다("접수되었습니다"
  // 문자가 먼저 가면 방문자가 폼을 마칠 이유를 잃는다). 운영자 인지용
  // 텔레그램 한 줄과 작동로그만 남기고, 나머지는 폼 완주 시점에 전량 발송한다.
  if (isExitGuard) {
    const guardPhone = String(fields.phone || "").replace(/\D/g, "");
    ctx.waitUntil(
      Promise.allSettled([
        notifyTelegram(
          env,
          `[day1design/estimates] 이탈 팝업 접수 (작성중)\n` +
            `이름: ${escapeHtml(fields.name)}\n` +
            `연락처: ${escapeHtml(fields.phone)}\n` +
            `출처: ${escapeHtml(attribution.platform)}\n` +
            `※ 견적 폼 완주 시 같은 카드가 '접수대기' 로 승격됩니다.`,
        ),
        logIntakeEvent(services, {
          channel: "exit_guard",
          source: attribution.source,
          name: fields.name,
          phone: fields.phone,
          geo: String(
            request.cf?.city || request.cf?.region || request.cf?.country || "",
          ),
          estimateId: record.id,
          steps: { d1: "ok", stage: "작성중", phone4: guardPhone.slice(-4) },
          ip,
        }),
      ]),
    );
    return jsonOk({ id: record.id, leadKey: issuedLeadKey, received: true });
  }

  const addressLine = compactJoin([fields.address, fields.address_detail]);
  const notificationLines = [
    `[day1design/estimates] 새 상담신청${promoteId ? " (이탈팝업 경유)" : ""}`,
    `이름: ${escapeHtml(fields.name)}`,
    `연락처: ${escapeHtml(fields.phone)}`,
  ];
  if (fields.email)
    notificationLines.push(`이메일: ${escapeHtml(fields.email)}`);
  notificationLines.push(
    `평형대: ${escapeHtml(fields.space_size)}`,
    `지점: ${escapeHtml(fields.branch)}`,
    `가용예산: ${escapeHtml(fields.budget)}`,
    `희망일정: ${escapeHtml(fields.schedule)}`,
  );
  if (addressLine) notificationLines.push(`주소: ${escapeHtml(addressLine)}`);
  notificationLines.push(
    `출처: ${escapeHtml(attribution.platform)}${attribution.campaign ? ` / ${escapeHtml(attribution.campaign)}` : ""}`,
  );
  if (conceptUrls.length || planUrls.length) {
    notificationLines.push(
      `파일: 컨셉 ${conceptUrls.length} / 평면도 ${planUrls.length}`,
    );
  }
  const notificationText = notificationLines.join("\n");

  // 알림 발송 실패가 접수 저장 성공을 막지 않도록 waitUntil으로 분리.
  // 작동로그(IntakeEvents)용 단계별 결과 수집 — 여기 도달 = D1 저장 확정.
  const steps = { d1: "ok" };
  const notifyTasks = [
    notifyTelegram(env, notificationText)
      .then(() => {
        steps.telegram = "ok";
      })
      .catch(() => {
        steps.telegram = "fail";
      }),
    notifyEmail(env, {
      subject: "[DAYONE] 새 상담신청",
      text: notificationText,
      html: internalEstimateEmailHtml(env, {
        fields,
        attribution,
        conceptCount: conceptUrls.length,
        planCount: planUrls.length,
        submittedAt,
      }),
    })
      .then(() => {
        steps.email = "ok";
      })
      .catch(() => {
        steps.email = "fail";
      }),
  ];
  // 고객 접수확인 메일은 이메일이 있을 때만 보낸다. 견적 폼은 2026-08-28 부터
  // 이메일을 필수로 받지만, 이탈 팝업 접수와 옛 재전송 큐에는 이메일이 없다.
  if (fields.email) {
    notifyTasks.push(
      sendEmail(env, {
        to: fields.email,
        subject: "[DAYONE DESIGN] 견적문의가 접수되었습니다",
        text: customerReceiptText(fields),
        html: customerReceiptHtml(env, fields, submittedAt),
      })
        .then(() => {
          steps.emailCustomer = "ok";
        })
        .catch(() => {
          steps.emailCustomer = "fail";
        }),
    );
  } else {
    steps.emailCustomer = "skip";
  }
  notifyTasks.push(
    // NCP SENS LMS — env/발신번호 미설정 시 sens.js 가 자동 skip
    sendNcpSens(env, {
      to: fields.phone,
      subject: CUSTOMER_SMS_SUBJECT,
      content: buildCustomerSms("homepage"),
    })
      .then((r) => {
        steps.lms = r.ok ? "ok" : r.skipped ? "skip" : "fail";
        if (!r.ok && !r.skipped) {
          return notifyTelegram(
            env,
            `[day1design/estimates] SENS 발송 실패\n` +
              `phone: ${escapeHtml(fields.phone)}\n` +
              `status: ${r.status || "-"}\n` +
              `body: ${escapeHtml((r.body || "").slice(0, 200))}`,
          );
        }
      })
      .catch(() => {
        steps.lms = "fail";
      }),
  );
  // Meta CAPI — 브라우저 픽셀과 동일 event_id(_fb_event_id)로 Lead 재전송(중복제거)
  // + pixel_events 에 Lead 1건 기록(광고별 귀속 포함)
  notifyTasks.push(
    sendMetaCapiLead(env, ctx, {
      eventId: fields._fb_event_id,
      email: fields.email,
      phone: fields.phone,
      name: fields.name,
      externalId: record.id,
      ip,
      ua: request.headers.get("user-agent") || "",
      fbp: fields._fbp,
      fbc: fields._fbc,
      source: attribution.source,
      sessionId,
      pagePath: "/estimates",
      campaign: fields._fb_campaign || fields.campaign || "",
      adset: fields._fb_adset || "",
      ad: fields._fb_ad || "",
      adId: fields._fb_adid || "",
      fbclid: fields._fbclid || "",
      estimateId: record.id,
    })
      .then(() => {
        steps.capi = "ok";
      })
      .catch(() => {
        steps.capi = "fail";
      }),
  );
  // 구글시트 미러링 — D1 저장이 확정된 뒤의 사본 1행. SoT 는 D1 이므로 시트 실패가
  // 접수를 막지 않는다(결과는 IntakeEvents.steps.sheet + 실패 시 텔레그램).
  notifyTasks.push(
    appendLeadToSheet(env, {
      submittedAt,
      name: fields.name,
      phone: fields.phone,
      email: fields.email || "",
      source: attribution.source,
      platform: attribution.platform,
      campaign: attribution.campaign,
      address: addressLine,
      spaceType: fields.space_type || "",
      spaceSize: fields.space_size || "",
      schedule: fields.schedule || "",
      budget: fields.budget || "",
      branch: fields.branch || "",
      detail,
      status: "접수대기",
      id: record.id,
    })
      .then((r) => {
        steps.sheet = r?.skipped ? "skip" : "ok";
      })
      .catch((e) => {
        steps.sheet = "fail";
        return notifyTelegram(
          env,
          `[day1design/estimates] 구글시트 기록 실패\n` +
            `이름: ${escapeHtml(fields.name)}\n` +
            `사유: ${escapeHtml((e?.message || "").slice(0, 200))}`,
        );
      }),
  );

  ctx.waitUntil(
    Promise.allSettled(notifyTasks).then(() =>
      logIntakeEvent(services, {
        channel: "homepage",
        source: "homepage",
        branch: fields.branch,
        name: fields.name,
        phone: fields.phone,
        geo: String(
          request.cf?.city || request.cf?.region || request.cf?.country || "",
        ),
        estimateId: record.id,
        steps,
        ip,
      }),
    ),
  );

  // 관리자 목록 캐시 무효화
  await edgeCacheDeleteMany(
    [listCacheNs(null), listCacheNs("접수대기"), listCacheNs("New")],
    ctx,
  );

  return jsonOk({ id: record.id, received: true });
}

async function uploadField(form, fieldName, folder, prefix, services, policy) {
  const files = form.getAll(fieldName).filter((f) => typeof f !== "string");
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f || !f.size) continue;
    if (f.size > MAX_FILE_BYTES) {
      const err = new Error("File too large");
      err.status = 413;
      throw err;
    }
    assertUploadPolicy(f, policy);
    const isImage = isImageUpload(f);
    const ct = isImage ? "image/webp" : f.type || "application/octet-stream";
    if (!isImage && !ALLOWED_DOCUMENT_TYPES.includes(ct)) {
      const err = new Error("Unsupported file type");
      err.status = 415;
      throw err;
    }
    const ext = fileExt(f.name) || "bin";
    const key = `${folder}/${prefix}-${String(i + 1).padStart(3, "0")}-${safeFileName(f.name.replace(/\.[^.]+$/, ""))}.${ext}`;
    const url = await services.media.upload(key, await f.arrayBuffer(), {
      contentType: ct,
    });
    urls.push(url);
  }
  return urls;
}

async function listEstimates(request, env, ctx, services) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const ns = listCacheNs(status);
  const cached = await edgeCacheGet(ns);
  if (cached) return jsonOk(cached);

  const where = status ? { Status: status } : undefined;
  const all = await services.estimates.listAll({
    where,
    sort: [{ field: "SubmittedAt", direction: "desc" }],
  });
  // 이탈 팝업만 거치고 견적 폼을 마치지 않은 '작성중' 건은 아직 완성된 문의가
  // 아니다. 상태를 명시해서 요청할 때만 돌려주고, 기본 목록에서는 뺀다
  // (상담 카드에 이름·연락처뿐인 카드가 섞이면 접수관리가 오염된다).
  const records = status
    ? all
    : all.filter((r) => r.fields.Status !== "작성중");
  const payload = {
    records: records.map((r) => ({
      id: r.id,
      ...r.fields,
      ConceptFiles: safeJsonParse(r.fields.ConceptFiles),
      FloorPlans: safeJsonParse(r.fields.FloorPlans),
    })),
  };
  await edgeCachePut(ns, payload, CACHE_TTL, ctx);
  return jsonOk(payload);
}

// ─── 상담 예약 알림 (데이원디자인 상담일정관리 채널) ───
// 전용 봇으로만 보낸다. 미설정이면 조용히 skip 한다 — 다른 채널로 새어 나가면
// 상담 인력이 아닌 사람에게 고객 연락처가 간다.
function notifyConsult(env, ctx, text) {
  const botToken = String(env.CALENDAR_BOT_TOKEN || "").trim();
  const chatId = String(env.CALENDAR_CHAT_ID || "").trim();
  if (!botToken || !chatId) return;
  const p = notifyTelegram(env, text, { botToken, chatId });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p);
}

const KST_OFFSET_MS = 9 * 3600 * 1000;
const KST_DOW = ["일", "월", "화", "수", "목", "금", "토"];

// 어드민 상세·캘린더와 같은 표기를 쓴다: 2026-09-12(토) 14:30
function fmtConsultKst(iso) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return String(iso || "");
  const d = new Date(t + KST_OFFSET_MS);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `(${KST_DOW[d.getUTCDay()]}) ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}

// KST 날짜끼리 뺀다. 시각이 아니라 날짜 기준이라 오늘 저녁 예약도 '오늘' 이다.
function ddayLabel(iso) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return "";
  const dayOf = (ms) => Math.floor((ms + KST_OFFSET_MS) / 86400000);
  const diff = dayOf(t) - dayOf(Date.now());
  if (diff === 0) return "오늘";
  return diff > 0 ? `${diff}일 뒤` : `${-diff}일 전`;
}

// 알림에서 바로 눌러 들어갈 어드민 주소. ADMIN_ORIGINS 의 첫 값을 쓰므로
// 도메인이 바뀌어도 코드를 고칠 일이 없다.
function adminBase(env) {
  const first = String(env?.ADMIN_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return (first || "https://admin.day1design.co.kr").replace(/\/$/, "");
}

// 캘린더는 날짜로 열고(그 날 일정이 한눈에), 접수는 id 로 연다.
// 상담 인력이 채널만 보고 있다가 그 자리에서 이동할 수 있어야 한다.
function consultLinkLines(env, iso, id) {
  const base = adminBase(env);
  const out = [];
  const t = Date.parse(iso);
  if (iso && !Number.isNaN(t)) {
    const d = new Date(t + KST_OFFSET_MS);
    const p = (n) => String(n).padStart(2, "0");
    const ymd = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
    out.push(
      `🔗 <a href="${base}/calendar?date=${ymd}">상담 캘린더에서 보기</a>`,
    );
  }
  if (id && /^rec[a-zA-Z0-9]{14}$/.test(id)) {
    out.push(`📋 <a href="${base}/estimates?id=${id}">접수 상세 보기</a>`);
  }
  return out;
}

function consultNotifyText(kind, fields, prev, env, id) {
  const f = fields || {};
  const at = (iso, branch) =>
    `${fmtConsultKst(iso)}${branch ? ` · ${escapeHtml(branch)}` : ""}`;
  const lines = [];
  if (kind === "created") {
    lines.push("[day1design/consult] 상담 예약");
    lines.push(
      `📅 ${at(f.ConsultAt, f.ConsultBranch)} · ${ddayLabel(f.ConsultAt)}`,
    );
  } else if (kind === "moved") {
    lines.push("[day1design/consult] 상담 예약 변경");
    lines.push(`이전 ${at(prev.at, prev.branch)}`);
    lines.push(
      `변경 ${at(f.ConsultAt, f.ConsultBranch)} · ${ddayLabel(f.ConsultAt)}`,
    );
  } else if (kind === "restored") {
    lines.push("[day1design/consult] 상담 예약 되살림");
    lines.push(
      `📅 ${at(f.ConsultAt, f.ConsultBranch)} · ${ddayLabel(f.ConsultAt)}`,
    );
  } else if (kind === "cancelled") {
    // 일정은 지우지 않았다. 캘린더에 '취소'로 남아 있다는 것을 알려 준다.
    lines.push("[day1design/consult] 상담 예약 취소");
    lines.push(
      `📅 ${at(f.ConsultAt || prev.at, f.ConsultBranch || prev.branch)}`,
    );
    lines.push("캘린더에는 취소로 남습니다");
  } else if (kind === "deleted") {
    // 접수 자체가 지워진 경우. 이때만 캘린더에서도 카드가 사라진다.
    lines.push("[day1design/consult] 상담 예약 취소 (접수 삭제)");
    lines.push(`📅 ${at(prev.at, prev.branch)}`);
    lines.push("접수가 지워져 캘린더에서도 사라집니다");
  } else {
    // 일시 자체를 비운 경우 — 잘못 넣은 예약을 되돌린 것이다.
    lines.push("[day1design/consult] 상담 예약 일시 삭제");
    lines.push(`📅 ${at(prev.at, prev.branch)}`);
  }
  lines.push(
    `🙍 ${escapeHtml(f.Name || "")} · ${escapeHtml(f.Phone || "")}`.trimEnd(),
  );
  const space = [f.SpaceType, f.SpaceSize].filter(Boolean).join(" ");
  const detail = [space, f.Address, f.AddressDetail]
    .filter(Boolean)
    .join(" · ");
  if (detail) lines.push(`🏠 ${escapeHtml(detail)}`);
  if (f.Assignee) lines.push(`👤 담당 ${escapeHtml(f.Assignee)}`);
  // 접수를 지운 경우에는 캘린더에 남는 것이 없으므로 링크를 붙이지 않는다.
  if (kind !== "deleted") {
    lines.push(...consultLinkLines(env, f.ConsultAt || prev.at, id));
  }
  return lines.join("\n");
}

// ─── 상담 리마인드 (하루 전 · 2시간 전) ───
// cron 이 15분마다 부른다. 이미 보낸 건은 컬럼에 발송 시각이 박혀 있어
// 몇 번을 돌아도 두 번 나가지 않는다(마이그 0044).
const REMIND_WINDOW_MS = 25 * 3600 * 1000; // 하루 전 알림을 놓치지 않을 여유
const REMIND_RULES = [
  { key: "1d", column: "ConsultRemind1dAt", beforeMs: 24 * 3600 * 1000 },
  { key: "2h", column: "ConsultRemind2hAt", beforeMs: 2 * 3600 * 1000 },
];

export async function runConsultReminders(env, nowMs = Date.now()) {
  if (!env?.DB) return { sent: 0, checked: 0 };
  const botToken = String(env.CALENDAR_BOT_TOKEN || "").trim();
  const chatId = String(env.CALENDAR_CHAT_ID || "").trim();
  if (!botToken || !chatId)
    return { sent: 0, checked: 0, skipped: "no-config" };

  const nowIso = new Date(nowMs).toISOString();
  const untilIso = new Date(nowMs + REMIND_WINDOW_MS).toISOString();

  let rows = [];
  try {
    const res = await env.DB.prepare(
      `SELECT id, Name, Phone, Assignee, Status, ConsultAt, ConsultBranch,
              SpaceType, SpaceSize, Address, AddressDetail,
              ConsultRemind1dAt, ConsultRemind2hAt
         FROM Estimates
        WHERE ConsultAt >= ? AND ConsultAt <= ?
          AND COALESCE(ConsultCancelledAt, '') = ''
        ORDER BY ConsultAt ASC
        LIMIT 100`,
    )
      .bind(nowIso, untilIso)
      .all();
    rows = res.results || [];
  } catch {
    return { sent: 0, checked: 0, error: "query" };
  }

  let sent = 0;
  for (const r of rows) {
    const at = Date.parse(r.ConsultAt);
    if (Number.isNaN(at)) continue;
    for (const rule of REMIND_RULES) {
      // 이미 보냈으면 건너뛴다. 예약을 옮기면 patchEstimate 가 이 값을 비운다.
      if (String(r[rule.column] || "")) continue;
      // 아직 그 시점에 이르지 않았으면 다음 회차로 미룬다.
      if (nowMs < at - rule.beforeMs) continue;
      const text = consultRemindText(rule.key, r, env);
      try {
        await notifyTelegram(env, text, { botToken, chatId });
        await env.DB.prepare(
          `UPDATE Estimates SET ${rule.column} = ? WHERE id = ?`,
        )
          .bind(nowIso, r.id)
          .run();
        sent++;
      } catch {
        // 실패하면 컬럼을 안 채우므로 다음 회차가 다시 시도한다
      }
    }
  }
  return { sent, checked: rows.length };
}

function consultRemindText(key, r, env) {
  const head =
    key === "1d"
      ? "[day1design/consult] 내일 상담 예정"
      : "[day1design/consult] 2시간 뒤 상담";
  const branch = r.ConsultBranch ? ` · ${escapeHtml(r.ConsultBranch)}` : "";
  const lines = [head, `📅 ${fmtConsultKst(r.ConsultAt)}${branch}`];
  lines.push(
    `🙍 ${escapeHtml(r.Name || "")} · ${escapeHtml(r.Phone || "")}`.trimEnd(),
  );
  const space = [r.SpaceType, r.SpaceSize].filter(Boolean).join(" ");
  const detail = [space, r.Address, r.AddressDetail]
    .filter(Boolean)
    .join(" · ");
  if (detail) lines.push(`🏠 ${escapeHtml(detail)}`);
  if (r.Assignee) lines.push(`👤 담당 ${escapeHtml(r.Assignee)}`);
  lines.push(...consultLinkLines(env, r.ConsultAt, r.id));
  return lines.join("\n");
}

async function patchEstimate(request, env, id, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const allowed = [
    // 상담 관리
    "Status",
    "Assignee",
    "ContactedAt",
    "ConsultAt",
    "ConsultBranch",
    "ConsultCancelledAt",
    "ContractAt",
    "ContractOwner",
    "ContractAmount",
    "Memo",
    "EstimateAmount",
    // 고객 정보 (관리자 확인 후 수정)
    "Name",
    "Phone",
    "Email",
    "SpaceType",
    "SpaceSize",
    "Postcode",
    "Address",
    "AddressDetail",
    "Schedule",
    "Detail",
    "Referral",
    "Branch",
  ];
  const fields = {};
  for (const k of allowed) if (k in body) fields[k] = body[k];
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");

  // 예약 일시를 손대면 리마인드 발송 기록을 지운다. 안 지우면 옮긴 일정에
  // 하루 전·2시간 전 알림이 영영 안 나간다(이미 보낸 것으로 남아 있으므로).
  if ("ConsultAt" in fields) {
    fields.ConsultRemind1dAt = "";
    fields.ConsultRemind2hAt = "";
  }

  // 알림은 "저장했다"가 아니라 "예약이 실제로 달라졌다"를 조건으로 한다.
  // 저장만 해도 보내면, 이미 잡혀 있던 예약이 새 예약처럼 다시 알려져
  // 상담 인력이 헛걸음한다 → 변경 전 값을 먼저 읽어 둔다.
  const touchesConsult =
    "ConsultAt" in fields ||
    "ConsultBranch" in fields ||
    "ConsultCancelledAt" in fields;
  let before = null;
  if (touchesConsult) {
    try {
      before = await services.estimates.get(id);
    } catch {
      before = null; // 못 읽으면 알림만 건너뛴다. 저장은 그대로 진행한다.
    }
  }

  let record;
  try {
    record = await services.estimates.update(id, fields);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Estimate not found");
    throw e;
  }
  // 상태 변경 가능성 → 모든 status 조합 invalidate
  await edgeCacheDeleteMany(
    [
      listCacheNs(null),
      listCacheNs("New"),
      listCacheNs("InProgress"),
      listCacheNs("Done"),
      listCacheNs("Cancelled"),
    ],
    ctx,
  );

  // 예약이 잡혔는가·옮겨졌는가·취소됐는가·되살렸는가.
  // 값이 그대로면 아무것도 보내지 않는다.
  if (touchesConsult && before) {
    const prevAt = String(before.fields?.ConsultAt || "");
    const prevBranch = String(before.fields?.ConsultBranch || "");
    const prevCancel = String(before.fields?.ConsultCancelledAt || "");
    const nextAt = String(record.fields?.ConsultAt || "");
    const nextBranch = String(record.fields?.ConsultBranch || "");
    const nextCancel = String(record.fields?.ConsultCancelledAt || "");

    let kind = "";
    if (!prevCancel && nextCancel) {
      // 취소는 일시를 지우지 않는다. 카드는 캘린더에 '취소'로 남는다.
      kind = "cancelled";
    } else if (prevCancel && !nextCancel) {
      kind = "restored";
    } else if (prevAt !== nextAt || prevBranch !== nextBranch) {
      if (!prevAt && nextAt) kind = "created";
      else if (prevAt && nextAt) kind = "moved";
      // 일시를 아예 비우는 경로도 남아 있다(잘못 입력한 예약을 되돌릴 때).
      else if (prevAt && !nextAt) kind = "cleared";
      // 일시 없이 지점만 만지작거린 경우는 예약이 아니므로 알리지 않는다.
    }
    if (kind) {
      notifyConsult(
        env,
        ctx,
        consultNotifyText(
          kind,
          record.fields,
          { at: prevAt, branch: prevBranch },
          env,
          id,
        ),
      );
      // 예약 변경은 흔적을 남긴다 — D1 에 메타, R2 에 이전·이후 원문.
      // 캘린더는 현재 값만 보여 주므로 "언제 누가 어떻게 바꿨나"는 여기에만
      // 남는다(어드민 감사 로그에서 조회).
      queueAudit(ctx, env, request, {
        type: `consult_${kind}`,
        severity: kind === "cancelled" ? "warn" : "info",
        status: 200,
        message:
          `${record.fields?.Name || ""} ${fmtConsultKst(nextAt || prevAt)}` +
          `${nextBranch || prevBranch ? ` · ${nextBranch || prevBranch}` : ""}`.trim(),
        payload: {
          estimateId: id,
          kind,
          before: {
            consultAt: prevAt,
            consultBranch: prevBranch,
            cancelledAt: prevCancel,
          },
          after: {
            consultAt: nextAt,
            consultBranch: nextBranch,
            cancelledAt: nextCancel,
          },
          customer: {
            name: record.fields?.Name || "",
            phone: record.fields?.Phone || "",
            assignee: record.fields?.Assignee || "",
            status: record.fields?.Status || "",
          },
        },
      });
    }
  }
  return jsonOk({ id: record.id, updated: record.fields });
}

function safeJsonParse(s, fallback = []) {
  if (!s) return fallback;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
