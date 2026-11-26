-- 네이버 검색광고 일별 통계 영속화 (2026-11-26)
-- 원천: 네이버 검색광고 API (CUSTOMER_ID 2799816) /ncc/campaigns · /ncc/adgroups · /stats
-- 수집: worker cron "0 * * * *" 중 KST 09시 회차 → 최근 3일(어제 포함)을 다시 받아 바뀐 행만 갱신
--       나머지 회차는 과거분을 7일씩 거슬러 채운다(API 조회 한계 730일)
-- 어드민·리포트는 이 테이블만 읽는다(검색광고 API 직접 호출 금지)

-- 캠페인·광고그룹 이름표 (매일 회차에 API 목록으로 갱신)
CREATE TABLE IF NOT EXISTS NaverSaEntities (
  EntityId    TEXT PRIMARY KEY,            -- nccCampaignId / nccAdgroupId
  Level       TEXT NOT NULL,               -- 'campaign' | 'adgroup'
  CampaignId  TEXT NOT NULL DEFAULT '',    -- 광고그룹이면 소속 캠페인, 캠페인이면 자기 자신
  Name        TEXT NOT NULL DEFAULT '',
  Type        TEXT NOT NULL DEFAULT '',    -- campaignTp(WEB_SITE·POWER_CONTENTS·PLACE) / adgroupType
  Locked      INTEGER NOT NULL DEFAULT 0,  -- userLock (1 = 사용자가 끔)
  DailyBudget REAL NOT NULL DEFAULT 0,
  UpdatedAt   TEXT NOT NULL DEFAULT ''
);

-- 일별 성과 (실적이 있는 날·엔티티만 행이 생긴다. 행이 없으면 0)
CREATE TABLE IF NOT EXISTS NaverSaDaily (
  Date        TEXT NOT NULL,               -- YYYY-MM-DD (KST)
  EntityId    TEXT NOT NULL,
  Level       TEXT NOT NULL,               -- 'campaign' | 'adgroup'
  CampaignId  TEXT NOT NULL DEFAULT '',
  Impressions INTEGER NOT NULL DEFAULT 0,  -- impCnt
  Clicks      INTEGER NOT NULL DEFAULT 0,  -- clkCnt
  Cost        REAL NOT NULL DEFAULT 0,     -- salesAmt(총비용) 원본 그대로
  Conversions REAL NOT NULL DEFAULT 0,     -- ccnt(전환수)
  ConvAmount  REAL NOT NULL DEFAULT 0,     -- convAmt(전환매출액)
  AvgRank     REAL NOT NULL DEFAULT 0,     -- avgRnk(평균노출순위)
  FetchedAt   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (Date, EntityId)
);

-- 기간 조회(레벨별·캠페인별)용
CREATE INDEX IF NOT EXISTS idx_naver_sa_daily_level_date ON NaverSaDaily (Level, Date);
CREATE INDEX IF NOT EXISTS idx_naver_sa_daily_campaign_date ON NaverSaDaily (CampaignId, Date);

-- 수집 진행 상태 (백필 커서·완료 표시)
CREATE TABLE IF NOT EXISTS NaverSaSyncState (
  Key       TEXT PRIMARY KEY,
  Value     TEXT NOT NULL DEFAULT '',
  UpdatedAt TEXT NOT NULL DEFAULT ''
);
