CREATE TRIGGER IF NOT EXISTS trg_crm_assignee_notification
AFTER UPDATE OF Assignee ON Estimates
WHEN COALESCE(NEW.Assignee,'')<>COALESCE(OLD.Assignee,'') AND COALESCE(NEW.Assignee,'')<>''
BEGIN
 INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key)
 SELECT 'crm_assign_'||NEW.id||'_'||NEW.CrmVersion||'_'||u.id,NEW.CrmTenantId,'staff_message',u.id,
 json_object('kind','assignee_assigned','estimate_id',NEW.id,'name',NEW.Name,'phone',NEW.Phone,'address',NEW.Address,'budget',NEW.EstimateAmount),
 strftime('%Y-%m-%dT%H:%M:%fZ','now'),'assignment:'||NEW.CrmTenantId||':'||NEW.id||':'||NEW.CrmVersion||':'||u.id
 FROM CrmUsers u JOIN CrmTenants t ON t.id=u.tenant_id
 WHERE u.tenant_id=NEW.CrmTenantId AND u.email=NEW.Assignee COLLATE NOCASE AND u.active=1 AND t.suspended=0;
 INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at)
 SELECT 'crm_assign_'||NEW.id||'_'||NEW.CrmVersion||'_'||u.id,NEW.CrmTenantId,u.id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM CrmUsers u WHERE u.tenant_id=NEW.CrmTenantId AND u.email=NEW.Assignee COLLATE NOCASE AND u.active=1
 AND EXISTS(SELECT 1 FROM CrmNotifications WHERE id='crm_assign_'||NEW.id||'_'||NEW.CrmVersion||'_'||u.id);
END;
