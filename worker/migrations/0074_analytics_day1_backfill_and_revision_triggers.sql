UPDATE HeatmapEvents
SET CrmTenantId='day1design'
WHERE CrmTenantId IS NULL
  AND EXISTS (SELECT 1 FROM CrmTenants WHERE id='day1design' AND suspended=0);
INSERT INTO CrmDataRevisions(tenant_id,version,updated_at)
SELECT 'day1design',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE changes()>0
ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;

UPDATE pixel_events
SET CrmTenantId='day1design'
WHERE CrmTenantId IS NULL
  AND EXISTS (SELECT 1 FROM CrmTenants WHERE id='day1design' AND suspended=0);
INSERT INTO CrmDataRevisions(tenant_id,version,updated_at)
SELECT 'day1design',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE changes()>0
ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;

UPDATE MetaAdsDaily
SET CrmTenantId='day1design'
WHERE CrmTenantId IS NULL
  AND EXISTS (SELECT 1 FROM CrmTenants WHERE id='day1design' AND suspended=0);
INSERT INTO CrmDataRevisions(tenant_id,version,updated_at)
SELECT 'day1design',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE changes()>0
ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;

UPDATE MetaAdsAd
SET CrmTenantId='day1design'
WHERE CrmTenantId IS NULL
  AND EXISTS (SELECT 1 FROM CrmTenants WHERE id='day1design' AND suspended=0);
INSERT INTO CrmDataRevisions(tenant_id,version,updated_at)
SELECT 'day1design',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE changes()>0
ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;

UPDATE MetaAdsBreakdown
SET CrmTenantId='day1design'
WHERE CrmTenantId IS NULL
  AND EXISTS (SELECT 1 FROM CrmTenants WHERE id='day1design' AND suspended=0);
INSERT INTO CrmDataRevisions(tenant_id,version,updated_at)
SELECT 'day1design',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE changes()>0
ON CONFLICT(tenant_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
