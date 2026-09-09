ALTER TABLE BriefRuns ADD COLUMN ReportKind TEXT DEFAULT '';
ALTER TABLE BriefRuns ADD COLUMN ImageKey TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_briefruns_kind_requested
  ON BriefRuns (ReportKind, RequestedAt DESC);
