-- 히트맵 /pages 집계 가속용 커버링 인덱스
-- 문제: listPages 가 `WHERE IsBot=0 GROUP BY Page` + `COUNT(DISTINCT SessionId)` 로
--   매 로드 HeatmapEvents(약 6.5만행) 전체를 스캔(실측 254ms / rows_read 128,200).
--   데이터 증가에 선형 악화 → 히트맵 메뉴 체감 지연의 주원인.
-- 해결: (IsBot, Page, SessionId, Device, EventType, CreatedAt) 커버링 인덱스.
--   · IsBot 필터(leftmost) → Page 그룹이 인덱스 순서로 인접(GROUP BY 임시정렬 불필요)
--   · Page 내 SessionId 정렬 → COUNT(DISTINCT SessionId) 인접 dedup(해시 불필요)
--   · 집계에 쓰는 Device/EventType/CreatedAt 모두 인덱스에 포함 → 인덱스만으로 처리(테이블 미접근)
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0029_heatmap_pages_index.sql
--      wrangler d1 execute day1design --local  --file=migrations/0029_heatmap_pages_index.sql

CREATE INDEX IF NOT EXISTS idx_heatmap_pages_agg
  ON HeatmapEvents(IsBot, Page, SessionId, Device, EventType, CreatedAt);
