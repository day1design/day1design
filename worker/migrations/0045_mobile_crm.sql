CREATE TABLE IF NOT EXISTS CrmTenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  suspended INTEGER NOT NULL DEFAULT 0 CHECK (suspended IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS CrmUsers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_users_tenant_active
  ON CrmUsers(tenant_id, active, id);

CREATE TABLE IF NOT EXISTS CrmOtpRequests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL,
  request_ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_otp_email_created
  ON CrmOtpRequests(email, created_at DESC);

CREATE TABLE IF NOT EXISTS CrmSessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES CrmUsers(id),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_sessions_token
  ON CrmSessions(token_hash);

CREATE TABLE IF NOT EXISTS CrmAppointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  estimate_id TEXT NOT NULL REFERENCES Estimates(id),
  kind TEXT NOT NULL CHECK (kind IN ('visit', 'measurement')),
  starts_at TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  CrmVersion INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES CrmUsers(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_appointments_customer
  ON CrmAppointments(tenant_id, estimate_id, starts_at, id);

CREATE TABLE IF NOT EXISTS CrmConsultations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  estimate_id TEXT NOT NULL REFERENCES Estimates(id),
  result TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES CrmUsers(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_consultations_customer
  ON CrmConsultations(tenant_id, estimate_id, created_at, id);

CREATE TABLE IF NOT EXISTS CrmContracts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  estimate_id TEXT NOT NULL REFERENCES Estimates(id),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'cancelled')),
  signed_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES CrmUsers(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_contracts_customer
  ON CrmContracts(tenant_id, estimate_id, signed_at, id);

CREATE TABLE IF NOT EXISTS CrmAuditLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  actor_id TEXT NOT NULL REFERENCES CrmUsers(id),
  estimate_id TEXT,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_audit_tenant_created
  ON CrmAuditLogs(tenant_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS CrmMutationGuard (
 id TEXT PRIMARY KEY,
 allowed INTEGER NOT NULL CHECK (allowed = 1)
);
CREATE INDEX IF NOT EXISTS idx_crm_appointments_calendar ON CrmAppointments(tenant_id,starts_at,id);

ALTER TABLE Estimates ADD COLUMN CrmVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE Estimates ADD COLUMN CrmTenantId TEXT NOT NULL DEFAULT 'day1design';
CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_cursor ON Estimates(CrmTenantId, id);
CREATE INDEX IF NOT EXISTS idx_estimates_crm_tenant_date ON Estimates(CrmTenantId,SubmittedAt);
CREATE TRIGGER IF NOT EXISTS trg_estimates_crm_version
AFTER UPDATE OF Name, Phone, Email, Address, EstimateAmount, Status, Assignee, Branch, ConsultAt, ConsultBranch, ConsultCancelledAt, ContractAt, ContractOwner, ContractAmount ON Estimates
WHEN NEW.CrmVersion = OLD.CrmVersion
BEGIN
  UPDATE Estimates SET CrmVersion = OLD.CrmVersion + 1 WHERE id = NEW.id;
END;

INSERT OR IGNORE INTO CrmTenants(id, name, brand, logo_url, created_at)
VALUES ('day1design', '데이원디자인', 'day1design',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/favicon/favicon-192.png',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT OR IGNORE INTO CrmUsers(id, tenant_id, email, role, created_at)
VALUES ('day1-owner', 'day1design', 'gahyun.co@gmail.com', 'owner',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT OR IGNORE INTO CrmTenants(id, name, brand, logo_url, created_at)
VALUES ('platform', 'POLARAD 플랫폼', 'polarad', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT OR IGNORE INTO CrmUsers(id, tenant_id, email, role, created_at)
VALUES ('platform-owner', 'platform', 'mkt@polarad.co.kr', 'owner', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
