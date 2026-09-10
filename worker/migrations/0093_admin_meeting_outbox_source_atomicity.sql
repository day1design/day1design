CREATE TRIGGER IF NOT EXISTS admin_meeting_consult_version
AFTER UPDATE OF ConsultAt,ConsultBranch,ConsultCancelledAt,ConsultTypeId,ConsultTypeName,ConsultDurationMinutes,ConsultBufferMinutes,ConsultColorKey ON Estimates
WHEN NEW.CrmTenantId='day1design' AND (COALESCE(OLD.ConsultAt,'')<>COALESCE(NEW.ConsultAt,'') OR COALESCE(OLD.ConsultBranch,'')<>COALESCE(NEW.ConsultBranch,'') OR COALESCE(OLD.ConsultCancelledAt,'')<>COALESCE(NEW.ConsultCancelledAt,'') OR COALESCE(OLD.ConsultTypeId,'')<>COALESCE(NEW.ConsultTypeId,'') OR COALESCE(OLD.ConsultDurationMinutes,0)<>COALESCE(NEW.ConsultDurationMinutes,0))
BEGIN
  UPDATE Estimates SET ConsultVersion=OLD.ConsultVersion+1 WHERE id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS admin_meeting_outbox_estimate_insert
AFTER INSERT ON Estimates
WHEN NEW.CrmTenantId='day1design' AND COALESCE(NEW.ConsultAt,'')<>'' AND COALESCE(NEW.ConsultCancelledAt,'')=''
BEGIN
  INSERT OR IGNORE INTO AdminMeetingOutbox(id,tenant_id,meeting_id,meeting_version,notification_type,idempotency_key,due_at,status,payload_json,attempts,created_at)
  SELECT lower(hex(randomblob(16))),NEW.CrmTenantId,NEW.id,CASE WHEN COALESCE(NEW.ConsultVersion,0)<1 THEN 1 ELSE NEW.ConsultVersion END,v.kind,
    NEW.CrmTenantId||':'||NEW.id||':'||(CASE WHEN COALESCE(NEW.ConsultVersion,0)<1 THEN 1 ELSE NEW.ConsultVersion END)||':telegram:'||v.kind,
    CASE v.kind WHEN 'created' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') WHEN 'day' THEN strftime('%Y-%m-%dT%H:%M:%fZ',NEW.ConsultAt,'-24 hours') ELSE strftime('%Y-%m-%dT%H:%M:%fZ',NEW.ConsultAt,'-2 hours') END,
    'queued',json_object('meeting',json_object('id',NEW.id,'tenantId',NEW.CrmTenantId,'version',CASE WHEN COALESCE(NEW.ConsultVersion,0)<1 THEN 1 ELSE NEW.ConsultVersion END,'startsAt',NEW.ConsultAt,'meetingName',COALESCE(NEW.ConsultTypeName,'이니셜미팅'),'durationMinutes',COALESCE(NEW.ConsultDurationMinutes,120),'bufferMinutes',COALESCE(NEW.ConsultBufferMinutes,60),'typeMarker',COALESCE(NEW.ConsultColorKey,'blue'),'colorKey',COALESCE(NEW.ConsultColorKey,'blue'),'customerName',COALESCE(NEW.Name,''),'assignee',COALESCE(NEW.Assignee,''),'location',COALESCE(NEW.ConsultBranch,''),'calendarUrl','https://admin.day1design.co.kr/admin/estimates.html?calendar=week','detailUrl','https://admin.day1design.co.kr/admin/estimates.html?id='||NEW.id)),0,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM (SELECT 'created' AS kind UNION ALL SELECT 'day' UNION ALL SELECT 'hour') v
  WHERE v.kind='created' OR (v.kind='day' AND strftime('%s',NEW.ConsultAt,'-24 hours')>=strftime('%s','now')) OR (v.kind='hour' AND strftime('%s',NEW.ConsultAt,'-2 hours')>=strftime('%s','now'));
END;

CREATE TRIGGER IF NOT EXISTS admin_meeting_outbox_estimate_update
AFTER UPDATE OF ConsultAt,ConsultBranch,ConsultCancelledAt,ConsultTypeId,ConsultTypeName,ConsultDurationMinutes,ConsultBufferMinutes,ConsultColorKey ON Estimates
WHEN NEW.CrmTenantId='day1design' AND (COALESCE(OLD.ConsultAt,'')<>COALESCE(NEW.ConsultAt,'') OR COALESCE(OLD.ConsultBranch,'')<>COALESCE(NEW.ConsultBranch,'') OR COALESCE(OLD.ConsultCancelledAt,'')<>COALESCE(NEW.ConsultCancelledAt,'') OR COALESCE(OLD.ConsultTypeId,'')<>COALESCE(NEW.ConsultTypeId,'') OR COALESCE(OLD.ConsultDurationMinutes,0)<>COALESCE(NEW.ConsultDurationMinutes,0))
BEGIN
  UPDATE AdminMeetingOutbox SET status='cancelled',cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tenant_id='day1design' AND meeting_id=NEW.id AND meeting_version<>COALESCE(NEW.ConsultVersion,0)+1 AND status IN ('queued','reserved');
  INSERT OR IGNORE INTO AdminMeetingOutbox(id,tenant_id,meeting_id,meeting_version,notification_type,idempotency_key,due_at,status,payload_json,attempts,created_at)
  SELECT lower(hex(randomblob(16))),NEW.CrmTenantId,NEW.id,COALESCE(NEW.ConsultVersion,0)+1,v.kind,
    NEW.CrmTenantId||':'||NEW.id||':'||(COALESCE(NEW.ConsultVersion,0)+1)||':telegram:'||v.kind,
    CASE v.kind WHEN 'created' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') WHEN 'day' THEN strftime('%Y-%m-%dT%H:%M:%fZ',NEW.ConsultAt,'-24 hours') ELSE strftime('%Y-%m-%dT%H:%M:%fZ',NEW.ConsultAt,'-2 hours') END,
    'queued',json_object('meeting',json_object('id',NEW.id,'tenantId',NEW.CrmTenantId,'version',COALESCE(NEW.ConsultVersion,0)+1,'startsAt',NEW.ConsultAt,'meetingName',COALESCE(NEW.ConsultTypeName,'이니셜미팅'),'durationMinutes',COALESCE(NEW.ConsultDurationMinutes,120),'bufferMinutes',COALESCE(NEW.ConsultBufferMinutes,60),'typeMarker',COALESCE(NEW.ConsultColorKey,'blue'),'colorKey',COALESCE(NEW.ConsultColorKey,'blue'),'customerName',COALESCE(NEW.Name,''),'assignee',COALESCE(NEW.Assignee,''),'location',COALESCE(NEW.ConsultBranch,''),'calendarUrl','https://admin.day1design.co.kr/admin/estimates.html?calendar=week','detailUrl','https://admin.day1design.co.kr/admin/estimates.html?id='||NEW.id)),0,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM (SELECT 'created' AS kind UNION ALL SELECT 'day' UNION ALL SELECT 'hour') v
  WHERE COALESCE(NEW.ConsultAt,'')<>'' AND COALESCE(NEW.ConsultCancelledAt,'')='' AND (v.kind='created' OR (v.kind='day' AND strftime('%s',NEW.ConsultAt,'-24 hours')>=strftime('%s','now')) OR (v.kind='hour' AND strftime('%s',NEW.ConsultAt,'-2 hours')>=strftime('%s','now')));
END;
