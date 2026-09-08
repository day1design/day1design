CREATE TABLE IF NOT EXISTS CrmSchedulerCursors (
  key TEXT PRIMARY KEY,
  cursor TEXT,
  updated_at TEXT NOT NULL
);
