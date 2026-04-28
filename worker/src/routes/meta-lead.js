// ─── Meta Lead 수신 엔드포인트 ───
// Make → HTTP Make a request → 이 Worker 로 POST.
// 인증: X-Meta-Lead-Secret 헤더 (서버-서버 호출 → Origin 미검증)
// 저장: D1 `Estimates` 테이블에 Source="meta" 로 기입 → 관리자 UI에서 Meta 출처 뱃지.
// 중복방지: phone+timestamp 10분 캐시.

import { jsonOk, jsonError, json } from "../lib/response.js";
import { escapeHtml } from "../lib/security.js";
import { d1Create } from "../lib/d1.js";
import { notifyTelegram } from "../lib/telegram.js";
import { edgeCacheDeleteMany } from "../lib/edge-cache.js";

const TABLE = "Estimates";

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
  if (v.includes("instagram")) return "instagram";
  if (v.includes("facebook")) return "facebook";
  return "facebook";
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

export async function handleMetaLead(request, env, ctx) {
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
  if (raw.length > 10240) return jsonError(413, "Payload too large");

  // 4) JSON 파싱
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "Bad Request");
  }

  // 5) 필수 필드 (name / phone 만 필수. 나머지는 미입력 허용)
  const name = String(body.name || "")
    .trim()
    .slice(0, 50);
  const phoneDigits = String(body.phone || "").replace(/\D/g, "");
  if (!name || !phoneDigits) {
    return jsonError(400, "Missing name or phone");
  }

  // 6) 중복 체크
  const timestamp = String(body.timestamp || "");
  const dedupKey = `${phoneDigits}:${timestamp || "no-ts"}`;
  if (timestamp && (await isDuplicate(dedupKey))) {
    return jsonOk({ duplicate: true });
  }

  // 7) 필드 정규화 (day1design 인테리어 Lead 폼 구조)
  const location = String(body.location || "")
    .trim()
    .slice(0, 100);
  const spaceType = String(body.spaceType || "")
    .trim()
    .slice(0, 40); // 아파트/빌라/주택/상가/기타
  const area = String(body.area || "")
    .trim()
    .slice(0, 40); // 20~30평 / 30~40평 ...
  const scheduledDate = String(body.scheduledDate || "")
    .trim()
    .slice(0, 100); // 시공예정일
  const budget = String(body.budget || "")
    .trim()
    .slice(0, 60); // 가용예산 (예: 3,000~5,000만원)
  const platform = normalizePlatform(body.platform);
  const campaign = String(body.campaign || "")
    .trim()
    .slice(0, 200);

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
  if (timestamp) await markProcessed(dedupKey);

  // 10) Meta 폼에는 주소 상세/이메일이 없음 → Detail 에 요약 남김
  const detailLines = [];
  if (spaceType) detailLines.push(`공간유형: ${spaceType}`);
  if (area) detailLines.push(`면적: ${area}`);
  if (scheduledDate) detailLines.push(`시공예정일: ${scheduledDate}`);
  if (budget) detailLines.push(`가용예산: ${budget}`);
  const detail = detailLines.join("\n");

  // 11) D1 저장 — Estimates 스키마와 자연스럽게 매핑
  //   location → Address (지역)
  //   spaceType → SpaceType (아파트/빌라/주택/상가/기타)
  //   area → SpaceSize (20~30평/30~40평 등)
  //   scheduledDate → Schedule (시공예정일)
  let recordId = null;
  let saveError = null;
  try {
    const record = await d1Create(env, TABLE, {
      Name: name,
      Phone: prettyPhone,
      Email: "",
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
    });
    recordId = record.id;
  } catch (e) {
    saveError = e.message || "D1 create failed";
  }

  // 12) 백그라운드: 텔레그램 + 캐시 무효화
  ctx.waitUntil(
    (async () => {
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
