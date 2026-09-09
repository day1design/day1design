CREATE TABLE IF NOT EXISTS CrmAnalyticsCache (
  cache_key TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  object_key TEXT,
  payload_json TEXT,
  expires_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_analytics_cache_tenant_expiry
  ON CrmAnalyticsCache(tenant_id, expires_at);
