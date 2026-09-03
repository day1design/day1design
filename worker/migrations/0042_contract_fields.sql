-- 계약 확정 정보. 견적 금액(EstimateAmount)은 제안 단계의 숫자라 계약 금액과
-- 다를 수 있어 컬럼을 나눈다. 집계는 계약 금액을 우선하고 없으면 견적 금액으로
-- 물러난다 — 이 컬럼이 생기기 전 계약건은 견적 금액에만 값이 있다.
ALTER TABLE Estimates ADD COLUMN ContractAt TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN ContractOwner TEXT DEFAULT '';
ALTER TABLE Estimates ADD COLUMN ContractAmount INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_estimates_contract_at
  ON Estimates(ContractAt);
