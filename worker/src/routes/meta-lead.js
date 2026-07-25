// ─── Meta Lead 수신 엔드포인트 ───
// 두 갈래 입력을 같은 라우트가 받는다(전환기 동안 공존):
//   1) Make → HTTP Make a request → 정규화된 필드({name, phone, location, ...})
//   2) 아이맥 폴러 → Graph API 원본({leadId, createdTime, fieldData:[{name,values}]})
// 인증: X-Meta-Lead-Secret 헤더 (서버-서버 호출 → Origin 미검증)
// 저장: D1 `Estimates` 테이블에 Source="meta" 로 기입 → 관리자 UI에서 Meta 출처 뱃지.
// 중복방지: leadId(D1 MetaLeadId 유니크) 우선, 없으면 phone+timestamp 10분 캐시(Make 경로).

import { jsonOk, jsonError, json } from "../lib/response.js";
import { escapeHtml } from "../lib/security.js";
import { createServices } from "../lib/services.js";
import { notifyTelegram, notifyInfra } from "../lib/telegram.js";
import { edgeCacheDeleteMany } from "../lib/edge-cache.js";
import { sendMetaCapiLead } from "../lib/meta-capi.js";
import {
  sendNcpSens,
  buildCustomerSms,
  CUSTOMER_SMS_SUBJECT,
} from "../lib/sens.js";
import { logIntakeEvent } from "../lib/intake-log.js";
import {
  archiveAttemptToR2,
  recordRejectToD1,
} from "../lib/estimate-archive.js";
import { appendLeadToSheet } from "../lib/sheets.js";
import { notifyEmail } from "../lib/email.js";
import { internalEstimateEmailHtml } from "./estimates.js";

const MAX_BODY_CHARS = 65536;

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isDuplicate(key) {
  const cache = await caches.open("meta-lead-dedup");
  return !!(await cache.match(
    new Request(`https://meta-lead.internal/${encodeURIComponent(key)}`),
  ));
}

async function markProcessed(key) {
  const cache = await caches.open("meta-lead-dedup");
  await cache.put(
    new Request(`https://meta-lead.internal/${encodeURIComponent(key)}`),
    new Response("1", { headers: { "Cache-Control": "s-maxage=600" } }),
  );
}

function normalizePlatform(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("instagram") || v === "ig") return "instagram";
  if (v.includes("facebook") || v === "fb") return "facebook";
  return "facebook";
}

// ─── 폴러 경로: Graph API 원본 field_data 매핑 ───
// 폼 질문 텍스트가 그대로 key 로 오므로(한글) 키워드 휴리스틱으로 매핑한다.
// 매핑 안 된 항목도 버리지 않고 extras 로 보존 → Detail 에 원문 표기(유실 0).
// 폼 질문 문구가 그대로 key 로 온다. day1design 폼 스타일:
//   공백은 `_`, 안내문은 괄호로 붙는다 — `가용_예산(프로젝트_방향성_설정을_위해_대략적으로_기입해주세요)`
// 괄호 안 안내문까지 매칭에 넣으면 안내 문구가 바뀔 때 엉뚱한 필드로 빠지므로 먼저 걷어낸다.
// 표준 질문 key 는 폼마다 다르다: 최신 폼은 full_name/phone_number, 구형 폼은 이름/전화번호.
export function normalizeQuestionKey(raw) {
  return String(raw ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const FIELD_RULES = [
  ["name", ["full name", "성함", "이름"]],
  [
    "phone",
    ["phone number", "phone", "연락처", "전화", "휴대폰", "핸드폰", "mobile"],
  ],
  ["email", ["email", "이메일", "메일"]],
  ["location", ["city", "지역", "소재지", "주소", "위치", "현장"]],
  ["spaceType", ["공간", "유형", "종류", "형태", "용도"]],
  ["area", ["면적", "평수", "평형", "규모", "크기"]],
  ["scheduledDate", ["시공", "일정", "예정", "입주", "착공", "시작일", "날짜"]],
  ["budget", ["예산", "비용", "금액", "가격대"]],
];

function fieldValueOf(field) {
  return (Array.isArray(field?.values) ? field.values : [])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function mapFieldData(fieldData) {
  const out = { extras: [] };
  const items = Array.isArray(fieldData) ? fieldData : [];
  const firstName = {};
  for (const item of items) {
    const rawKey = String(item?.name ?? "").trim();
    const rawLower = rawKey.toLowerCase();
    const key = normalizeQuestionKey(rawKey);
    const value = fieldValueOf(item);
    if (!rawKey || !value) continue;
    if (rawLower === "first_name" || rawLower === "last_name") {
      firstName[rawLower] = value;
      continue;
    }
    const hit = FIELD_RULES.find(([, tokens]) =>
      tokens.some((t) => key.includes(t)),
    );
    if (hit && !out[hit[0]]) {
      out[hit[0]] = value;
    } else if (!hit) {
      out.extras.push(`${rawKey}: ${value}`);
    }
  }
  if (!out.name) {
    out.name = [firstName.last_name, firstName.first_name]
      .filter(Boolean)
      .join(" ");
  }
  return out;
}

// Make(정규화 필드) / 폴러(원본 field_data) 공통 페이로드로 정규화.
// 명시 필드가 항상 우선하고, 비어있는 자리만 field_data 매핑으로 채운다.
export function normalizeLeadPayload(body = {}) {
  const raw = body.fieldData || body.field_data;
  const mapped = raw ? mapFieldData(raw) : { extras: [] };
  const pick = (...candidates) => {
    for (const c of candidates) {
      const v = String(c ?? "").trim();
      if (v) return v;
    }
    return "";
  };
  return {
    leadId: pick(body.leadId, body.lead_id, body.id),
    name: pick(body.name, mapped.name),
    phone: pick(body.phone, mapped.phone),
    location: pick(body.location, mapped.location),
    spaceType: pick(body.spaceType, mapped.spaceType),
    area: pick(body.area, mapped.area),
    scheduledDate: pick(body.scheduledDate, mapped.scheduledDate),
    budget: pick(body.budget, mapped.budget),
    email: pick(body.email, mapped.email),
    platform: pick(body.platform),
    // Campaign 컬럼은 Make 시절부터 '광고명'이 들어와 있다(캠페인명 아님).
    // 폴링 전환으로 의미가 바뀌면 어드민 집계가 과거와 어긋나므로 광고명을 유지하고,
    // 진짜 캠페인명은 campaignName 으로 따로 받아 Detail 에 덧붙인다.
    campaign: pick(body.campaign, body.adName, body.ad_name),
    campaignName: pick(body.campaignName, body.campaign_name),
    timestamp: pick(body.timestamp, body.createdTime, body.created_time),
    extras: mapped.extras,
  };
}

// leadId 로 기존 접수 조회 (폴링 48h 겹침조회 → 중복 접수 0)
async function findByMetaLeadId(services, leadId) {
  if (!leadId) return null;
  try {
    const rows = await services.estimates.list({
      where: { MetaLeadId: leadId },
      limit: 1,
    });
    return rows?.records?.[0] || null;
  } catch {
    return null;
  }
}

// ─── 필수정보 없는 리드 캡처 (불변규칙 1 — 접수 누락 0) ───
// 이름/연락처를 못 읽은 Meta 리드도 버리지 않는다: R2 원문 + D1 'Status=오류' 카드 +
// 텔레그램. 폼 질문 문구가 매핑과 어긋나 생기는 사고를 접수관리 화면에서 바로 본다.
// 응답은 400(정상 접수 아님) + captured:true — 폴러는 이걸 보고 재시도를 멈춘다.
export async function captureInvalidLead(
  env,
  ctx,
  services,
  { raw, lead, leadId, name, phoneDigits, reason },
) {
  const summary = [
    lead.location && `지역: ${lead.location}`,
    lead.spaceType && `공간유형: ${lead.spaceType}`,
    lead.area && `면적: ${lead.area}`,
    lead.scheduledDate && `시공예정일: ${lead.scheduledDate}`,
    lead.budget && `가용예산: ${lead.budget}`,
    lead.email && `이메일: ${lead.email}`,
    lead.campaignName && `캠페인: ${lead.campaignName}`,
    ...lead.extras,
  ]
    .filter(Boolean)
    .join("\n");

  await archiveAttemptToR2(env, ctx, {
    ip: "",
    ua: "meta-lead-poller",
    fields: { name, phone: phoneDigits, leadId, campaign: lead.campaign },
    outcome: "meta_invalid",
    error: reason,
    rawText: raw,
  });
  await recordRejectToD1(services, ctx, {
    name,
    phone: phoneDigits,
    email: lead.email,
    fields: { referral: "Meta 광고", detail: summary },
    ip: "",
    outcome: "meta_invalid",
    error: reason,
    source: "meta",
    extra: {
      MetaLeadId: leadId,
      Platform: normalizePlatform(lead.platform),
      Campaign: lead.campaign.slice(0, 200),
      SubmittedAt: lead.timestamp || new Date().toISOString(),
    },
  });
  ctx.waitUntil(
    Promise.resolve(
      notifyTelegram(
        env,
        `<b>[day1design/meta-lead]</b> ⚠ <b>필수정보 없는 Meta 리드</b>\n` +
          `├ 사유: ${escapeHtml(reason)}\n` +
          `├ leadId: ${escapeHtml(leadId || "-")}\n` +
          `├ 이름: ${escapeHtml(name || "-")}\n` +
          `├ 연락처: ${escapeHtml(phoneDigits || "-")}\n` +
          `└ 접수관리에 '오류' 카드로 저장됨 — 폼 질문 문구 확인 필요`,
      ),
    ).catch(() => {}),
  );
  return jsonError(400, "Missing name or phone", { captured: true });
}

// 텔레그램 메시지 빌더 — 폴라애드 스타일 (섹션 헤더 + 트리 문자)
// parse_mode: HTML 전제. 빈 필드는 라인 자체 생략.
function buildMetaLeadMessage({
  name,
  prettyPhone,
  location,
  spaceType,
  area,
  scheduledDate,
  budget,
  platform,
  campaign,
}) {
  const platformLabel = platform === "instagram" ? "Instagram" : "Facebook";
  const spaceLabel = (spaceType || "").replace(/_/g, " ");

  const pushBlock = (lines, header, rows) => {
    if (rows.length === 0) return;
    lines.push("", header);
    rows.forEach((row, i) => {
      lines.push(`${i === rows.length - 1 ? "└" : "├"} ${row}`);
    });
  };

  const out = [];
  out.push(`<b>[day1design/meta-lead]</b> 🔔 <b>신규 상담 신청</b>`);
  out.push(`🔵 Meta 광고`);

  // 고객정보 — 이름/연락처는 항상, 지역은 있을 때만
  const customer = [
    `이름: ${escapeHtml(name)}`,
    `연락처: ${escapeHtml(prettyPhone)}`,
  ];
  if (location) customer.push(`지역: ${escapeHtml(location)}`);
  pushBlock(out, `👤 <b>고객정보</b>`, customer);

  // 공간/일정/예산
  const space = [];
  if (spaceLabel) space.push(`유형: ${escapeHtml(spaceLabel)}`);
  if (area) space.push(`면적: ${escapeHtml(area)}`);
  if (scheduledDate) space.push(`시공예정: ${escapeHtml(scheduledDate)}`);
  if (budget) space.push(`가용예산: ${escapeHtml(budget)}`);
  pushBlock(out, `🏘 <b>공간/일정</b>`, space);

  // 광고정보 — 플랫폼은 항상, 캠페인은 있을 때만
  const ads = [`플랫폼: ${escapeHtml(platformLabel)}`];
  if (campaign) ads.push(`캠페인: ${escapeHtml(campaign)}`);
  pushBlock(out, `📢 <b>광고정보</b>`, ads);

  return out.join("\n");
}

export async function handleMetaLead(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  // 1) 시크릿 검증
  if (!env.META_LEAD_SECRET) {
    return jsonError(500, "Server misconfigured");
  }
  const provided = request.headers.get("x-meta-lead-secret") || "";
  if (!timingSafeEqual(provided, env.META_LEAD_SECRET)) {
    return jsonError(403, "Forbidden");
  }

  // 2) Content-Type
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return jsonError(415, "Invalid Content-Type");
  }

  // 3) Body size
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return jsonError(413, "Payload too large");

  // 4) JSON 파싱
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "Bad Request");
  }

  // 5) 페이로드 정규화 — Make(정규화 필드) / 폴러(원본 field_data) 공통
  const lead = normalizeLeadPayload(body);

  // 6) 중복 체크 — leadId(영구·D1) 우선. 필수필드 검증보다 먼저 본다:
  //    캡처된 '오류' 리드가 다시 전달돼도 같은 leadId 면 카드가 두 장 생기면 안 된다.
  const leadId = lead.leadId.slice(0, 64);
  if (leadId) {
    const existing = await findByMetaLeadId(services, leadId);
    if (existing) {
      return jsonOk({ duplicate: true, id: existing.id, source: "meta" });
    }
  }

  // 7) 필수 필드 (name / phone 만 필수. 나머지는 미입력 허용)
  //    검증 실패해도 버리지 않는다(불변규칙 1 — 누락 0). R2 원문 + D1 '오류' 카드 + 알림으로
  //    남기고 captured 를 회신 → 폴러가 같은 리드에서 계속 걸려 큐가 막히는 것을 막는다.
  const name = lead.name.slice(0, 50);
  const phoneDigits = lead.phone.replace(/\D/g, "");
  if (!name || !phoneDigits) {
    return await captureInvalidLead(env, ctx, services, {
      raw,
      lead,
      leadId,
      name,
      phoneDigits,
      reason:
        !name && !phoneDigits
          ? "이름·연락처 없음"
          : !name
            ? "이름 없음"
            : "연락처 없음",
    });
  }

  const timestamp = lead.timestamp;
  const dedupKey = `${phoneDigits}:${timestamp || "no-ts"}`;
  if (!leadId && timestamp && (await isDuplicate(dedupKey))) {
    return jsonOk({ duplicate: true });
  }

  // 8) 필드 정규화 (day1design 인테리어 Lead 폼 구조)
  const location = lead.location.slice(0, 100);
  const spaceType = lead.spaceType.slice(0, 40); // 아파트/빌라/주택/상가/기타
  const area = lead.area.slice(0, 40); // 20~30평 / 30~40평 ...
  const scheduledDate = lead.scheduledDate.slice(0, 100); // 시공예정일
  const budget = lead.budget; // Meta 폼의 예산/문의내용 원문은 저장용으로 보존
  const platform = normalizePlatform(lead.platform);
  const campaign = lead.campaign.slice(0, 200);

  // 8) phone → 010-xxxx-xxxx 포맷
  const prettyPhone = (() => {
    const p = phoneDigits;
    if (p.length === 11)
      return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
    if (p.length === 10)
      return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
    return p;
  })();

  // 9) 중복 방지 마킹
  if (!leadId && timestamp) await markProcessed(dedupKey);

  // 10) Meta 폼에는 주소 상세/이메일이 없음 → Detail 에 요약 남김
  //     폴러 경로에서 매핑되지 않은 질문(extras)도 원문 그대로 붙여 유실 0.
  const detailLines = [];
  if (spaceType) detailLines.push(`공간유형: ${spaceType}`);
  if (area) detailLines.push(`면적: ${area}`);
  if (scheduledDate) detailLines.push(`시공예정일: ${scheduledDate}`);
  if (budget) detailLines.push(`가용예산: ${budget}`);
  if (lead.campaignName) detailLines.push(`캠페인: ${lead.campaignName}`);
  for (const extra of lead.extras) detailLines.push(extra);
  const detail = detailLines.join("\n").slice(0, 2000);

  // 11) D1 저장 — Estimates 스키마와 자연스럽게 매핑
  //   location → Address (지역)
  //   spaceType → SpaceType (아파트/빌라/주택/상가/기타)
  //   area → SpaceSize (20~30평/30~40평 등)
  //   scheduledDate → Schedule (시공예정일)
  let recordId = null;
  let saveError = null;
  try {
    const record = await services.estimates.create({
      Name: name,
      Phone: prettyPhone,
      Email: lead.email.slice(0, 120),
      SpaceType: spaceType,
      SpaceSize: area,
      Postcode: "",
      Address: location,
      AddressDetail: "",
      Schedule: scheduledDate,
      Referral: "Meta 광고",
      Branch: "",
      Detail: detail,
      PrivacyAgreed: true, // Meta Lead Ads 는 Facebook 이 동의 수집
      ConceptFiles: "[]",
      FloorPlans: "[]",
      SubmittedAt: timestamp || new Date().toISOString(),
      Status: "접수대기",
      IP: "",
      Source: "meta",
      Platform: platform,
      Campaign: campaign,
      MetaLeadId: leadId,
    });
    recordId = record.id;
  } catch (e) {
    saveError = e.message || "D1 create failed";
    // 동시 폴링/재시도로 같은 leadId 가 겹치면 유니크 인덱스가 막는다 → 중복으로 처리(알림·문자 재발송 금지)
    if (leadId && /UNIQUE constraint failed/i.test(saveError)) {
      const existing = await findByMetaLeadId(services, leadId);
      if (existing) {
        return jsonOk({ duplicate: true, id: existing.id, source: "meta" });
      }
    }
    // 저장 실패 원문 보관 (불변규칙 1 — 접수 누락 0)
    await archiveAttemptToR2(env, ctx, {
      ip: "",
      ua: "meta-lead-poller",
      fields: { name, phone: phoneDigits, leadId, campaign },
      outcome: "meta_d1_failed",
      error: saveError,
      rawText: raw,
    });
  }

  // 12) 백그라운드: 텔레그램 + 자동 SMS(LMS) + 캐시 무효화 + Meta CAPI(데이터세트 적재)
  ctx.waitUntil(
    (async () => {
      // Meta 인스턴트폼 리드 → CAPI Lead. 사이트 미방문이라 전화 해시 매칭(action_source=system_generated).
      // 작동로그(IntakeEvents)용 단계 결과 수집.
      let capiStep = "ok";
      let lmsStep = "skip";
      try {
        await sendMetaCapiLead(env, ctx, {
          actionSource: "system_generated",
          gaName: "lead_form",
          channel: "capi",
          eventId: `meta-lead:${phoneDigits}:${timestamp || ""}`,
          phone: phoneDigits,
          source: "meta",
          campaign,
          pagePath: "",
        });
      } catch {
        capiStep = "fail";
      }
      if (recordId) {
        await edgeCacheDeleteMany(
          ["estimates:list:all", "estimates:list:접수대기"],
          ctx,
        );
        await notifyTelegram(
          env,
          buildMetaLeadMessage({
            name,
            prettyPhone,
            location,
            spaceType,
            area,
            scheduledDate,
            budget,
            platform,
            campaign,
          }),
        );
        // Meta lead 도 홈페이지 직접접수와 동일한 안내 SMS 발송 + SmsLogs 기록.
        // 플랫폼(instagram/facebook)에 따라 인트로 문구 자동 분기.
        const smsChannel = platform === "instagram" ? "instagram" : "facebook";
        const smsBody = buildCustomerSms(smsChannel);
        try {
          const r = await sendNcpSens(env, {
            to: prettyPhone,
            subject: CUSTOMER_SMS_SUBJECT,
            content: smsBody,
          });
          const status = r.ok ? "sent" : r.skipped ? "skipped" : "failed";
          lmsStep = r.ok ? "ok" : r.skipped ? "skip" : "fail";
          const detail = r.ok
            ? `meta-lead status=${r.status || ""}`
            : r.skipped
              ? `meta-lead reason=${r.reason || ""}`
              : `meta-lead status=${r.status || ""} body=${(r.body || "").slice(0, 160)}`;
          await services.smsLogs
            .create({
              EstimateId: recordId,
              TemplateId: "",
              ToPhone: String(prettyPhone || "").replace(/\D/g, ""),
              Subject: CUSTOMER_SMS_SUBJECT,
              Content: smsBody,
              SmsType: r.type || "LMS",
              Status: status,
              Detail: detail.slice(0, 480),
              SentAt: new Date().toISOString(),
              SentBy: "system:meta-lead",
            })
            .catch(() => {});
          if (!r.ok && !r.skipped) {
            await notifyTelegram(
              env,
              `[day1design/meta-lead] LMS 발송 실패\n${escapeHtml(prettyPhone)}\n${detail.slice(0, 200)}`,
            );
          }
        } catch (e) {
          lmsStep = "fail";
          await notifyTelegram(
            env,
            `[day1design/meta-lead] LMS 호출 예외\n${escapeHtml((e?.message || "").slice(0, 200))}`,
          );
        }
        // 내부 알림 메일 — 홈페이지 접수와 동일한 템플릿·수신자.
        // (Make→Apps Script 가 보내던 Meta 리드 알림 메일을 워커로 흡수)
        let emailStep = "ok";
        try {
          await notifyEmail(env, {
            subject: "[DAYONE] 새 상담신청 (Meta)",
            text: [
              `이름: ${name}`,
              `연락처: ${prettyPhone}`,
              location && `지역: ${location}`,
              spaceType && `공간유형: ${spaceType}`,
              area && `면적: ${area}`,
              scheduledDate && `시공예정일: ${scheduledDate}`,
              budget && `가용예산: ${budget}`,
              `출처: Meta / ${platform}${campaign ? ` / ${campaign}` : ""}`,
            ]
              .filter(Boolean)
              .join("\n"),
            html: internalEstimateEmailHtml(env, {
              fields: {
                name,
                phone: prettyPhone,
                address: location,
                address_detail: "",
                branch: "",
                space_type: spaceType,
                space_size: area,
                schedule: scheduledDate,
                budget,
                detail,
              },
              attribution: { platform, campaign },
              conceptCount: 0,
              planCount: 0,
              submittedAt: timestamp || new Date().toISOString(),
            }),
          });
        } catch {
          emailStep = "fail";
        }
        // 구글시트 미러링 — 홈페이지 접수와 같은 시트·같은 컬럼(출처로 구분).
        let sheetStep = "skip";
        try {
          const r = await appendLeadToSheet(env, {
            submittedAt: timestamp,
            name,
            phone: prettyPhone,
            email: lead.email,
            source: "meta",
            platform,
            campaign,
            address: location,
            spaceType,
            spaceSize: area,
            schedule: scheduledDate,
            budget,
            branch: "",
            detail,
            status: "접수대기",
            id: recordId,
          });
          sheetStep = r?.skipped ? "skip" : "ok";
        } catch (e) {
          sheetStep = "fail";
          await notifyTelegram(
            env,
            `[day1design/meta-lead] 구글시트 기록 실패\n` +
              `이름: ${escapeHtml(name)}\n` +
              `사유: ${escapeHtml((e?.message || "").slice(0, 200))}`,
          );
        }
        // 작동로그 기록 (메타는 지점값 없음 → 두 지점 안내 = '지점 무관')
        await logIntakeEvent(services, {
          channel: smsChannel,
          source: "meta",
          branch: "지점 무관",
          name,
          phone: prettyPhone,
          geo: "",
          estimateId: recordId,
          steps: {
            d1: "ok",
            telegram: "ok",
            lms: lmsStep,
            capi: capiStep,
            email: emailStep,
            sheet: sheetStep,
          },
        });
      } else if (saveError) {
        await notifyTelegram(
          env,
          `<b>[day1design/meta-lead]</b> ⚠ <b>D1 저장 실패</b>\n` +
            `├ 이름: ${escapeHtml(name)}\n` +
            `├ 전화: ${escapeHtml(prettyPhone)}\n` +
            `└ 에러: ${escapeHtml(saveError.slice(0, 200))}`,
        );
      }
    })(),
  );

  if (!recordId) {
    return json({ ok: false, error: "D1 save failed" }, { status: 502 });
  }

  return jsonOk({ id: recordId, source: "meta" });
}

// ─── 폴러 하트비트 ───
// 아이맥 폴러가 매 실행마다 1회 POST. 리드가 0건이어도 "살아있음"을 남긴다.
// 헬스체크(checkLeadPoller)가 이 신선도로 맥 다운/런치d 정지/토큰 만료를 잡는다.
// 실패 보고(status=fail)는 즉시 인프라봇으로.
export async function handleMetaLeadHeartbeat(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  if (!env.META_LEAD_SECRET) return jsonError(500, "Server misconfigured");
  const provided = request.headers.get("x-meta-lead-secret") || "";
  if (!timingSafeEqual(provided, env.META_LEAD_SECRET)) {
    return jsonError(403, "Forbidden");
  }
  let body = {};
  try {
    body = JSON.parse((await request.text()) || "{}");
  } catch {
    return jsonError(400, "Bad Request");
  }

  const status = body.status === "fail" ? "fail" : "ok";
  const source = String(body.source || "meta-lead-poller")
    .trim()
    .slice(0, 40);
  const detail = String(body.detail || "")
    .trim()
    .slice(0, 300);
  const at = new Date().toISOString();

  try {
    await services.systemHeartbeats.create({
      Source: source,
      At: at,
      Status: status,
      Detail: detail,
    });
  } catch (e) {
    return json(
      { ok: false, error: (e?.message || "insert failed").slice(0, 120) },
      { status: 502 },
    );
  }

  ctx.waitUntil(
    (async () => {
      // 7일 초과 하트비트 정리 (테이블 무한 증식 방지)
      try {
        await env.DB.prepare(
          "DELETE FROM SystemHeartbeats WHERE Source = ? AND At < ?",
        )
          .bind(source, new Date(Date.now() - 7 * 86400000).toISOString())
          .run();
      } catch {}
      if (status === "fail") {
        await notifyInfra(
          env,
          `<b>[day1design/${escapeHtml(source)}]</b> 🔴 <b>리드 폴러 실패</b>\n` +
            `└ ${escapeHtml(detail || "사유 미기재")}`,
        );
      }
    })(),
  );

  return jsonOk({ at, status });
}
