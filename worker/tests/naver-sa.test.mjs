// 네이버 검색광고 일별 통계 수집 가드
// 1) 서명은 네이버 규격(HMAC-SHA256, "{timestamp}.{method}.{uri}", base64)과 같다.
// 2) 같은 값이면 다시 쓰지 않고, 바뀐 값만 갱신한다.
// 3) 요청했는데 응답에서 빠진 엔티티(실적 0)만 지우고, 요청하지 않은 엔티티 기록은 남긴다.
// 4) KST 09시 = 최근 3일 재수집, 그 밖 = 과거분 7일씩 백필, 730일 한계에서 멈춘다.
// 5) API 가 실패하면 아무것도 지우지 않는다.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  dailyStatements,
  kstDate,
  runNaverSaCron,
  signRequest,
} from "../src/lib/naver-sa.js";

const MIGRATION = readFileSync(
  new URL("../migrations/0101_naver_sa_stats.sql", import.meta.url),
  "utf8",
);

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION);
  let batches = 0;
  const db = {
    sqlite,
    prepare(sql) {
      let args = [];
      const q = {
        bind(...v) {
          args = v;
          return q;
        },
        async first() {
          return sqlite.prepare(sql).get(...args) || null;
        },
        async all() {
          return { success: true, results: sqlite.prepare(sql).all(...args) };
        },
        async run() {
          return sqlite.prepare(sql).run(...args);
        },
      };
      return q;
    },
    async batch(statements) {
      batches++;
      return Promise.all(statements.map((s) => s.all()));
    },
    get batches() {
      return batches;
    },
  };
  return db;
}

const ENV_KEYS = {
  NAVER_SA_API_KEY: "test-license",
  NAVER_SA_SECRET_KEY: "test-secret",
  NAVER_SA_CUSTOMER_ID: "2799816",
};

const CAMPAIGNS = [
  { nccCampaignId: "cmp-1", name: "플레이스_판교점", campaignTp: "PLACE", userLock: false, dailyBudget: 20000 },
  { nccCampaignId: "cmp-2", name: "파워링크_강남본점", campaignTp: "WEB_SITE", userLock: true, dailyBudget: 120000 },
];
const ADGROUPS = [
  { nccAdgroupId: "grp-1", nccCampaignId: "cmp-1", name: "판교 그룹", adgroupType: "PLACE", userLock: false, dailyBudget: 0 },
];

// 날짜별 가짜 실적. 키: `${date}|${id}`
function fakeApi(stats = {}, { failStats = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init.headers });
    if (u.pathname === "/ncc/campaigns") return Response.json(CAMPAIGNS);
    if (u.pathname === "/ncc/adgroups") return Response.json(ADGROUPS);
    if (u.pathname === "/stats") {
      if (failStats) return new Response('{"code":500}', { status: 500 });
      const { since } = JSON.parse(u.searchParams.get("timeRange"));
      const ids = u.searchParams.get("ids").split(",");
      const data = ids
        .filter((id) => stats[`${since}|${id}`])
        .map((id) => ({ id, ...stats[`${since}|${id}`] }));
      return Response.json({ data });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, calls };
}

// 2026-11-26 09:05 KST
const AT_9 = Date.parse("2026-11-26T00:05:00Z");
// 2026-11-26 13:05 KST
const AT_13 = Date.parse("2026-11-26T04:05:00Z");

test("서명은 네이버 검색광고 규격과 같다", async () => {
  const expected = crypto
    .createHmac("sha256", "secret-x")
    .update("1700000000000.GET./stats")
    .digest("base64");
  assert.equal(await signRequest("secret-x", "1700000000000", "GET", "/stats"), expected);
});

test("키가 없으면 아무것도 하지 않는다", async () => {
  const db = fixture();
  try {
    const { fetchImpl, calls } = fakeApi();
    const r = await runNaverSaCron({ DB: db }, { now: AT_9, fetchImpl });
    assert.equal(r.skipped, "no_config");
    assert.equal(calls.length, 0);
  } finally {
    db.sqlite.close();
  }
});

test("KST 09시 회차는 이름표를 갱신하고 최근 3일을 저장한다", async () => {
  const db = fixture();
  try {
    const y = kstDate(-1, AT_9);
    assert.equal(y, "2026-11-25");
    const { fetchImpl, calls } = fakeApi({
      [`${y}|cmp-1`]: { impCnt: 55, clkCnt: 3, salesAmt: 7586, ccnt: 0, convAmt: 0, avgRnk: 2.1 },
      [`${y}|grp-1`]: { impCnt: 55, clkCnt: 3, salesAmt: 7586, ccnt: 0, convAmt: 0, avgRnk: 2.1 },
    });
    const r = await runNaverSaCron({ DB: db, ...ENV_KEYS }, { now: AT_9, fetchImpl });
    assert.equal(r.mode, "daily");
    assert.deepEqual(r.dates, ["2026-11-25", "2026-11-24", "2026-11-23"]);
    // 목록 2회 + 3일 × 2레벨
    assert.equal(calls.filter((c) => c.path === "/stats").length, 6);
    assert.ok(calls.every((c) => c.headers["X-Customer"] === "2799816" && c.headers["X-Signature"]));
    const entities = db.sqlite.prepare("SELECT EntityId, Level, CampaignId, Locked FROM NaverSaEntities ORDER BY EntityId").all();
    assert.deepEqual(entities.map((e) => [e.EntityId, e.Level, e.CampaignId, e.Locked]), [
      ["cmp-1", "campaign", "cmp-1", 0],
      ["cmp-2", "campaign", "cmp-2", 1],
      ["grp-1", "adgroup", "cmp-1", 0],
    ]);
    const rows = db.sqlite.prepare("SELECT Date, EntityId, Level, CampaignId, Impressions, Cost FROM NaverSaDaily ORDER BY EntityId").all();
    assert.deepEqual(rows.map((x) => [x.Date, x.EntityId, x.Level, x.CampaignId, x.Impressions, x.Cost]), [
      ["2026-11-25", "cmp-1", "campaign", "cmp-1", 55, 7586],
      ["2026-11-25", "grp-1", "adgroup", "cmp-1", 55, 7586],
    ]);
  } finally {
    db.sqlite.close();
  }
});

test("같은 값이면 다시 쓰지 않고 바뀐 값만 갱신한다", async () => {
  const db = fixture();
  try {
    const run = (rows, at) => db.batch(dailyStatements(db, {
      date: "2026-11-25", level: "campaign", requested: ["cmp-1", "cmp-2"], rows, campaignOf: (id) => id, at,
    }));
    await run([{ id: "cmp-1", impCnt: 10, clkCnt: 1, salesAmt: 500 }], "t1");
    await run([{ id: "cmp-1", impCnt: 10, clkCnt: 1, salesAmt: 500 }], "t2");
    assert.equal(db.sqlite.prepare("SELECT FetchedAt FROM NaverSaDaily").get().FetchedAt, "t1");
    await run([{ id: "cmp-1", impCnt: 12, clkCnt: 1, salesAmt: 600 }], "t3");
    const row = db.sqlite.prepare("SELECT Impressions, Cost, FetchedAt FROM NaverSaDaily").get();
    assert.deepEqual([row.Impressions, row.Cost, row.FetchedAt], [12, 600, "t3"]);
  } finally {
    db.sqlite.close();
  }
});

test("응답에서 빠진 요청 엔티티만 지우고 요청하지 않은 기록은 남긴다", async () => {
  const db = fixture();
  try {
    const base = { date: "2026-11-25", level: "campaign", campaignOf: (id) => id, at: "t" };
    await db.batch(dailyStatements(db, { ...base, requested: ["cmp-1", "cmp-old"], rows: [
      { id: "cmp-1", impCnt: 5 }, { id: "cmp-old", impCnt: 7 },
    ] }));
    // 다음 회차: cmp-old 는 목록에서 사라져 요청하지 않음, cmp-1 은 실적 0으로 응답에서 빠짐
    await db.batch(dailyStatements(db, { ...base, requested: ["cmp-1"], rows: [] }));
    const ids = db.sqlite.prepare("SELECT EntityId FROM NaverSaDaily").all().map((r) => r.EntityId);
    assert.deepEqual(ids, ["cmp-old"]);
  } finally {
    db.sqlite.close();
  }
});

test("그 밖의 회차는 어제부터 7일씩 거슬러 채우고 730일 한계에서 멈춘다", async () => {
  const db = fixture();
  try {
    const { fetchImpl } = fakeApi({ "2026-11-20|cmp-1": { impCnt: 3, salesAmt: 100 } });
    const env = { DB: db, ...ENV_KEYS };
    const first = await runNaverSaCron(env, { now: AT_13, fetchImpl });
    assert.equal(first.mode, "backfill");
    assert.deepEqual(first.dates, ["2026-11-25", "2026-11-24", "2026-11-23", "2026-11-22", "2026-11-21", "2026-11-20", "2026-11-19"]);
    assert.equal(first.next, "2026-11-18");
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM NaverSaDaily WHERE Date='2026-11-20'").get().n, 1);
    const second = await runNaverSaCron(env, { now: AT_13, fetchImpl });
    assert.equal(second.dates[0], "2026-11-18");

    // 한계 바로 앞으로 커서를 옮기면 남은 날만 받고 끝 표시
    const oldest = kstDate(-729, AT_13);
    db.sqlite.prepare("UPDATE NaverSaSyncState SET Value=? WHERE Key='backfill_cursor'").run(oldest);
    const last = await runNaverSaCron(env, { now: AT_13, fetchImpl });
    assert.deepEqual(last.dates, [oldest]);
    assert.equal(last.done, true);
    const after = await runNaverSaCron(env, { now: AT_13, fetchImpl });
    assert.equal(after.skipped, "done");
  } finally {
    db.sqlite.close();
  }
});

test("API 가 실패하면 아무것도 지우지 않는다", async () => {
  const db = fixture();
  try {
    db.sqlite.prepare("INSERT INTO NaverSaDaily (Date, EntityId, Level, Impressions) VALUES ('2026-11-25','cmp-1','campaign',9)").run();
    const { fetchImpl } = fakeApi({}, { failStats: true });
    await assert.rejects(runNaverSaCron({ DB: db, ...ENV_KEYS }, { now: AT_9, fetchImpl }), /naver-sa \/stats 500/);
    assert.equal(db.sqlite.prepare("SELECT Impressions FROM NaverSaDaily").get().Impressions, 9);
  } finally {
    db.sqlite.close();
  }
});

test("기간 조회는 인덱스를 쓴다", () => {
  const db = fixture();
  try {
    const plan = db.sqlite
      .prepare("EXPLAIN QUERY PLAN SELECT Date, SUM(Cost) FROM NaverSaDaily WHERE Level=? AND Date>=? AND Date<=? GROUP BY Date ORDER BY Date LIMIT 400")
      .all("campaign", "2026-10-01", "2026-10-31");
    assert.ok(plan.some((r) => r.detail.includes("idx_naver_sa_daily_level_date")));
    assert.ok(!plan.some((r) => /SCAN NaverSaDaily\b(?! USING)/.test(r.detail)));
    const byCampaign = db.sqlite
      .prepare("EXPLAIN QUERY PLAN SELECT Date, Cost FROM NaverSaDaily WHERE CampaignId=? AND Date>=? ORDER BY Date LIMIT 400")
      .all("cmp-1", "2026-10-01");
    assert.ok(byCampaign.some((r) => r.detail.includes("idx_naver_sa_daily_campaign_date")));
  } finally {
    db.sqlite.close();
  }
});
