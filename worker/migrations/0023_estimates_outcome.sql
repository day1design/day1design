-- 0023_estimates_outcome.sql  (★준비만 — 적용 보류)
--
-- 목적: 거부/오류 접수 레코드를 정상건과 정규화된 컬럼으로 구분하고 싶을 때 사용.
-- 현재 안전망 복구 코드(worker/src/lib/estimate-archive.js recordRejectToD1)는
--   Status='오류' + Detail 프리픽스 '[오류:<outcome> <error>]' 로
--   스키마 변경 없이 동작하므로 이 마이그레이션은 필수가 아니다.
--
-- 적용 시 반드시 함께 할 것 (누락 시 d1Create 가 칼럼을 silent drop):
--   worker/src/lib/d1.js 의 SCHEMA.Estimates 배열에 'Outcome', 'ErrorReason' 추가.
--   그리고 recordRejectToD1 / submitEstimate 에서 해당 칼럼에 값 채우도록 수정.
--
-- 적용 명령(보류):
--   wrangler d1 execute day1design --remote --file=migrations/0023_estimates_outcome.sql
--
-- 멱등성: SQLite 는 ADD COLUMN IF NOT EXISTS 미지원 → 1회만 적용. 재적용 금지.

ALTER TABLE Estimates ADD COLUMN Outcome TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN ErrorReason TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_estimates_outcome
  ON Estimates (Outcome, SubmittedAt DESC);
