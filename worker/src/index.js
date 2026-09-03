import { handleEstimates } from "./routes/estimates.js";
import { handleHero } from "./routes/hero.js";
import { handlePopups } from "./routes/popups.js";
import { handlePortfolio } from "./routes/portfolio.js";
import { handleCommunity } from "./routes/community.js";
import { handleAuth } from "./routes/auth.js";
import { handleUpload } from "./routes/upload.js";
import {
  handleMetaLead,
  handleMetaLeadHeartbeat,
  handleMetaFormSchema,
} from "./routes/meta-lead.js";
import {
  handleAnalytics,
  runScheduledAnalyticsSnapshot,
} from "./routes/analytics.js";
import { handleHeatmap } from "./routes/heatmap.js";
import { handleExitGuard } from "./routes/exit-guard.js";
import { handleAudit } from "./routes/audit.js";
import { handleMemos, handleHistory } from "./routes/memos.js";
import { handleSms } from "./routes/sms.js";
import {
  handleMarketingLinks,
  handleSlugRedirect,
} from "./routes/marketing.js";
import {
  handleMetaAds,
  runScheduledSync,
  prewarmOverviewCache,
  runLeadRecountBackfill,
} from "./routes/meta-ads.js";
import { handleBrief } from "./routes/brief.js";
import { handleSearchVolume } from "./routes/search-volume.js";
import {
  handlePixelEvents,
  handlePixelEventsAdmin,
} from "./routes/pixel-events.js";
import { handleWorks } from "./routes/works.js";
import { handleHealth } from "./routes/healthcheck.js";
import { runAndReportHealth, healthReportTarget } from "./lib/healthcheck.js";
import { cors, preflight } from "./lib/cors.js";
import { jsonError } from "./lib/response.js";
import { notifyTelegram, notifyInfra } from "./lib/telegram.js";
import { createServices } from "./lib/services.js";
import { accessDenied, authorizeRequest } from "./lib/access.js";
import { queueAudit } from "./lib/audit-log.js";
import { captureRejectedSubmission } from "./lib/estimate-archive.js";

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
  if (!access.ok) {
    // ★보강A: 공개 견적폼 POST 가 origin 가드(인앱 웹뷰 등)에서 막히면 흔적 보존.
    // 라우트 핸들러 진입 전이라 submitEstimate 내부 안전망이 못 잡는 구간 → 여기서 캡처.
    if (
      request.method === "POST" &&
      (path === "/api/estimates" || path === "/api/estimates/")
    ) {
      ctx.waitUntil(
        captureRejectedSubmission(request, env, services, ctx, {
          outcome: "origin_denied",
          error: access.code || "origin",
        }),
      );
    }
    return cors(accessDenied(access), request, env);
  }

  if (path === "/" || path === "/api" || path === "/api/") {
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
  } else if (path === "/api/meta-lead/form-schema") {
    // 폴러가 보고한 입력폼 질문 목록 → 변경 감지·매핑 판정 (같은 META_LEAD_SECRET)
    if (request.method !== "POST") {
      res = jsonError(405, "Method Not Allowed");
    } else {
      res = await handleMetaFormSchema(request, env, ctx, services);
    }
  } else if (path === "/api/meta-lead/heartbeat") {
    // 아이맥 폴러 생존 신호 (같은 META_LEAD_SECRET 사용)
    if (request.method !== "POST") {
      res = jsonError(405, "Method Not Allowed");
    } else {
      res = await handleMetaLeadHeartbeat(request, env, ctx, services);
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
  } else if (path.startsWith("/api/popups")) {
    res = await handlePopups(request, env, ctx, services);
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
  } else if (path.startsWith("/api/exit-guard")) {
    res = await handleExitGuard(request, env, ctx);
  } else if (path.startsWith("/api/upload")) {
    res = await handleUpload(request, env, ctx, services);
  } else if (path.startsWith("/api/sms")) {
    res = await handleSms(request, env, ctx, services);
  } else if (path.startsWith("/api/marketing-links")) {
    res = await handleMarketingLinks(request, env, ctx);
  } else if (path.startsWith("/api/audit")) {
    res = await handleAudit(request, env);
  } else if (path.startsWith("/api/meta-ads")) {
    res = await handleMetaAds(request, env, ctx);
  } else if (path.startsWith("/api/brief")) {
    res = await handleBrief(request, env, ctx, services);
  } else if (path.startsWith("/api/admin/search-volume")) {
    res = await handleSearchVolume(request, env, ctx);
  } else if (path === "/api/pixel-events") {
    res = await handlePixelEvents(request, env, ctx);
  } else if (path.startsWith("/api/admin/pixel-events")) {
    res = await handlePixelEventsAdmin(request, env);
  } else if (
    path === "/api/admin/health" ||
    path.startsWith("/api/admin/health/")
  ) {
    res = await handleHealth(request, env, ctx, services);
  } else if (
    path === "/api/whoami" ||
    path === "/api/clients" ||
    path === "/api/works" ||
    path.startsWith("/api/works/")
  ) {
    res = await handleWorks(request, env, ctx, services);
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
        // admin host는 CF route가 Worker로 직접 보내므로 여기서도 처리
        // (Vercel rewrite는 CF route에 가려서 동작 안 함)
        if (!isApiHost(host) && !isAdminHost(host))
          return jsonError(404, "Not Found");
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
        notifyInfra(
          env,
          `<b>[day1design${path}]</b> 🔴 500 서버 에러\n${e.message?.slice(0, 200) || "unknown"}`,
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

  // Cron 두 종류:
  //   "0 19 * * *" 매일 KST 04:00 — meta-ads sync + analytics snapshot + 풀 헬스점검(다이제스트)
  //   "0 * * * *"  매시간 정각 — 헬스 하트비트 점검(기록만, 오류 시 텔레그램). 전원 인디케이터용.
  async scheduled(event, env, ctx) {
    const isDaily = event.cron === "0 19 * * *";
    ctx.waitUntil(
      (async () => {
        if (isDaily) {
          try {
            await runScheduledSync(env, ctx);
            // sync 로 D1 갱신된 직후 주요 필터 overview 캐시 프리워밍
            // (self-fetch refresh=1) → 사용자 첫 로드 콜드 지연 제거
            try {
              await prewarmOverviewCache(env);
            } catch {}
          } catch (e) {
            await notifyTelegram(
              env,
              `[day1design/cron] meta-ads scheduled sync 실패\n${(e?.message || "").slice(0, 200)}`,
              {
                botToken: env.META_RATE_TELEGRAM_BOT_TOKEN,
                chatId: env.META_RATE_TELEGRAM_CHAT_ID,
              },
            );
          }
          try {
            await runScheduledAnalyticsSnapshot(env, ctx);
          } catch (e) {
            await notifyTelegram(
              env,
              `[day1design/cron] analytics snapshot 실패\n${(e?.message || "").slice(0, 200)}`,
              {
                botToken: env.TELEGRAM_BOT_TOKEN,
                chatId: env.TELEGRAM_ADMIN_CHAT_ID,
              },
            );
          }
        }
        // 리드를 두 번 세던 시절의 수치를 되돌리는 일회성 백필. 이미 돌았으면
        // 스스로 건너뛰고, 실패하면 다음 cron 이 다시 시도한다.
        try {
          const recount = await runLeadRecountBackfill(env, ctx);
          if (recount?.ran) {
            await notifyTelegram(
              env,
              `[day1design/cron] Meta 리드 재집계 백필 ${recount.ok ? "완료" : "실패"}`,
              {
                botToken: env.META_RATE_TELEGRAM_BOT_TOKEN,
                chatId: env.META_RATE_TELEGRAM_CHAT_ID,
              },
            );
          }
        } catch (e) {
          await notifyTelegram(
            env,
            `[day1design/cron] Meta 리드 재집계 백필 오류\n${(e?.message || "").slice(0, 200)}`,
            {
              botToken: env.META_RATE_TELEGRAM_BOT_TOKEN,
              chatId: env.META_RATE_TELEGRAM_CHAT_ID,
            },
          );
        }

        // 헬스 점검: 매시간(하트비트, 오류만 알림) + 매일(풀 다이제스트)
        try {
          await runAndReportHealth(env, createServices(env), {
            triggeredBy: isDaily ? "cron" : "hourly",
            alertOnlyOnIssue: !isDaily,
          });
        } catch (e) {
          await notifyTelegram(
            env,
            `[day1design/cron] healthcheck 실패\n${(e?.message || "").slice(0, 200)}`,
            healthReportTarget(env) || {},
          );
        }
      })(),
    );
  },
};
