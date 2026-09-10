import assert from "node:assert/strict";
import test from "node:test";
import { reconcileVideoBreakdown, writeBreakdownSnapshots } from "../src/routes/meta-ads.js";

const account = (value) => ({ date_start: "2026-09-09", video_play_actions: [{ action_type: "video_view", value }] });
const platform = (name, value) => ({ date_start: "2026-09-09", publisher_platform: name, ...(value === undefined ? {} : { video_play_actions: [{ action_type: "video_view", value }] }), impressions: 10 });

test("exact account sum reconciles omitted platform action as a sourced zero without dropping rows", () => {
  const result = reconcileVideoBreakdown([account(10)], [platform("facebook"), platform("instagram", 10)], "platform");
  assert.equal(result.evidence.completeDays, 1);
  assert.equal(result.evidence.omittedUnobserved, 1);
  assert.equal(result.snapshots[0].rows.length, 2);
  assert.equal(result.snapshots[0].rows[0].__videoPlaysSource, "account_total_reconciled");
  assert.equal(result.snapshots[0].rows[1].__videoPlaysSource, "meta_action");
});

test("sum mismatch keeps raw rows partial and never labels missing action reconciled", () => {
  const result = reconcileVideoBreakdown([account(10)], [platform("facebook"), platform("instagram", 9)], "platform");
  assert.equal(result.evidence.partialDays, 1);
  assert.equal(result.snapshots[0].rows[0].__videoPlaysSource, null);
});

test("malformed and duplicate groups fail before publishing a snapshot", () => {
  assert.throws(() => reconcileVideoBreakdown([account(10)], [platform("facebook", "bad"), platform("instagram", 10)], "platform"), /metric_invalid/);
  assert.throws(() => reconcileVideoBreakdown([account(10)], [platform("facebook", 5), platform("facebook", 5)], "platform"), /duplicate_group/);
});

test("missing account replaces prior inferred values with raw unknown rows", () => {
  const result = reconcileVideoBreakdown([], [platform("facebook"), platform("instagram", 10)], "platform");
  assert.equal(result.snapshots.length, 1);
  assert.equal(result.snapshots[0].rows[0].__videoPlaysSource, null);
});

test("snapshot batch is bounded to delete plus rows plus revision", async () => {
  const batches = [];
  const env = { DB: {
    prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    async batch(statements) { batches.push(statements); },
  } };
  const rows = Array.from({ length: 98 }, (_, i) => ({ date_start: "2026-09-09", publisher_platform: `p${i}`, impressions: 1, video_play_actions: [{ action_type: "video_view", value: 0 }] }));
  await writeBreakdownSnapshots(env, [{ date: "2026-09-09", dimension: "platform", rows }], "2026-09-10T00:00:00.000Z");
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 100);
  assert.match(batches[0][0].sql, /DELETE FROM MetaAdsBreakdown/);
  assert.match(batches[0].at(-1).sql, /CrmDataRevisions/);
});

test("oversize snapshot fails before any database batch", async () => {
  let writes = 0;
  await assert.rejects(() => writeBreakdownSnapshots({ DB: { batch() { writes++; } } }, [{ date: "2026-09-09", dimension: "platform", rows: Array(99).fill(platform("facebook",0)) }], "now"), /batch_limit/);
  assert.equal(writes, 0);
});

import { DatabaseSync } from "node:sqlite";
import { buildBreakdownStmt } from "../src/routes/meta-ads.js";
test("snapshot transaction preserves foreign rows and rolls back deletion on insert failure", async () => {
  const db = new DatabaseSync(":memory:");
  let insertSql;
  buildBreakdownStmt({DB:{prepare(sql){ insertSql=sql; return {bind(){}}; }}}, {Date:"2026-09-09",Dimension:"platform",DimensionValue:"instagram"});
  const columns = insertSql.match(/INSERT INTO MetaAdsBreakdown\s*\(([^)]+)\)/)[1].split(",").map(s=>s.trim());
  db.exec(`CREATE TABLE MetaAdsBreakdown (${columns.map(c=>c+' TEXT').join(',')}, UNIQUE(Date,Dimension,DimensionValue,DimensionSub)); CREATE TABLE CrmDataRevisions(tenant_id TEXT PRIMARY KEY,version INTEGER,updated_at TEXT)`);
  const env={DB:{prepare(sql){return {bind(...values){return {sql,values};}};},async batch(items){db.exec('BEGIN');try{for(const item of items)db.prepare(item.sql).run(...item.values);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}}};
  db.exec("INSERT INTO MetaAdsBreakdown(id,CrmTenantId,Date,Dimension,DimensionValue,DimensionSub) VALUES ('old','day1design','2026-09-09','platform','old',''),('foreign','other','2026-09-09','platform','foreign',''); CREATE TRIGGER reject_bad BEFORE INSERT ON MetaAdsBreakdown WHEN NEW.DimensionValue='fail' BEGIN SELECT RAISE(ABORT,'fixture insert rejected'); END;");
  await assert.rejects(()=>writeBreakdownSnapshots(env,[{date:'2026-09-09',dimension:'platform',rows:[platform('fail',1)]}],'now'),/fixture insert/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM MetaAdsBreakdown').get().n,2);
  const reconciled=reconcileVideoBreakdown([account(10)],[platform('instagram',10),platform('facebook')],'platform');
  await writeBreakdownSnapshots(env,reconciled.snapshots,'now');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM MetaAdsBreakdown WHERE CrmTenantId='other'").get().n,1);
  const zero=db.prepare("SELECT VideoPlays,VideoPlaysSource,Impressions FROM MetaAdsBreakdown WHERE DimensionValue='facebook'").get();
  assert.equal(Number(zero.VideoPlays),0);assert.equal(zero.VideoPlaysSource,'account_total_reconciled');assert.equal(Number(zero.Impressions),10);
  assert.equal(db.prepare('SELECT version FROM CrmDataRevisions').get().version,1);db.close();
});
