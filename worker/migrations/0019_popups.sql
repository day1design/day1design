-- 어드민에서 관리하는 사이트 팝업 (이미지 기반)
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0019_popups.sql

CREATE TABLE IF NOT EXISTS Popups (
  id TEXT PRIMARY KEY,
  Title TEXT NOT NULL DEFAULT '',
  ImageUrl TEXT NOT NULL,
  Alt TEXT NOT NULL DEFAULT '',
  LinkUrl TEXT NOT NULL DEFAULT '',
  WidthPx INTEGER,
  TopPx INTEGER NOT NULL DEFAULT 0,
  LeftPx INTEGER NOT NULL DEFAULT 0,
  Active INTEGER NOT NULL DEFAULT 0,
  "Order" INTEGER NOT NULL DEFAULT 0,
  CreatedAt TEXT NOT NULL,
  UpdatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_popups_active_order ON Popups(Active, "Order");

-- 표시 방식 글로벌 설정 (parallel | sequential) — AdminSettings 재사용
INSERT OR IGNORE INTO AdminSettings (id, Value, UpdatedAt)
VALUES ('popup_display_mode', 'sequential', datetime('now'));

-- 기존 하드코딩 팝업(지점 확장 안내)을 등록된 활성 record 로 시드
-- (위치 0/0 = sequential 모드에서는 화면 중앙 자동 정렬되므로 좌표 의미 없음)
INSERT OR IGNORE INTO Popups (
  id, Title, ImageUrl, Alt, LinkUrl, WidthPx, TopPx, LeftPx, Active, "Order",
  CreatedAt, UpdatedAt
) VALUES (
  'recPopupSeedBranch1',
  '지점 확장 안내',
  'https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/hero/popup-banner.webp',
  '데이원디자인 지점 확장 안내',
  '',
  520,
  100,
  100,
  1,
  0,
  datetime('now'),
  datetime('now')
);
