-- 관리자 유입통계 영속 스냅샷
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0002_analytics_snapshots.sql

CREATE TABLE IF NOT EXISTS AnalyticsSnapshots (
  id          TEXT PRIMARY KEY,
  RangeKey    TEXT NOT NULL DEFAULT '',
  StartDate   TEXT NOT NULL DEFAULT '',
  EndDate     TEXT NOT NULL DEFAULT '',
  Source      TEXT NOT NULL DEFAULT '',
  Payload     TEXT NOT NULL DEFAULT '{}',
  RawR2Key    TEXT NOT NULL DEFAULT '',
  CreatedAt   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_range
  ON AnalyticsSnapshots(RangeKey, StartDate, EndDate, Source, CreatedAt DESC);
