CREATE TABLE IF NOT EXISTS AdminMeetingSettings (
  id TEXT PRIMARY KEY,
  types_json TEXT NOT NULL DEFAULT '[]',
  notifications_json TEXT NOT NULL DEFAULT '{"created":{"enabled":true,"template":""},"day":{"enabled":true,"template":""},"hour":{"enabled":true,"template":""}}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO AdminMeetingSettings (id, types_json, notifications_json) VALUES ('day1design','[{"id":"initial","name":"이니셜미팅","durationMinutes":120,"bufferMinutes":60,"colorKey":"blue","active":1},{"id":"design","name":"디자인미팅","durationMinutes":180,"bufferMinutes":60,"colorKey":"green","active":1}]','{"created":{"enabled":true,"template":""},"day":{"enabled":true,"template":""},"hour":{"enabled":true,"template":""}}');
CREATE TABLE IF NOT EXISTS EstimateContractHistory (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  previous_amount INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  contract_date TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_detail TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  saved_by TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (estimate_id) REFERENCES Estimates(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contract_history_estimate_cursor ON EstimateContractHistory(estimate_id, saved_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_history_idempotency ON EstimateContractHistory(estimate_id, idempotency_key) WHERE idempotency_key <> '';
ALTER TABLE Estimates ADD COLUMN ConsultTypeId TEXT DEFAULT NULL;
ALTER TABLE Estimates ADD COLUMN ConsultTypeName TEXT DEFAULT NULL;
ALTER TABLE Estimates ADD COLUMN ConsultDurationMinutes INTEGER DEFAULT NULL;
ALTER TABLE Estimates ADD COLUMN ConsultBufferMinutes INTEGER DEFAULT NULL;
ALTER TABLE Estimates ADD COLUMN ConsultColorKey TEXT DEFAULT NULL;
ALTER TABLE Estimates ADD COLUMN ContractVersion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Estimates ADD COLUMN ContractLastRequestKey TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN ConsultVersion INTEGER NOT NULL DEFAULT 0;
UPDATE Estimates SET ConsultTypeId='initial', ConsultTypeName='이니셜미팅', ConsultDurationMinutes=120, ConsultBufferMinutes=60, ConsultColorKey='blue' WHERE CrmTenantId='day1design' AND COALESCE(ConsultAt,'')<>'';
UPDATE Estimates SET ConsultVersion=1 WHERE CrmTenantId='day1design' AND COALESCE(ConsultAt,'')<>'';
INSERT OR IGNORE INTO EstimateContractHistory(id,estimate_id,amount,previous_amount,stage,contract_date,address,address_detail,region,saved_at,saved_by)
SELECT 'legacy-'||id,id,ContractAmount,0,'기존값',COALESCE(substr(NULLIF(ContractAt,''),1,10),substr(NULLIF(SubmittedAt,''),1,10),''),COALESCE(Address,''),COALESCE(AddressDetail,''),'',COALESCE(NULLIF(ContractAt,''),NULLIF(SubmittedAt,''),'1970-01-01T00:00:00.000Z'),'migration'
FROM Estimates e WHERE e.CrmTenantId='day1design' AND COALESCE(e.ContractAmount,0)>0 AND NOT EXISTS (SELECT 1 FROM EstimateContractHistory h WHERE h.estimate_id=e.id);
CREATE INDEX IF NOT EXISTS idx_estimates_consult_time ON Estimates(ConsultAt, ConsultCancelledAt, id);
CREATE TRIGGER IF NOT EXISTS estimates_consult_overlap_guard_insert
BEFORE INSERT ON Estimates
WHEN NEW.CrmTenantId='day1design' AND COALESCE(NEW.ConsultAt,'') <> '' AND COALESCE(NEW.ConsultCancelledAt,'') = ''
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM Estimates e
    WHERE e.CrmTenantId='day1design' AND COALESCE(e.ConsultAt,'') <> '' AND COALESCE(e.ConsultCancelledAt,'') = ''
      AND julianday(e.ConsultAt) < julianday(NEW.ConsultAt, '+' || ((COALESCE(NEW.ConsultDurationMinutes,120)+COALESCE(NEW.ConsultBufferMinutes,60))*60) || ' seconds')
      AND julianday(NEW.ConsultAt) < julianday(e.ConsultAt, '+' || ((COALESCE(e.ConsultDurationMinutes,120)+COALESCE(e.ConsultBufferMinutes,60))*60) || ' seconds')
  ) THEN RAISE(ABORT,'meeting_conflict') END);
END;
CREATE TRIGGER IF NOT EXISTS estimates_consult_overlap_guard_update
BEFORE UPDATE OF ConsultAt, ConsultDurationMinutes, ConsultBufferMinutes, ConsultCancelledAt ON Estimates
WHEN NEW.CrmTenantId='day1design' AND COALESCE(NEW.ConsultAt,'') <> '' AND COALESCE(NEW.ConsultCancelledAt,'') = ''
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM Estimates e
    WHERE e.CrmTenantId='day1design' AND e.id <> NEW.id AND COALESCE(e.ConsultAt,'') <> '' AND COALESCE(e.ConsultCancelledAt,'') = ''
      AND julianday(e.ConsultAt) < julianday(NEW.ConsultAt, '+' || ((COALESCE(NEW.ConsultDurationMinutes,120)+COALESCE(NEW.ConsultBufferMinutes,60))*60) || ' seconds')
      AND julianday(NEW.ConsultAt) < julianday(e.ConsultAt, '+' || ((COALESCE(e.ConsultDurationMinutes,120)+COALESCE(e.ConsultBufferMinutes,60))*60) || ' seconds')
  ) THEN RAISE(ABORT,'meeting_conflict') END);
END;
