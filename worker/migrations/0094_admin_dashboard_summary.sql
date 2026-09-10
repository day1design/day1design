-- Web admin summary; one-time rollup backfill, subsequent writes maintain it.
CREATE TABLE IF NOT EXISTS AdminDashboardState (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1,
 estimates INTEGER NOT NULL DEFAULT 0, hero INTEGER NOT NULL DEFAULT 0,
 portfolio INTEGER NOT NULL DEFAULT 0, community INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO AdminDashboardState(id) VALUES ('day1design');
CREATE TABLE IF NOT EXISTS AdminDashboardHours (
 hour TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0,
 meta INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_estimates_admin_recent ON Estimates(CrmTenantId,SubmittedAt DESC,id DESC);
UPDATE AdminDashboardState SET
 estimates=(SELECT COUNT(*) FROM Estimates WHERE CrmTenantId='day1design' AND COALESCE(Status,'')<>'작성중'),
 hero=(SELECT COUNT(*) FROM HeroSlides WHERE Active<>0),
 portfolio=(SELECT COUNT(*) FROM Portfolio), community=(SELECT COUNT(*) FROM Community),
 revision=revision+1 WHERE id='day1design';
INSERT OR REPLACE INTO AdminDashboardHours(hour,total,meta,pending)
 SELECT strftime('%Y-%m-%dT%H:00:00.000Z',SubmittedAt),COUNT(*),
 SUM(CASE WHEN lower(Source)='meta' THEN 1 ELSE 0 END),
 SUM(CASE WHEN COALESCE(NULLIF(Status,''),'접수대기')='접수대기' THEN 1 ELSE 0 END)
 FROM Estimates WHERE CrmTenantId='day1design' AND COALESCE(Status,'')<>'작성중' AND julianday(SubmittedAt) IS NOT NULL
 GROUP BY strftime('%Y-%m-%dT%H:00:00.000Z',SubmittedAt);

CREATE TRIGGER IF NOT EXISTS admin_dashboard_est_insert AFTER INSERT ON Estimates BEGIN
INSERT INTO AdminDashboardHours(hour,total,meta,pending)
 SELECT strftime('%Y-%m-%dT%H:00:00.000Z',NEW.SubmittedAt),1,
 1*(CASE WHEN lower(NEW.Source)='meta' THEN 1 ELSE 0 END),
 1*(CASE WHEN COALESCE(NULLIF(NEW.Status,''),'접수대기')='접수대기' THEN 1 ELSE 0 END)
 WHERE NEW.CrmTenantId='day1design' AND COALESCE(NEW.Status,'')<>'작성중' AND julianday(NEW.SubmittedAt) IS NOT NULL
 ON CONFLICT(hour) DO UPDATE SET total=total+excluded.total,meta=meta+excluded.meta,pending=pending+excluded.pending;
 UPDATE AdminDashboardState SET estimates=estimates+1,revision=revision+1
 WHERE id='day1design' AND NEW.CrmTenantId='day1design' AND COALESCE(NEW.Status,'')<>'작성중';
END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_est_delete AFTER DELETE ON Estimates BEGIN
INSERT INTO AdminDashboardHours(hour,total,meta,pending)
 SELECT strftime('%Y-%m-%dT%H:00:00.000Z',OLD.SubmittedAt),-1,
 -1*(CASE WHEN lower(OLD.Source)='meta' THEN 1 ELSE 0 END),
 -1*(CASE WHEN COALESCE(NULLIF(OLD.Status,''),'접수대기')='접수대기' THEN 1 ELSE 0 END)
 WHERE OLD.CrmTenantId='day1design' AND COALESCE(OLD.Status,'')<>'작성중' AND julianday(OLD.SubmittedAt) IS NOT NULL
 ON CONFLICT(hour) DO UPDATE SET total=total+excluded.total,meta=meta+excluded.meta,pending=pending+excluded.pending;
 UPDATE AdminDashboardState SET estimates=estimates+-1,revision=revision+1
 WHERE id='day1design' AND OLD.CrmTenantId='day1design' AND COALESCE(OLD.Status,'')<>'작성중';
END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_est_update AFTER UPDATE OF Name,SubmittedAt,Source,Status,CrmTenantId ON Estimates BEGIN
INSERT INTO AdminDashboardHours(hour,total,meta,pending)
 SELECT strftime('%Y-%m-%dT%H:00:00.000Z',OLD.SubmittedAt),-1,
 -1*(CASE WHEN lower(OLD.Source)='meta' THEN 1 ELSE 0 END),
 -1*(CASE WHEN COALESCE(NULLIF(OLD.Status,''),'접수대기')='접수대기' THEN 1 ELSE 0 END)
 WHERE OLD.CrmTenantId='day1design' AND COALESCE(OLD.Status,'')<>'작성중' AND julianday(OLD.SubmittedAt) IS NOT NULL
 ON CONFLICT(hour) DO UPDATE SET total=total+excluded.total,meta=meta+excluded.meta,pending=pending+excluded.pending;
 UPDATE AdminDashboardState SET estimates=estimates+-1,revision=revision+1
 WHERE id='day1design' AND OLD.CrmTenantId='day1design' AND COALESCE(OLD.Status,'')<>'작성중';
INSERT INTO AdminDashboardHours(hour,total,meta,pending)
 SELECT strftime('%Y-%m-%dT%H:00:00.000Z',NEW.SubmittedAt),1,
 1*(CASE WHEN lower(NEW.Source)='meta' THEN 1 ELSE 0 END),
 1*(CASE WHEN COALESCE(NULLIF(NEW.Status,''),'접수대기')='접수대기' THEN 1 ELSE 0 END)
 WHERE NEW.CrmTenantId='day1design' AND COALESCE(NEW.Status,'')<>'작성중' AND julianday(NEW.SubmittedAt) IS NOT NULL
 ON CONFLICT(hour) DO UPDATE SET total=total+excluded.total,meta=meta+excluded.meta,pending=pending+excluded.pending;
 UPDATE AdminDashboardState SET estimates=estimates+1,revision=revision+1
 WHERE id='day1design' AND NEW.CrmTenantId='day1design' AND COALESCE(NEW.Status,'')<>'작성중';
END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_hero_insert AFTER INSERT ON HeroSlides BEGIN UPDATE AdminDashboardState SET hero=hero+(1),revision=revision+1 WHERE id='day1design' AND NEW.Active<>0; END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_hero_delete AFTER DELETE ON HeroSlides BEGIN UPDATE AdminDashboardState SET hero=hero+(-1),revision=revision+1 WHERE id='day1design' AND OLD.Active<>0; END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_hero_update AFTER UPDATE OF Active ON HeroSlides BEGIN UPDATE AdminDashboardState SET hero=hero+(CASE WHEN NEW.Active<>0 THEN 1 ELSE 0 END)-(CASE WHEN OLD.Active<>0 THEN 1 ELSE 0 END),revision=revision+1 WHERE id='day1design'; END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_portfolio_insert AFTER INSERT ON Portfolio BEGIN UPDATE AdminDashboardState SET portfolio=portfolio+(1),revision=revision+1 WHERE id='day1design'; END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_portfolio_delete AFTER DELETE ON Portfolio BEGIN UPDATE AdminDashboardState SET portfolio=portfolio+(-1),revision=revision+1 WHERE id='day1design'; END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_community_insert AFTER INSERT ON Community BEGIN UPDATE AdminDashboardState SET community=community+(1),revision=revision+1 WHERE id='day1design'; END;
CREATE TRIGGER IF NOT EXISTS admin_dashboard_community_delete AFTER DELETE ON Community BEGIN UPDATE AdminDashboardState SET community=community+(-1),revision=revision+1 WHERE id='day1design'; END;