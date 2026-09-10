CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_channel_submitted_desc
  ON Estimates(
    CrmTenantId,
    (CASE WHEN COALESCE(NULLIF(TRIM(MetaLeadId),''),'')<>'' OR lower(TRIM(COALESCE(Source,'')))='meta' THEN 'meta' ELSE 'homepage' END),
    (CASE WHEN COALESCE(SubmittedAt,'')='' THEN 1 ELSE 0 END),
    SubmittedAt DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_status_channel_submitted_desc
  ON Estimates(
    CrmTenantId,
    Status,
    (CASE WHEN COALESCE(NULLIF(TRIM(MetaLeadId),''),'')<>'' OR lower(TRIM(COALESCE(Source,'')))='meta' THEN 'meta' ELSE 'homepage' END),
    (CASE WHEN COALESCE(SubmittedAt,'')='' THEN 1 ELSE 0 END),
    SubmittedAt DESC,
    id DESC
  );
