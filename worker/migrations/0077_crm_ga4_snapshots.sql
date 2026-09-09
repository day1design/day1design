CREATE TABLE IF NOT EXISTS CrmGa4AnalyticsSnapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_ga4_snapshot_binding
  ON CrmGa4AnalyticsSnapshots(tenant_id, source_kind, source_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_crm_ga4_snapshot_lookup
  ON CrmGa4AnalyticsSnapshots(tenant_id, source_kind, source_id, start_date, end_date, created_at DESC);
