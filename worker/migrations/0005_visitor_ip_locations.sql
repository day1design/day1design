-- 방문자 IP 기반 접속위치 집계
-- D1: 관리자 조회용 집계, R2: 이벤트 원본 JSON 아카이브 키 보존

CREATE TABLE IF NOT EXISTS VisitorIpEvents (
  id             TEXT PRIMARY KEY,
  EventAt        TEXT NOT NULL DEFAULT '',
  DayKey         TEXT NOT NULL DEFAULT '',
  HourKey        TEXT NOT NULL DEFAULT '',
  IpHash         TEXT NOT NULL DEFAULT '',
  IpPrefix       TEXT NOT NULL DEFAULT '',
  Country        TEXT NOT NULL DEFAULT '',
  Region         TEXT NOT NULL DEFAULT '',
  City           TEXT NOT NULL DEFAULT '',
  Timezone       TEXT NOT NULL DEFAULT '',
  Latitude       TEXT NOT NULL DEFAULT '',
  Longitude      TEXT NOT NULL DEFAULT '',
  LocationKey    TEXT NOT NULL DEFAULT '',
  Path           TEXT NOT NULL DEFAULT '',
  ReferrerHost   TEXT NOT NULL DEFAULT '',
  UserAgentHash  TEXT NOT NULL DEFAULT '',
  RawR2Key       TEXT NOT NULL DEFAULT '',
  CreatedAt      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_visitor_ip_events_day
  ON VisitorIpEvents(DayKey, HourKey);

CREATE INDEX IF NOT EXISTS idx_visitor_ip_events_location
  ON VisitorIpEvents(LocationKey, DayKey);

CREATE INDEX IF NOT EXISTS idx_visitor_ip_events_ip_hash
  ON VisitorIpEvents(IpHash, DayKey);

CREATE TABLE IF NOT EXISTS VisitorLocationHourly (
  HourKey      TEXT NOT NULL,
  LocationKey  TEXT NOT NULL,
  DayKey       TEXT NOT NULL DEFAULT '',
  Country      TEXT NOT NULL DEFAULT '',
  Region       TEXT NOT NULL DEFAULT '',
  City         TEXT NOT NULL DEFAULT '',
  Timezone     TEXT NOT NULL DEFAULT '',
  Visits       INTEGER NOT NULL DEFAULT 0,
  UniqueIps    INTEGER NOT NULL DEFAULT 0,
  UpdatedAt    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (HourKey, LocationKey)
);

CREATE INDEX IF NOT EXISTS idx_visitor_location_hourly_day
  ON VisitorLocationHourly(DayKey, Visits DESC);

CREATE TABLE IF NOT EXISTS VisitorLocationIpHourly (
  HourKey      TEXT NOT NULL,
  LocationKey  TEXT NOT NULL,
  IpHash       TEXT NOT NULL,
  SeenAt       TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (HourKey, LocationKey, IpHash)
);
