import { verify as verifyJwt } from "./jwt.js";

const COOKIE_NAME = "day1_admin";
const COOKIE_MAX_AGE = 60 * 60 * 12; // 12h

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  const out = {};
  raw.split(/;\s*/).forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}

/**
 * 관리자 인증 검증. 아래 중 하나라도 통과하면 true.
 *  1) day1_admin 쿠키에 유효한 JWT (HS256, JWT_SECRET 서명)
 *  2) x-admin-token 헤더 = env.ADMIN_TOKEN (레거시/백도어)
 * async 로 변경됨 — 호출부에 반드시 await.
 */
export async function verifyAdmin(request, env) {
  // 1) JWT 쿠키
  const cookies = parseCookies(request);
  const jwt = cookies[COOKIE_NAME];
  if (jwt && env.JWT_SECRET) {
    const payload = await verifyJwt(jwt, env.JWT_SECRET);
    if (payload && payload.sub === "admin") return true;
  }
  // 2) x-admin-token 헤더 (레거시, 긴급 복구용)
  if (env.ADMIN_TOKEN) {
    const header = request.headers.get("x-admin-token");
    if (header && timingSafeEqual(header, env.ADMIN_TOKEN)) return true;
  }
  return false;
}

export function setSessionCookie(jwt, maxAge = COOKIE_MAX_AGE) {
  return `${COOKIE_NAME}=${encodeURIComponent(jwt)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

// 레거시 이름 유지 (routes에서 쓰던 것)
export const setAdminCookie = setSessionCookie;
export const clearAdminCookie = clearSessionCookie;

export { COOKIE_NAME, COOKIE_MAX_AGE, timingSafeEqual };
