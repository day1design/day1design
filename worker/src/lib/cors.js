function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchOrigin(origin, list) {
  if (!origin) return null;
  if (list.includes(origin)) return origin;
  // Vercel preview 허용 (day1design-*.vercel.app)
  try {
    const u = new URL(origin);
    if (
      u.hostname.endsWith(".vercel.app") &&
      u.hostname.includes("day1design")
    ) {
      return origin;
    }
  } catch (e) {}
  return null;
}

export function preflight(request, env) {
  const origin = request.headers.get("origin");
  const allowed = matchOrigin(origin, getAllowedOrigins(env));
  const h = new Headers();
  if (allowed) h.set("access-control-allow-origin", allowed);
  h.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  h.set(
    "access-control-allow-headers",
    "content-type,authorization,x-admin-token",
  );
  h.set("access-control-allow-credentials", "true");
  h.set("access-control-max-age", "86400");
  h.set("vary", "origin");
  return new Response(null, { status: 204, headers: h });
}

export function cors(res, request, env) {
  const origin = request.headers.get("origin");
  const allowed = matchOrigin(origin, getAllowedOrigins(env));
  const h = new Headers(res.headers);
  if (allowed) {
    h.set("access-control-allow-origin", allowed);
    h.set("access-control-allow-credentials", "true");
    h.set("vary", "origin");
  }
  return new Response(res.body, { status: res.status, headers: h });
}
