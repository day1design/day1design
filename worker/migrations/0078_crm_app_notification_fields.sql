DROP TRIGGER IF EXISTS trg_crm_new_customer_internal_notification;

CREATE TRIGGER trg_crm_new_customer_internal_notification
AFTER INSERT ON Estimates
WHEN NEW.CrmTenantId IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key)
  SELECT 'crm_auto_customer_' || NEW.id, NEW.CrmTenantId, 'new_customer', u.id,
    json_object('kind','new_customer','estimate_id',NEW.id,
      'source',COALESCE(NULLIF(NEW.Source,''),CASE WHEN COALESCE(NEW.MetaLeadId,'')<>'' THEN 'meta' ELSE 'homepage' END),
      'meta_lead_id',COALESCE(NEW.MetaLeadId,''),'detail',COALESCE(NEW.Detail,''),
      'name',COALESCE(NEW.Name,''),'phone',COALESCE(NEW.Phone,''),'email',COALESCE(NEW.Email,''),
      'address',COALESCE(NEW.Address,''),'branch',COALESCE(NEW.Branch,''),'budget',COALESCE(NEW.EstimateAmount,'')),
    COALESCE(NEW.SubmittedAt,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    'new_customer:' || NEW.CrmTenantId || ':' || NEW.id
    FROM CrmUsers u WHERE u.tenant_id=NEW.CrmTenantId AND u.role='owner' AND u.active=1 ORDER BY u.id LIMIT 1;
  INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at)
  SELECT 'crm_auto_customer_' || NEW.id, NEW.CrmTenantId, id,
    COALESCE(NEW.SubmittedAt,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    FROM CrmUsers WHERE tenant_id=NEW.CrmTenantId AND active=1
      AND EXISTS (SELECT 1 FROM CrmNotifications WHERE id='crm_auto_customer_' || NEW.id);
END;
