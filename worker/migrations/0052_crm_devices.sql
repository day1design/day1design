CREATE TABLE CrmDevices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  user_id TEXT NOT NULL REFERENCES CrmUsers(id),
  session_id TEXT NOT NULL REFERENCES CrmSessions(id),
  push_token TEXT NOT NULL UNIQUE,
  notifications_enabled INTEGER NOT NULL CHECK(notifications_enabled IN (0,1)),
  preview_mode TEXT NOT NULL DEFAULT 'generic' CHECK(preview_mode IN ('generic','details')),
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_crm_devices_user ON CrmDevices(tenant_id,user_id,id);
CREATE INDEX idx_crm_devices_session ON CrmDevices(session_id);
CREATE TRIGGER trg_crm_devices_logout AFTER UPDATE OF revoked_at ON CrmSessions
WHEN NEW.revoked_at IS NOT NULL
BEGIN DELETE FROM CrmDevices WHERE session_id=NEW.id; END;
CREATE TRIGGER trg_crm_devices_inactive AFTER UPDATE OF active ON CrmUsers
WHEN NEW.active=0
BEGIN DELETE FROM CrmDevices WHERE tenant_id=NEW.tenant_id AND user_id=NEW.id; END;
CREATE TRIGGER trg_crm_devices_suspended AFTER UPDATE OF suspended ON CrmTenants
WHEN NEW.suspended=1
BEGIN DELETE FROM CrmDevices WHERE tenant_id=NEW.id; END;
