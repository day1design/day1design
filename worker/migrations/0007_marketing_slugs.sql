-- 마케팅 슬러그 URL 생성기 (출처 추적)
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0007_marketing_slugs.sql
--      wrangler d1 execute day1design --local  --file=migrations/0007_marketing_slugs.sql

CREATE TABLE IF NOT EXISTS MarketingSlugs (
  Slug         TEXT PRIMARY KEY,
  SourceLabel  TEXT NOT NULL DEFAULT '',
  TargetUrl    TEXT NOT NULL DEFAULT '',
  UtmSource    TEXT NOT NULL DEFAULT '',
  UtmMedium    TEXT NOT NULL DEFAULT '',
  UtmCampaign  TEXT NOT NULL DEFAULT '',
  Active       INTEGER NOT NULL DEFAULT 1,
  Clicks       INTEGER NOT NULL DEFAULT 0,
  LastClickAt  TEXT NOT NULL DEFAULT '',
  CreatedAt    TEXT NOT NULL DEFAULT '',
  UpdatedAt    TEXT NOT NULL DEFAULT '',
  CreatedBy    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_marketing_slugs_active
  ON MarketingSlugs(Active, UpdatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_slugs_source
  ON MarketingSlugs(SourceLabel);
