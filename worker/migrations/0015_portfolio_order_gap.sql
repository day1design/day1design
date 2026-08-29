-- Spread "Order" values with gap=1000 so future inserts/moves can fit between
-- siblings without shifting other rows. Sort result is unchanged.
-- Uses ROW_NUMBER() OVER existing Order to preserve current sequence.
UPDATE portfolio AS p
SET "Order" = (
  SELECT (rn) * 1000
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY "Order" ASC) AS rn
    FROM portfolio
  ) AS s
  WHERE s.id = p.id
);
