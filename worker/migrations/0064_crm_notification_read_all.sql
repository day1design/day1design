CREATE TABLE IF NOT EXISTS CrmNotificationReadAll (
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  user_id TEXT NOT NULL REFERENCES CrmUsers(id),
  last_read_notification_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_notification_read_all_user
  ON CrmNotificationReadAll(tenant_id, user_id);
