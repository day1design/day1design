import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runDailyExpertAnalysis } from "./bot.mjs";

const day = {
  range: { startDate: "2026-09-08", endDate: "2026-09-08", days: 1 },
  ads: {
    summary: { spend: 220.87, impressions: 15930, clicks: 293, linkClicks: 238, leads: 7 },
    campaigns: [],
  },
  leads: { total: 9, bySource: [{ source: "meta", n: 7 }], daily: [], byCampaign: [] },
};

const week = {
  range: { startDate: "2026-09-02", endDate: "2026-09-08", days: 7 },
  ads: { summary: { spend: 1745.89, impressions: 109534, clicks: 2117, leads: 33 }, campaigns: [] },
  leads: { total: 44, bySource: [{ source: "meta", n: 33 }], daily: [], byCampaign: [] },
};

test("daily dry-run uses fixture agents and never persists or sends", async () => {
  const result = await runDailyExpertAnalysis({
    date: "2026-09-08",
    day,
    week,
    dayCompleteness: { status: "complete", reportDate: "2026-09-08", evidence: "fixture" },
    dryRun: true,
    persist: true,
    imageKey: "briefs/daily/2026-09-08.png",
    agentRunner: {
      interpret: () => { throw new Error("agent must not run in dry-run"); },
      audit: () => { throw new Error("agent must not run in dry-run"); },
      synthesize: () => { throw new Error("agent must not run in dry-run"); },
    },
  });
  assert.equal(result.payload.status, "success");
  assert.equal(result.payload.reportKind, "daily");
  assert.equal(result.persisted, false);
  assert.equal(result.payload.imageKey, "briefs/daily/2026-09-08.png");
  assert.equal(result.payload.snapshot.dryRun, true);
});

test("daily production path runs the three existing expert stages", async () => {
  const called = [];
  const result = await runDailyExpertAnalysis({
    date: "2026-09-08",
    day,
    week,
    dayCompleteness: { status: "complete", reportDate: "2026-09-08", evidence: "fixture" },
    dryRun: false,
    persist: false,
    agentRunner: {
      interpret: async () => { called.push("interpret"); return { ok: true, out: "draft" }; },
      audit: async () => { called.push("audit"); return { ok: true, out: "audit" }; },
      synthesize: async () => { called.push("synthesize"); return { ok: true, out: "final" }; },
    },
  });
  assert.deepEqual(called, ["interpret", "audit", "synthesize"]);
  assert.equal(result.report, "final");
  assert.equal(result.payload.snapshot.week.range.endDate, "2026-09-08");
});

test("missing daily ads data is explicit and cannot become a zero performance claim", async () => {
  let prompt = "";
  const result = await runDailyExpertAnalysis({
    date: "2026-09-09",
    day,
    week,
    dayCompleteness: { status: "not_collected", reportDate: "2026-09-09", lastSyncedAt: "2026-09-08T19:00:45+09:00" },
    persist: false,
    agentRunner: {
      interpret: async (p) => { prompt = p; return { ok: true, out: "미집계" }; },
      audit: async () => ({ ok: true, out: "미집계" }),
      synthesize: async () => ({ ok: true, out: "미집계" }),
    },
  });
  assert.equal(result.payload.snapshot.dayCompleteness.status, "not_collected");
  assert.match(prompt, /당일 광고 완결성=not_collected/);
  assert.match(prompt, /미집계이면 성과를 0으로 해석하지 말고/);
});

test("CLI dry-run never enters the Telegram send branch", () => {
  const root = mkdtempSync(path.join(tmpdir(), "day1-daily-dry-run-"));
  const out = path.join(root, "out");
  mkdirSync(out);
  writeFileSync(path.join(root, "brief_yday.json"), JSON.stringify(day));
  writeFileSync(path.join(root, "brief_7d.json"), JSON.stringify(week));
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "workers/imac-mkt-brief-bot/daily-report.mjs"), "--dry-run", "--date", "2026-09-08", "--from-dir", root, "--out", out],
      { encoding: "utf8", timeout: 120000, env: { ...process.env, DAY1_MKT_BOT_TOKEN: "must-not-be-used" } },
    );
    assert.equal(result.status, 0, result.stderr);
    const line = result.stdout.trim().split(/\r?\n/).at(-1);
    const summary = JSON.parse(line);
    assert.equal(summary.date, "2026-09-08");
    assert.equal(summary.sent, false);
    assert.equal(summary.noSend, true);
    assert.equal(summary.dryRun, true);
    assert.ok(readdirSync(out).some((name) => /^daily-\d{8}\.png$/.test(name)));
    const expert = readdirSync(out).find((name) => /^expert-daily-\d{8}\.md$/.test(name));
    assert.ok(expert);
    assert.match(readFileSync(path.join(out, expert), "utf8"), /드라이런 전문가 분석/);
    const html = readdirSync(out).find((name) => /^daily-\d{8}\.html$/.test(name));
    assert.ok(html);
    assert.match(readFileSync(path.join(out, html), "utf8"), /Meta 광고 데이터 미집계/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
