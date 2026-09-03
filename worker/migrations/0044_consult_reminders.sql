-- 상담 리마인드 발송 기록. 값이 있으면 이미 보낸 것이고, 그 값이 발송 시각이다.
-- 컬럼으로 남겨야 cron 이 몇 번을 돌아도 같은 예약에 두 번 보내지 않는다.
-- 예약을 옮기면 워커가 이 두 칸을 비워 새 일정 기준으로 다시 보낸다.
ALTER TABLE Estimates ADD COLUMN ConsultRemind1dAt TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN ConsultRemind2hAt TEXT DEFAULT '';
