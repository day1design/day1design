CREATE TABLE IF NOT EXISTS MetaAdsCreativeCatalog (
  CrmTenantId TEXT NOT NULL,
  SnapshotDate TEXT NOT NULL,
  AdId TEXT NOT NULL,
  AdName TEXT NOT NULL DEFAULT '',
  AdsetId TEXT NOT NULL DEFAULT '',
  AdsetName TEXT NOT NULL DEFAULT '',
  CampaignId TEXT NOT NULL DEFAULT '',
  CampaignName TEXT NOT NULL DEFAULT '',
  CreativeId TEXT NOT NULL DEFAULT '',
  CreativeType TEXT NOT NULL DEFAULT '',
  VideoId TEXT NOT NULL DEFAULT '',
  Status TEXT NOT NULL DEFAULT '',
  UpdatedAt TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (CrmTenantId, SnapshotDate, AdId)
);
CREATE INDEX IF NOT EXISTS idx_meta_creative_catalog_tenant_date_adid
  ON MetaAdsCreativeCatalog(CrmTenantId, SnapshotDate, AdId);
CREATE INDEX IF NOT EXISTS idx_meta_creative_catalog_tenant_adid_date
  ON MetaAdsCreativeCatalog(CrmTenantId, AdId, SnapshotDate);
