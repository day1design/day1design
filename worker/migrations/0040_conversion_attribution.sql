ALTER TABLE pixel_events ADD COLUMN event_detail TEXT DEFAULT '';
ALTER TABLE pixel_events ADD COLUMN estimate_id TEXT DEFAULT '';

ALTER TABLE Estimates ADD COLUMN UtmSource TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN UtmMedium TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN UtmCampaign TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN MetaCampaign TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN MetaCampaignId TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN MetaAdset TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN MetaAdsetId TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN MetaAd TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN MetaAdId TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN Fbclid TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN Fbp TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN Fbc TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_pixel_events_estimate ON pixel_events(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimates_meta_ad ON Estimates(MetaAdId, SubmittedAt);
CREATE INDEX IF NOT EXISTS idx_estimates_status_amount ON Estimates(Status, EstimateAmount, SubmittedAt);
