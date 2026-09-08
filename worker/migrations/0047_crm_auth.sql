CREATE TABLE IF NOT EXISTS CrmAuthRateLimits (
  scope TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, bucket)
);

CREATE INDEX IF NOT EXISTS idx_crm_auth_rate_window
  ON CrmAuthRateLimits(window_start);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_otp_one_active_email
  ON CrmOtpRequests(email) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS CrmOtpCooldown(email TEXT PRIMARY KEY, requested_at TEXT NOT NULL);
