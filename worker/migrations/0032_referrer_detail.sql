-- 0032_referrer_detail.sql — 유입 꼬리표(referrer)의 "뒷부분" 보존
--  배경: tracker.js·heatmap.js 가 이중으로 hostname 만 남기고 path/query 를 버려서
--        "네이버 블로그 중 어느 글인지 / 통합검색에서 어떤 검색어였는지" 가 원천 소실.
--  설계: 기존 Referrer(호스트) 컬럼은 **건드리지 않는다**. 유입통계 GROUP BY·봇필터
--        (isSpoofedSearch/SEARCH_REF_RE)가 전부 "Referrer = 호스트" 전제라 값을 URL 로
--        바꾸면 집계가 호스트별이 아닌 URL별로 쪼개져 회귀한다. 새 컬럼으로 분리 저장.
--  1) HeatmapEvents.RefPath  : 유입 꼬리표의 path + query (호스트 제외, 200자 상한)
--  2) Estimates.FirstRefPath : 접수건의 첫 진입 시점 RefPath 스냅샷
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0032_referrer_detail.sql

ALTER TABLE HeatmapEvents ADD COLUMN RefPath TEXT NOT NULL DEFAULT '';

ALTER TABLE Estimates ADD COLUMN FirstRefPath TEXT NOT NULL DEFAULT '';
