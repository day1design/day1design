CREATE INDEX IF NOT EXISTS idx_meta_creative_catalog_tenant_snapshot_status_adid
  ON MetaAdsCreativeCatalog(CrmTenantId, SnapshotDate, Status, AdId);
