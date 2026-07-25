// ╔══════════════════════════════════════════════════════════════════════╗
// ║  구글시트 리드 미러링 가드                                             ║
// ║  1) D1 이 SoT, 시트는 사본 — 미설정이면 접수를 막지 않고 skip 한다.      ║
// ║  2) 컬럼 순서는 계약이다(중간 삽입 금지). 기존 행과 어긋나면 사고.       ║
// ║  3) 수식 인젝션 차단 — '=' 로 시작하는 입력이 실행되면 안 된다(RAW).     ║
// ╚══════════════════════════════════════════════════════════════════════╝
import assert from "node:assert/strict";
import test from "node:test";

import {
  LEAD_SHEET_HEADER,
  LEGACY_COLUMN_COUNT,
  appendLeadToSheet,
  buildLeadRow,
  isSheetConfigured,
  toSheetStamp,
} from "../src/lib/sheets.js";

const ENV = {
  LEADS_SHEET_ID: "sheet-1",
  LEADS_SHEET_TAB: "고객정보",
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "csecret",
  GOOGLE_SHEETS_REFRESH_TOKEN: "rtoken",
};

const LEAD = {
  submittedAt: "2026-07-25T02:30:00.000Z",
  name: "임혜진",
  phone: "010-6624-6615",
  email: "imagime2002@naver.com",
  source: "homepage",
  platform: "naver",
  campaign: "브랜딩용",
  address: "성남시 분당구",
  spaceType: "아파트",
  spaceSize: "30~40평",
  schedule: "2026년 9월",
  budget: "5천~1억",
  branch: "판교",
  detail: "욕실만 따로 가능한가요",
  status: "접수대기",
  id: "rec1",
};

function stub(handlers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, respond] of handlers) {
      if (String(url).includes(match)) return respond(init);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { calls, fetchImpl };
}

const okToken = [
  "oauth2.googleapis.com",
  () => Response.json({ access_token: "at-1" }),
];

// A~L 은 Make 시절부터 5천여 행이 쌓인 기존 컬럼이다. 이 순서가 어긋나면
// 새 접수가 엉뚱한 칸에 들어가 기존 데이터와 섞인다.
test("[guard] 기존 12컬럼(A~L)의 순서·문구는 계약이다", () => {
  assert.deepEqual(LEAD_SHEET_HEADER.slice(0, LEGACY_COLUMN_COUNT), [
    "접수시간",
    "캠페인",
    "플랫폼",
    "지역",
    "이름",
    "연락처",
    "공간유형",
    "면적",
    "가용예산",
    "시공예정일",
    "상담내용",
    "메일발송",
  ]);
  assert.deepEqual(LEAD_SHEET_HEADER.slice(LEGACY_COLUMN_COUNT), [
    "출처",
    "이메일",
    "접수ID",
  ]);
});

test("[guard] 행이 헤더 자리에 정확히 매핑된다", () => {
  const row = buildLeadRow(LEAD);
  const at = (label) => row[LEAD_SHEET_HEADER.indexOf(label)];
  assert.equal(row.length, LEAD_SHEET_HEADER.length);
  assert.equal(at("접수시간"), "2026-07-25T02:30:00.000Z");
  assert.equal(at("이름"), "임혜진");
  assert.equal(at("연락처"), "010-6624-6615");
  assert.equal(at("지역"), "성남시 분당구");
  assert.equal(at("상담내용"), LEAD.detail);
  assert.equal(at("메일발송"), "", "Make 시절 컬럼 — 워커는 채우지 않는다");
  assert.equal(at("출처"), "homepage");
  assert.equal(at("접수ID"), "rec1");
});

test("플랫폼은 기존 행 표기(ig/fb)에 맞춘다", () => {
  const code = (platform) =>
    buildLeadRow({ platform })[LEAD_SHEET_HEADER.indexOf("플랫폼")];
  assert.equal(code("instagram"), "ig");
  assert.equal(code("facebook"), "fb");
  assert.equal(code("ig"), "ig");
  assert.equal(code("naver"), "naver", "홈페이지 유입은 원문 유지");
});

test("접수시간은 기존 행과 같은 ISO UTC", () => {
  assert.equal(
    toSheetStamp("2026-07-25T15:00:00+0000"),
    "2026-07-25T15:00:00.000Z",
  );
  assert.match(toSheetStamp(""), /^\d{4}-\d{2}-\d{2}T/);
});

test("[invariant] 미설정이면 skip — 시트 때문에 접수가 막히면 안 된다", async () => {
  const { calls, fetchImpl } = stub([]);
  const r = await appendLeadToSheet({ LEADS_SHEET_ID: "" }, LEAD, { fetchImpl });
  assert.deepEqual(r, { skipped: true, reason: "unconfigured" });
  assert.equal(calls.length, 0, "미설정 상태에서 외부 호출 금지");
});

test("append — 토큰 발급 후 지정 탭에 1행, 서브리퀘스트 2회", async () => {
  const { calls, fetchImpl } = stub([
    okToken,
    ["sheets.googleapis.com", () => Response.json({ updates: {} })],
  ]);
  const r = await appendLeadToSheet(ENV, LEAD, { fetchImpl });

  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 2, "토큰 1 + append 1");
  const append = calls[1];
  assert.match(append.url, /\/spreadsheets\/sheet-1\/values\/.*:append/);
  assert.ok(append.url.includes(encodeURIComponent("고객정보!A:O")));
  assert.equal(append.init.headers.Authorization, "Bearer at-1");
  assert.deepEqual(JSON.parse(append.init.body).values, [buildLeadRow(LEAD)]);
});

test("[guard] valueInputOption=RAW — 수식 인젝션 차단", async () => {
  const { calls, fetchImpl } = stub([
    okToken,
    ["sheets.googleapis.com", () => Response.json({})],
  ]);
  await appendLeadToSheet(ENV, { ...LEAD, detail: "=IMPORTXML(1,2)" }, {
    fetchImpl,
  });
  assert.ok(calls[1].url.includes("valueInputOption=RAW"));
  assert.ok(!calls[1].url.includes("USER_ENTERED"));
  assert.equal(
    JSON.parse(calls[1].init.body).values[0][
      LEAD_SHEET_HEADER.indexOf("상담내용")
    ],
    "=IMPORTXML(1,2)",
    "원문은 그대로 저장하되 RAW 라 수식으로 실행되지 않는다",
  );
});

test("탭 이름이 틀리면(400) 첫 번째 탭으로 자동 재시도", async () => {
  let appendCount = 0;
  const { calls, fetchImpl } = stub([
    okToken,
    [
      ":append",
      () => {
        appendCount += 1;
        return appendCount === 1
          ? new Response("Unable to parse range", { status: 400 })
          : Response.json({ updates: {} });
      },
    ],
    [
      "fields=sheets.properties.title",
      () => Response.json({ sheets: [{ properties: { title: "Leads" } }] }),
    ],
  ]);

  const r = await appendLeadToSheet(ENV, LEAD, { fetchImpl });
  assert.deepEqual(r, { ok: true });
  assert.equal(appendCount, 2);
  assert.ok(calls.at(-1).url.includes(encodeURIComponent("Leads!A:O")));
});

test("스코프 부족 토큰은 예외로 드러난다(조용한 누락 금지)", async () => {
  const { fetchImpl } = stub([
    [
      "oauth2.googleapis.com",
      () => Response.json({ error: "invalid_scope" }, { status: 400 }),
    ],
  ]);
  await assert.rejects(
    appendLeadToSheet(ENV, LEAD, { fetchImpl }),
    /sheets_oauth_400_invalid_scope/,
  );
});

test("append 5xx 도 예외 — 호출부가 steps.sheet=fail 로 남긴다", async () => {
  const { fetchImpl } = stub([
    okToken,
    ["sheets.googleapis.com", () => new Response("boom", { status: 503 })],
  ]);
  await assert.rejects(
    appendLeadToSheet(ENV, LEAD, { fetchImpl }),
    /sheets_append_503/,
  );
});

test("설정 판정 — 토큰·시트ID·클라이언트 중 하나라도 없으면 미설정", () => {
  assert.equal(isSheetConfigured(ENV), true);
  assert.equal(
    isSheetConfigured({ ...ENV, GOOGLE_SHEETS_REFRESH_TOKEN: "" }),
    false,
  );
  assert.equal(isSheetConfigured({ ...ENV, LEADS_SHEET_ID: "" }), false);
});
