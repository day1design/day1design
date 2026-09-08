ALTER TABLE CrmNotificationOutbox ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (delivery_status IN ('pending', 'blocked', 'sent'));
ALTER TABLE CrmNotificationOutbox ADD COLUMN blocked_reason TEXT;
ALTER TABLE CrmNotificationOutbox ADD COLUMN invalidated_at TEXT;
ALTER TABLE CrmNotifications ADD COLUMN event_key TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_outbox_due_tenant_cursor
  ON CrmNotificationOutbox(tenant_id, due_at, id)
  WHERE status = 'queued' AND delivery_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crm_outbox_delivery_state
  ON CrmNotificationOutbox(tenant_id, delivery_status, due_at, id);
CREATE INDEX IF NOT EXISTS idx_crm_appointments_automation
  ON CrmAppointments(tenant_id, status, starts_at, id, CrmVersion);
CREATE INDEX IF NOT EXISTS idx_crm_templates_enabled
  ON CrmNotificationTemplates(tenant_id, kind, state, enabled);
CREATE INDEX IF NOT EXISTS idx_crm_estimates_new_customer
  ON Estimates(CrmTenantId, SubmittedAt, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_notifications_event_key
  ON CrmNotifications(event_key) WHERE event_key IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_crm_appointment_automation_insert
AFTER INSERT ON CrmAppointments
WHEN NEW.status IN ('scheduled', 'confirmed', 'booked')
BEGIN
  INSERT OR IGNORE INTO CrmNotificationOutbox(
    id, tenant_id, appointment_id, appointment_version, notification_type,
    recipient_id, channel, idempotency_key, due_at, status, payload_json,
    created_at, delivery_status
  ) VALUES (
    'crm_auto_' || lower(hex(randomblob(16))), NEW.tenant_id, NEW.id,
    NEW.CrmVersion,
    CASE WHEN NEW.kind = 'measurement' THEN 'measurement_reminder' ELSE 'visit_reminder' END,
    'customer', 'customer',
    NEW.tenant_id || ':' || NEW.id || ':' || NEW.CrmVersion || ':' ||
      CASE WHEN NEW.kind = 'measurement' THEN 'measurement_reminder' ELSE 'visit_reminder' END || ':customer:customer',
    strftime('%Y-%m-%dT%H:%M:%fZ', julianday(NEW.starts_at) - 3.0 / 24.0),
    'queued', '{}', NEW.created_at, 'pending'
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_appointment_internal_notification_insert
AFTER INSERT ON CrmAppointments
BEGIN
  INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key)
  VALUES ('crm_auto_appt_' || NEW.id || '_' || NEW.CrmVersion, NEW.tenant_id, 'staff_message', NEW.created_by,
    json_object('kind','appointment_created','appointment_id',NEW.id,'estimate_id',NEW.estimate_id,
      'appointment_kind',NEW.kind,'starts_at',NEW.starts_at,'location',NEW.location,'address',NEW.address),
    NEW.created_at, 'appointment:' || NEW.tenant_id || ':' || NEW.id || ':' || NEW.CrmVersion);
  INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at)
  SELECT 'crm_auto_appt_' || NEW.id || '_' || NEW.CrmVersion, NEW.tenant_id, id, NEW.created_at
    FROM CrmUsers WHERE tenant_id=NEW.tenant_id AND active=1;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_appointment_automation_update
AFTER UPDATE OF CrmVersion, starts_at, status, kind ON CrmAppointments
BEGIN
  UPDATE CrmNotificationOutbox
     SET status = 'cancelled', invalidated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         blocked_reason = CASE WHEN NEW.status NOT IN ('scheduled', 'confirmed', 'booked')
                               THEN 'appointment_inactive' ELSE 'appointment_version_changed' END
   WHERE tenant_id = NEW.tenant_id AND appointment_id = NEW.id
     AND status IN ('queued', 'reserved')
     AND (appointment_version <> NEW.CrmVersion OR NEW.status NOT IN ('scheduled', 'confirmed', 'booked'));
  INSERT OR IGNORE INTO CrmNotificationOutbox(
    id, tenant_id, appointment_id, appointment_version, notification_type,
    recipient_id, channel, idempotency_key, due_at, status, payload_json,
    created_at, delivery_status
  )
  SELECT
    'crm_auto_' || lower(hex(randomblob(16))), NEW.tenant_id, NEW.id,
    NEW.CrmVersion,
    CASE WHEN NEW.kind = 'measurement' THEN 'measurement_reminder' ELSE 'visit_reminder' END,
    'customer', 'customer',
    NEW.tenant_id || ':' || NEW.id || ':' || NEW.CrmVersion || ':' ||
      CASE WHEN NEW.kind = 'measurement' THEN 'measurement_reminder' ELSE 'visit_reminder' END || ':customer:customer',
    strftime('%Y-%m-%dT%H:%M:%fZ', julianday(NEW.starts_at) - 3.0 / 24.0),
    'queued', '{}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'pending'
  WHERE NEW.status IN ('scheduled', 'confirmed', 'booked');
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_appointment_internal_notification_update
AFTER UPDATE OF CrmVersion, starts_at, status, kind, location, address ON CrmAppointments
BEGIN
  INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key)
  VALUES ('crm_auto_appt_' || NEW.id || '_' || NEW.CrmVersion, NEW.tenant_id, 'staff_message', NEW.created_by,
    json_object('kind','appointment_updated','appointment_id',NEW.id,'estimate_id',NEW.estimate_id,
      'appointment_kind',NEW.kind,'starts_at',NEW.starts_at,'status',NEW.status,'location',NEW.location,'address',NEW.address),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'appointment:' || NEW.tenant_id || ':' || NEW.id || ':' || NEW.CrmVersion);
  INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at)
  SELECT 'crm_auto_appt_' || NEW.id || '_' || NEW.CrmVersion, NEW.tenant_id, id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM CrmUsers WHERE tenant_id=NEW.tenant_id AND active=1;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_automation_tenant_suspend
AFTER UPDATE OF suspended ON CrmTenants
WHEN NEW.suspended = 1
BEGIN
  UPDATE CrmNotificationOutbox
     SET status = 'cancelled', invalidated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         blocked_reason = 'tenant_suspended'
   WHERE tenant_id = NEW.id AND status IN ('queued', 'reserved');
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_automation_template_off
AFTER UPDATE OF enabled ON CrmNotificationTemplates
WHEN NEW.enabled = 0 AND NEW.state = 'approved'
BEGIN
  UPDATE CrmNotificationOutbox
     SET status = 'cancelled', invalidated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         blocked_reason = 'template_disabled'
   WHERE tenant_id = NEW.tenant_id AND status IN ('queued', 'reserved')
     AND notification_type = CASE WHEN NEW.kind = 'measurement'
                                  THEN 'measurement_reminder' ELSE 'visit_reminder' END;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_new_customer_internal_notification
AFTER INSERT ON Estimates
WHEN NEW.CrmTenantId IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key)
  SELECT 'crm_auto_customer_' || NEW.id, NEW.CrmTenantId, 'new_customer', u.id,
    json_object('kind','new_customer','estimate_id',NEW.id,'name',COALESCE(NEW.Name,''),
      'phone',COALESCE(NEW.Phone,''),'email',COALESCE(NEW.Email,''),'address',COALESCE(NEW.Address,''),
      'budget',COALESCE(NEW.EstimateAmount,0)),
    COALESCE(NEW.SubmittedAt,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    'new_customer:' || NEW.CrmTenantId || ':' || NEW.id
    FROM CrmUsers u WHERE u.tenant_id=NEW.CrmTenantId AND u.role='owner' AND u.active=1 ORDER BY u.id LIMIT 1;
  INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at)
  SELECT 'crm_auto_customer_' || NEW.id, NEW.CrmTenantId, id,
    COALESCE(NEW.SubmittedAt,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    FROM CrmUsers WHERE tenant_id=NEW.CrmTenantId AND active=1
      AND EXISTS (SELECT 1 FROM CrmNotifications WHERE id='crm_auto_customer_' || NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_short_notice_review
AFTER INSERT ON CrmNotificationOutbox
WHEN julianday(NEW.created_at)>=julianday(NEW.due_at)
BEGIN
 UPDATE CrmNotificationOutbox SET delivery_status='blocked',blocked_reason='short_notice_manual_review' WHERE id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_crm_web_visit_sync
AFTER UPDATE OF ConsultAt,ConsultBranch,ConsultCancelledAt ON Estimates
WHEN NOT EXISTS(SELECT 1 FROM CrmMutationGuard)
 AND (COALESCE(OLD.ConsultAt,'')<>COALESCE(NEW.ConsultAt,'') OR COALESCE(OLD.ConsultBranch,'')<>COALESCE(NEW.ConsultBranch,'') OR COALESCE(OLD.ConsultCancelledAt,'')<>COALESCE(NEW.ConsultCancelledAt,''))
BEGIN
 UPDATE CrmAppointments SET status='cancelled',CrmVersion=CrmVersion+1
 WHERE tenant_id=NEW.CrmTenantId AND estimate_id=NEW.id AND kind='visit' AND status='scheduled';
 INSERT INTO CrmAppointments(id,tenant_id,estimate_id,kind,starts_at,location,address,status,created_by,created_at)
 SELECT 'web-visit-'||NEW.id,NEW.CrmTenantId,NEW.id,'visit',NEW.ConsultAt,COALESCE(NEW.ConsultBranch,''),COALESCE(NEW.Address,''),'scheduled',u.id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM CrmUsers u JOIN CrmTenants t ON t.id=u.tenant_id
 WHERE u.tenant_id=NEW.CrmTenantId AND u.role='owner' AND u.active=1 AND t.suspended=0
 AND COALESCE(NEW.ConsultAt,'')<>'' AND COALESCE(NEW.ConsultCancelledAt,'')=''
 ORDER BY u.id LIMIT 1
 ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at,location=excluded.location,address=excluded.address,status='scheduled',CrmVersion=CrmAppointments.CrmVersion+1;
END;
