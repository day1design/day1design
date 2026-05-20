-- 관리자 화면 설정값 저장
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0003_admin_settings.sql

CREATE TABLE IF NOT EXISTS AdminSettings (
  id TEXT PRIMARY KEY,
  Value TEXT NOT NULL DEFAULT '',
  UpdatedAt TEXT NOT NULL
);
