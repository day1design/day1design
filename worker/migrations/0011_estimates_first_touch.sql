-- First-Touch Attribution + 방문 히스토리 연동 (2026-05-21)
-- Estimates 테이블에 자체 트래커 SessionId + 첫 진입 출처 컬럼 추가
-- 기존 Source/Platform/Campaign은 폼 제출 시점의 last-touch 로 그대로 유지

ALTER TABLE Estimates ADD COLUMN SessionId TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FirstSource TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FirstPlatform TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FirstCampaign TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FirstReferrer TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FirstUtmSource TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FirstUtmMedium TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FirstUtmCampaign TEXT NOT NULL DEFAULT '';

-- 방문 히스토리 조회 인덱스 (SessionId + CreatedAt 시간순)
CREATE INDEX IF NOT EXISTS idx_heatmap_session_created
  ON HeatmapEvents(SessionId, CreatedAt);
