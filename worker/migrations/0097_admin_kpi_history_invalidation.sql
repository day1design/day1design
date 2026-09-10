-- Contract KPI dates depend on the first final event and on the owning estimate.
-- Capture the affected indexed history before ON DELETE CASCADE removes its owner.
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_history_owner_delete
BEFORE DELETE ON Estimates
WHEN OLD.CrmTenantId='day1design'
BEGIN
  INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision)
  SELECT OLD.CrmTenantId,date(h.saved_at,'+9 hours'),'business',
    COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=OLD.CrmTenantId),0)
  FROM EstimateContractHistory h WHERE h.estimate_id=OLD.id AND date(h.saved_at,'+9 hours') IS NOT NULL
  GROUP BY date(h.saved_at,'+9 hours')
  ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
  DELETE FROM AdminKpiNormalized WHERE tenant_id=OLD.CrmTenantId AND estimate_id=OLD.id;
END;

-- A first-final correction can change the classification of subsequent events.
DROP TRIGGER IF EXISTS trg_admin_kpi_dirty_contract_update;
CREATE TRIGGER trg_admin_kpi_dirty_contract_update
AFTER UPDATE OF amount,previous_amount,stage,saved_at,estimate_id ON EstimateContractHistory
BEGIN
  INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision)
  SELECT e.CrmTenantId,date(OLD.saved_at,'+9 hours'),'business',
    COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=e.CrmTenantId),0)
  FROM Estimates e WHERE e.id=OLD.estimate_id AND e.CrmTenantId='day1design' AND date(OLD.saved_at,'+9 hours') IS NOT NULL
  ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
  INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision)
  SELECT e.CrmTenantId,date(h.saved_at,'+9 hours'),'business',
    COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=e.CrmTenantId),0)
  FROM EstimateContractHistory h JOIN Estimates e ON e.id=h.estimate_id
  WHERE h.estimate_id IN (OLD.estimate_id,NEW.estimate_id) AND e.CrmTenantId='day1design' AND date(h.saved_at,'+9 hours') IS NOT NULL
  GROUP BY e.CrmTenantId,date(h.saved_at,'+9 hours')
  ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;

DROP TRIGGER IF EXISTS trg_admin_kpi_dirty_contract_delete;
CREATE TRIGGER trg_admin_kpi_dirty_contract_delete
AFTER DELETE ON EstimateContractHistory
BEGIN
  INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision)
  SELECT e.CrmTenantId,date(OLD.saved_at,'+9 hours'),'business',
    COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=e.CrmTenantId),0)
  FROM Estimates e WHERE e.id=OLD.estimate_id AND e.CrmTenantId='day1design' AND date(OLD.saved_at,'+9 hours') IS NOT NULL
  ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
  INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision)
  SELECT e.CrmTenantId,date(h.saved_at,'+9 hours'),'business',
    COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=e.CrmTenantId),0)
  FROM EstimateContractHistory h JOIN Estimates e ON e.id=h.estimate_id
  WHERE h.estimate_id=OLD.estimate_id AND e.CrmTenantId='day1design' AND date(h.saved_at,'+9 hours') IS NOT NULL
  GROUP BY e.CrmTenantId,date(h.saved_at,'+9 hours')
  ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;
