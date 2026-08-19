// 폴러 단위 테스트 — 네트워크 없이 fetch 스텁으로만 검증.
// 실행: node --test workers/imac-meta-lead-poller/worker.test.mjs
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildLeadPayload,
  computeSinceMs,
  discoverActiveForms,
  formatFailureMessage,
  isPhoneQuestion,
  normalizePhone,
  parseFormIds,
  runPoll,
  sanitizePagingUrl,
  sendHeartbeat,
} from "./worker.mjs";

const ENV_KEYS = [
  "META_SYSTEM_USER_TOKEN",
  "META_LEAD_FORM_IDS",
  "META_LEAD_PAGE_ID",
  "META_LEAD_CUTOVER_AT",
  "META_LEAD_STATE_FILE",
  "META_LEAD_DRY_RUN",
  "LEAD_WEBHOOK_URL",
  "LEAD_WEBHOOK_SECRET",
  "HEALTH_TELEGRAM_BOT_TOKEN",
  "HEALTH_TELEGRAM_CHAT_ID",
];

// runPoll 통합 테스트용 — 임시 상태파일 + 환경변수 격리. 네트워크는 전부 스텁.
async function withPoller(fn) {
  const dir = await mkdtemp(join(tmpdir(), "day1-meta-poller-"));
  const statePath = join(dir, "state.json");
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    META_SYSTEM_USER_TOKEN: "token",
    META_LEAD_FORM_IDS: "111",
    META_LEAD_PAGE_ID: "",
    META_LEAD_CUTOVER_AT: "2026-07-25T00:00:00.000Z",
    META_LEAD_STATE_FILE: statePath,
    META_LEAD_DRY_RUN: "",
    LEAD_WEBHOOK_URL: "https://api.example.test/api/meta-lead",
    LEAD_WEBHOOK_SECRET: "s3cr3t",
    HEALTH_TELEGRAM_BOT_TOKEN: "",
    HEALTH_TELEGRAM_CHAT_ID: "",
  });
  try {
    return await fn({
      statePath,
      readState: async () => JSON.parse(await readFile(statePath, "utf8")),
    });
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

function stubFetch(leads, onPost) {
  return async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://graph.facebook.com")) {
      return Response.json({ data: leads, paging: {} });
    }
    if (u.endsWith("/heartbeat")) return Response.json({ ok: true });
    return onPost(JSON.parse(init.body));
  };
}

function leadFixture(id, createdTime, fieldData) {
  return {
    id,
    created_time: createdTime,
    platform: "ig",
    form_id: "111",
    field_data: fieldData,
  };
}

// runPoll 가드 테스트의 리드 시각은 실행 시점 기준이어야 한다.
// processed 보존창이 now−96h 라서 고정 날짜를 쓰면 그 날짜가 지나는 순간
// "재전송하지 않는다" 가드가 코드와 무관하게 항상 깨진다(2026-08-20 실제로 깨져 있었음).
const hoursAgoIso = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

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

// 폴러의 전화 인식이 워커보다 좁으면 새 폼('핸드폰번호' 등)에서 폴러만 못 읽는다.
// 워커와의 동기화 가드는 worker/tests/meta-lead-poll.test.mjs 에 함께 있다.
test("전화 질문 인식 — 표준키·한글 변형·영문 변형 전부", () => {
  for (const key of [
    "phone_number",
    "Phone Number",
    "전화번호",
    "연락처",
    "휴대폰_번호",
    "핸드폰번호",
    "mobile",
    "휴대폰_번호(필수)",
  ]) {
    assert.ok(isPhoneQuestion(key), `미인식: ${key}`);
  }
  for (const key of ["성함", "면적", "가용_예산", "공간_형태"]) {
    assert.ok(!isPhoneQuestion(key), `오인식: ${key}`);
  }
  // 괄호 안 안내문은 워커와 동일하게 매칭에서 제외한다(안내문이 바뀌어도 매핑이 안 흔들리게).
  // 이런 폼이 생기면 이제 큐를 막지 않고 '오류' 카드 + 알림으로 드러난다.
  assert.ok(!isPhoneQuestion("연락_가능한_번호(휴대폰)"));
});

test("[guard] 전화번호를 못 읽은 리드가 뒤 리드를 막지 않는다", async () => {
  await withPoller(async ({ readState }) => {
    const posted = [];
    const result = await runPoll({
      fetchImpl: stubFetch(
        [
          leadFixture("noPhone", hoursAgoIso(2), [
            { name: "성함", values: ["임혜진"] },
            { name: "궁금한_점", values: ["욕실"] },
          ]),
          leadFixture("good", hoursAgoIso(1), [
            { name: "성함", values: ["임혜진"] },
            { name: "핸드폰번호", values: ["010-6624-6615"] },
          ]),
        ],
        (payload) => {
          posted.push(payload.leadId);
          // 워커: 필수정보 없는 리드는 캡처하고 400 + captured 로 회신
          return payload.phone
            ? Response.json({ ok: true, id: "rec1" })
            : Response.json(
                { ok: false, error: "Missing name or phone", captured: true },
                { status: 400 },
              );
        },
      ),
    });

    assert.deepEqual(posted, ["noPhone", "good"], "뒤 리드까지 전달돼야 함");
    assert.equal(result.captured, 1);
    assert.equal(result.delivered, 1, "'핸드폰번호' 폼도 정상 전달");
    const state = await readState();
    assert.ok(
      state.processed.noPhone && state.processed.good,
      "캡처된 리드는 재전송하지 않는다(무한 재시도 금지)",
    );
  });
});

test("[guard] 전달 실패건은 워터마크를 되돌려 다음 실행이 반드시 다시 잡는다", async () => {
  await withPoller(async ({ readState }) => {
    const failsAt = hoursAgoIso(2);
    await assert.rejects(
      runPoll({
        fetchImpl: stubFetch(
          [
            leadFixture("fails", failsAt, [
              { name: "성함", values: ["임혜진"] },
              { name: "연락처", values: ["010-1111-2222"] },
            ]),
            leadFixture("ok", hoursAgoIso(1), [
              { name: "성함", values: ["김철수"] },
              { name: "연락처", values: ["010-3333-4444"] },
            ]),
          ],
          (payload) =>
            payload.leadId === "fails"
              ? Response.json({ ok: false, error: "boom" }, { status: 500 })
              : Response.json({ ok: true, id: "rec1" }),
        ),
      }),
      /리드 전달 실패/,
    );

    const state = await readState();
    assert.equal(
      state.highWatermarkAt,
      failsAt,
      "실패한 리드 시각으로 워터마크가 고정돼야 재조회된다",
    );
    assert.ok(!state.processed.fails, "실패건은 processed 에 남으면 안 됨");
    assert.ok(state.processed.ok, "성공건은 재전송되면 안 됨");
  });
});

test("실패 메시지에 네임태그가 붙는다", () => {
  const msg = formatFailureMessage(new Error("토큰 만료"), Date.parse("2026-07-25T04:00:00.000Z"));
  assert.match(msg, /\[day1design\/meta-lead-poller\]/);
  assert.match(msg, /토큰 만료/);
});
