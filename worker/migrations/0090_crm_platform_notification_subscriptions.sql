CREATE TABLE IF NOT EXISTS CrmPlatformNotificationSubscriptions (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL REFERENCES CrmUsers(id),
  source_tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('new_customer')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  cursor_created_at TEXT NOT NULL,
  cursor_relay_id TEXT NOT NULL DEFAULT '',
  source_cursor_created_at TEXT NOT NULL,
  source_cursor_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform_user_id, source_tenant_id, notification_type)
);
CREATE INDEX IF NOT EXISTS idx_crm_platform_subscriptions_active
  ON CrmPlatformNotificationSubscriptions(source_tenant_id, notification_type, enabled, platform_user_id);

CREATE TABLE IF NOT EXISTS CrmPlatformNotificationRelays (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES CrmPlatformNotificationSubscriptions(id) ON DELETE CASCADE,
  source_tenant_id TEXT NOT NULL REFERENCES CrmTenants(id),
  source_notification_id TEXT NOT NULL REFERENCES CrmNotifications(id) ON DELETE CASCADE,
  relay_notification_id TEXT NOT NULL UNIQUE REFERENCES CrmNotifications(id) ON DELETE CASCADE,
  platform_user_id TEXT NOT NULL REFERENCES CrmUsers(id),
  created_at TEXT NOT NULL,
  UNIQUE(subscription_id, source_notification_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_platform_relays_subscription
  ON CrmPlatformNotificationRelays(subscription_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_crm_notifications_source_cursor ON CrmNotifications(tenant_id,type,created_at,id);
