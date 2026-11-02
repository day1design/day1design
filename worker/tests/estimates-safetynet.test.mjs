// ╔══════════════════════════════════════════════════════════════════════╗
// ║  접수 안전망 회귀 가드 (INVARIANT)                                      ║
// ║  이 테스트가 깨지면 = 안전망 회귀.                                       ║
// ║  모든 폼 제출 시도(정상·origin거부·검증실패·허니팟·D1실패)는 반드시      ║
// ║  R2(estimates-attempts) + (사람건은) D1 두 곳에 기록되어야 한다.         ║
// ║  archiveAttemptToR2 / recordRejectToD1 / captureRejectedSubmission 를    ║
// ║  사용자 명시 승인 없이 제거·약화하지 말 것. (2026-05-29 7a35a85 회귀 재발 ║
// ║  방지 — 당시 archiveAttemptToR2 가 커밋 누락 stash 로 유실됨)            ║
// ╚══════════════════════════════════════════════════════════════════════╝
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { handleEstimates } from "../src/routes/estimates.js";
import { captureRejectedSubmission } from "../src/lib/estimate-archive.js";

let previousCaches;
let previousFetch;

beforeEach(() => {
  previousCaches = globalThis.caches;
  previousFetch = globalThis.fetch;
  globalThis.caches = {
    default: {
      async match() {
        return null;
      },
      async put() {},
      async delete() {
        return true;
      },
    },
  };
  // 텔레그램/이메일/SMS/CAPI 등 외부 호출은 모두 ok 로 스텁 (네트워크 차단)
  globalThis.fetch = async () => Response.json({ ok: true });
});

afterEach(() => {
  globalThis.caches = previousCaches;
  globalThis.fetch = previousFetch;
});

function makeR2(puts) {
  return {
    put(key, body) {
      puts.push({ key, body });
      return Promise.resolve();
    },
  };
}

function r2Outcomes(puts) {
  return puts.map((p) => {
    try {
      return JSON.parse(p.body).outcome;
    } catch {
      return null;
    }
  });
}

// (c) 정상 접수 → D1 Status='접수대기' + R2 outcome='accepted'
test("[invariant] accepted submit records BOTH D1(접수대기) and R2(accepted)", async () => {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "정상고객");
  form.append("phone", "010-1234-5678");
  form.append("privacy_agreed", "true");
  form.append("space_size", "30~40평");
  form.append("address", "서울 강남구 테헤란로 1");
  form.append("schedule", "2026년 9월");
  form.append("branch", "강남점");
  form.append("budget", "5000만원");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.10" },
    }),
    { IMAGES: makeR2(puts) },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: { async upload() { return "https://x/y"; } },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recAccepted00001", fields };
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(body.received, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].Status, "접수대기");
  assert.ok(
    r2Outcomes(puts).includes("accepted"),
    "R2 에 accepted 원문이 보관되어야 함",
  );
});

// (b) 검증 실패 → D1 Status='오류' + R2 outcome='validation_failed'  (누락 0)
test("[invariant] validation failure records BOTH D1(오류) and R2(validation_failed)", async () => {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "검증실패고객");
  form.append("phone", "010-2222-3333");
  form.append("privacy_agreed", "true");
  // budget/branch 등 필수 누락 → validation 실패

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.11" },
    }),
    { IMAGES: makeR2(puts), TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-100" },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: { async upload() { throw new Error("no upload expected"); } },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recReject0000001", fields };
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 400);
  assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  assert.ok(
    r2Outcomes(puts).includes("validation_failed"),
    "R2 에 validation_failed 원문이 보관되어야 함",
  );
  assert.equal(created.length, 1, "거부건도 D1 에 남아야 함 (누락 0)");
  assert.equal(created[0].Status, "오류");
  assert.equal(created[0].Name, "검증실패고객");
});

// (a) origin 거부(인앱 웹뷰 등) → D1 Status='오류' + R2 outcome='origin_denied'
test("[invariant] origin-denied submit is captured to BOTH D1(오류) and R2(origin_denied)", async () => {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "인앱고객");
  form.append("phone", "010-4444-5555");
  form.append("budget", "3000만원");

  await captureRejectedSubmission(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.12" },
    }),
    { IMAGES: makeR2(puts), TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-100" },
    {
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recOrigin0000001", fields };
        },
      },
    },
    { waitUntil: (t) => tasks.push(t) },
    { outcome: "origin_denied", error: "site_origin_required" },
  );
  await Promise.allSettled(tasks);

  assert.ok(
    r2Outcomes(puts).includes("origin_denied"),
    "R2 에 origin_denied 원문이 보관되어야 함",
  );
  assert.equal(created.length, 1, "origin 거부도 사람건이면 D1 에 남아야 함");
  assert.equal(created[0].Status, "오류");
  assert.equal(created[0].IP, "203.0.113.12");
});

// ★자동완성 허니팟 오탐 → '오류'가 아니라 '정상 접수'로 살린다 (고객 리드 보존).
// 사람(이름·연락처 정상) + 허니팟 채워짐 + 타이밍 정상(_ts 없음/3초+) → 일반 접수와 동일.
test("[invariant] human autofill honeypot is SAVED as normal estimate (D1 접수대기 + R2 accepted* + 200)", async () => {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "자동완성고객");
  form.append("phone", "010-6624-6615");
  form.append("privacy_agreed", "true");
  form.append("space_size", "30평");
  form.append("address", "서울 강남구 논현로 1");
  form.append("schedule", "2026년 10월");
  form.append("branch", "강남점");
  form.append("budget", "4000만원");
  form.append("_hp", "autofilled@example.com"); // 자동완성이 숨김필드 채움 (봇 아님)
  // _ts 미포함 → tooFast=false (타이밍 정상)

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.13" },
    }),
    { IMAGES: makeR2(puts), TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-100" },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: { async upload() { return "https://x/y"; } },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recAutofill00001", fields };
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(body.received, true, "자동완성 오탐은 정상 200 접수여야 함");
  assert.equal(created.length, 1);
  assert.equal(created[0].Status, "접수대기", "정상 리드로 저장(오류 아님)");
  assert.ok(
    r2Outcomes(puts).some((o) => String(o).startsWith("accepted")),
    "R2 에 accepted(_autofill) 로 보관",
  );
});

// 진짜 봇(허니팟 + 링크 스팸 삽입) → 조용히 드롭(가짜 200) + R2 honeypot_bot, D1 미저장.
test("[invariant] bot honeypot (link-spam injected) is dropped to R2 only (no D1)", async () => {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "spammer");
  form.append("phone", "010-0000-0000");
  form.append("privacy_agreed", "true");
  form.append("space_size", "30평");
  form.append("address", "x");
  form.append("schedule", "x");
  form.append("branch", "x");
  form.append("budget", "x");
  // 링크 3개+ = 링크 스팸 → 봇 신호. (단순 링크 1개는 정상 고객으로 허용됨)
  form.append(
    "detail",
    "buy now http://s1.example.com http://s2.example.com http://s3.example.com",
  );
  form.append("_hp", "filled-by-bot");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.14" },
    }),
    { IMAGES: makeR2(puts) },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: { async upload() { throw new Error("no upload expected"); } },
      estimates: {
        async create() {
          throw new Error("bot must not reach D1");
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(body.queued, true, "봇은 가짜 200 으로 기만");
  assert.ok(r2Outcomes(puts).includes("honeypot_bot"), "R2 honeypot_bot 보관");
  assert.equal(created.length, 0, "봇은 D1 에 저장하지 않음");
});

// ★단순 참고링크(문의내용 1개) 는 정상 접수로 살린다 — 고객이 견적 참고자료
// (구글 드라이브 등) 링크를 첨부하는 정상 패턴. (2026-06-30 url-detected 오탐 복구)
test("[invariant] single reference link in detail is ACCEPTED (D1 접수대기 + 200)", async () => {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "송훈희");
  form.append("phone", "010-8233-3800");
  form.append("privacy_agreed", "true");
  form.append("space_size", "20~30평");
  form.append("address", "서울 양천구 목동서로 155");
  form.append("schedule", "2026년 10월");
  form.append("branch", "강남점");
  form.append("budget", "6,000~8,000만원");
  form.append(
    "detail",
    "상세는 링크 참고: https://drive.google.com/file/d/abc/view",
  );

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.20" },
    }),
    { IMAGES: makeR2(puts), TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-100" },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: { async upload() { return "https://x/y"; } },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recLinkOk0000001", fields };
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200, "단순 링크 첨부는 정상 접수");
  assert.equal(body.received, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].Status, "접수대기", "오류 아닌 정상 리드");
  assert.ok(
    r2Outcomes(puts).includes("accepted"),
    "R2 accepted 원문 보관",
  );
});

// 이름에 URL = 봇/인젝션 → 차단(누락 0: R2 validation_failed + D1 오류).
test("[invariant] URL in name is BLOCKED (D1 오류 + R2 validation_failed)", async () => {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "http://spam.example.com");
  form.append("phone", "010-2222-3333");
  form.append("privacy_agreed", "true");
  form.append("space_size", "30평");
  form.append("address", "서울 강남구 1");
  form.append("schedule", "2026년 9월");
  form.append("branch", "강남점");
  form.append("budget", "5000만원");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.21" },
    }),
    { IMAGES: makeR2(puts), TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-100" },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: { async upload() { throw new Error("no upload expected"); } },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recUrlName000001", fields };
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 400);
  assert.ok(
    Array.isArray(body.errors) && body.errors.includes("url-in-name"),
    "url-in-name 사유로 차단",
  );
  assert.ok(
    r2Outcomes(puts).includes("validation_failed"),
    "R2 validation_failed 보관",
  );
  assert.equal(created.length, 1, "거부건도 D1 에 남아야 함");
  assert.equal(created[0].Status, "오류");
});

// 문의 내용이 길어도 접수를 거절하지 않는다(2026-11-02 서유정 건: 2,044자가 옛 2,000자 제한에
// 네 번 거절됨). 접수카드(D1)에는 원문 전체, 텔레그램에는 "상세내용: 접수카드 확인" 한 줄만.
async function submitLongDetail({ utmCampaign = "", phone = "010-4444-5555" } = {}) {
  const puts = [];
  const created = [];
  const tasks = [];
  const telegramTexts = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.telegram.org")) {
      telegramTexts.push(JSON.parse(init.body).text);
    }
    return Response.json({ ok: true });
  };
  // 브라우저 폼 전송(multipart)은 줄바꿈을 \r\n 으로 보내므로 같은 형식으로 만든다.
  const detail = `긴문의시작\r\n${"ㆍ현관 중문 교체와 다운라이트 시공 범위 확인 요청\r\n".repeat(90)}추가비 없는 견적 요청 끝`;
  const form = new FormData();
  form.append("name", "긴문의고객");
  form.append("phone", phone);
  form.append("privacy_agreed", "true");
  form.append("space_size", "30평대 이하");
  form.append("address", "동탄 반도유보라");
  form.append("schedule", "3개월 이내");
  form.append("branch", "판교점");
  form.append("budget", "7천만원~1억");
  form.append("detail", detail);
  if (utmCampaign) form.append("utm_campaign", utmCampaign);

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.30" },
    }),
    { IMAGES: makeR2(puts), TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-100" },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: { async upload() { return "https://x/y"; } },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recLongDetail001", fields };
        },
      },
    },
  );
  await Promise.allSettled(tasks);
  return { res, puts, created, telegramTexts, detail };
}

test("[invariant] long detail (over 2,000 chars) is ACCEPTED with the full text on the card", async () => {
  const { res, puts, created, telegramTexts, detail } = await submitLongDetail();
  assert.ok(detail.length > 2000, "테스트 문의 내용은 2,000자를 넘어야 함");
  assert.equal(res.status, 200);
  assert.equal(created.length, 1);
  assert.equal(created[0].Status, "접수대기");
  assert.ok(created[0].Detail.includes(detail.trim()), "접수카드에 원문 전체가 남아야 함");
  const answers = JSON.parse(created[0].MetaFieldData);
  assert.equal(answers.find((a) => a.f === "detail").a, detail.trim(), "폼 응답 칸도 원문 전체");
  assert.ok(r2Outcomes(puts).includes("accepted"));
  const alert = telegramTexts.find((t) => t.includes("새 상담신청"));
  assert.ok(alert, "견적폼 알림이 가야 함");
  assert.ok(alert.includes("상세내용: 접수카드 확인"));
  assert.ok(!alert.includes("긴문의시작"), "알림에는 문의 내용 원문을 싣지 않음");
});

test("[invariant] long detail from a landing page alerts '상세내용: 접수카드 확인' only", async () => {
  const { res, created, telegramTexts, detail } = await submitLongDetail({ utmCampaign: "lp-bd" });
  assert.equal(res.status, 200);
  assert.ok(created[0].Detail.includes(detail.trim()));
  const alert = telegramTexts.find((t) => t.includes("신규 상담 신청"));
  assert.ok(alert, "랜딩 알림이 가야 함");
  assert.ok(alert.includes("상세내용: 접수카드 확인"));
  assert.ok(!alert.includes("긴문의시작"));
});

test("[invariant] rejected submit keeps the full long detail on the 오류 card", async () => {
  const { res, created, detail } = await submitLongDetail({ phone: "12" });
  assert.equal(res.status, 400);
  assert.equal(created.length, 1);
  assert.equal(created[0].Status, "오류");
  assert.ok(created[0].Detail.includes(detail), "오류 카드도 원문 전체를 남겨야 함");
});
