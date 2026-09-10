ALTER TABLE MetaAdsAd ADD COLUMN CreativeTitle TEXT DEFAULT '';
ALTER TABLE MetaAdsAd ADD COLUMN CreativeBody TEXT DEFAULT '';
ALTER TABLE MetaAdsAd ADD COLUMN CreativeCallToAction TEXT DEFAULT '';
ALTER TABLE MetaAdsAd ADD COLUMN CreativeLinkUrl TEXT DEFAULT '';
ALTER TABLE MetaAdsAd ADD COLUMN CreativeVariants TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_meta_ads_ad_date_adid ON MetaAdsAd(Date, AdId);
CREATE INDEX IF NOT EXISTS idx_meta_ads_ad_adid_date ON MetaAdsAd(AdId, Date);
