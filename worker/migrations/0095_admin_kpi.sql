CREATE TABLE IF NOT EXISTS AdminKpiDaily (
  tenant_id TEXT NOT NULL,
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL,
  source TEXT NOT NULL DEFAULT '',
  coverage_status TEXT NOT NULL DEFAULT 'unknown',
  source_revision TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (tenant_id, day, metric)
);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_daily_metric_day ON AdminKpiDaily(tenant_id, metric, day);
CREATE TABLE IF NOT EXISTS AdminKpiMonthly (
  tenant_id TEXT NOT NULL,
  month TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL,
  source TEXT NOT NULL DEFAULT '',
  coverage_status TEXT NOT NULL DEFAULT 'unknown',
  source_revision TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (tenant_id, month, metric)
);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_monthly_metric_month ON AdminKpiMonthly(tenant_id, metric, month);
CREATE TABLE IF NOT EXISTS AdminKpiCoverage (
  tenant_id TEXT NOT NULL,
  source TEXT NOT NULL,
  first_date TEXT,
  last_complete_date TEXT,
  missing_days_json TEXT NOT NULL DEFAULT '[]',
  backfill_status TEXT NOT NULL DEFAULT 'unknown',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (tenant_id, source)
);
CREATE TABLE IF NOT EXISTS AdminKpiSnapshotMeta (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  anchor TEXT NOT NULL,
  period TEXT NOT NULL,
  revision INTEGER NOT NULL,
  r2_key TEXT NOT NULL DEFAULT '',
  byte_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_kpi_snapshot_key ON AdminKpiSnapshotMeta(tenant_id, anchor, period, revision);
CREATE TABLE IF NOT EXISTS AdminKpiDirtyDays (
  tenant_id TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  dirty_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (tenant_id, day, source)
);
CREATE INDEX IF NOT EXISTS idx_admin_kpi_dirty_revision ON AdminKpiDirtyDays(tenant_id, revision, day, source);
CREATE INDEX IF NOT EXISTS idx_meta_ads_daily_tenant_date ON MetaAdsDaily(CrmTenantId, Date, Level);
CREATE INDEX IF NOT EXISTS idx_estimates_kpi_source_date ON Estimates(CrmTenantId, SubmittedAt, Source, id);
CREATE INDEX IF NOT EXISTS idx_estimates_kpi_first_source_date ON Estimates(CrmTenantId, SubmittedAt, FirstSource, id);
CREATE INDEX IF NOT EXISTS idx_contract_history_tenant_date ON EstimateContractHistory(estimate_id, stage, saved_at, id);

CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_dirty_estimate_insert AFTER INSERT ON Estimates BEGIN
INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT NEW.CrmTenantId,date(NEW.SubmittedAt,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=NEW.CrmTenantId),0) WHERE COALESCE(NEW.SubmittedAt,'')<>'' AND NEW.CrmTenantId='day1design' AND date(NEW.SubmittedAt,'+9 hours') IS NOT NULL ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT NEW.CrmTenantId,date(NEW.ConsultAt,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=NEW.CrmTenantId),0) WHERE COALESCE(NEW.ConsultAt,'')<>'' AND NEW.CrmTenantId='day1design' AND date(NEW.ConsultAt,'+9 hours') IS NOT NULL ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;

CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_dirty_estimate_update AFTER UPDATE ON Estimates BEGIN
INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT OLD.CrmTenantId,date(OLD.SubmittedAt,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=OLD.CrmTenantId),0) WHERE COALESCE(OLD.SubmittedAt,'')<>'' AND OLD.CrmTenantId='day1design' AND date(OLD.SubmittedAt,'+9 hours') IS NOT NULL ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT OLD.CrmTenantId,date(OLD.ConsultAt,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=OLD.CrmTenantId),0) WHERE COALESCE(OLD.ConsultAt,'')<>'' AND OLD.CrmTenantId='day1design' AND date(OLD.ConsultAt,'+9 hours') IS NOT NULL ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT NEW.CrmTenantId,date(NEW.SubmittedAt,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=NEW.CrmTenantId),0) WHERE COALESCE(NEW.SubmittedAt,'')<>'' AND NEW.CrmTenantId='day1design' AND date(NEW.SubmittedAt,'+9 hours') IS NOT NULL ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT NEW.CrmTenantId,date(NEW.ConsultAt,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=NEW.CrmTenantId),0) WHERE COALESCE(NEW.ConsultAt,'')<>'' AND NEW.CrmTenantId='day1design' AND date(NEW.ConsultAt,'+9 hours') IS NOT NULL ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;

CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_dirty_estimate_delete AFTER DELETE ON Estimates BEGIN
INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT OLD.CrmTenantId,date(OLD.SubmittedAt,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=OLD.CrmTenantId),0) WHERE COALESCE(OLD.SubmittedAt,'')<>'' AND OLD.CrmTenantId='day1design' AND date(OLD.SubmittedAt,'+9 hours') IS NOT NULL ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT OLD.CrmTenantId,date(OLD.ConsultAt,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=OLD.CrmTenantId),0) WHERE COALESCE(OLD.ConsultAt,'')<>'' AND OLD.CrmTenantId='day1design' AND date(OLD.ConsultAt,'+9 hours') IS NOT NULL ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_dirty_contract_insert
AFTER INSERT ON EstimateContractHistory
BEGIN
  INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT e.CrmTenantId,date(NEW.saved_at,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=e.CrmTenantId),0) FROM Estimates e WHERE e.id=NEW.estimate_id
  ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_dirty_contract_update
AFTER UPDATE OF amount,previous_amount,stage,saved_at ON EstimateContractHistory
BEGIN
  INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT e.CrmTenantId,date(NEW.saved_at,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=e.CrmTenantId),0) FROM Estimates e WHERE e.id=NEW.estimate_id
  ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_dirty_contract_delete
AFTER DELETE ON EstimateContractHistory
BEGIN
  INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) SELECT e.CrmTenantId,date(OLD.saved_at,'+9 hours'),'business',COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=e.CrmTenantId),0) FROM Estimates e WHERE e.id=OLD.estimate_id
  ON CONFLICT(tenant_id,day,source) DO UPDATE SET revision=excluded.revision,dirty_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_meta_insert
AFTER INSERT ON MetaAdsDaily
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_meta_update
AFTER UPDATE ON MetaAdsDaily
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_meta_delete
AFTER DELETE ON MetaAdsDaily
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(OLD.CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_ga4_snapshot
AFTER INSERT ON CrmGa4AnalyticsSnapshots
BEGIN
  INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_ga4_update AFTER UPDATE ON CrmGa4AnalyticsSnapshots BEGIN INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(NEW.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_ga4_delete AFTER DELETE ON CrmGa4AnalyticsSnapshots BEGIN INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES(OLD.tenant_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_history_insert AFTER INSERT ON EstimateContractHistory BEGIN INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) SELECT CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM Estimates WHERE id=NEW.estimate_id ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_history_update AFTER UPDATE ON EstimateContractHistory BEGIN INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) SELECT CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM Estimates WHERE id=NEW.estimate_id ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER IF NOT EXISTS trg_admin_kpi_revision_history_delete AFTER DELETE ON EstimateContractHistory BEGIN INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) SELECT CrmTenantId,1,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM Estimates WHERE id=OLD.estimate_id ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at; END;
