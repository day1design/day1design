CREATE INDEX IF NOT EXISTS idx_meta_ads_ad_tenant_date_adid
  ON MetaAdsAd(CrmTenantId, Date, AdId);
CREATE INDEX IF NOT EXISTS idx_meta_ads_ad_tenant_adid_date
  ON MetaAdsAd(CrmTenantId, AdId, Date);
