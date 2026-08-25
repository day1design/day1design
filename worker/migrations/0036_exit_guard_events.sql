-- 이탈 방지 팝업이 실제로 방문을 붙잡았는지 영속 기록
--
-- 팝업이 뜬 뒤 방문자가 어떻게 됐는지를 남긴다. 브라우저 저장소는 방문자가
-- 지우면 사라지고 집계도 불가능하므로 D1 에 남긴다.
--
-- EventType
--   shown      팝업 노출
--   submit     이름·연락처를 넣고 견적 폼으로 넘어감
--   form_view  견적 폼에 실제로 도착함
--   stayed     팝업을 닫고 사이트에 계속 머묾 (= 이탈을 막은 것)
--   dismissed  "다음에 볼게요" 로 나감
--   escaped    팝업이 뜬 상태에서 뒤로가기로 나감
--
-- SessionId 는 자체 트래커(_d1_hm_sid)와 같은 값이라, HeatmapEvents·
-- AnalyticsSessions 와 조인하면 "붙잡은 뒤 몇 페이지를 더 봤는지" 를 서버에서
-- 직접 계산할 수 있다. 그래서 프런트는 결과만 보내고 페이지 수는 세지 않는다.
CREATE TABLE IF NOT EXISTS ExitGuardEvents (
  id         TEXT PRIMARY KEY,
  SessionId  TEXT NOT NULL DEFAULT '',
  EventType  TEXT NOT NULL DEFAULT '',
  Page       TEXT NOT NULL DEFAULT '',
  Device     TEXT NOT NULL DEFAULT '',
  ShownSeq   INTEGER NOT NULL DEFAULT 0,  -- 이번 방문에서 몇 번째 노출인가
  HeldMs     INTEGER NOT NULL DEFAULT 0,  -- 노출부터 이 결과까지 걸린 시간
  Referrer   TEXT NOT NULL DEFAULT '',
  RefPath    TEXT NOT NULL DEFAULT '',
  UtmSource  TEXT NOT NULL DEFAULT '',
  UtmMedium  TEXT NOT NULL DEFAULT '',
  UtmCampaign TEXT NOT NULL DEFAULT '',
  InflowApp  TEXT NOT NULL DEFAULT '',
  IP         TEXT NOT NULL DEFAULT '',
  Country    TEXT NOT NULL DEFAULT '',
  Region     TEXT NOT NULL DEFAULT '',
  City       TEXT NOT NULL DEFAULT '',
  IsBot      INTEGER NOT NULL DEFAULT 0,
  CreatedAt  TEXT NOT NULL DEFAULT '',
  DayKey     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_exitguard_day ON ExitGuardEvents (DayKey, EventType);
CREATE INDEX IF NOT EXISTS idx_exitguard_session ON ExitGuardEvents (SessionId, CreatedAt);
CREATE INDEX IF NOT EXISTS idx_exitguard_created ON ExitGuardEvents (CreatedAt);
