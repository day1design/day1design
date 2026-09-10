CREATE TABLE IF NOT EXISTS AdminMeetingOutbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  meeting_version INTEGER NOT NULL CHECK (meeting_version > 0),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('created','day','hour')),
  idempotency_key TEXT NOT NULL UNIQUE,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','reserved','sent','cancelled','blocked')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  reserved_at TEXT,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_meeting_outbox_due
  ON AdminMeetingOutbox(status, due_at, next_attempt_at, tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_admin_meeting_outbox_meeting
  ON AdminMeetingOutbox(tenant_id, meeting_id, meeting_version, status);
