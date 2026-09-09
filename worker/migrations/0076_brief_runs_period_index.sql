CREATE INDEX IF NOT EXISTS idx_briefruns_daily_end_requested
ON BriefRuns (ReportKind, EndDate, RequestedAt DESC, id DESC);
