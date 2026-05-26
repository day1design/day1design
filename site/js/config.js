// 프론트엔드 API 베이스 URL. Worker 배포 후 실제 URL로 교체.
//   예: "https://day1design-api.your-account.workers.dev"
//   또는 커스텀 도메인: "https://api.day1design.co.kr"
// 빈 문자열이면 API 미사용 → 기존 정적 JSON / 하드코딩된 projectData 사용.
window.DAY1_API_BASE = "https://day1design-api.day1design-co.workers.dev";

// GA4 Measurement ID — common.js 의 gtag 초기화가 이 값을 G-XXXXX 형식 검증 후
// 활성. 비어 있으면 GA4 측정 자체가 안 됨 (2026-05-20 deploy 시점부터 누락되어
// 5/22 이후 GA4 trend 가 빈 값으로 응답하던 사고).
// Property ID 537274300 의 데이터 스트림 측정 ID.
window.DAY1_GA4_ID = "G-V7VLPPDY9B";
