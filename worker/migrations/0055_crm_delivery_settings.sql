CREATE TABLE IF NOT EXISTS CrmTenantDeliverySettings (
  tenant_id TEXT PRIMARY KEY REFERENCES CrmTenants(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  activation_at TEXT,
  channel TEXT NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'alimtalk')),
  credentials_ciphertext TEXT NOT NULL DEFAULT '',
  sms_service_id TEXT NOT NULL DEFAULT '',
  from_number TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  alimtalk_service_id TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL DEFAULT '',
  visit_template_code TEXT NOT NULL DEFAULT '',
  measurement_template_code TEXT NOT NULL DEFAULT '',
  visit_body TEXT NOT NULL DEFAULT '',
  measurement_body TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_tenant_delivery_enabled
  ON CrmTenantDeliverySettings(enabled, tenant_id);
