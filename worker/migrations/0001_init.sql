-- Day1Design D1 스키마 (Airtable 대체)
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0001_init.sql
-- 로컬 테스트: wrangler d1 execute day1design --local --file=migrations/0001_init.sql

-- ─── Estimates (상담신청) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Estimates (
  id              TEXT PRIMARY KEY,
  Name            TEXT NOT NULL DEFAULT '',
  Phone           TEXT NOT NULL DEFAULT '',
  Email           TEXT NOT NULL DEFAULT '',
  SpaceType       TEXT NOT NULL DEFAULT '',
  SpaceSize       TEXT NOT NULL DEFAULT '',
  Postcode        TEXT NOT NULL DEFAULT '',
  Address         TEXT NOT NULL DEFAULT '',
  AddressDetail   TEXT NOT NULL DEFAULT '',
  Schedule        TEXT NOT NULL DEFAULT '',
  Referral        TEXT NOT NULL DEFAULT '',
  Branch          TEXT NOT NULL DEFAULT '',
  Detail          TEXT NOT NULL DEFAULT '',
  PrivacyAgreed   INTEGER NOT NULL DEFAULT 0,
  ConceptFiles    TEXT NOT NULL DEFAULT '[]',
  FloorPlans      TEXT NOT NULL DEFAULT '[]',
  SubmittedAt     TEXT NOT NULL DEFAULT '',
  IP              TEXT NOT NULL DEFAULT '',
  Status          TEXT NOT NULL DEFAULT '',
  Assignee        TEXT NOT NULL DEFAULT '',
  ContactedAt     TEXT NOT NULL DEFAULT '',
  Memo            TEXT NOT NULL DEFAULT '',
  EstimateAmount  INTEGER NOT NULL DEFAULT 0,
  Source          TEXT NOT NULL DEFAULT '',
  Platform        TEXT NOT NULL DEFAULT '',
  Campaign        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON Estimates(Status);
CREATE INDEX IF NOT EXISTS idx_estimates_submitted ON Estimates(SubmittedAt DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_phone ON Estimates(Phone);
CREATE INDEX IF NOT EXISTS idx_estimates_email ON Estimates(Email);

-- ─── EstimateMemos (상담 쓰레드 메모) ─────────────────────────────
CREATE TABLE IF NOT EXISTS EstimateMemos (
  id          TEXT PRIMARY KEY,
  EstimateId  TEXT NOT NULL DEFAULT '',
  Body        TEXT NOT NULL DEFAULT '',
  Author      TEXT NOT NULL DEFAULT '',
  CreatedAt   TEXT NOT NULL DEFAULT '',
  UpdatedAt   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_memos_estimate ON EstimateMemos(EstimateId, CreatedAt);

-- ─── HeroSlides (메인 히어로 캐러셀) ──────────────────────────────
CREATE TABLE IF NOT EXISTS HeroSlides (
  id       TEXT PRIMARY KEY,
  Image    TEXT NOT NULL DEFAULT '',
  Href     TEXT NOT NULL DEFAULT '',
  Alt      TEXT NOT NULL DEFAULT '',
  "Order"  INTEGER NOT NULL DEFAULT 0,
  Active   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_hero_order ON HeroSlides("Order");

-- ─── Portfolio (시공 포트폴리오) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS Portfolio (
  id           TEXT PRIMARY KEY,
  Name         TEXT NOT NULL DEFAULT '',
  Folder       TEXT NOT NULL DEFAULT '',
  Count        INTEGER NOT NULL DEFAULT 0,
  Category     TEXT NOT NULL DEFAULT 'HOUSE',
  "Order"      INTEGER NOT NULL DEFAULT 0,
  RightFolder  TEXT NOT NULL DEFAULT '',
  RightCount   INTEGER NOT NULL DEFAULT 0,
  RightName    TEXT NOT NULL DEFAULT '',
  ThumbAfter   TEXT NOT NULL DEFAULT '',
  ThumbBefore  TEXT NOT NULL DEFAULT '',
  Images       TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_portfolio_order ON Portfolio("Order");

-- ─── Community (게시글) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Community (
  id             TEXT PRIMARY KEY,
  Idx            TEXT NOT NULL UNIQUE,
  Title          TEXT NOT NULL DEFAULT '',
  Category       TEXT NOT NULL DEFAULT '',
  Date           TEXT NOT NULL DEFAULT '',
  Board          TEXT NOT NULL DEFAULT 'Residential',
  Thumb          TEXT NOT NULL DEFAULT '',
  Views          INTEGER NOT NULL DEFAULT 0,
  Excerpt        TEXT NOT NULL DEFAULT '',
  BodyText       TEXT NOT NULL DEFAULT '',
  Images         TEXT NOT NULL DEFAULT '[]',
  ContentBlocks  TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_community_board_date ON Community(Board, Date DESC);
