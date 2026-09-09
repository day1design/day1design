CREATE INDEX IF NOT EXISTS idx_crm_analytics_cache_tenant_window_lease
  ON CrmAnalyticsCache(tenant_id, start_date, end_date, lease_until);
