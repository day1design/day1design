CREATE TABLE IF NOT EXISTS AnalyticsEvents (
  id          TEXT PRIMARY KEY,
  SessionId   TEXT NOT NULL DEFAULT '',
  CreatedAt   TEXT NOT NULL DEFAULT '',
  DayKey      TEXT NOT NULL DEFAULT '',
  EventType   TEXT NOT NULL DEFAULT '',
  Page        TEXT NOT NULL DEFAULT '',
  Device      TEXT NOT NULL DEFAULT '',
  Country     TEXT NOT NULL DEFAULT '',
  Region      TEXT NOT NULL DEFAULT '',
  City        TEXT NOT NULL DEFAULT '',
  Referrer    TEXT NOT NULL DEFAULT '',
  UtmSource   TEXT NOT NULL DEFAULT '',
  UtmMedium   TEXT NOT NULL DEFAULT '',
  UtmCampaign TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_day_session_time
  ON AnalyticsEvents(DayKey, SessionId, CreatedAt, id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_day
  ON AnalyticsEvents(SessionId, DayKey);

CREATE TABLE IF NOT EXISTS AnalyticsPageViews (
  id          TEXT PRIMARY KEY,
  SessionId   TEXT NOT NULL DEFAULT '',
  CreatedAt   TEXT NOT NULL DEFAULT '',
  DayKey      TEXT NOT NULL DEFAULT '',
  HourKey     TEXT NOT NULL DEFAULT '',
  Page        TEXT NOT NULL DEFAULT '',
  Device      TEXT NOT NULL DEFAULT '',
  Country     TEXT NOT NULL DEFAULT '',
  Region      TEXT NOT NULL DEFAULT '',
  City        TEXT NOT NULL DEFAULT '',
  Referrer    TEXT NOT NULL DEFAULT '',
  UtmSource   TEXT NOT NULL DEFAULT '',
  UtmMedium   TEXT NOT NULL DEFAULT '',
  UtmCampaign TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_day_session_time
  ON AnalyticsPageViews(DayKey, SessionId, CreatedAt, id);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_session_time
  ON AnalyticsPageViews(SessionId, CreatedAt, id);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_day_device_session
  ON AnalyticsPageViews(DayKey, Device, SessionId);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_day_source_session
  ON AnalyticsPageViews(DayKey, UtmSource, UtmMedium, Referrer, SessionId);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_day_hour
  ON AnalyticsPageViews(DayKey, HourKey);

CREATE TABLE IF NOT EXISTS AnalyticsSessionDays (
  DayKey      TEXT NOT NULL,
  SessionId   TEXT NOT NULL,
  FirstSeenAt TEXT NOT NULL DEFAULT '',
  LastSeenAt  TEXT NOT NULL DEFAULT '',
  Pageviews   INTEGER NOT NULL DEFAULT 0,
  EventCount  INTEGER NOT NULL DEFAULT 0,
  Device      TEXT NOT NULL DEFAULT '',
  Country     TEXT NOT NULL DEFAULT '',
  Region      TEXT NOT NULL DEFAULT '',
  City        TEXT NOT NULL DEFAULT '',
  Referrer    TEXT NOT NULL DEFAULT '',
  UtmSource   TEXT NOT NULL DEFAULT '',
  UtmMedium   TEXT NOT NULL DEFAULT '',
  UtmCampaign TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (DayKey, SessionId)
);

CREATE INDEX IF NOT EXISTS idx_analytics_session_days_session_day
  ON AnalyticsSessionDays(SessionId, DayKey);

CREATE TABLE IF NOT EXISTS AnalyticsSessions (
  SessionId      TEXT PRIMARY KEY,
  FirstSeenAt    TEXT NOT NULL DEFAULT '',
  LastSeenAt     TEXT NOT NULL DEFAULT '',
  FirstDayKey    TEXT NOT NULL DEFAULT '',
  LastDayKey     TEXT NOT NULL DEFAULT '',
  ActiveDayCount INTEGER NOT NULL DEFAULT 1,
  TotalPageviews INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_first_day
  ON AnalyticsSessions(FirstDayKey);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_day
  ON AnalyticsSessions(LastDayKey);

CREATE TABLE IF NOT EXISTS AnalyticsRefreshLog (
  id          TEXT PRIMARY KEY,
  RangeKey    TEXT NOT NULL DEFAULT '',
  StartDate   TEXT NOT NULL DEFAULT '',
  EndDate     TEXT NOT NULL DEFAULT '',
  Mode        TEXT NOT NULL DEFAULT '',
  Source      TEXT NOT NULL DEFAULT '',
  State       TEXT NOT NULL DEFAULT '',
  DurationMs  INTEGER NOT NULL DEFAULT 0,
  SnapshotId  TEXT NOT NULL DEFAULT '',
  ErrorCode   TEXT NOT NULL DEFAULT '',
  CreatedAt   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_analytics_refresh_log_created
  ON AnalyticsRefreshLog(CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_refresh_log_source_state
  ON AnalyticsRefreshLog(Source, State, CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_refresh_log_range
  ON AnalyticsRefreshLog(RangeKey, StartDate, EndDate, CreatedAt DESC);
