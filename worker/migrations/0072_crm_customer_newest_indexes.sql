CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_submitted_desc
  ON Estimates(CrmTenantId, (CASE WHEN COALESCE(SubmittedAt,'')='' THEN 1 ELSE 0 END), SubmittedAt DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_status_submitted_desc
  ON Estimates(CrmTenantId, Status, (CASE WHEN COALESCE(SubmittedAt,'')='' THEN 1 ELSE 0 END), SubmittedAt DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_source_submitted_desc
  ON Estimates(CrmTenantId, Source, (CASE WHEN COALESCE(SubmittedAt,'')='' THEN 1 ELSE 0 END), SubmittedAt DESC, id DESC);
