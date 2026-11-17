import assert from "node:assert/strict";
import test from "node:test";

import {
  getLeadCpmWeekly,
  buildLeadWeeklyStmts,
  fetchBreakdown,
} from "../src/routes/meta-ads.js";

// 잠재고객 캠페인 주별 노출 단가: 트래픽 캠페인을 섞으면 CPM 이 싸게 보이는 착시가 생긴다(2026-11-17 실측).
function fakeEnv({ daily = [], positions = [], reach = [] } = {}) {
  const calls = [];
  return {
    calls,
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            calls.push({ sql, args });
            const results = sql.includes("lead_position_week")
              ? positions
              : sql.includes("'lead_week'")
                ? reach
                : daily;
            return { all: async () => ({ results }) };
          },
        };
      },
    },
  };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("13 Monday-based weeks from lead campaigns only, current week marked partial", async () => {
  // 2026-11-16 is a Monday, so the current week holds one day.
  const env = fakeEnv({
    daily: [
      { Date: "2026-08-24", Spend: 100, Impressions: 2500 },
      { Date: "2026-08-30", Spend: 50, Impressions: 1250 },
      { Date: "2026-11-09", Spend: 300, Impressions: 6000 },
      { Date: "2026-11-16", Spend: 80, Impressions: 1000 },
    ],
  });
  const out = await getLeadCpmWeekly(env, 13, "2026-11-16");

  assert.equal(out.start, "2026-08-24");
  assert.equal(out.weeks.length, 13);
  const daily = env.calls.find((c) => c.sql.includes("MetaAdsDaily"));
  assert.match(daily.sql, /Level = 'campaign'/);
  assert.match(daily.sql, /LIMIT \d+/);
  assert.deepEqual(daily.args, ["2026-08-24", "2026-11-16", "OUTCOME_LEADS", "LEAD_GENERATION"]);
  for (const c of env.calls) assert.match(c.sql, /LIMIT \d+/, "every list query is bounded");

  const first = out.weeks[0];
  assert.deepEqual(
    [first.start, first.end, first.days, first.partial, first.spend, first.impressions],
    ["2026-08-24", "2026-08-30", 7, false, 150, 3750],
  );
  close(first.cpm, 40);
  close(first.impPer100, 2500);

  const last = out.weeks[11];
  assert.equal(last.start, "2026-11-09");
  assert.equal(last.partial, false);
  close(last.cpm, 50);

  const cur = out.weeks[12];
  assert.deepEqual([cur.start, cur.end, cur.days, cur.partial], ["2026-11-16", "2026-11-16", 1, true]);
  close(cur.cpm, 80);

  // A week without delivery stays at zero instead of NaN.
  assert.deepEqual([out.weeks[5].cpm, out.weeks[5].impPer100], [0, 0]);
});

test("a Sunday end date closes the last week", async () => {
  const out = await getLeadCpmWeekly(fakeEnv(), 13, "2026-11-15");
  assert.equal(out.start, "2026-08-17");
  assert.equal(out.weeks.at(-1).start, "2026-11-09");
  assert.equal(out.weeks.at(-1).partial, false);
});

test("weekly placements and reach attach to their Monday week only", async () => {
  const env = fakeEnv({
    positions: [
      { Date: "2026-11-09", Platform: "instagram", Position: "feed", Spend: 60, Impressions: 1000 },
      { Date: "2026-11-09", Platform: "threads", Position: "threads_feed", Spend: 6, Impressions: 500 },
      { Date: "2026-11-10", Platform: "instagram", Position: "feed", Spend: 1, Impressions: 1 }, // not a week start
    ],
    reach: [
      { Date: "2026-11-09", Spend: 1500, Impressions: 33000, Reach: 15000 },
      { Date: "2026-11-02", Spend: 100, Impressions: 0, Reach: 0 }, // no reach → stays null
    ],
  });
  const out = await getLeadCpmWeekly(env, 13, "2026-11-16");
  const w = out.weeks.find((x) => x.start === "2026-11-09");
  assert.deepEqual(w.placements, [
    { key: "instagram/feed", spend: 60, impressions: 1000 },
    { key: "threads/threads_feed", spend: 6, impressions: 500 },
  ]);
  close(w.reach.people, 15000);
  close(w.reach.frequency, 2.2);
  close(w.reach.costPer1000, 100);
  assert.equal(out.weeks.find((x) => x.start === "2026-11-02").reach, null);
  assert.deepEqual(out.weeks.find((x) => x.start === "2026-11-16").placements, []);
});

test("weekly lead rows are stored as lead_week / lead_position_week by Monday date", () => {
  const stmts = [];
  const env = { DB: { prepare(sql) { return { bind(...values) { const s = { sql, values }; stmts.push(s); return s; } }; } } };
  buildLeadWeeklyStmts(
    env,
    {
      weeks: [{ date_start: "2026-11-09", spend: "1500", impressions: "33000", reach: "15000" }],
      positions: [
        { date_start: "2026-11-09", publisher_platform: "instagram", platform_position: "instagram_reels", spend: "500", impressions: "13000" },
        { date_start: "2026-11-09", publisher_platform: "instagram" }, // no position → skipped
      ],
    },
    "2026-11-17T00:00:00.000Z",
  );
  assert.equal(stmts.length, 2);
  assert.deepEqual(stmts[0].values.slice(2, 6), ["2026-11-09", "lead_week", "all", ""]);
  assert.deepEqual(stmts[1].values.slice(2, 6), ["2026-11-09", "lead_position_week", "instagram_reels", "instagram"]);
  assert.match(stmts[0].sql, /ON CONFLICT\(Date, Dimension, DimensionValue, DimensionSub\)/);
});

test("fetchBreakdown keeps daily defaults and supports a weekly lead-only request", async () => {
  const oldFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(new URL(String(url)));
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };
  try {
    await fetchBreakdown("t", "1", "2026-11-09", "2026-11-16", "publisher_platform");
    await fetchBreakdown("t", "1", "2026-11-09", "2026-11-16", "", {
      timeIncrement: 7,
      filtering: [{ field: "campaign.objective", operator: "IN", value: ["OUTCOME_LEADS"] }],
    });
  } finally {
    globalThis.fetch = oldFetch;
  }
  const [daily, weekly] = urls.map((u) => u.searchParams);
  assert.equal(daily.get("time_increment"), "1");
  assert.equal(daily.get("filtering"), null);
  assert.equal(weekly.get("time_increment"), "7");
  assert.equal(weekly.has("breakdowns"), false);
  assert.deepEqual(JSON.parse(weekly.get("filtering"))[0].value, ["OUTCOME_LEADS"]);
});
