ALTER TABLE CrmConsultations ADD COLUMN outcome TEXT NOT NULL DEFAULT '';
ALTER TABLE CrmConsultations ADD COLUMN next_action TEXT NOT NULL DEFAULT '';
ALTER TABLE CrmConsultations ADD COLUMN completed_at TEXT;
ALTER TABLE CrmConsultations ADD COLUMN appointment_id TEXT;
CREATE INDEX IF NOT EXISTS idx_crm_consultations_appointment ON CrmConsultations(tenant_id, appointment_id, created_at, id);

ALTER TABLE CrmContracts ADD COLUMN contract_owner TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_crm_contracts_owner ON CrmContracts(tenant_id, contract_owner, signed_at, id);
