-- KPI 저장 집계가 어느 분류 규칙 버전까지 반영했는지 기억한다.
-- 예산 해석 규칙(worker/src/lib/estimate-budget.js BUDGET_RULE_VERSION)이 오르면
-- KPI 배치가 옛 규칙으로 센 날짜를 스스로 재집계 대상으로 올리고 여기 버전을 갱신한다.
-- 사람이 규칙을 바꿀 때마다 재집계를 따로 돌리지 않아도 된다.
CREATE TABLE IF NOT EXISTS AdminKpiRuleVersions (
  tenant_id TEXT NOT NULL,
  rule TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, rule)
);
