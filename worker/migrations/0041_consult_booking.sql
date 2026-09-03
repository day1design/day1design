-- 상담 예약 정보. 접수(SubmittedAt)·연락(ContactedAt)과 별개로 "언제 어디서
-- 만나기로 했는가" 를 남긴다. Branch 는 고객이 접수 때 고른 희망 지점이라
-- 실제 상담 지점과 다를 수 있어 컬럼을 나눈다.
ALTER TABLE Estimates ADD COLUMN ConsultAt TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN ConsultBranch TEXT DEFAULT '';

-- 예약이 잡힌 건만 날짜순으로 훑는 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_estimates_consult_at
  ON Estimates(ConsultAt, Status);
