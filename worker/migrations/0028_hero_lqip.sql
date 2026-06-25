-- 히어로 슬라이드 LQIP(저용량 흐림 미리보기, data:image base64) 컬럼
-- 최초 방문 시 원본 다운로드 동안 흐린 미리보기를 즉시 표시 → '점점 선명(현상)' 전환.
ALTER TABLE HeroSlides ADD COLUMN Lqip TEXT;
