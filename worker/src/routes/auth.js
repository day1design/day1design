import { jsonOk, jsonError } from "../lib/response.js";
import {
  verifyAdmin,
  setSessionCookie,
  clearSessionCookie,
  timingSafeEqual,
} from "../lib/auth.js";
import {
  generateCode,
  generateCodeId,
  sendLoginCode,
} from "../lib/telegram-auth.js";
import { sign as signJwt } from "../lib/jwt.js";
import { clientIP, rateLimit } from "../lib/security.js";
import { notifyTelegram } from "../lib/telegram.js";

const CHALLENGE_TTL = 300; // 5분
const SESSION_TTL = 60 * 60 * 12; // 12h
const CHALLENGE_PREFIX = "https://internal.day1design/auth-challenge/";

export async function handleAuth(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth/, "");

  if (path === "/request" && request.method === "POST") {
    return requestCode(request, env, ctx);
  }
  if (path === "/verify" && request.method === "POST") {
    return verifyCode(request, env, ctx);
  }
  if (path === "/login" && request.method === "POST") {
    return legacyTokenLogin(request, env, ctx);
  }
  if (path === "/logout" && request.method === "POST") {
    const res = jsonOk({ loggedIn: false });
    res.headers.append("set-cookie", clearSessionCookie());
    return res;
  }
  if (path === "/me" && request.method === "GET") {
    const ok = await verifyAdmin(request, env);
    return jsonOk({ loggedIn: ok });
  }
  return jsonError(404, "Not Found");
}

async function requestCode(request, env, ctx) {
  const ip = clientIP(request);
  const rl = await rateLimit(`auth-code:${ip}`, 5); // 시간당 5회
  if (!rl.allowed) {
    ctx.waitUntil(
      notifyTelegram(
        env,
        `[day1design/auth] rate-limit 초과\nIP: ${ip} (${rl.count}회)`,
      ),
    );
    return jsonError(429, "Too many requests");
  }
  if (
    !env.TELEGRAM_BOT_TOKEN ||
    (!env.TELEGRAM_ADMIN_CHAT_ID && !env.TELEGRAM_CHAT_ID)
  ) {
    return jsonError(500, "Telegram auth not configured");
  }

  const code = generateCode();
  const codeId = generateCodeId();
  // Cache API에 저장 (자동 TTL)
  await caches.default.put(
    `${CHALLENGE_PREFIX}${codeId}`,
    new Response(code, {
      headers: { "cache-control": `max-age=${CHALLENGE_TTL}` },
    }),
  );
  try {
    await sendLoginCode(env, code, ip);
  } catch (e) {
    return jsonError(500, `Failed to send code: ${e.message.slice(0, 200)}`);
  }
  return jsonOk({ codeId, ttl: CHALLENGE_TTL });
}

async function verifyCode(request, env, ctx) {
  const ip = clientIP(request);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const codeId = String(body?.codeId || "");
  const inputCode = String(body?.code || "")
    .toUpperCase()
    .trim();
  if (!/^[0-9a-f]{32}$/.test(codeId)) return jsonError(400, "Invalid codeId");
  if (!/^[A-Z0-9]{4,8}$/.test(inputCode))
    return jsonError(400, "Invalid code format");

  const cacheKey = `${CHALLENGE_PREFIX}${codeId}`;
  const cached = await caches.default.match(cacheKey);
  if (!cached) return jsonError(401, "Code expired or invalid");
  const stored = (await cached.text()).trim();

  if (!timingSafeEqual(stored, inputCode)) {
    ctx.waitUntil(
      notifyTelegram(env, `[day1design/auth] 로그인 코드 불일치\nIP: ${ip}`),
    );
    return jsonError(401, "Code mismatch");
  }

  // 일회용 → 소비
  await caches.default.delete(cacheKey);

  if (!env.JWT_SECRET) return jsonError(500, "JWT_SECRET not configured");

  const jwt = await signJwt(
    { sub: "admin", method: "tg", ip },
    env.JWT_SECRET,
    SESSION_TTL,
  );
  const res = jsonOk({ loggedIn: true });
  res.headers.append("set-cookie", setSessionCookie(jwt));
  ctx.waitUntil(
    notifyTelegram(
      env,
      `[day1design/auth] 관리자 로그인 성공 (Telegram 코드)\nIP: ${ip}`,
    ),
  );
  return res;
}

async function legacyTokenLogin(request, env, ctx) {
  if (!env.ADMIN_TOKEN) return jsonError(500, "ADMIN_TOKEN not configured");
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const token = String(body?.token || "");
  if (!timingSafeEqual(token, env.ADMIN_TOKEN)) {
    return jsonError(401, "Invalid credentials");
  }
  if (!env.JWT_SECRET) return jsonError(500, "JWT_SECRET not configured");

  const jwt = await signJwt(
    { sub: "admin", method: "token", ip: clientIP(request) },
    env.JWT_SECRET,
    SESSION_TTL,
  );
  const res = jsonOk({ loggedIn: true });
  res.headers.append("set-cookie", setSessionCookie(jwt));
  ctx.waitUntil(
    notifyTelegram(
      env,
      `[day1design/auth] 관리자 로그인 성공 (비상 토큰)\nIP: ${clientIP(request)}`,
    ),
  );
  return res;
}
