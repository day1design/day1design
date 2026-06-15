-- 커뮤니티 위지윅(WYSIWYG) 본문 HTML 저장용 컬럼 추가
-- 기존 글은 ContentBlocks/BodyText 로 폴백 렌더링되므로 기본값 빈 문자열.
ALTER TABLE Community ADD COLUMN BodyHtml TEXT NOT NULL DEFAULT '';
