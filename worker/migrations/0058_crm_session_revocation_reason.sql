ALTER TABLE CrmSessions ADD COLUMN revoked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_sessions_revocation_reason
  ON CrmSessions(revoked_reason, expires_at);
