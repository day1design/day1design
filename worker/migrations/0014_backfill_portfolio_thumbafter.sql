-- Backfill ThumbAfter for portfolio records whose migration left it empty.
-- R2 files exist for indices 01~35; map = (Order + 1) zero-padded to 2 digits.
-- Records with Order >= 35 must be filled manually via admin (no legacy R2 file).
UPDATE portfolio
SET ThumbAfter = 'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/'
  || printf('%02d', "Order" + 1) || '_after.webp'
WHERE (ThumbAfter IS NULL OR ThumbAfter = '')
  AND "Order" >= 0
  AND "Order" <= 34;
