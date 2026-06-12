const MIN_SUBMIT_TIME_MS = 3000;
const RATE_LIMIT_PER_HOUR = 10;

export function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clientIP(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "0.0.0.0"
  );
}

/**
 * 허니팟/타임스탬프 검증.
 * - _hp 필드가 비어있지 않으면 봇 → fake 200 (조용히 기만)
 * - _ts 가 3초 이내면 봇 → 429
 * returns { valid: bool, fakeOk: bool, reason: string }
 */
export function checkBotTrap(fields) {
  const hp = fields._hp ?? fields.website ?? "";
  if (hp !== "") return { valid: false, fakeOk: true, reason: "honeypot" };
  const ts = Number(fields._ts || 0);
  if (ts && Date.now() - ts < MIN_SUBMIT_TIME_MS) {
    return { valid: false, fakeOk: false, reason: "too-fast" };
  }
  return { valid: true };
}

/**
 * 봇 신호 분리 — 허니팟/제출속도를 단독 boolean 으로 노출(복합신호 판정용).
 * 자동완성이 허니팟을 채운 정상고객을 '버리지 않고 살리기' 위해, 허니팟 채워짐과
 * 타이밍·기타 신호를 호출부가 조합해 봇 여부를 종합 판단한다.
 *   { honeypotFilled, tooFast, ts }
 */
export function botSignals(fields) {
  const hp = fields._hp ?? fields.website ?? "";
  const honeypotFilled = String(hp).trim() !== "";
  const ts = Number(fields._ts || 0);
  const tooFast = ts > 0 && Date.now() - ts < MIN_SUBMIT_TIME_MS;
  return { honeypotFilled, tooFast, ts };
}

/** IP 기반 Rate Limit (Cache API 사용) */
export async function rateLimit(ip, limit = RATE_LIMIT_PER_HOUR) {
  const cache = caches.default;
  const key = `https://rate-limit.internal/${ip}`;
  const cached = await cache.match(key);
  let count = 0;
  if (cached) {
    count = parseInt((await cached.text()) || "0", 10) || 0;
  }
  count++;
  if (count > limit) return { allowed: false, count };
  const res = new Response(String(count), {
    headers: { "cache-control": "max-age=3600" },
  });
  await cache.put(key, res);
  return { allowed: true, count };
}

export function validateContentType(request, expected = "application/json") {
  const ct = request.headers.get("content-type") || "";
  return ct.toLowerCase().includes(expected);
}

const URL_RE = /(https?:\/\/|www\.)/i;
export function hasUrl(s) {
  return URL_RE.test(String(s || ""));
}

export function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ""));
}

export function isValidPhone(s) {
  return /^\d{2,3}-?\d{3,4}-?\d{4}$/.test(String(s || "").replace(/\s/g, ""));
}
