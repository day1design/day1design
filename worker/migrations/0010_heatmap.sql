-- 자체 히트맵 시스템 (HeatmapEvents + HeatmapScreenshots)
-- 명세: HEATMAP_SPEC.md v1.0 (2026-05-20)
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0009_heatmap.sql

-- 이벤트 원본: 클릭 좌표 + 스크롤 깊이
CREATE TABLE IF NOT EXISTS HeatmapEvents (
  id              TEXT PRIMARY KEY,
  Page            TEXT NOT NULL DEFAULT '',
  EventType       TEXT NOT NULL DEFAULT '',          -- 'click' | 'scroll'
  Device          TEXT NOT NULL DEFAULT '',          -- 'pc' | 'mobile'
  XPct            REAL,                              -- click only, 0~1
  YPct            REAL,                              -- click only, 0~1
  ScrollDepthPct  REAL,                              -- scroll only, 0~1
  PageW           INTEGER NOT NULL DEFAULT 0,
  PageH           INTEGER NOT NULL DEFAULT 0,
  ViewportW       INTEGER NOT NULL DEFAULT 0,
  ViewportH       INTEGER NOT NULL DEFAULT 0,
  SessionId       TEXT NOT NULL DEFAULT '',
  IP              TEXT NOT NULL DEFAULT '',
  Country         TEXT NOT NULL DEFAULT '',
  Region          TEXT NOT NULL DEFAULT '',
  City            TEXT NOT NULL DEFAULT '',
  Referrer        TEXT NOT NULL DEFAULT '',
  UtmSource       TEXT NOT NULL DEFAULT '',
  UtmMedium       TEXT NOT NULL DEFAULT '',
  UtmCampaign     TEXT NOT NULL DEFAULT '',
  CreatedAt       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_heatmap_page_device
  ON HeatmapEvents(Page, Device, EventType);

CREATE INDEX IF NOT EXISTS idx_heatmap_created_at
  ON HeatmapEvents(CreatedAt);

-- 페이지별 스크린샷 메타 (PC/Mobile)
CREATE TABLE IF NOT EXISTS HeatmapScreenshots (
  Page          TEXT NOT NULL,
  Device        TEXT NOT NULL,                       -- 'pc' | 'mobile'
  Url           TEXT NOT NULL DEFAULT '',
  PageW         INTEGER NOT NULL DEFAULT 0,
  PageH         INTEGER NOT NULL DEFAULT 0,
  CapturedAt    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (Page, Device)
);
