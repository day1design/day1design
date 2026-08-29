-- 1) ThumbAfter 백필(0014) 롤백: R2 portfolio-thumbs/01~35_after.webp만 비움
UPDATE portfolio SET ThumbAfter = '' WHERE ThumbAfter IN (
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/01_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/02_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/03_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/04_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/05_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/06_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/07_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/08_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/09_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/10_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/11_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/12_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/13_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/14_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/15_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/16_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/17_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/18_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/19_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/20_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/21_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/22_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/23_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/24_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/25_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/26_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/27_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/28_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/29_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/30_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/31_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/32_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/33_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/34_after.webp',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/35_after.webp'
);

-- 2) Order(0015) 롤백: 1000,2000,... → 0,1,2,...
UPDATE portfolio AS p
SET "Order" = (
  SELECT (rn - 1)
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY "Order" ASC) AS rn
    FROM portfolio
  ) AS s
  WHERE s.id = p.id
);
