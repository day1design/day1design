// 프론트엔드 API 베이스 URL. Worker 배포 후 실제 URL로 교체.
//   예: "https://day1design-api.your-account.workers.dev"
//   또는 커스텀 도메인: "https://api.day1design.co.kr"
// 빈 문자열이면 API 미사용 → 기존 정적 JSON / 하드코딩된 projectData 사용.
window.DAY1_API_BASE = "https://day1design-api.day1design-co.workers.dev";

// GA4 Measurement ID — common.js 의 gtag 초기화가 이 값을 G-XXXXX 형식 검증 후
// 활성. 비어 있으면 GA4 측정 자체가 안 됨.
// Property 537274300 · 스트림 14863296006 (https://day1design.co.kr) 측정 ID.
window.DAY1_GA4_ID = "G-F6TGWLBL7T";

// Meta Pixel(데이터세트) ID — common.js 가 15~16자리 숫자 검증 후 fbq 활성.
// 데이터세트 "day1design-web-260602" (day1design_marketing 포트폴리오, 광고계정 986916453663066).
window.DAY1_META_PIXEL_ID = "977283848476177";
