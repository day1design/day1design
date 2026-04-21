import { jsonOk, jsonError } from "../lib/response.js";
import { setAdminCookie, clearAdminCookie, verifyAdmin } from "../lib/auth.js";

export async function handleAuth(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth/, "");

  if (path === "/login" && request.method === "POST") {
    if (!env.ADMIN_TOKEN) return jsonError(500, "ADMIN_TOKEN not configured");
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const token = String(body?.token || "");
    if (token !== env.ADMIN_TOKEN) return jsonError(401, "Invalid credentials");
    const res = jsonOk({ loggedIn: true });
    res.headers.append("set-cookie", setAdminCookie(env.ADMIN_TOKEN));
    return res;
  }

  if (path === "/logout" && request.method === "POST") {
    const res = jsonOk({ loggedIn: false });
    res.headers.append("set-cookie", clearAdminCookie());
    return res;
  }

  if (path === "/me" && request.method === "GET") {
    return jsonOk({ loggedIn: verifyAdmin(request, env) });
  }

  return jsonError(404, "Not Found");
}
