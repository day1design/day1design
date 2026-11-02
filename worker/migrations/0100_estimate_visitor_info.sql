-- 접수자 방문 정보를 고객카드(Estimates)에 남긴다. 접수 알림에 싣는 값과 같다.
-- VisitCount   : 최근 30일 방문 횟수(접수한 방문 포함). 자체 트래커 방문자 ID(_d1_hm_sid, 30일 보관) 기준, 30분 공백 = 다른 방문.
--                0 은 방문자 ID 가 없거나 조회하지 못한 경우다(옛 접수·Meta 입력양식 리드 포함).
-- IsRevisit    : 30일 안에 앞선 방문이 있었으면 1.
-- FirstVisitAt : 30일 안 첫 방문 시각(ISO).
-- DeviceInfo   : User-Agent 로 읽은 기기 요약(예: "iPhone 14 Pro · iOS 26.6 · 인스타그램 앱").
-- UserAgent    : 원문 User-Agent(500자까지). 기종 표를 고치면 원문으로 다시 판별할 수 있다.
-- IP 는 기존 IP 칸을 그대로 쓴다.
ALTER TABLE Estimates ADD COLUMN VisitCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Estimates ADD COLUMN IsRevisit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Estimates ADD COLUMN FirstVisitAt TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN DeviceInfo TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN UserAgent TEXT NOT NULL DEFAULT '';
