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

// 유입 앱 판정 — tracker.js(방문)·common.js(GA4)·estimates.js(접수)가 함께 쓴다.
// 이 파일이 셋보다 먼저 로드되므로 판정을 한 곳에 두고 값만 나눠 쓴다.
//
// 왜 필요한가: 네이버·카카오·인스타 인앱 브라우저는 리퍼러를 지우고 보낸다.
// 실측(2026-08-21) 견적문의 착지 중 (direct) 로 떨어진 57건은 93%가 모바일이었고,
// 리퍼러가 살아남은 블로그 유입 56건은 데스크톱이 32건으로 더 많았다. 즉 앱에서
// 오는 유입만 통째로 출처를 잃고 있다. 리퍼러는 없어도 User-Agent 에는 앱 이름이
// 남으므로 그것을 단서로 삼는다.
//
// 앱이 아니면 아임웹 시절 게시판 주소인지 본다 — 그 주소를 사람이 외워서 입력할
// 리는 없으니 외부에 남아 있는 옛 링크를 타고 온 유입이라는 뜻이다.
window.DAY1_INFLOW_APP = (function () {
  try {
    var ua = String(navigator.userAgent || "");
    if (/NAVER\(inapp;/i.test(ua)) return "naver-app";
    if (/KAKAOTALK/i.test(ua)) return "kakaotalk";
    if (/Instagram/i.test(ua)) return "instagram-app";
    if (/FBAN\/|FBAV\/|FB_IAB/i.test(ua)) return "facebook-app";
    if (/[?&](bmode=view|t=board)|[?&]q=YToxOnt/i.test(location.search)) {
      return "legacy-link";
    }
  } catch (e) {}
  return "";
})();
