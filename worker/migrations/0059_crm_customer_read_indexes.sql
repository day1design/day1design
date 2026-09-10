CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_status_id
  ON Estimates(CrmTenantId, Status, id);

CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_source_id
  ON Estimates(CrmTenantId, Source, id);

CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_status_source_id
  ON Estimates(CrmTenantId, Status, Source, id);
