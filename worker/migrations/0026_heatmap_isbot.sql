-- 히트맵 봇 트래픽 태깅 (유입통계 오염 차단)
-- 배경: 2026-06-24 referrer=www.google.com 을 위조한 해외 헤드리스 봇이
--   1시간(01시 KST)에 ~557건(전부 해외 IP·PC·단일 community-detail·클릭0)으로
--   몰려 "구글 유입 559" 오보 발생. 검색/일반 봇에서 벗어난 위장 봇만 차단.
-- 방식: 비파괴 태깅(IsBot). 집계는 IsBot=0 만 사용, 봇 행은 보존(포렌식·복원).
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0026_heatmap_isbot.sql

ALTER TABLE HeatmapEvents ADD COLUMN IsBot INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_heatmap_isbot_created
  ON HeatmapEvents(IsBot, CreatedAt);
