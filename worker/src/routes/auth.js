import { jsonOk, jsonError } from "../lib/response.js";
import {
  verifyAdmin,
  setSessionCookie,
  clearSessionCookie,
  timingSafeEqual,
} from "../lib/auth.js";
import { sign as signJwt } from "../lib/jwt.js";
import { clientIP, rateLimit } from "../lib/security.js";
import { notifyTelegram } from "../lib/telegram.js";

const SESSION_TTL = 60 * 60 * 12; // 12h
const DEFAULT_ADMIN_USERNAME = "admin";

function queueTask(ctx, task) {
  if (task && typeof task.then === "function") ctx?.waitUntil?.(task);
}

export async function handleAuth(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth/, "");

  if (path === "/login" && request.method === "POST") {
    return loginWithPassword(request, env, ctx);
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

async function loginWithPassword(request, env, ctx) {
  const ip = clientIP(request);
  const rl = await rateLimit(`auth-login-v2:${ip}`, 20);
  if (!rl.allowed) {
    queueTask(
      ctx,
      notifyTelegram(
        env,
        `[day1design/auth] rate-limit 초과\nIP: ${ip} (${rl.count}회)`,
      ),
    );
    return jsonError(429, "Too many requests");
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const username = String(body?.username || "").trim();
  const password = typeof body?.password === "string" ? body.password : "";
  const expectedUsername = env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
  const expectedPassword = env.ADMIN_PASSWORD || "";

  if (!env.JWT_SECRET) return jsonError(500, "JWT_SECRET not configured");
  if (!expectedPassword) return jsonError(500, "ADMIN_PASSWORD not configured");

  const ok =
    timingSafeEqual(username, expectedUsername) &&
    timingSafeEqual(password, expectedPassword);
  if (!ok) {
    // 로그인 실패는 텔레그램 알림 안 함 (일상 오타 노이즈 + rate-limit 가 비정상 패턴 차단).
    // 향후 audit log 메뉴에 영속 기록 예정.
    return jsonError(401, "Invalid credentials");
  }

  const jwt = await signJwt(
    { sub: "admin", method: "password", username, ip },
    env.JWT_SECRET,
    SESSION_TTL,
  );
  // cookie + body token 이중 발급 (cross-site cookie 차단 시 클라가 localStorage 토큰으로 fallback)
  const res = jsonOk({ loggedIn: true, token: jwt });
  res.headers.append("set-cookie", setSessionCookie(jwt));
  // 접속 성공 알림은 사용자 요청으로 제거. 향후 audit log 에서만 영속 기록.
  return res;
}
