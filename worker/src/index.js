import { handleEstimates } from "./routes/estimates.js";
import { handleHero } from "./routes/hero.js";
import { handlePortfolio } from "./routes/portfolio.js";
import { handleCommunity } from "./routes/community.js";
import { handleAuth } from "./routes/auth.js";
import { handleUpload } from "./routes/upload.js";
import { handleMetaLead } from "./routes/meta-lead.js";
import { handleMemos, handleHistory } from "./routes/memos.js";
import { cors, preflight } from "./lib/cors.js";
import { jsonError } from "./lib/response.js";
import { notifyTelegram } from "./lib/telegram.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") return preflight(request, env);

    try {
      let res;
      if (path === "/" || path === "/api") {
        res = new Response(
          JSON.stringify({ ok: true, service: "day1design-api" }),
          { headers: { "content-type": "application/json" } },
        );
      } else if (path === "/api/meta-lead") {
        // Meta Lead 수신 (서버-서버, Origin 없음 → CORS 스킵 가능하지만 일관성 위해 cors() 통과)
        if (request.method !== "POST") {
          res = jsonError(405, "Method Not Allowed");
        } else {
          res = await handleMetaLead(request, env, ctx);
        }
      } else if (path.startsWith("/api/estimates/")) {
        // 상위 세분화 라우팅
        const tail = path.slice("/api/estimates/".length);
        const memosMatch = tail.match(
          /^([a-zA-Z0-9_-]+)\/memos(?:\/([a-zA-Z0-9_-]+))?$/,
        );
        const historyMatch = tail.match(/^([a-zA-Z0-9_-]+)\/history$/);
        if (memosMatch) {
          res = await handleMemos(
            request,
            env,
            ctx,
            memosMatch[1],
            memosMatch[2],
          );
        } else if (historyMatch) {
          res = await handleHistory(request, env, ctx, historyMatch[1]);
        } else {
          // /api/estimates/:id  (PATCH 등)
          res = await handleEstimates(request, env, ctx);
        }
      } else if (path.startsWith("/api/estimates")) {
        res = await handleEstimates(request, env, ctx);
      } else if (path.startsWith("/api/hero")) {
        res = await handleHero(request, env, ctx);
      } else if (path.startsWith("/api/portfolio")) {
        res = await handlePortfolio(request, env, ctx);
      } else if (path.startsWith("/api/community")) {
        res = await handleCommunity(request, env, ctx);
      } else if (path.startsWith("/api/auth")) {
        res = await handleAuth(request, env, ctx);
      } else if (path.startsWith("/api/upload")) {
        res = await handleUpload(request, env, ctx);
      } else {
        res = jsonError(404, "Not Found");
      }

      return cors(res, request, env);
    } catch (e) {
      console.error(`[day1design/${path}]`, e);
      ctx.waitUntil(
        notifyTelegram(
          env,
          `[day1design${path}] 500\n${e.message?.slice(0, 200) || "unknown"}`,
        ),
      );
      return cors(jsonError(500, "Internal Server Error"), request, env);
    }
  },
};
