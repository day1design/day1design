-- 문자발송 기능
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0006_messages.sql
--      wrangler d1 execute day1design --local  --file=migrations/0006_messages.sql

-- 관리자가 등록하는 LMS 메시지 템플릿
CREATE TABLE IF NOT EXISTS MessageTemplates (
  id TEXT PRIMARY KEY,
  Name TEXT NOT NULL DEFAULT '',
  Subject TEXT NOT NULL DEFAULT '',
  Content TEXT NOT NULL DEFAULT '',
  CreatedAt TEXT NOT NULL DEFAULT '',
  UpdatedAt TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_message_templates_updated
  ON MessageTemplates (UpdatedAt DESC);

-- SENS 발송 이력 (검수 통과 후 실제 발송 시점부터 기록)
CREATE TABLE IF NOT EXISTS SmsLogs (
  id TEXT PRIMARY KEY,
  EstimateId TEXT NOT NULL DEFAULT '',
  TemplateId TEXT NOT NULL DEFAULT '',
  ToPhone TEXT NOT NULL DEFAULT '',
  Subject TEXT NOT NULL DEFAULT '',
  Content TEXT NOT NULL DEFAULT '',
  SmsType TEXT NOT NULL DEFAULT 'LMS',
  Status TEXT NOT NULL DEFAULT 'pending',
  Detail TEXT NOT NULL DEFAULT '',
  SentAt TEXT NOT NULL DEFAULT '',
  SentBy TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at
  ON SmsLogs (SentAt DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_estimate
  ON SmsLogs (EstimateId, SentAt DESC);
