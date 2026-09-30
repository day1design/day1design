-- KPI 저장 집계가 어느 분류 규칙 버전까지 반영했는지 기억한다.
-- 예산 해석 규칙(worker/src/lib/estimate-budget.js BUDGET_RULE_VERSION)이 오르면
-- KPI 배치가 옛 규칙으로 분류한 접수를 스스로 다시 분류하고(그 날의 예산 구간 수만
-- 옮기며 KPI 화면은 가리지 않는다) 다 끝나면 여기 버전을 갱신한다.
-- 사람이 규칙을 바꿀 때마다 재집계를 따로 돌리지 않아도 된다.
CREATE TABLE IF NOT EXISTS AdminKpiRuleVersions (
  tenant_id TEXT NOT NULL,
  rule TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, rule)
);
