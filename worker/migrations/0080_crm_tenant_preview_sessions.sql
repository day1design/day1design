CREATE TABLE IF NOT EXISTS CrmTenantPreviewSessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  parent_session_id TEXT NOT NULL REFERENCES CrmSessions(id),
  parent_actor_id TEXT NOT NULL REFERENCES CrmUsers(id),
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  target_user_id TEXT NOT NULL REFERENCES CrmUsers(id),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_tenant_preview_active
  ON CrmTenantPreviewSessions(token_hash, revoked_at, expires_at);
