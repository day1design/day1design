ALTER TABLE HeatmapEvents ADD COLUMN CrmTenantId TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_heatmap_crm_tenant_created
  ON HeatmapEvents(CrmTenantId, CreatedAt, id);

ALTER TABLE pixel_events ADD COLUMN CrmTenantId TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_events_crm_tenant_created
  ON pixel_events(CrmTenantId, created_at, id);

ALTER TABLE MetaAdsDaily ADD COLUMN CrmTenantId TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_ads_daily_crm_tenant_date
  ON MetaAdsDaily(CrmTenantId, Date, Level, EntityId);

ALTER TABLE MetaAdsAd ADD COLUMN CrmTenantId TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_ads_ad_crm_tenant_date
  ON MetaAdsAd(CrmTenantId, Date, AdId);

ALTER TABLE MetaAdsBreakdown ADD COLUMN CrmTenantId TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdown_crm_tenant_date
  ON MetaAdsBreakdown(CrmTenantId, Date, Dimension, DimensionValue, DimensionSub);
