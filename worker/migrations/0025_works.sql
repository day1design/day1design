-- 0025_works.sql — 업무관리(Works) + 코멘트(WorkComments) + 광고주(Clients)
-- 폴라애드가 데이원디자인 업무를 기록/완료처리하고, 데이원디자인(광고주)이 코멘트로 피드백.
-- 작성자 식별: 전화번호 뒤 4자리 (폴라애드=WORKS_ADMIN_PHONE4 기본 9834, 광고주=Clients.Phone4)
-- 적용: wrangler d1 execute <DB> --remote --file=migrations/0025_works.sql

CREATE TABLE IF NOT EXISTS Clients (
  id TEXT PRIMARY KEY,
  Brand TEXT NOT NULL DEFAULT '',
  Phone4 TEXT NOT NULL DEFAULT '',
  "Order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Works (
  id TEXT PRIMARY KEY,
  ClientId TEXT NOT NULL DEFAULT '',
  Date TEXT NOT NULL DEFAULT '',
  Type TEXT NOT NULL DEFAULT '완료',
  Title TEXT NOT NULL DEFAULT '',
  Body TEXT NOT NULL DEFAULT '',
  AuthorLabel TEXT NOT NULL DEFAULT '',
  IP TEXT NOT NULL DEFAULT '',
  CreatedAt TEXT NOT NULL DEFAULT '',
  CompletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_works_client_date ON Works (ClientId, Date);

CREATE TABLE IF NOT EXISTS WorkComments (
  id TEXT PRIMARY KEY,
  WorkId TEXT NOT NULL DEFAULT '',
  Role TEXT NOT NULL DEFAULT '',
  Label TEXT NOT NULL DEFAULT '',
  Body TEXT NOT NULL DEFAULT '',
  IP TEXT NOT NULL DEFAULT '',
  CreatedAt TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_workcomments_work ON WorkComments (WorkId);

-- 광고주 시드: 데이원디자인 (전화 뒤 4자리 3349). 폴라애드(관리자)는 코드 기본값 9834.
INSERT OR IGNORE INTO Clients (id, Brand, Phone4, "Order")
VALUES ('cl-day1', '데이원디자인', '3349', 0);
