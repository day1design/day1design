// 폴러 단위 테스트 — 네트워크 없이 fetch 스텁으로만 검증.
// 실행: node --test workers/imac-meta-lead-poller/worker.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeadPayload,
  computeSinceMs,
  discoverActiveForms,
  formatFailureMessage,
  normalizePhone,
  parseFormIds,
  sanitizePagingUrl,
  sendHeartbeat,
} from "./worker.mjs";

test("폼 ID 파싱 — 공백/중복/비숫자 제거", () => {
  assert.deepEqual(parseFormIds(" 123, 123 ,abc,456 ,"), ["123", "456"]);
  assert.deepEqual(parseFormIds(""), []);
});

test("전화번호 정규화 — 국가코드 82 를 0 으로", () => {
  assert.equal(normalizePhone("+82 10-6624-6615"), "01066246615");
  assert.equal(normalizePhone("010-6624-6615"), "01066246615");
});

test("페이로드 — 원본 field_data 를 보존하고 phone 만 별도 정규화", () => {
  const payload = buildLeadPayload({
    id: "999",
    created_time: "2026-07-25T02:00:00+0000",
    platform: "ig",
    ad_name: "브랜딩용",
    campaign_name: "260710",
    form_id: "1332988105550524",
    field_data: [
      { name: "성함", values: ["임혜진"] },
      { name: "연락처", values: ["+821066246615"] },
      { name: "궁금한 점", values: ["욕실"] },
    ],
  });
  assert.equal(payload.leadId, "999");
  assert.equal(payload.phone, "01066246615");
  assert.equal(payload.fieldData.length, 3);
  assert.deepEqual(payload.fieldData[2], { name: "궁금한 점", values: ["욕실"] });
});

test("조회 시작점 — cutover 이전으로는 절대 내려가지 않는다", () => {
  const cutoverMs = Date.parse("2026-07-25T00:00:00.000Z");
  const nowMs = Date.parse("2026-07-25T06:00:00.000Z");
  const since = computeSinceMs({
    nowMs,
    cutoverMs,
    highWatermarkMs: Date.parse("2026-07-25T05:00:00.000Z"),
    lookbackMs: 48 * 3600000,
    overlapMs: 48 * 3600000,
  });
  assert.equal(since, cutoverMs, "cutover 이전 리드를 재발송하면 안 됨");
});

test("조회 시작점 — 워터마크가 있으면 겹쳐 조회한다(복구용)", () => {
  const cutoverMs = Date.parse("2026-07-01T00:00:00.000Z");
  const highWatermarkMs = Date.parse("2026-07-25T05:00:00.000Z");
  const since = computeSinceMs({
    nowMs: Date.parse("2026-07-25T06:00:00.000Z"),
    cutoverMs,
    highWatermarkMs,
    lookbackMs: 48 * 3600000,
    overlapMs: 2 * 3600000,
  });
  assert.equal(since, highWatermarkMs - 2 * 3600000);
});

test("페이징 URL 에서 access_token 제거(로그 유출 방지)", () => {
  const clean = sanitizePagingUrl(
    "https://graph.facebook.com/v21.0/1/leads?access_token=SECRET&after=abc",
  );
  assert.ok(!clean.includes("SECRET"));
  assert.ok(clean.includes("after=abc"));
});

test("하트비트 — /heartbeat 경로 + 시크릿 헤더로 POST", async () => {
  const calls = [];
  await sendHeartbeat({
    webhookUrl: "https://api.day1design.co.kr/api/meta-lead",
    webhookSecret: "s3cr3t",
    status: "ok",
    detail: "forms=1 fetched=0",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.day1design.co.kr/api/meta-lead/heartbeat");
  assert.equal(calls[0].init.headers["X-Meta-Lead-Secret"], "s3cr3t");
  assert.equal(JSON.parse(calls[0].init.body).status, "ok");
});

test("하트비트 실패는 예외로 드러난다(조용히 삼키지 않음)", async () => {
  await assert.rejects(
    sendHeartbeat({
      webhookUrl: "https://api.day1design.co.kr/api/meta-lead",
      webhookSecret: "s",
      status: "ok",
      detail: "",
      fetchImpl: async () => new Response("nope", { status: 500 }),
    }),
    /하트비트 실패/,
  );
});

test("폼 자동 발견 — ACTIVE 만 수집 대상, 그 외 상태는 제외", async () => {
  const forms = await discoverActiveForms({
    pageId: "969217572947331",
    pageToken: "page-token",
    graphVersion: "v21.0",
    fetchImpl: async (url) => {
      assert.ok(url.includes("/969217572947331/leadgen_forms"));
      assert.ok(url.includes("access_token=page-token"));
      return Response.json({
        data: [
          { id: "111", name: "견적 양식", status: "ACTIVE" },
          { id: "222", name: "옛 양식", status: "ARCHIVED" },
          { id: "333", name: "초안", status: "DRAFT" },
        ],
      });
    },
  });
  assert.deepEqual(forms, [{ id: "111", name: "견적 양식" }]);
});

test("폼 자동 발견 실패는 예외로 드러난다(조용한 누락 금지)", async () => {
  await assert.rejects(
    discoverActiveForms({
      pageId: "969217572947331",
      pageToken: "bad",
      graphVersion: "v21.0",
      fetchImpl: async () =>
        Response.json({ error: { message: "(#190) page token 필요" } }, { status: 400 }),
    }),
    /폼 목록 조회 실패/,
  );
});

test("실패 메시지에 네임태그가 붙는다", () => {
  const msg = formatFailureMessage(new Error("토큰 만료"), Date.parse("2026-07-25T04:00:00.000Z"));
  assert.match(msg, /\[day1design\/meta-lead-poller\]/);
  assert.match(msg, /토큰 만료/);
});
