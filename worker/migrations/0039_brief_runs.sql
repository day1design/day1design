-- 브리프 실행 이력 — 무엇을 근거로 그렇게 판단했는지 남긴다.
--
-- 분석 결과는 지금 텔레그램 방에만 남는다. 그러면 두 가지를 못 한다.
--   1) "그때 무슨 숫자를 보고 그렇게 말했나" 를 되짚을 수 없다. 광고 데이터는 계속
--      갱신되므로 나중에 같은 기간을 다시 조회해도 그때 본 값이 아니다.
--   2) "지난번보다 나아졌나" 를 봇이 스스로 비교할 수 없다.
--
-- 그래서 실행마다 스냅샷과 보고를 R2 에 원문으로 두고, 검색·정렬에 필요한 것만 D1 에
-- 남긴다. 접수 안전망(estimates-attempts)이 쓰는 방식과 같다 — 큰 것은 R2, 색인은 D1.

CREATE TABLE IF NOT EXISTS BriefRuns (
  id TEXT PRIMARY KEY,
  RequestedAt TEXT NOT NULL,
  Question TEXT DEFAULT '',
  PeriodLabel TEXT DEFAULT '',
  StartDate TEXT DEFAULT '',
  EndDate TEXT DEFAULT '',
  Spend REAL DEFAULT 0,
  Leads INTEGER DEFAULT 0,
  MetaLeads INTEGER DEFAULT 0,
  MetaCostPerLead REAL DEFAULT 0,
  HookRateAvg REAL DEFAULT 0,
  Bottleneck TEXT DEFAULT '',
  Verdict TEXT DEFAULT '',
  SnapshotKey TEXT DEFAULT '',
  ReportKey TEXT DEFAULT '',
  DurationSec INTEGER DEFAULT 0,
  Stages TEXT DEFAULT '',
  Status TEXT DEFAULT '',
  CreatedAt TEXT DEFAULT ''
);

-- 목록은 최신순으로만 넘긴다. 페이지네이션이 이 인덱스를 탄다
CREATE INDEX IF NOT EXISTS idx_briefruns_requested ON BriefRuns (RequestedAt DESC);
CREATE INDEX IF NOT EXISTS idx_briefruns_period ON BriefRuns (StartDate, EndDate);
