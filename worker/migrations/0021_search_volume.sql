-- 0021: 네이버 검색광고 키워드도구 월별 실조회수 (search_volume)
-- 키워드도구 모달 "월별 검색수 추이"의 정확한 달력월 PC/모바일 실측치를 누적.
-- 수집: 맥미니 launchd 월1회(매월2일) collector.js → Worker POST /api/admin/search-volume
-- 대상 키워드: 데이원디자인 / day1design (BAS와 동일 구조, 키워드만 다름)

CREATE TABLE IF NOT EXISTS search_volume (
  keyword       TEXT NOT NULL,                  -- 검색 키워드
  month         TEXT NOT NULL,                  -- 'YYYY-MM' (달력월)
  pc            INTEGER NOT NULL DEFAULT 0,      -- PC 월간검색수
  mobile        INTEGER NOT NULL DEFAULT 0,      -- 모바일 월간검색수
  total         INTEGER NOT NULL DEFAULT 0,      -- pc + mobile
  source        TEXT DEFAULT 'searchad_kwtool',
  collected_at  TEXT,                            -- ISO 수집 시각
  PRIMARY KEY (keyword, month)
);

CREATE INDEX IF NOT EXISTS idx_search_volume_kw ON search_volume(keyword, month);

-- ── 백필 시드 (collector 검증분, 2026-05 확정값) ──
INSERT OR IGNORE INTO search_volume (keyword, month, pc, mobile, total, collected_at) VALUES
('데이원디자인','2026-05', 200, 270, 470, '2026-06-02T00:00:00Z'),
('day1design','2026-05',     0,   0,   0, '2026-06-02T00:00:00Z');
