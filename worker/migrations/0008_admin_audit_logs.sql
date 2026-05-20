-- 관리자 감사 로그 (AdminAuditLogs)
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0008_admin_audit_logs.sql
--      wrangler d1 execute day1design --local  --file=migrations/0008_admin_audit_logs.sql

-- Type 예시:
--   login_ok          : 관리자 로그인 성공
--   login_fail        : 관리자 로그인 실패 (비밀번호 오류)
--   rate_limit        : 로그인 rate-limit 초과
--   error_5xx         : Worker 5xx 에러
--   sms_fail          : SMS 발송 실패
--   estimate_delete   : 견적 삭제

CREATE TABLE IF NOT EXISTS AdminAuditLogs (
  id TEXT PRIMARY KEY,
  Type TEXT NOT NULL DEFAULT '',
  Severity TEXT NOT NULL DEFAULT 'info',
  Path TEXT NOT NULL DEFAULT '',
  Method TEXT NOT NULL DEFAULT '',
  Status INTEGER NOT NULL DEFAULT 0,
  IP TEXT NOT NULL DEFAULT '',
  UA TEXT NOT NULL DEFAULT '',
  Username TEXT NOT NULL DEFAULT '',
  Message TEXT NOT NULL DEFAULT '',
  PayloadKey TEXT NOT NULL DEFAULT '',
  CreatedAt TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON AdminAuditLogs (CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type
  ON AdminAuditLogs (Type, CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_severity
  ON AdminAuditLogs (Severity, CreatedAt DESC);
