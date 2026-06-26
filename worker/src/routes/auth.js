import { jsonOk, jsonError } from "../lib/response.js";
import {
  verifyAdmin,
  setSessionCookie,
  clearSessionCookie,
  timingSafeEqual,
} from "../lib/auth.js";
import { sign as signJwt } from "../lib/jwt.js";
import { clientIP, rateLimit, escapeHtml } from "../lib/security.js";
import { notifyInfra } from "../lib/telegram.js";
import { queueAudit } from "../lib/audit-log.js";

const SESSION_TTL = 60 * 60 * 12; // 12h
const DEFAULT_ADMIN_USERNAME = "admin";
const LOGIN_FAIL_ALERT_THRESHOLD = 5; // 동일 IP 연속 실패 임계(브루트포스)

function queueTask(ctx, task) {
  if (task && typeof task.then === "function") ctx?.waitUntil?.(task);
}

// 동일 IP 로그인 실패 누적(Cache API, 1h TTL). 반환=현재 누적 실패 횟수.
async function recordLoginFailure(ip) {
  const cache = caches.default;
  const key = `https://login-fail.internal/count/${ip}`;
  const cached = await cache.match(key);
  let count = cached ? parseInt((await cached.text()) || "0", 10) || 0 : 0;
  count++;
  await cache.put(
    key,
    new Response(String(count), {
      headers: { "cache-control": "max-age=3600" },
    }),
  );
  return count;
}

// 실패 임계 초과 시 인프라봇으로 1회만 알림(동시간대 과알림 방지).
async function maybeAlertBruteforce(env, ip, username, count) {
  if (count < LOGIN_FAIL_ALERT_THRESHOLD) return;
  const cache = caches.default;
  const alertKey = `https://login-fail.internal/alert/${ip}`;
  if (await cache.match(alertKey)) return; // 이미 알림함(1h)
  await cache.put(
    alertKey,
    new Response("1", { headers: { "cache-control": "max-age=3600" } }),
  );
  await notifyInfra(
    env,
    `<b>[day1design/auth]</b> 🚨 로그인 실패 급증(브루트포스 의심)\n` +
      `IP: ${escapeHtml(ip)}\n` +
      `누적 실패: ${count}회 (임계 ${LOGIN_FAIL_ALERT_THRESHOLD})\n` +
      `시도 ID: <code>${escapeHtml(username || "-")}</code>`,
  );
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
      notifyInfra(
        env,
        `<b>[day1design/auth]</b> ⛔ 로그인 rate-limit 초과\nIP: ${escapeHtml(ip)} (${rl.count}회)`,
      ),
    );
    queueAudit(ctx, env, request, {
      type: "rate_limit",
      severity: "warn",
      status: 429,
      message: `로그인 rate-limit 초과 (${rl.count}회)`,
    });
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
    queueAudit(ctx, env, request, {
      type: "login_fail",
      severity: "warn",
      status: 401,
      username,
      message: "관리자 로그인 실패",
    });
    // 실패 누적 + 임계 초과 시 인프라봇 브루트포스 알림(응답 비차단)
    queueTask(
      ctx,
      (async () => {
        const count = await recordLoginFailure(ip);
        await maybeAlertBruteforce(env, ip, username, count);
      })(),
    );
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
  queueAudit(ctx, env, request, {
    type: "login_ok",
    severity: "info",
    status: 200,
    username,
    message: "관리자 로그인 성공",
  });
  return res;
}
