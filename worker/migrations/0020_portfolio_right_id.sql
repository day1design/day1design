-- 포트폴리오 참조 키를 folder 슬러그(가변·중복 가능) → 영구 record id 로 전환
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0020_portfolio_right_id.sql

-- 1) RightId 칼럼 추가
ALTER TABLE Portfolio ADD COLUMN RightId TEXT NOT NULL DEFAULT '';

-- 2) 기존 RightFolder 값을 RightId 로 백필
--    같은 Folder 슬러그를 가진 다른 record 중 첫 번째 id 로 매칭.
--    매칭 실패 시 빈 문자열 유지 (= 참조 해제). 이후 어드민에서 재설정.
--    own Images 가 있는 record 는 백필 제외 — 라이브에서 own 이 우선이므로
--    stale rightFolder 가 우연히 다른 record 와 매칭되어도 사용자 의도에 따라
--    own 이 그대로 보임. (사고 사례: recAyOhKIjEx6tckb own 30장 + 잔존
--    rightFolder → 백필 시 다른 89장 record 가리키게 되는 노출 변화 차단)
UPDATE Portfolio
SET RightId = COALESCE((
  SELECT P2.id FROM Portfolio P2
  WHERE P2.Folder = Portfolio.RightFolder
    AND P2.id != Portfolio.id
  LIMIT 1
), '')
WHERE RightFolder != ''
  AND (Images = '[]' OR Images = '' OR Images IS NULL);

CREATE INDEX IF NOT EXISTS idx_portfolio_right_id ON Portfolio(RightId);
