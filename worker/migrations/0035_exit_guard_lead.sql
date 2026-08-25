-- 이탈 방지 팝업(exit guard) 접수 → 견적 폼 완주 승격
--
-- 팝업에서 이름·연락처만 먼저 받아 Status='작성중' 으로 저장하고, 이어지는 견적 폼
-- 제출이 같은 LeadKey 를 실어 오면 새 레코드를 만들지 않고 그 레코드를 채워
-- '접수대기' 로 승격한다. 이 키를 대조하지 않으면 같은 사람이 카드 두 장으로
-- 갈라진다(Meta 리드의 MetaLeadId 와 같은 역할).
--
-- FormType 은 접수가 어느 입구로 들어왔는지 남긴다. '' = 기존 견적 폼,
-- 'exit_guard' = 이탈 팝업 경유. 어드민 통계에서 두 경로를 나눠 보기 위한 값이다.
ALTER TABLE Estimates ADD COLUMN LeadKey TEXT NOT NULL DEFAULT '';
ALTER TABLE Estimates ADD COLUMN FormType TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_estimates_leadkey
  ON Estimates (LeadKey) WHERE LeadKey <> '';
CREATE INDEX IF NOT EXISTS idx_estimates_status_submitted
  ON Estimates (Status, SubmittedAt);
