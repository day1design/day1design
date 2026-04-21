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

export function verifyAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  // Header 우선 (fetch)
  const header = request.headers.get("x-admin-token");
  if (header && timingSafeEqual(header, env.ADMIN_TOKEN)) return true;
  // Cookie 세션
  const cookies = parseCookies(request);
  const session = cookies[COOKIE_NAME];
  if (session && timingSafeEqual(session, env.ADMIN_TOKEN)) return true;
  return false;
}

export function setAdminCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=None`;
}

export function clearAdminCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

export { COOKIE_NAME };
