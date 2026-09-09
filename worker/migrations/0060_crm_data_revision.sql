CREATE TABLE IF NOT EXISTS CrmDataRevisions (
  tenant_id TEXT PRIMARY KEY REFERENCES CrmTenants(id),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO CrmDataRevisions(tenant_id,version,updated_at)
SELECT id,0,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM CrmTenants;

CREATE INDEX IF NOT EXISTS idx_crm_data_revisions_updated
  ON CrmDataRevisions(updated_at,tenant_id);

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_tenant_insert
AFTER INSERT ON CrmTenants
BEGIN
  INSERT OR IGNORE INTO CrmDataRevisions(tenant_id,version,updated_at)
  VALUES(NEW.id,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_estimates_insert
AFTER INSERT ON Estimates
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_estimates_update
AFTER UPDATE ON Estimates
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) SELECT OLD.CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE OLD.CrmTenantId IS NOT NEW.CrmTenantId
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_estimates_delete
AFTER DELETE ON Estimates
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(OLD.CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_appointments_insert
AFTER INSERT ON CrmAppointments
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_appointments_update
AFTER UPDATE ON CrmAppointments
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) SELECT OLD.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE OLD.tenant_id IS NOT NEW.tenant_id
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_appointments_delete
AFTER DELETE ON CrmAppointments
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(OLD.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_consultations_insert
AFTER INSERT ON CrmConsultations
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_consultations_update
AFTER UPDATE ON CrmConsultations
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) SELECT OLD.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE OLD.tenant_id IS NOT NEW.tenant_id
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_consultations_delete
AFTER DELETE ON CrmConsultations
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(OLD.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_contracts_insert
AFTER INSERT ON CrmContracts
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_contracts_update
AFTER UPDATE ON CrmContracts
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) SELECT OLD.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE OLD.tenant_id IS NOT NEW.tenant_id
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_revision_contracts_delete
AFTER DELETE ON CrmContracts
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(OLD.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;
