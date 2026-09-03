import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { sign as signJwt } from "../src/lib/jwt.js";
import { handleEstimates } from "../src/routes/estimates.js";

// [가드] 상담 캘린더와 예약 알림.
//
// 여기서 지키는 것은 두 가지다.
//   1) 알림은 "저장했다"가 아니라 "예약이 실제로 달라졌다"에만 나간다.
//      저장 버튼만 눌러도 나가면, 이미 잡혀 있던 실제 고객 예약이 새 예약처럼
//      다시 알려져 상담 인력이 헛걸음한다.
//   2) 알림은 전용 채널(CALENDAR_*)로만 나간다. 다른 봇 토큰으로 새면
//      상담 인력이 아닌 사람에게 고객 연락처가 간다.

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
});

afterEach(() => {
  globalThis.caches = previousCaches;
  globalThis.fetch = previousFetch;
});

const ID = "rec12345678901A";
const BOOKED = {
  Name: "김서연",
  Phone: "010-1234-5678",
  Status: "전화상담 후 미팅예약",
  Assignee: "박실장",
  ConsultAt: "2026-09-12T05:30:00.000Z",
  ConsultBranch: "강남점",
};

const ENV = {
  JWT_SECRET: "jwt-secret",
  CALENDAR_BOT_TOKEN: "cal-token",
  CALENDAR_CHAT_ID: "-1003958269262",
  // 캘린더 알림이 기본 관리자 채널로 새지 않는지 확인하기 위해 같이 둔다
  TELEGRAM_BOT_TOKEN: "admin-token",
  TELEGRAM_CHAT_ID: "-100999",
};

// 텔레그램 호출만 골라 담는다. 그 밖의 fetch 는 이 경로에서 나오지 않는다.
function captureTelegram() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const m = href.match(/api\.telegram\.org\/bot([^/]+)\/sendMessage/);
    if (m) {
      calls.push({ token: m[1], body: JSON.parse(init.body || "{}") });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return calls;
}

function makeServices(before) {
  return {
    estimates: {
      async get() {
        return { id: ID, fields: { ...before } };
      },
      async update(id, fields) {
        return { id, fields: { ...before, ...fields } };
      },
      async delete() {
        return { deleted: true, id: ID };
      },
    },
    media: { async deleteMany() {} },
  };
}

async function patch(fields, before, env = ENV) {
  const calls = captureTelegram();
  const tasks = [];
  const jwt = await signJwt({ sub: "admin" }, "jwt-secret", 3600);
  const res = await handleEstimates(
    new Request(`https://api.example.test/api/estimates/${ID}`, {
      method: "PATCH",
      headers: {
        cookie: `day1_admin=${encodeURIComponent(jwt)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(fields),
    }),
    env,
    {
      waitUntil(task) {
        tasks.push(task);
      },
    },
    makeServices(before),
  );
  await Promise.all(tasks);
  return { res, calls };
}

test("[가드] 예약이 그대로면 알림을 보내지 않는다", async () => {
  const { res, calls } = await patch(
    { ConsultAt: BOOKED.ConsultAt, ConsultBranch: BOOKED.ConsultBranch },
    BOOKED,
  );
  assert.equal(res.status, 200);
  assert.equal(
    calls.length,
    0,
    "값이 같은데 알림이 나갔다 — 저장만 해도 예약이 새로 잡힌 것처럼 알려진다",
  );
});

test("[가드] 예약과 무관한 필드만 고치면 알림을 보내지 않는다", async () => {
  const { calls } = await patch({ Memo: "통화함" }, BOOKED);
  assert.equal(calls.length, 0);
});

test("빈 값에서 예약이 잡히면 등록 알림을 전용 채널로 보낸다", async () => {
  const { calls } = await patch(
    { ConsultAt: BOOKED.ConsultAt, ConsultBranch: "강남점" },
    { ...BOOKED, ConsultAt: "", ConsultBranch: "" },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].token, "cal-token", "전용 봇이 아닌 토큰으로 나갔다");
  assert.equal(calls[0].body.chat_id, "-1003958269262");
  const text = calls[0].body.text;
  assert.match(text, /\[day1design\/consult\] 상담 예약/);
  // KST 로 환산해 보여야 한다 (05:30Z → 14:30 KST)
  assert.match(text, /2026-09-12\(토\) 14:30 · 강남점/);
  assert.match(text, /김서연/);
});

test("예약 일시가 바뀌면 이전 값과 새 값을 함께 알린다", async () => {
  const { calls } = await patch(
    { ConsultAt: "2026-09-14T02:00:00.000Z", ConsultBranch: "판교점" },
    BOOKED,
  );
  assert.equal(calls.length, 1);
  const text = calls[0].body.text;
  assert.match(text, /상담 예약 변경/);
  assert.match(text, /이전 2026-09-12\(토\) 14:30 · 강남점/);
  assert.match(text, /변경 2026-09-14\(월\) 11:00 · 판교점/);
});

test("지점만 바뀌어도 변경으로 알린다", async () => {
  const { calls } = await patch({ ConsultBranch: "판교점" }, BOOKED);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /상담 예약 변경/);
});

test("[가드] 취소해도 예약 일시를 지우지 않는다 — 캘린더에 '취소'로 남는다", async () => {
  const { res, calls } = await patch(
    { ConsultCancelledAt: "2026-09-04T01:00:00.000Z" },
    BOOKED,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(
    body.updated.ConsultAt,
    BOOKED.ConsultAt,
    "취소하면서 일시를 지웠다 — 캘린더에서 카드가 통째로 사라진다",
  );
  assert.equal(calls.length, 1);
  const text = calls[0].body.text;
  assert.match(text, /상담 예약 취소/);
  assert.match(text, /2026-09-12\(토\) 14:30 · 강남점/);
  assert.match(text, /캘린더에는 취소로 남습니다/);
});

test("취소를 풀면 되살렸다고 알린다", async () => {
  const { calls } = await patch({ ConsultCancelledAt: "" }, {
    ...BOOKED,
    ConsultCancelledAt: "2026-09-04T01:00:00.000Z",
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /상담 예약 되살림/);
  assert.match(calls[0].body.text, /2026-09-12\(토\) 14:30 · 강남점/);
});

test("[가드] 이미 취소된 예약을 다시 저장해도 알리지 않는다", async () => {
  const cancelled = {
    ...BOOKED,
    ConsultCancelledAt: "2026-09-04T01:00:00.000Z",
  };
  const { calls } = await patch(
    { ConsultCancelledAt: "2026-09-04T01:00:00.000Z" },
    cancelled,
  );
  assert.equal(calls.length, 0);
});

test("일시 자체를 비우면 취소와 구분해서 알린다", async () => {
  const { calls } = await patch({ ConsultAt: "", ConsultBranch: "" }, BOOKED);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /상담 예약 일시 삭제/);
});

test("[가드] 전용 채널 시크릿이 없으면 조용히 건너뛴다", async () => {
  const { res, calls } = await patch(
    { ConsultAt: BOOKED.ConsultAt },
    { ...BOOKED, ConsultAt: "" },
    { JWT_SECRET: "jwt-secret", TELEGRAM_BOT_TOKEN: "admin-token" },
  );
  assert.equal(res.status, 200, "알림 설정이 없다고 저장이 실패하면 안 된다");
  assert.equal(calls.length, 0, "기본 관리자 채널로 새어 나갔다");
});

test("캘린더 조회는 기간 안의 예약을 시간순으로 돌려준다", async () => {
  const jwt = await signJwt({ sub: "admin" }, "jwt-secret", 3600);
  let bound = null;
  const env = {
    ...ENV,
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            bound = { sql, args };
            return {
              async all() {
                return {
                  results: [
                    {
                      Id: ID,
                      Name: "김서연",
                      Phone: "010-1234-5678",
                      Status: "전화상담 후 미팅예약",
                      ConsultAt: "2026-09-12T05:30:00.000Z",
                      ConsultBranch: "강남점",
                      Branch: "판교점",
                      Address: "서초구 반포동",
                      AddressDetail: "101동",
                    },
                  ],
                };
              },
            };
          },
        };
      },
    },
  };
  const res = await handleEstimates(
    new Request(
      "https://api.example.test/api/estimates/calendar?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z",
      { headers: { cookie: `day1_admin=${encodeURIComponent(jwt)}` } },
    ),
    env,
    { waitUntil() {} },
    makeServices(BOOKED),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.records.length, 1);
  // 표시 지점은 ConsultBranch 다. Branch(희망 지점)와 섞이면 안 된다.
  assert.equal(body.records[0].consultBranch, "강남점");
  assert.equal(body.records[0].branch, "판교점");
  assert.match(bound.sql, /ORDER BY ConsultAt ASC/);
});

test("[가드] 캘린더 조회는 어드민 인증을 요구한다", async () => {
  const res = await handleEstimates(
    new Request(
      "https://api.example.test/api/estimates/calendar?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z",
    ),
    ENV,
    { waitUntil() {} },
    makeServices(BOOKED),
  );
  assert.equal(res.status, 401);
});

test("기간이 없거나 형식이 어긋나면 400 으로 끊는다", async () => {
  const jwt = await signJwt({ sub: "admin" }, "jwt-secret", 3600);
  for (const q of ["", "?from=2026-09&to=2026-10", "?from=zzz&to=zzz"]) {
    const res = await handleEstimates(
      new Request(`https://api.example.test/api/estimates/calendar${q}`, {
        headers: { cookie: `day1_admin=${encodeURIComponent(jwt)}` },
      }),
      ENV,
      { waitUntil() {} },
      makeServices(BOOKED),
    );
    assert.equal(res.status, 400, `${q} 가 400 이 아니다`);
  }
});
