// 공개 사이트가 읽는 목록·본문은 브라우저가 30초 동안 다시 받지 않게 한다.
// 페이지를 옮길 때마다 히어로·포트폴리오·커뮤니티·팝업을 새로 받던 구조를 줄인다(2026-10-15 사용자 승인).
// 공개 사이트 출처에서 온 GET 200 응답에만 붙인다. 관리자 화면은 같은 주소를 써도 출처가 달라
// 캐시되지 않는다(cors() 가 vary: origin 을 붙인다). 관리자가 고친 내용은 공개 사이트에서 최대 30초 늦게 보인다.
export const PUBLIC_CACHE_SECONDS = 30;

const PUBLIC_ORIGINS = new Set([
  "https://day1design.co.kr",
  "https://www.day1design.co.kr",
]);

// 공개 페이지가 실제로 부르는 조회만: 히어로 슬라이드, 팝업, 포트폴리오 목록, 커뮤니티 목록·본문.
// /api/popups/all·/api/portfolio/:id 같은 관리자용 조회는 넣지 않는다.
const PUBLIC_PATHS =
  /^\/api\/(hero\/slides|popups\/?|portfolio\/?|community\/?|community\/[^/]+)$/;

export function withPublicCache(res, request, path) {
  if (!res || request.method !== "GET" || res.status !== 200) return res;
  if (!PUBLIC_ORIGINS.has(request.headers.get("origin") || "")) return res;
  if (!PUBLIC_PATHS.test(path)) return res;
  if (res.headers.has("cache-control")) return res;
  const headers = new Headers(res.headers);
  headers.set("cache-control", `public, max-age=${PUBLIC_CACHE_SECONDS}`);
  return new Response(res.body, { status: res.status, headers });
}
