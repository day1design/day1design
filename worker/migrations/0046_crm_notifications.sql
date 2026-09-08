CREATE TABLE IF NOT EXISTS CrmNotifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  type TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES CrmUsers(id),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_notifications_tenant_created
  ON CrmNotifications(tenant_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS CrmNotificationRecipients (
  notification_id TEXT NOT NULL REFERENCES CrmNotifications(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  recipient_id TEXT NOT NULL REFERENCES CrmUsers(id),
  created_at TEXT NOT NULL,
  read_at TEXT,
  PRIMARY KEY (notification_id, recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_notification_recipients_inbox
  ON CrmNotificationRecipients(tenant_id, recipient_id, created_at DESC, notification_id DESC);

CREATE TABLE IF NOT EXISTS CrmNotificationInbox (
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  user_id TEXT NOT NULL REFERENCES CrmUsers(id),
  last_read_notification_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS CrmNotificationTemplates (
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  kind TEXT NOT NULL CHECK (kind IN ('visit', 'measurement')),
  state TEXT NOT NULL CHECK (state IN ('draft', 'approved')),
  body TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES CrmUsers(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, kind, state)
);
CREATE INDEX IF NOT EXISTS idx_crm_notification_templates_tenant
  ON CrmNotificationTemplates(tenant_id, kind, state);

CREATE TABLE IF NOT EXISTS CrmNotificationOutbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  appointment_id TEXT NOT NULL,
  appointment_version INTEGER NOT NULL CHECK (appointment_version > 0),
  notification_type TEXT NOT NULL,
  recipient_id TEXT NOT NULL DEFAULT 'customer',
  channel TEXT NOT NULL DEFAULT 'customer',
  idempotency_key TEXT NOT NULL UNIQUE,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'reserved', 'cancelled', 'sent')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  reserved_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_crm_notification_outbox_due
  ON CrmNotificationOutbox(status, due_at, tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_crm_notification_outbox_appointment
  ON CrmNotificationOutbox(tenant_id, appointment_id, appointment_version, status);

CREATE TABLE IF NOT EXISTS CrmDailyBriefings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  recipient_id TEXT NOT NULL REFERENCES CrmUsers(id),
  briefing_date TEXT NOT NULL,
  notification_id TEXT REFERENCES CrmNotifications(id),
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, recipient_id, briefing_date)
);
CREATE INDEX IF NOT EXISTS idx_crm_daily_briefings_tenant_date
  ON CrmDailyBriefings(tenant_id, briefing_date, recipient_id);
