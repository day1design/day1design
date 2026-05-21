-- Meta Marketing API 데이터 영속화 (2026-05-21)
-- 광고계정: act_986916453663066 (day1design_marketing)
-- 운영: cron 매일 KST 04:00 → 어제 데이터 fetch → D1 UPSERT
--       어드민은 D1 read-only (Meta API 직접 호출 금지)
--       초기 백필 범위: 2026-02-02 ~ 어제

-- 일별 인사이트 (account + campaign 레벨)
CREATE TABLE IF NOT EXISTS MetaAdsDaily (
  id              TEXT PRIMARY KEY,
  Date            TEXT NOT NULL DEFAULT '',     -- YYYY-MM-DD (광고계정 timezone Asia/Seoul)
  Level           TEXT NOT NULL DEFAULT '',     -- 'account' | 'campaign'
  EntityId        TEXT NOT NULL DEFAULT '',     -- act_xxx 또는 campaign_id
  EntityName      TEXT NOT NULL DEFAULT '',
  Status          TEXT NOT NULL DEFAULT '',     -- ACTIVE/PAUSED (campaign level only)
  Objective       TEXT NOT NULL DEFAULT '',     -- OUTCOME_TRAFFIC / OUTCOME_LEADS 등
  Impressions     INTEGER NOT NULL DEFAULT 0,
  Clicks          INTEGER NOT NULL DEFAULT 0,
  LinkClicks      INTEGER NOT NULL DEFAULT 0,
  Spend           REAL NOT NULL DEFAULT 0,
  Ctr             REAL NOT NULL DEFAULT 0,
  Cpc             REAL NOT NULL DEFAULT 0,
  Reach           INTEGER NOT NULL DEFAULT 0,
  Frequency       REAL NOT NULL DEFAULT 0,
  Leads           INTEGER NOT NULL DEFAULT 0,   -- offsite_complete_registration_add_meta_leads
  ActionsJson     TEXT NOT NULL DEFAULT '[]',   -- 모든 actions 원본 (전환 추적용)
  FetchedAt       TEXT NOT NULL DEFAULT '',
  CreatedAt       TEXT NOT NULL DEFAULT ''
);

-- 같은 날짜·엔티티는 UPSERT (REPLACE 패턴)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_ads_daily_dedupe
  ON MetaAdsDaily(Date, Level, EntityId);

CREATE INDEX IF NOT EXISTS idx_meta_ads_daily_date
  ON MetaAdsDaily(Date);

CREATE INDEX IF NOT EXISTS idx_meta_ads_daily_level_date
  ON MetaAdsDaily(Level, Date);

-- 동기화 이력 (rate-limit 모니터링·디버그)
CREATE TABLE IF NOT EXISTS MetaSyncLog (
  id              TEXT PRIMARY KEY,
  SyncType        TEXT NOT NULL DEFAULT '',     -- 'cron' | 'backfill'
  Status          TEXT NOT NULL DEFAULT '',     -- 'success' | 'failed' | 'rate_limited' | 'partial'
  DateRangeStart  TEXT NOT NULL DEFAULT '',
  DateRangeEnd    TEXT NOT NULL DEFAULT '',
  ApiCallsUsed    INTEGER NOT NULL DEFAULT 0,
  RecordsUpdated  INTEGER NOT NULL DEFAULT 0,
  ErrorCode       TEXT NOT NULL DEFAULT '',
  ErrorMessage    TEXT NOT NULL DEFAULT '',
  StartedAt       TEXT NOT NULL DEFAULT '',
  CompletedAt     TEXT NOT NULL DEFAULT '',
  CreatedAt       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_meta_sync_log_created
  ON MetaSyncLog(CreatedAt DESC);
