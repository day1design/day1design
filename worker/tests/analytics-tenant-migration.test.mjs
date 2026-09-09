import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migration = (name) =>
  readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

test("analytics tenant migration backfills raw sources and leaves TTL-owned writes out of revisions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE CrmTenants (id TEXT PRIMARY KEY, suspended INTEGER NOT NULL DEFAULT 0);
      INSERT INTO CrmTenants(id,suspended) VALUES ('day1design',0),('other',0);
      CREATE TABLE CrmDataRevisions (tenant_id TEXT PRIMARY KEY REFERENCES CrmTenants(id), version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT '');
      INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES ('day1design',0,''),('other',0,'');
      CREATE TABLE HeatmapEvents (id TEXT PRIMARY KEY, CreatedAt TEXT);
      CREATE TABLE pixel_events (id TEXT PRIMARY KEY, created_at TEXT);
      CREATE TABLE MetaAdsDaily (id TEXT PRIMARY KEY, Date TEXT, Level TEXT, EntityId TEXT);
      CREATE TABLE MetaAdsAd (id TEXT PRIMARY KEY, Date TEXT, AdId TEXT);
      CREATE TABLE MetaAdsBreakdown (id TEXT PRIMARY KEY, Date TEXT, Dimension TEXT, DimensionValue TEXT, DimensionSub TEXT);
      INSERT INTO HeatmapEvents(id,CreatedAt) VALUES ('h-old','2026-09-09T00:00:00Z');
      INSERT INTO pixel_events(id,created_at) VALUES ('p-old','2026-09-09T00:00:00Z');
      INSERT INTO MetaAdsDaily(id,Date,Level,EntityId) VALUES ('d-old','2026-09-09','account','account-1');
      INSERT INTO MetaAdsAd(id,Date,AdId) VALUES ('a-old','2026-09-09','ad-1');
      INSERT INTO MetaAdsBreakdown(id,Date,Dimension,DimensionValue,DimensionSub) VALUES ('b-old','2026-09-09','platform','facebook','');
    `);
    db.exec(migration("0073_analytics_tenant_link_nullable.sql"));
    db.exec(migration("0074_analytics_day1_backfill_and_revision_triggers.sql"));

    for (const table of ["HeatmapEvents", "pixel_events", "MetaAdsDaily", "MetaAdsAd", "MetaAdsBreakdown"]) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE CrmTenantId='day1design'`).get().n, 1);
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE CrmTenantId IS NULL`).get().n, 0);
    }
    const afterBackfill = db.prepare("SELECT version FROM CrmDataRevisions WHERE tenant_id='day1design'").get().version;
    assert.equal(afterBackfill, 5);

    db.exec(`
      INSERT INTO HeatmapEvents(id,CrmTenantId) VALUES ('h-new','day1design');
      INSERT INTO pixel_events(id,CrmTenantId) VALUES ('p-new','day1design');
      INSERT INTO MetaAdsDaily(id,CrmTenantId) VALUES ('d-new','day1design');
      INSERT INTO MetaAdsAd(id,CrmTenantId) VALUES ('a-new','day1design');
      INSERT INTO MetaAdsBreakdown(id,CrmTenantId) VALUES ('b-new','day1design');
      UPDATE MetaAdsDaily SET EntityId='account-2' WHERE id='d-new';
    `);
    const afterWrites = db.prepare("SELECT version FROM CrmDataRevisions WHERE tenant_id='day1design'").get().version;
    assert.equal(afterWrites, afterBackfill);

    db.exec(migration("0074_analytics_day1_backfill_and_revision_triggers.sql"));
    assert.equal(db.prepare("SELECT version FROM CrmDataRevisions WHERE tenant_id='day1design'").get().version, afterWrites);
    for (const indexName of [
      "idx_heatmap_crm_tenant_created",
      "idx_pixel_events_crm_tenant_created",
      "idx_meta_ads_daily_crm_tenant_date",
      "idx_meta_ads_ad_crm_tenant_date",
      "idx_meta_ads_breakdown_crm_tenant_date",
    ]) {
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name=?").get(indexName).n, 1);
    }
  } finally {
    db.close();
  }
});
