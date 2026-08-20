-- 0033_meta_form_schema.sql — Meta 인스턴트폼 변경 자동대응
--  배경: 폼 질문이 바뀌면(추가·삭제·문구수정) 워커의 키워드 매핑(FIELD_RULES)에 안 걸리는
--        응답이 생긴다. 지금까지 그런 응답은 Detail 에 한 줄 텍스트로만 남아 상담카드·
--        텔레그램에서 사실상 보이지 않았다. 원본을 구조로 보관해 폼이 바뀌어도 코드 수정 없이
--        상담카드·알림이 따라가게 한다.
--  1) Estimates.MetaFieldData : 리드 원본 응답 JSON [{"q":"질문","a":"답변"}, ...]
--     (매핑 결과인 SpaceType/Detail 등은 그대로 유지 — 어드민 필터·통계·엑셀이 그 컬럼을 쓴다)
--  2) MetaFormSchemas         : 폼별 질문 목록 스냅샷. 폴러가 매 실행 보고 → 워커가 diff 판정.
--     변경이 감지되면 텔레그램으로 "추가/삭제된 질문 + 매핑 결과"를 알린다.
-- 적용: wrangler d1 execute day1design --remote --file=migrations/0033_meta_form_schema.sql

ALTER TABLE Estimates ADD COLUMN MetaFieldData TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS MetaFormSchemas (
  id TEXT PRIMARY KEY,
  FormId TEXT NOT NULL DEFAULT '',      -- Meta leadgen form id
  FormName TEXT NOT NULL DEFAULT '',
  Questions TEXT NOT NULL DEFAULT '[]', -- JSON 문자열 배열(질문 key 원문, 순서 보존)
  Mapping TEXT NOT NULL DEFAULT '{}',   -- JSON {질문: 매핑필드|""} — 스냅샷 시점 워커 판정
  UpdatedAt TEXT NOT NULL DEFAULT ''    -- ISO. 마지막으로 '변경이 감지된' 시각
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_form_schemas_form_id
  ON MetaFormSchemas (FormId);
