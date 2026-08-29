-- 빈 ThumbAfter/ThumbBefore에 정렬순 ROW_NUMBER 기준 R2 fallback URL을 박아
-- record에 사진을 고정. 이후 위치를 어떻게 옮겨도 사진은 record 따라감.
-- 1~35번 R2 파일까지만 (그 너머 record는 비워둠 — admin에서 직접 업로드 필요).

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "Order" ASC) AS rn FROM portfolio
)
UPDATE portfolio
SET ThumbAfter = (
  SELECT 'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/' || printf('%02d', ranked.rn) || '_after.webp'
  FROM ranked WHERE ranked.id = portfolio.id AND ranked.rn <= 35
)
WHERE (ThumbAfter IS NULL OR ThumbAfter = '')
  AND id IN (SELECT id FROM ranked WHERE rn <= 35);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "Order" ASC) AS rn FROM portfolio
)
UPDATE portfolio
SET ThumbBefore = (
  SELECT 'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/' || printf('%02d', ranked.rn) || '_before.webp'
  FROM ranked WHERE ranked.id = portfolio.id AND ranked.rn <= 35
)
WHERE (ThumbBefore IS NULL OR ThumbBefore = '')
  AND id IN (SELECT id FROM ranked WHERE rn <= 35);
