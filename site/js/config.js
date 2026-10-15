// 프론트엔드 API 베이스 URL. Worker 배포 후 실제 URL로 교체.
//   예: "https://day1design-api.your-account.workers.dev"
//   또는 커스텀 도메인: "https://api.day1design.co.kr"
// 빈 문자열이면 API 미사용 → 기존 정적 JSON / 하드코딩된 projectData 사용.
window.DAY1_API_BASE = "https://day1design-api.day1design-co.workers.dev";

// 사진·폰트 전송 주소. R2 버킷에 연결한 커스텀 도메인(Cloudflare 엣지 캐시·HTTP/2).
// D1·정적 데이터에는 옛 r2.dev 주소가 그대로 저장돼 있으므로 화면에 그릴 때 day1Img 로 바꾼다.
// 문제가 생기면 DAY1_IMG_HOST 를 r2.dev 주소로 되돌리면 크기 변환 없이 예전처럼 동작한다.
window.DAY1_R2_PUBLIC = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev";
window.DAY1_IMG_HOST = "https://img.day1design.co.kr";

// day1Img(src)        → 새 주소로만 바꾼다 (원본 그대로, 캐시 효과)
// day1Img(src, width) → Cloudflare 이미지 변환으로 폭을 줄이고 WebP/AVIF 로 보낸다.
//   변환이 실패하거나 월 무료 한도(고유 변환 5,000건)를 넘기면 onerror=redirect 로 원본이 나간다.
//   폭 종류를 늘리면 고유 변환 수가 곱으로 늘어나므로 용도별로 한 가지씩만 쓴다.
window.day1Img = function (src, width) {
  var r2 = window.DAY1_R2_PUBLIC;
  var host = window.DAY1_IMG_HOST;
  if (typeof src !== "string" || src.indexOf(r2) !== 0 || host === r2) {
    return src;
  }
  var path = src.slice(r2.length);
  if (!width) return host + path;
  return (
    host +
    "/cdn-cgi/image/width=" +
    width +
    ",quality=75,format=auto,onerror=redirect" +
    path
  );
};

// 히어로 사진 주소. 고해상도 원본(hero-hd/ 폴더)으로 올린 사진만 Cloudflare 가 화면에 맞게 잘라 준다.
//   폰: 히어로가 393×720 처럼 세로로 길어 가로 사진의 가운데만 보인다. 1920px 사진으로는 그 부분이
//       699×1280 픽셀뿐이라 1.69배 늘어나 흐렸다(2026-10-15 실측). 원본에서 같은 가운데를 1296×2160 으로 받는다.
//   PC: 가로 1920 으로 줄여 받는다.
// 1920px 로 올린 예전 사진(hero/)은 변환하면 확대만 되므로 예전처럼 주소만 바꾼다.
// ⚠ index.html <head> 의 첫 슬라이드 preload 가 같은 옵션 문자열을 쓴다. 바꾸면 두 곳을 함께 바꿀 것.
window.day1HeroImg = function (src, mobile) {
  var url = window.day1Img(src);
  var host = window.DAY1_IMG_HOST;
  if (host === window.DAY1_R2_PUBLIC) return url;
  if (typeof url !== "string" || url.indexOf(host + "/hero-hd/") !== 0) {
    return url;
  }
  var opt = mobile
    ? "width=1296,height=2160,fit=cover,quality=78,format=auto,onerror=redirect"
    : "width=1920,quality=82,format=auto,onerror=redirect";
  return host + "/cdn-cgi/image/" + opt + url.slice(host.length);
};

// HTML 문자열 안의 r2.dev 이미지 주소를 새 주소로 바꾼다 (커뮤니티 본문처럼 HTML 로 오는 내용용).
window.day1ImgHtml = function (html) {
  if (typeof html !== "string") return html;
  return html.split(window.DAY1_R2_PUBLIC).join(window.DAY1_IMG_HOST);
};

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
