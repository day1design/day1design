CREATE INDEX IF NOT EXISTS idx_heatmap_crm_tenant_session_event_bot_created_id
  ON HeatmapEvents(CrmTenantId, SessionId, EventType, IsBot, CreatedAt, id);
