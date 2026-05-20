// 관리자 API 베이스 URL.
// Worker 배포 후 실제 URL로 교체하세요.
//   예: "https://day1design-api.your-account.workers.dev"
//   또는 커스텀 도메인: "https://api.day1design.co.kr"
// 빈 문자열이면 same-origin (로컬 개발 시 /api/... 를 프록시로 연결할 때)
// admin Vercel 의 /api/* rewrite 로 workers.dev 에 same-origin 프록시.
// → 응답 cookie 가 admin.day1design.co.kr 에 저장돼 로그인 세션 유지.
window.ADMIN_API_BASE = "";
