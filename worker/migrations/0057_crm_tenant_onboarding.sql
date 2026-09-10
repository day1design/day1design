ALTER TABLE CrmTenants ADD COLUMN homepage_url TEXT NOT NULL DEFAULT '';
ALTER TABLE CrmTenants ADD COLUMN manager_name TEXT NOT NULL DEFAULT '';
ALTER TABLE CrmTenants ADD COLUMN manager_email TEXT NOT NULL DEFAULT '';
ALTER TABLE CrmTenants ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'active' CHECK (onboarding_status IN ('pending', 'active'));
ALTER TABLE CrmTenants ADD COLUMN onboarding_checklist_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE CrmTenants ADD COLUMN activated_at TEXT;
ALTER TABLE CrmTenants ADD COLUMN activated_by TEXT;

UPDATE CrmTenants SET onboarding_status='active' WHERE id IN ('day1design', 'platform');
CREATE INDEX IF NOT EXISTS idx_crm_tenants_onboarding ON CrmTenants(onboarding_status, suspended, id);
