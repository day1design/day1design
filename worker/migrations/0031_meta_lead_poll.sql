-- 0031_meta_lead_poll.sql — Meta 리드 폴링 전환(Make 탈피) 준비
--  1) Estimates.MetaLeadId  : Meta leadId 기반 멱등키. 폴러가 48h 를 겹쳐 조회해도 중복 접수 0.
--     (기존 phone+timestamp Cache API 중복방지는 10분·콜로별이라 폴링에는 불충분)
--  2) SystemHeartbeats      : 외부 실행체(아이맥 폴러 등) 생존 신호. 헬스체크가 신선도로 판정.
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0031_meta_lead_poll.sql

ALTER TABLE Estimates ADD COLUMN MetaLeadId TEXT NOT NULL DEFAULT '';

-- 부분 유니크 인덱스: 빈 문자열(홈페이지 접수 등)은 제약 대상에서 제외
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_meta_lead_id
  ON Estimates (MetaLeadId) WHERE MetaLeadId <> '';

CREATE TABLE IF NOT EXISTS SystemHeartbeats (
  id TEXT PRIMARY KEY,
  Source TEXT NOT NULL DEFAULT '',      -- meta-lead-poller | ...
  At TEXT NOT NULL DEFAULT '',          -- ISO. 실행체가 보고한 시각이 아니라 수신 시각
  Status TEXT NOT NULL DEFAULT 'ok',    -- ok | fail
  Detail TEXT NOT NULL DEFAULT ''       -- forms=1 fetched=3 delivered=1 duplicates=2 ...
);
CREATE INDEX IF NOT EXISTS idx_system_heartbeats_source_at
  ON SystemHeartbeats (Source, At DESC);
