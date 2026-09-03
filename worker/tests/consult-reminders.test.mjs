import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { runConsultReminders } from "../src/routes/estimates.js";

// [가드] 상담 리마인드 — 하루 전 · 2시간 전.
// cron 이 15분마다 도므로 "같은 예약에 두 번 보내지 않는다"가 핵심이다.
// 담당자가 같은 알림을 네 번 받으면 알림 자체를 꺼 버린다.

let previousFetch;

beforeEach(() => {
  previousFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = previousFetch;
});

const ENV_BASE = {
  CALENDAR_BOT_TOKEN: "cal-token",
  CALENDAR_CHAT_ID: "-100395",
};

function makeEnv(rows, opts = {}) {
  const updates = [];
  return {
    env: {
      ...ENV_BASE,
      ...opts.env,
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async all() {
                  // 조회 조건(기간·취소 제외)은 SQL 에 있으므로 여기서는
                  // 넘겨진 rows 를 그대로 돌려준다
                  return { results: rows };
                },
                async run() {
                  if (/UPDATE Estimates SET/.test(sql)) {
                    updates.push({ sql, args });
                  }
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
    },
    updates,
  };
}

function captureTelegram() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    if (/api\.telegram\.org/.test(String(url))) {
      calls.push(JSON.parse(init.body || "{}"));
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return calls;
}

const NOW = Date.parse("2026-09-03T02:00:00.000Z"); // KST 11:00
const row = (over = {}) => ({
  id: "rec12345678901A",
  Name: "박아연",
  Phone: "010-1234-5678",
  Assignee: "유재원",
  Status: "전화상담 후 미팅예약",
  ConsultAt: "2026-09-04T01:00:00.000Z", // 23시간 뒤 (KST 9/4 10:00)
  ConsultBranch: "강남점",
  SpaceSize: "40~50평",
  Address: "서울 동대문구 사가정로 148",
  ConsultRemind1dAt: "",
  ConsultRemind2hAt: "",
  ...over,
});

test("하루 전 구간에 들어오면 내일 상담 알림을 보낸다", async () => {
  const calls = captureTelegram();
  const { env, updates } = makeEnv([row()]);
  const res = await runConsultReminders(env, NOW);
  assert.equal(res.sent, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /내일 상담 예정/);
  assert.match(calls[0].text, /2026-09-04\(금\) 10:00 · 강남점/);
  assert.match(calls[0].text, /박아연/);
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /ConsultRemind1dAt/);
});

test("[가드] 이미 보낸 리마인드는 다시 보내지 않는다", async () => {
  const calls = captureTelegram();
  const { env, updates } = makeEnv([
    row({ ConsultRemind1dAt: "2026-09-03T01:00:00.000Z" }),
  ]);
  const res = await runConsultReminders(env, NOW);
  assert.equal(res.sent, 0, "15분마다 도는 cron 이 같은 알림을 또 보냈다");
  assert.equal(calls.length, 0);
  assert.equal(updates.length, 0);
});

test("2시간 전에 이르면 두 번째 알림이 나간다", async () => {
  const calls = captureTelegram();
  // 상담 1시간 30분 뒤, 하루 전 알림은 이미 보낸 상태
  const now = Date.parse("2026-09-03T23:30:00.000Z");
  const { env } = makeEnv([
    row({ ConsultRemind1dAt: "2026-09-03T01:00:00.000Z" }),
  ]);
  const res = await runConsultReminders(env, now);
  assert.equal(res.sent, 1);
  assert.match(calls[0].text, /2시간 뒤 상담/);
});

test("아직 하루 전에 이르지 않았으면 아무것도 보내지 않는다", async () => {
  const calls = captureTelegram();
  // 상담이 이틀 뒤
  const { env } = makeEnv([row({ ConsultAt: "2026-09-05T01:00:00.000Z" })]);
  const res = await runConsultReminders(env, NOW);
  assert.equal(res.sent, 0);
  assert.equal(calls.length, 0);
});

test("[가드] 전용 채널 시크릿이 없으면 조용히 건너뛴다", async () => {
  const calls = captureTelegram();
  const { env } = makeEnv([row()], { env: { CALENDAR_BOT_TOKEN: "" } });
  const res = await runConsultReminders(env, NOW);
  assert.equal(res.sent, 0);
  assert.equal(calls.length, 0);
});

test("[가드] 조회 SQL 이 취소된 예약을 제외한다", async () => {
  captureTelegram();
  let seenSql = "";
  const env = {
    ...ENV_BASE,
    DB: {
      prepare(sql) {
        seenSql = sql;
        return {
          bind() {
            return {
              async all() {
                return { results: [] };
              },
              async run() {
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
  await runConsultReminders(env, NOW);
  assert.match(
    seenSql,
    /COALESCE\(ConsultCancelledAt, ''\) = ''/,
    "취소된 예약에도 리마인드가 나간다",
  );
});
