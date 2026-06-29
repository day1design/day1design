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
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];
const SOURCE_LABELS = {
  homepage: "Homepage",
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
    .toLowerCase();
  let source = "homepage";
  if (/(facebook|instagram|meta|fbclid|fb\.|ig\.|threads)/.test(raw)) {
    source = "meta";
  } else if (/(youtube|youtu\.be)/.test(raw)) {
    source = "youtube";
  } else if (/(naver|nclid)/.test(raw)) {
    source = "naver";
  } else if (/(google|gclid|doubleclick|adwords)/.test(raw)) {
    source = "google";
  } else if (/(kakao|daum|tistory)/.test(raw)) {
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

// First-touch 출처 — 자체 트래커 SessionId로 D1 HeatmapEvents 의
// 가장 오래된 page_view 이벤트에서 referrer/utm 추출하고 정규화
async function fetchFirstTouch(env, sessionId) {
  const empty = {
    source: "",
    platform: "",
    campaign: "",
    referrer: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
  };
  if (!sessionId || !env?.DB) return empty;
  try {
    const row = await env.DB.prepare(
      `SELECT Referrer, UtmSource, UtmMedium, UtmCampaign
       FROM HeatmapEvents
       WHERE SessionId = ? AND EventType = 'page_view'
       ORDER BY CreatedAt ASC
       LIMIT 1`,
    )
      .bind(sessionId)
      .first();
    if (!row) return empty;
    const norm = normalizeEstimateAttribution({
      utm_source: row.UtmSource || "",
      utm_medium: row.UtmMedium || "",
      campaign: row.UtmCampaign || "",
      source: row.Referrer || "",
    });
    return {
      source: norm.source,
      platform: norm.platform,
      campaign: norm.campaign,
      referrer: String(row.Referrer || ""),
      utmSource: String(row.UtmSource || ""),
      utmMedium: String(row.UtmMedium || ""),
      utmCampaign: String(row.UtmCampaign || ""),
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

function internalEstimateEmailHtml(env, details) {
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

  // 기본 검증 — 간소화 폼 필수: 이름·연락처·평형대·현장주소·희망일정·지점·가용예산 + 개인정보 동의
  // (이메일·공간유형·문의경로는 폼에서 제거되어 선택값. 이메일은 입력 시에만 형식 검증)
  const errors = [];
  if (!fields.name || fields.name.length > 50) errors.push("name");
  if (!isValidPhone(fields.phone || "")) errors.push("phone");
  if (fields.email && !isValidEmail(fields.email)) errors.push("email");
  if (fields.privacy_agreed !== "true") errors.push("privacy_agreed");
  if (!fields.space_size) errors.push("space_size");
  if (!fields.address) errors.push("address");
  if (!fields.schedule) errors.push("schedule");
  if (!fields.branch) errors.push("branch");
  if (!fields.budget) errors.push("budget");
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
  const detail = detailWithBudget(fields.detail, fields.budget);

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
    Status: "접수대기",
    IP: ip,
    Source: attribution.source,
    Platform: attribution.platform,
    Campaign: attribution.campaign,
    SessionId: sessionId,
    FirstSource: firstTouch.source,
    FirstPlatform: firstTouch.platform,
    FirstCampaign: firstTouch.campaign,
    FirstReferrer: firstTouch.referrer,
    FirstUtmSource: firstTouch.utmSource,
    FirstUtmMedium: firstTouch.utmMedium,
    FirstUtmCampaign: firstTouch.utmCampaign,
  };
  let record;
  try {
    record = await services.estimates.create(createPayload);
  } catch (dbErr1) {
    try {
      record = await services.estimates.create(createPayload); // 1회 재시도
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

  const addressLine = compactJoin([fields.address, fields.address_detail]);
  const notificationLines = [
    `[day1design/estimates] 새 상담신청`,
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
  // 고객 접수확인 메일은 이메일을 입력한 경우에만 (간소화 폼은 이메일 미수집)
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
    })
      .then(() => {
        steps.capi = "ok";
      })
      .catch(() => {
        steps.capi = "fail";
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
  const records = await services.estimates.listAll({
    where,
    sort: [{ field: "SubmittedAt", direction: "desc" }],
  });
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
