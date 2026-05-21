-- Meta Ads 데이터 확장 (2026-05-21)
-- 1) MetaAdsDaily 컬럼 추가: 영상 시청 메트릭 + 고유 클릭
-- 2) MetaAdsAd 신규: 광고(Ad) 단위 일별 인사이트 + 크리에이티브 메타
-- 3) MetaAdsBreakdown 신규: 5종 분해(플랫폼/위치/디바이스/연령성별/지역) + 시간대 한 테이블

-- 1) MetaAdsDaily 컬럼 확장
ALTER TABLE MetaAdsDaily ADD COLUMN VideoP25Watched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN VideoP50Watched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN VideoP75Watched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN VideoP100Watched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN VideoAvgWatchSec REAL NOT NULL DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN ThruPlay INTEGER NOT NULL DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN UniqueClicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN UniqueLinkClicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN CostPerLinkClick REAL NOT NULL DEFAULT 0;

-- 2) MetaAdsAd — 광고(Ad) 단위 일별 인사이트
CREATE TABLE IF NOT EXISTS MetaAdsAd (
  id              TEXT PRIMARY KEY,
  Date            TEXT NOT NULL DEFAULT '',
  AdId            TEXT NOT NULL DEFAULT '',
  AdName          TEXT NOT NULL DEFAULT '',
  AdsetId         TEXT NOT NULL DEFAULT '',
  AdsetName       TEXT NOT NULL DEFAULT '',
  CampaignId      TEXT NOT NULL DEFAULT '',
  CampaignName    TEXT NOT NULL DEFAULT '',
  CreativeId      TEXT NOT NULL DEFAULT '',
  CreativeType    TEXT NOT NULL DEFAULT '',   -- image/video/carousel (from /adcreatives)
  ThumbnailUrl    TEXT NOT NULL DEFAULT '',
  Status          TEXT NOT NULL DEFAULT '',
  Impressions     INTEGER NOT NULL DEFAULT 0,
  Clicks          INTEGER NOT NULL DEFAULT 0,
  LinkClicks      INTEGER NOT NULL DEFAULT 0,
  Spend           REAL NOT NULL DEFAULT 0,
  Ctr             REAL NOT NULL DEFAULT 0,
  Cpc             REAL NOT NULL DEFAULT 0,
  Reach           INTEGER NOT NULL DEFAULT 0,
  Leads           INTEGER NOT NULL DEFAULT 0,
  ThruPlay        INTEGER NOT NULL DEFAULT 0,
  VideoAvgWatchSec REAL NOT NULL DEFAULT 0,
  FetchedAt       TEXT NOT NULL DEFAULT '',
  CreatedAt       TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_ads_ad_dedupe
  ON MetaAdsAd(Date, AdId);
CREATE INDEX IF NOT EXISTS idx_meta_ads_ad_date ON MetaAdsAd(Date);
CREATE INDEX IF NOT EXISTS idx_meta_ads_ad_campaign ON MetaAdsAd(CampaignId, Date);

-- 3) MetaAdsBreakdown — 6종 분해 통합 (플랫폼/위치/디바이스/연령성별/지역/시간대)
CREATE TABLE IF NOT EXISTS MetaAdsBreakdown (
  id              TEXT PRIMARY KEY,
  Date            TEXT NOT NULL DEFAULT '',
  Dimension       TEXT NOT NULL DEFAULT '',   -- 'platform' | 'position' | 'device' | 'age_gender' | 'region' | 'hour' | 'dow'
  DimensionValue  TEXT NOT NULL DEFAULT '',   -- 예: 'instagram', 'feed', 'iphone', '25-34_female', 'Gyeonggi-do', '14', '3'(요일)
  DimensionSub    TEXT NOT NULL DEFAULT '',   -- 위치 분해의 경우 publisher (예: 'instagram') 보조 컬럼
  Impressions     INTEGER NOT NULL DEFAULT 0,
  Clicks          INTEGER NOT NULL DEFAULT 0,
  LinkClicks      INTEGER NOT NULL DEFAULT 0,
  Spend           REAL NOT NULL DEFAULT 0,
  Ctr             REAL NOT NULL DEFAULT 0,
  Cpc             REAL NOT NULL DEFAULT 0,
  Reach           INTEGER NOT NULL DEFAULT 0,
  Leads           INTEGER NOT NULL DEFAULT 0,
  FetchedAt       TEXT NOT NULL DEFAULT '',
  CreatedAt       TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_breakdown_dedupe
  ON MetaAdsBreakdown(Date, Dimension, DimensionValue, DimensionSub);
CREATE INDEX IF NOT EXISTS idx_meta_breakdown_date_dim
  ON MetaAdsBreakdown(Date, Dimension);
CREATE INDEX IF NOT EXISTS idx_meta_breakdown_dim_value
  ON MetaAdsBreakdown(Dimension, DimensionValue);
