CREATE TABLE IF NOT EXISTS MetaAdsMediaAssets (
  CrmTenantId TEXT NOT NULL,
  Kind TEXT NOT NULL,
  MediaId TEXT NOT NULL,
  R2Key TEXT NOT NULL,
  State TEXT NOT NULL DEFAULT 'ready',
  UpdatedAt TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (CrmTenantId, Kind, MediaId)
);
CREATE INDEX IF NOT EXISTS idx_meta_ads_media_assets_tenant_state_updated
  ON MetaAdsMediaAssets(CrmTenantId, State, UpdatedAt, MediaId);

CREATE TABLE IF NOT EXISTS MetaAdsMediaSyncLeases (
  CrmTenantId TEXT PRIMARY KEY,
  OwnerId TEXT NOT NULL,
  ExpiresAt TEXT NOT NULL
);
