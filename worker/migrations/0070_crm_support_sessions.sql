CREATE TABLE IF NOT EXISTS CrmSupportSessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  actor_id TEXT NOT NULL REFERENCES CrmUsers(id),
  reason TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_support_sessions_active
  ON CrmSupportSessions(token_hash, revoked_at, expires_at);
