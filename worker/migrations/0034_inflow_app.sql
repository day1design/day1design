-- 유입 앱·랜딩 단서 보관 (2026-08-21)
--
-- 네이버·카카오·인스타 인앱 브라우저는 리퍼러를 지우고 보낸다. 그래서 접수 185건(60일) 중
-- 76%가 출처 단서 없이 들어왔고, 견적문의 착지 (direct) 57건은 93%가 모바일이었다.
-- 리퍼러는 없어도 User-Agent 에는 앱 이름이 남으므로 그것을 단서로 보관한다.
-- 앱이 아니면 아임웹 시절 게시판 링크 여부(legacy-link)를 같은 칸에 담는다 — 그 주소를
-- 사람이 외워서 입력할 리 없으니 외부에 남은 옛 링크를 타고 온 유입이라는 단서가 된다.
--
-- 값: naver-app · kakaotalk · instagram-app · facebook-app · legacy-link · '' (판정 불가)
-- 판정은 클라이언트(config.js)에서 하고 워커는 화이트리스트로 걸러 저장한다.

ALTER TABLE HeatmapEvents ADD COLUMN InflowApp TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FirstInflowApp TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_heatmap_inflow_app
  ON HeatmapEvents (InflowApp, CreatedAt);
