import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdStmt,
  buildBreakdownStmt,
  buildDailyStmt,
  runBatch,
} from "../src/routes/meta-ads.js";

function capture() {
  const calls = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...values) {
              calls.push({ sql, values });
              return { sql, values };
            },
          };
        },
      },
    },
  };
}

test("Meta ingestion builders bind the server tenant and match placeholders", () => {
  const fields = {
    Date: "2026-09-09",
    Level: "account",
    EntityId: "account-1",
    AdId: "ad-1",
    Dimension: "platform",
    DimensionValue: "facebook",
    DimensionSub: "",
    CrmTenantId: "other",
  };
  for (const builder of [buildDailyStmt, buildAdStmt, buildBreakdownStmt]) {
    const stub = capture();
    builder(stub.env, fields);
    assert.equal(stub.calls.length, 1);
    const { sql, values } = stub.calls[0];
    assert.match(sql, /CrmTenantId/);
    assert.equal(values[1], "day1design");
    assert.equal((sql.match(/\?/g) || []).length, values.length);
  }
});

import { DatabaseSync } from "node:sqlite";

function sqliteEnv(sqlite) {
  return {
    DB: {
      prepare(sql) {
        const statement = sqlite.prepare(sql);
        return { bind(...values) { return { async run() { return statement.run(...values); } }; } };
      },
    },
  };
}

const cases = [
  { name: "daily", builder: buildDailyStmt, table: "MetaAdsDaily", key: "Date,Level,EntityId", columns: ["EntityName", "Status", "Objective", "Impressions", "Clicks", "LinkClicks", "Spend", "Ctr", "Cpc", "Reach", "Frequency", "Leads", "ActionsJson", "VideoP25Watched", "VideoP50Watched", "VideoP75Watched", "VideoP100Watched", "VideoAvgWatchSec", "ThruPlay", "VideoPlays", "Video2SecViews", "UniqueClicks", "UniqueLinkClicks", "CostPerLinkClick", "FetchedAt"], fields: { Date: "2026-09-10", Level: "account", EntityId: "account-1" }, select: "Date='2026-09-10' AND Level='account' AND EntityId='account-1'" },
  { name: "ad", builder: buildAdStmt, table: "MetaAdsAd", key: "Date,AdId", columns: ["AdName", "AdsetId", "AdsetName", "CampaignId", "CampaignName", "CreativeId", "CreativeType", "VideoId", "ThumbnailUrl", "CreativeTitle", "CreativeBody", "CreativeCallToAction", "CreativeLinkUrl", "CreativeVariants", "Status", "Impressions", "Clicks", "LinkClicks", "Spend", "Ctr", "Cpc", "Reach", "Leads", "ThruPlay", "VideoAvgWatchSec", "VideoPlays", "Video2SecViews", "VideoP25Watched", "VideoP50Watched", "VideoP75Watched", "VideoP100Watched", "FetchedAt"], fields: { Date: "2026-09-10", AdId: "ad-1" }, select: "Date='2026-09-10' AND AdId='ad-1'" },
  { name: "breakdown", builder: buildBreakdownStmt, table: "MetaAdsBreakdown", key: "Date,Dimension,DimensionValue,DimensionSub", columns: ["Impressions", "Clicks", "LinkClicks", "Spend", "Ctr", "Cpc", "Reach", "Leads", "VideoPlays", "VideoPlaysSource", "FetchedAt"], fields: { Date: "2026-09-10", Dimension: "platform", DimensionValue: "facebook", DimensionSub: "" }, select: "Date='2026-09-10' AND Dimension='platform' AND DimensionValue='facebook' AND DimensionSub=''" },
];

test("Meta ingestion upserts repair null legacy ownership and preserve other tenants", async () => {
  for (const item of cases) {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE ${item.table} (id TEXT, CrmTenantId TEXT, Date TEXT, Level TEXT, EntityId TEXT, AdId TEXT, Dimension TEXT, DimensionValue TEXT, DimensionSub TEXT, ${item.columns.map((column) => `${column} TEXT`).join(",")}, CreatedAt TEXT); CREATE UNIQUE INDEX dedupe ON ${item.table}(${item.key});`);
    const env = sqliteEnv(sqlite);
    const fields = { ...item.fields, CrmTenantId: "spoofed", Impressions: 99 };
    await item.builder(env, fields).run();
    assert.equal(sqlite.prepare(`SELECT CrmTenantId FROM ${item.table} WHERE ${item.select}`).get().CrmTenantId, "day1design", item.name);
    sqlite.prepare(`DELETE FROM ${item.table}`).run();
    const keyValues = [item.fields.Date, item.fields.Level || "", item.fields.EntityId || "", item.fields.AdId || "", item.fields.Dimension || "", item.fields.DimensionValue || "", item.fields.DimensionSub || ""];
    sqlite.prepare(`INSERT INTO ${item.table}(id,CrmTenantId,Date,Level,EntityId,AdId,Dimension,DimensionValue,DimensionSub,Impressions) VALUES(?,?,?,?,?,?,?,?,?,?)`).run("legacy", null, ...keyValues, 1);
    await item.builder(env, fields).run();
    const repaired = sqlite.prepare(`SELECT CrmTenantId,Impressions FROM ${item.table} WHERE ${item.select}`).get();
    assert.equal(repaired.CrmTenantId, "day1design", item.name + " null legacy tenant");
    assert.equal(Number(repaired.Impressions), 99, item.name + " null legacy metric");
    sqlite.prepare(`UPDATE ${item.table} SET CrmTenantId='other', Impressions='7' WHERE ${item.select}`).run();
    await item.builder(env, fields).run();
    const preserved = sqlite.prepare(`SELECT CrmTenantId,Impressions FROM ${item.table} WHERE ${item.select}`).get();
    assert.equal(preserved.CrmTenantId, "other", item.name + " other tenant");
    assert.equal(Number(preserved.Impressions), 7, item.name + " other tenant metric");
    sqlite.close();
  }
});

test("revision-aware batches stay within the 100 statement D1 limit", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE CrmDataRevisions (tenant_id TEXT PRIMARY KEY, version INTEGER, updated_at TEXT)");
  const batches = [];
  const env = sqliteEnv(sqlite);
  env.DB.batch = async (statements) => {
    batches.push(statements.length);
    for (const statement of statements) await statement.run();
  };
  const statements = Array.from({ length: 100 }, () => ({ async run() {} }));
  await runBatch(env, statements, "day1design");
  assert.deepEqual(batches, [100, 2]);
  assert.equal(sqlite.prepare("SELECT version FROM CrmDataRevisions WHERE tenant_id='day1design'").get().version, 2);
  sqlite.close();
});
