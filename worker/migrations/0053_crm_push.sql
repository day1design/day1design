CREATE TABLE IF NOT EXISTS CrmPushCursors (
  tenant_id TEXT PRIMARY KEY REFERENCES CrmTenants(id),
  baseline_created_at TEXT NOT NULL,
  baseline_notification_id TEXT NOT NULL,
  baseline_recipient_id TEXT NOT NULL,
  cursor_created_at TEXT NOT NULL,
  cursor_notification_id TEXT NOT NULL,
  cursor_recipient_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS CrmPushReceipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  notification_id TEXT NOT NULL REFERENCES CrmNotifications(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES CrmUsers(id),
  device_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('sending', 'accepted', 'failed', 'unknown')),
  provider_message_name TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (notification_id, recipient_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_push_receipts_tenant_created
  ON CrmPushReceipts(tenant_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_crm_push_candidates_cursor
  ON CrmNotificationRecipients(tenant_id, created_at, notification_id, recipient_id);
