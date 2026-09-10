-- Bounded, resumable preparation of only KPI metrics absent from existing stores.
CREATE TABLE IF NOT EXISTS AdminKpiJobs (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, kind TEXT NOT NULL,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, cursor TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, retries INTEGER NOT NULL DEFAULT 0,
 lease_until TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0,
 payload_json TEXT NOT NULL DEFAULT '{}', error_code TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_jobs_due ON AdminKpiJobs(tenant_id,status,updated_at,id);
CREATE TABLE IF NOT EXISTS AdminKpiNormalized (
 tenant_id TEXT NOT NULL, estimate_id TEXT NOT NULL, submitted_day TEXT NOT NULL DEFAULT '',
 meeting_day TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}',
 budget_raw TEXT NOT NULL DEFAULT '', budget_band INTEGER NOT NULL DEFAULT 6,
 budget_reason TEXT NOT NULL DEFAULT 'missing', classification_version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT '', PRIMARY KEY(tenant_id,estimate_id)
);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_normalized_day ON AdminKpiNormalized(tenant_id,submitted_day,estimate_id);
CREATE TABLE IF NOT EXISTS AdminKpiBatchBudget (
 tenant_id TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,day)
);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_estimate_intake ON Estimates(CrmTenantId,SubmittedAt,id);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_estimate_meeting ON Estimates(CrmTenantId,ConsultAt,id);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_contract_event ON EstimateContractHistory(saved_at,id);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_contract_first ON EstimateContractHistory(estimate_id,stage,saved_at,id);

CREATE INDEX IF NOT EXISTS idx_admin_kpi_jobs_page ON AdminKpiJobs(tenant_id,updated_at,id);

CREATE INDEX IF NOT EXISTS idx_admin_kpi_jobs_id ON AdminKpiJobs(tenant_id,id);
CREATE TABLE IF NOT EXISTS AdminKpiBatchLease (
 tenant_id TEXT PRIMARY KEY, owner TEXT NOT NULL, lease_until TEXT NOT NULL
);
-- Persist tenant ownership on the existing immutable history for indexed batch reads.
ALTER TABLE EstimateContractHistory ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '';
UPDATE EstimateContractHistory SET tenant_id=COALESCE((SELECT CrmTenantId FROM Estimates WHERE Estimates.id=EstimateContractHistory.estimate_id),'');
CREATE INDEX IF NOT EXISTS idx_admin_kpi_history_tenant_day ON EstimateContractHistory(tenant_id,saved_at,id);
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_history_tenant_insert AFTER INSERT ON EstimateContractHistory
BEGIN
 UPDATE EstimateContractHistory SET tenant_id=COALESCE((SELECT CrmTenantId FROM Estimates WHERE id=NEW.estimate_id),'') WHERE id=NEW.id;
END;
