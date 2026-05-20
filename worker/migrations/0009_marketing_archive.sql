-- 마케팅 슬러그 영속화: 삭제해도 통계/내역 보존
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0009_marketing_archive.sql

-- 슬러그 soft-delete: DELETE 대신 DeletedAt 마킹 → 메타 정보(SourceLabel, TargetUrl, UTM, 누적 Clicks) 영구 보존
ALTER TABLE MarketingSlugs ADD COLUMN DeletedAt TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_marketing_slugs_deleted
  ON MarketingSlugs(DeletedAt);

-- 일일 클릭 집계 (Date + Slug 복합 PK)
-- 슬러그가 soft-delete 되어도 이 행은 그대로 남아 일별 트렌드 보존.
CREATE TABLE IF NOT EXISTS MarketingSlugDaily (
  Date         TEXT NOT NULL,           -- YYYY-MM-DD (KST 기준 일자)
  Slug         TEXT NOT NULL,
  SourceLabel  TEXT NOT NULL DEFAULT '', -- 클릭 시점 스냅샷 (슬러그 수정/삭제 후에도 어떤 라벨이었는지 알 수 있게)
  Clicks       INTEGER NOT NULL DEFAULT 0,
  LastClickAt  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (Date, Slug)
);

CREATE INDEX IF NOT EXISTS idx_marketing_slug_daily_slug_date
  ON MarketingSlugDaily(Slug, Date DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_slug_daily_date
  ON MarketingSlugDaily(Date DESC);
