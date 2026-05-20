import { getAllowedOrigins, matchOrigin } from "./cors.js";
import { jsonError } from "./response.js";

function listEnv(env, key) {
  return String(env?.[key] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function hostnameOf(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

function isLocalOrigin(origin) {
  const host = hostnameOf(origin);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isAdminOrigin(origin, env) {
  if (!origin) return false;
  if (isLocalOrigin(origin)) return true;
  const configured = listEnv(env, "ADMIN_ORIGINS");
  if (configured.includes(origin)) return true;
  const host = hostnameOf(origin);
  return host === "admin.day1design.co.kr";
}

function isMainOrigin(origin, env) {
  if (!origin) return false;
  if (isLocalOrigin(origin)) return true;
  const configured = listEnv(env, "MAIN_ORIGINS");
  if (configured.includes(origin)) return true;
  if (configured.length) return false;
  return !isAdminOrigin(origin, env);
}

function effectiveMethod(request, opts = {}) {
  return String(
    opts.method ||
      request.headers.get("access-control-request-method") ||
      request.method ||
      "GET",
  ).toUpperCase();
}

export function classifyAccess(request, opts = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = effectiveMethod(request, opts);

  if (path === "/api/meta-lead") return { role: "integration", method, path };
  if (path === "/" || path === "/api") return { role: "main", method, path };
  if (path.startsWith("/api/auth") || path.startsWith("/api/upload")) {
    return { role: "admin", method, path };
  }
  if (path === "/api/analytics/visit") {
    return { role: method === "POST" ? "main" : "unknown", method, path };
  }
  if (path.startsWith("/api/analytics")) {
    return { role: "admin", method, path };
  }

  if (path === "/api/estimates" && method === "POST") {
    return { role: "main", method, path };
  }
  if (path.startsWith("/api/estimates")) {
    return { role: "admin", method, path };
  }

  if (path === "/api/hero/slides" && method === "GET") {
    return { role: "main", method, path };
  }
  if (path.startsWith("/api/hero")) return { role: "admin", method, path };

  if (path.startsWith("/api/portfolio")) {
    return { role: method === "GET" ? "main" : "admin", method, path };
  }

  if (path.startsWith("/api/community")) {
    return { role: method === "GET" ? "main" : "admin", method, path };
  }

  if (path.startsWith("/api/marketing-links")) {
    return { role: "admin", method, path };
  }

  if (path.startsWith("/api/audit")) {
    return { role: "admin", method, path };
  }

  return { role: "unknown", method, path };
}

export function authorizeRequest(request, env, opts = {}) {
  const rule = classifyAccess(request, opts);
  if (rule.role === "integration") return { ok: true, rule };

  let origin = request.headers.get("origin");

  // Vercel rewrite same-origin proxy 케이스: 브라우저가 same-origin 요청에
  // Origin 헤더를 안 붙이지만 Vercel proxy 가 x-forwarded-host 를 추가함.
  // 이 헤더로 admin/main host 를 추정해 fallback origin 으로 사용.
  if (!origin) {
    const xfHost = request.headers.get("x-forwarded-host") || "";
    if (xfHost) {
      const candidate = `https://${xfHost}`;
      if (isAdminOrigin(candidate, env) || isMainOrigin(candidate, env)) {
        origin = candidate;
      }
    }
  }

  const allowedOrigin = matchOrigin(origin, getAllowedOrigins(env));
  if (!allowedOrigin) {
    return {
      ok: false,
      status: 403,
      code: "origin_required",
      message: "Forbidden",
      rule,
    };
  }

  if (rule.role === "admin" && !isAdminOrigin(allowedOrigin, env)) {
    return {
      ok: false,
      status: 403,
      code: "admin_origin_required",
      message: "Forbidden",
      rule,
    };
  }

  if (
    rule.role === "main" &&
    !isMainOrigin(allowedOrigin, env) &&
    !isAdminOrigin(allowedOrigin, env)
  ) {
    return {
      ok: false,
      status: 403,
      code: "site_origin_required",
      message: "Forbidden",
      rule,
    };
  }

  return { ok: true, origin: allowedOrigin, rule };
}

export function accessDenied(access) {
  return jsonError(access.status || 403, access.message || "Forbidden", {
    code: access.code || "forbidden",
  });
}
