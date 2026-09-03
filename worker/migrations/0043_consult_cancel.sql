-- 상담 예약 취소. 취소해도 예약 일시(ConsultAt)를 지우지 않는다 —
-- 지우면 캘린더에서 카드가 통째로 사라져 "언제 잡았다가 취소했는지"가 남지 않는다.
-- 값이 있으면 취소된 예약이고, 값 자체가 취소 시각이다.
ALTER TABLE Estimates ADD COLUMN ConsultCancelledAt TEXT DEFAULT '';
