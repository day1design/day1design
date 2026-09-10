CREATE TABLE IF NOT EXISTS WorkflowDeliveries (
  request_id TEXT PRIMARY KEY,
  revision TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'unknown')),
  markdown TEXT NOT NULL,
  markdown_hash TEXT NOT NULL,
  message_id INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_delivery_actor_created
  ON WorkflowDeliveries(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_delivery_created
  ON WorkflowDeliveries(created_at DESC);
