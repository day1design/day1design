-- 0027_health_intake.sql — 시스템 상태(헬스 점검) + 실시간 작동로그(접수 이벤트)
-- HealthChecks: 매일/수동 5기능 진단 1행
-- IntakeEvents: 접수 1건당 작동 단계(D1·LMS·알림·메일·CAPI) 결과 1행
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0027_health_intake.sql

CREATE TABLE IF NOT EXISTS HealthChecks (
  id TEXT PRIMARY KEY,
  CheckedAt TEXT NOT NULL DEFAULT '',
  Overall TEXT NOT NULL DEFAULT 'ok',   -- ok | warn | fail
  Results TEXT NOT NULL DEFAULT '[]',   -- [{key,label,status,metric,log}]
  TriggeredBy TEXT NOT NULL DEFAULT 'cron'
);
CREATE INDEX IF NOT EXISTS idx_healthchecks_at ON HealthChecks (CheckedAt DESC);

CREATE TABLE IF NOT EXISTS IntakeEvents (
  id TEXT PRIMARY KEY,
  At TEXT NOT NULL DEFAULT '',
  Channel TEXT NOT NULL DEFAULT '',     -- homepage | instagram | facebook
  Source TEXT NOT NULL DEFAULT '',      -- homepage | meta
  Branch TEXT NOT NULL DEFAULT '',      -- 강남점 | 판교점 | 지점 무관 | ''
  RefName TEXT NOT NULL DEFAULT '',     -- 마스킹 (임○○)
  RefPhone TEXT NOT NULL DEFAULT '',    -- 마스킹 (010-****-1234)
  Geo TEXT NOT NULL DEFAULT '',
  EstimateId TEXT NOT NULL DEFAULT '',
  Steps TEXT NOT NULL DEFAULT '{}',     -- {d1,lms,telegram,email,capi,...: ok|skip|fail}
  Overall TEXT NOT NULL DEFAULT 'ok',   -- ok | warn | fail
  IP TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_intakeevents_at ON IntakeEvents (At DESC);
CREATE INDEX IF NOT EXISTS idx_intakeevents_overall ON IntakeEvents (Overall, At DESC);
