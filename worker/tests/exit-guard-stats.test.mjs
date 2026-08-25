// ╔══════════════════════════════════════════════════════════════════════╗
// ║  이탈 방지 팝업 성과 기록 회귀 가드                                     ║
// ║                                                                       ║
// ║  기록은 홈페이지에서 누구나 남길 수 있어야 하고(공개 POST), 집계 조회는  ║
// ║  관리자만 볼 수 있어야 한다. 봇 트래픽은 태깅해 집계에서 빼되 버리지     ║
// ║  않는다(유입통계와 같은 규칙).                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { handleExitGuard } from "../src/routes/exit-guard.js";

let previousCaches;

beforeEach(() => {
  previousCaches = globalThis.caches;
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
});

// bind 로 넘어온 값을 그대로 붙잡아 두는 최소 D1 스텁
function makeDb(captured) {
  return {
    prepare(sql) {
      const stmt = {
        sql,
        bound: [],
        bind(...args) {
          stmt.bound = args;
          captured.push({ sql, args });
          return stmt;
        },
        async run() {
          return { success: true };
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      return stmts.map(() => ({ results: [] }));
    },
  };
}

function trackRequest(events, headers = {}) {
  return new Request("https://api.example.test/api/exit-guard/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.70",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      ...headers,
    },
    body: JSON.stringify({ events }),
  });
}

test("[invariant] 팝업 결과 기록은 홈페이지에서 인증 없이 남길 수 있다", async () => {
  const captured = [];
  const tasks = [];
  const res = await handleExitGuard(
    trackRequest([
      {
        type: "shown",
        page: "/pages/portfolio",
        device: "pc",
        session_id: "sess-1",
        shown_seq: 1,
      },
    ]),
    { DB: makeDb(captured) },
    { waitUntil: (t) => tasks.push(t) },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(body.stored, 1);
  assert.equal(captured.length, 1);
  assert.ok(
    captured[0].sql.includes("INSERT INTO ExitGuardEvents"),
    "ExitGuardEvents 에 적재되어야 함",
  );
  assert.equal(captured[0].args[1], "sess-1", "SessionId 를 그대로 남겨야 함");
  assert.equal(captured[0].args[2], "shown");
  assert.equal(captured[0].args[17], 0, "정상 브라우저는 IsBot=0");
});

test("[invariant] 알 수 없는 이벤트 종류는 버린다", async () => {
  const captured = [];
  const res = await handleExitGuard(
    trackRequest([
      { type: "hacked", page: "/", device: "pc" },
      { type: "", page: "/", device: "pc" },
    ]),
    { DB: makeDb(captured) },
    { waitUntil() {} },
  );
  const body = await res.json();
  assert.equal(body.stored, 0);
  assert.equal(captured.length, 0, "허용 목록 밖의 값이 적재되면 안 된다");
});

test("[invariant] 봇 트래픽은 버리지 않고 IsBot=1 로 태깅한다", async () => {
  const captured = [];
  const tasks = [];
  await handleExitGuard(
    trackRequest(
      [{ type: "shown", page: "/", device: "pc", session_id: "bot-1" }],
      { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
    ),
    { DB: makeDb(captured) },
    { waitUntil: (t) => tasks.push(t) },
  );
  await Promise.allSettled(tasks);
  assert.equal(captured.length, 1, "봇도 기록은 남긴다");
  assert.equal(captured[0].args[17], 1, "봇은 IsBot=1 로 태깅되어야 함");
});

test("[invariant] JSON 이 아닌 요청은 415 로 막는다", async () => {
  const res = await handleExitGuard(
    new Request("https://api.example.test/api/exit-guard/track", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "cf-connecting-ip": "203.0.113.71",
      },
      body: "events=1",
    }),
    { DB: makeDb([]) },
    { waitUntil() {} },
  );
  assert.equal(res.status, 415);
});

test("[invariant] 집계 조회는 관리자 인증을 요구한다", async () => {
  const res = await handleExitGuard(
    new Request("https://api.example.test/api/exit-guard/stats?days=30", {
      method: "GET",
      headers: { "cf-connecting-ip": "203.0.113.72" },
    }),
    { DB: makeDb([]), JWT_SECRET: "s" },
    { waitUntil() {} },
  );
  assert.equal(res.status, 401, "인증 없이 성과 통계가 열리면 안 된다");
});
