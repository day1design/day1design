import { handleEstimates } from "./routes/estimates.js";
import { handleHero } from "./routes/hero.js";
import { handlePortfolio } from "./routes/portfolio.js";
import { handleCommunity } from "./routes/community.js";
import { handleAuth } from "./routes/auth.js";
import { handleUpload } from "./routes/upload.js";
import { handleMetaLead } from "./routes/meta-lead.js";
import { handleAnalytics } from "./routes/analytics.js";
import { handleHeatmap } from "./routes/heatmap.js";
import { handleAudit } from "./routes/audit.js";
import { handleMemos, handleHistory } from "./routes/memos.js";
import { handleSms } from "./routes/sms.js";
import {
  handleMarketingLinks,
  handleSlugRedirect,
} from "./routes/marketing.js";
import { cors, preflight } from "./lib/cors.js";
import { jsonError } from "./lib/response.js";
import { notifyTelegram } from "./lib/telegram.js";
import { createServices } from "./lib/services.js";
import { accessDenied, authorizeRequest } from "./lib/access.js";
import { queueAudit } from "./lib/audit-log.js";

const API_HOST = "api.day1design.co.kr";
const WORKERS_DEV_HOST = "day1design-api.day1design-co.workers.dev";
const ADMIN_HOST = "admin.day1design.co.kr";
const MAIN_HOSTS = new Set(["day1design.co.kr", "www.day1design.co.kr"]);

function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isApiHost(host) {
  return (
    host === API_HOST ||
    host === WORKERS_DEV_HOST ||
    host.startsWith("api.") ||
    isLocalHost(host)
  );
}

function isAdminHost(host) {
  return host === ADMIN_HOST || host.startsWith("admin.") || isLocalHost(host);
}

function isMainHost(host) {
  return MAIN_HOSTS.has(host) || isLocalHost(host);
}

function isApiPath(path) {
  return path === "/api" || path.startsWith("/api/");
}

function hasExtension(path) {
  const last = path.split("/").pop() || "";
  return last.includes(".");
}

function withPath(request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  return new Request(url.toString(), request);
}

async function fetchAsset(request, env, path) {
  if (!env.ASSETS) {
    return jsonError(503, "Static assets are not configured");
  }
  return env.ASSETS.fetch(withPath(request, path));
}

function htmlPath(path) {
  if (path === "/" || path === "") return "/index.html";
  if (path.endsWith("/")) return `${path}index.html`;
  if (!hasExtension(path)) return `${path}.html`;
  return path;
}

function adminAssetPath(path) {
  if (path === "/" || path === "") return "/admin/login.html";
  const scoped = path.startsWith("/admin/") ? path : `/admin${path}`;
  return htmlPath(scoped);
}

function mainAssetPath(path) {
  return htmlPath(path);
}

function withStaticHeaders(response, host) {
  const headers = new Headers(response.headers);
  if (host === ADMIN_HOST || host.startsWith("admin.")) {
    headers.set("x-robots-tag", "noindex, nofollow");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "no-referrer");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleStatic(request, env, host, path) {
  const assetPath = isAdminHost(host)
    ? adminAssetPath(path)
    : mainAssetPath(path);
  let response = await fetchAsset(request, env, assetPath);
  if (response.status === 404 && assetPath !== path) {
    response = await fetchAsset(request, env, path);
  }
  return withStaticHeaders(response, host);
}

async function handleApi(request, env, ctx, path) {
  let res;
  const services = createServices(env);
  const access = authorizeRequest(request, env);
  if (!access.ok) return cors(accessDenied(access), request, env);

  if (path === "/" || path === "/api") {
    res = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } else if (path === "/api/meta-lead") {
    // Meta Lead is server-to-server and still requires its route secret.
    if (request.method !== "POST") {
      res = jsonError(405, "Method Not Allowed");
    } else {
      res = await handleMetaLead(request, env, ctx, services);
    }
  } else if (path.startsWith("/api/estimates/")) {
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
        services,
      );
    } else if (historyMatch) {
      res = await handleHistory(request, env, ctx, historyMatch[1], services);
    } else {
      res = await handleEstimates(request, env, ctx, services);
    }
  } else if (path.startsWith("/api/estimates")) {
    res = await handleEstimates(request, env, ctx, services);
  } else if (path.startsWith("/api/hero")) {
    res = await handleHero(request, env, ctx, services);
  } else if (path.startsWith("/api/portfolio")) {
    res = await handlePortfolio(request, env, ctx, services);
  } else if (path.startsWith("/api/community")) {
    res = await handleCommunity(request, env, ctx, services);
  } else if (path.startsWith("/api/auth")) {
    res = await handleAuth(request, env, ctx);
  } else if (path.startsWith("/api/analytics")) {
    res = await handleAnalytics(request, env, ctx, services);
  } else if (path.startsWith("/api/heatmap")) {
    res = await handleHeatmap(request, env, ctx, services);
  } else if (path.startsWith("/api/upload")) {
    res = await handleUpload(request, env, ctx, services);
  } else if (path.startsWith("/api/sms")) {
    res = await handleSms(request, env, ctx, services);
  } else if (path.startsWith("/api/marketing-links")) {
    res = await handleMarketingLinks(request, env, ctx);
  } else if (path.startsWith("/api/audit")) {
    res = await handleAudit(request, env);
  } else {
    res = jsonError(404, "Not Found");
  }

  return cors(res, request, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      if (!isApiHost(host)) return jsonError(404, "Not Found");
      const access = authorizeRequest(request, env);
      if (!access.ok) return accessDenied(access);
      return preflight(request, env);
    }

    try {
      if (path === "/" && isApiHost(host)) {
        return handleApi(request, env, ctx, path);
      }

      if (isApiPath(path)) {
        if (!isApiHost(host)) return jsonError(404, "Not Found");
        return handleApi(request, env, ctx, path);
      }

      // 공개 마케팅 슬러그 리다이렉트: day1design.co.kr/r/<slug>
      // Vercel 프록시 경유 시 호스트가 workers.dev/api.* 일 수 있어 호스트 무관 매칭.
      if (path.startsWith("/r/")) {
        return handleSlugRedirect(request, env, ctx, path.slice(3));
      }

      if (isMainHost(host) || isAdminHost(host)) {
        return handleStatic(request, env, host, path);
      }

      return jsonError(404, "Not Found");
    } catch (e) {
      console.error(`[day1design/${path}]`, e);
      ctx.waitUntil(
        notifyTelegram(
          env,
          `[day1design${path}] 500\n${e.message?.slice(0, 200) || "unknown"}`,
        ),
      );
      queueAudit(ctx, env, request, {
        type: "error_5xx",
        severity: "error",
        status: 500,
        message: e?.message?.slice(0, 200) || "unknown error",
        payload: {
          name: e?.name || "",
          stack: (e?.stack || "").slice(0, 4000),
        },
      });
      return cors(jsonError(500, "Internal Server Error"), request, env);
    }
  },
};
