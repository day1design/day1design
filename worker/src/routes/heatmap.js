import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { clientIP, validateContentType, escapeHtml } from "../lib/security.js";
import { generateId } from "../lib/d1.js";
import { notifyInfra } from "../lib/telegram.js";

// 히트맵은 빈도가 높아 일반 폼 rate-limit(10/h)보다 관대
const HEATMAP_RATE_LIMIT_PER_HOUR = 1000;
const MAX_EVENTS_PER_REQUEST = 50;

// 별도 캐시 네임스페이스 (폼 rate-limit과 격리)
async function heatmapRateLimit(ip, limit = HEATMAP_RATE_LIMIT_PER_HOUR) {
  const cache = caches.default;
  const key = `https://rate-limit.heatmap.internal/${ip}`;
  const cached = await cache.match(key);
  let count = 0;
  if (cached) count = parseInt((await cached.text()) || "0", 10) || 0;
  count++;
  if (count > limit) return { allowed: false, count };
  await cache.put(
    key,
    new Response(String(count), {
      headers: { "cache-control": "max-age=3600" },
    }),
  );
  return { allowed: true, count };
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function clampInt(n, max = 100000) {
  const v = Math.floor(Number(n) || 0);
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}

// 단축 URL → 본래 페이지로 정규화 (vercel.json rewrites 동일).
// 사용자가 본 페이지 기준으로 통합 집계.
const PAGE_ALIAS = {
  "/HOUSE": "/pages/portfolio",
  "/OFFICE": "/pages/portfolio",
  "/PORTFOLIO": "/pages/portfolio",
  "/COMMUNITY": "/pages/community",
  "/Residential": "/pages/community",
  "/Commercial": "/pages/community",
  "/ESTIMATES": "/pages/estimates",
  "/ABOUT": "/pages/about",
  "/56": "/pages/project-flow",
  "/57": "/pages/about",
};

function safePage(s) {
  // 쿼리스트링·해시 제거, 끝 슬래시 정리, .html 확장자 제거 (cleanUrls 통일)
  const raw = String(s || "");
  let noQuery = raw.split("?")[0].split("#")[0];
  if (!noQuery.startsWith("/")) return "";
  // 끝 슬래시 정리 (단 루트 '/'는 유지)
  if (noQuery.length > 1) noQuery = noQuery.replace(/\/+$/, "");
  // .html 제거 (cleanUrls와 일치)
  if (noQuery.endsWith(".html")) noQuery = noQuery.slice(0, -5);
  // 단축 URL → 본래 페이지 정규화 (이중 안전망 — tracker가 못 잡은 경우 대비)
  if (PAGE_ALIAS[noQuery]) noQuery = PAGE_ALIAS[noQuery];
  return noQuery.slice(0, 200) || "/";
}

function safeStr(s, max = 100) {
  return String(s || "").slice(0, max);
}

function safeDevice(s) {
  return s === "mobile" ? "mobile" : s === "pc" ? "pc" : "";
}

function safeReferrerHost(s) {
  const raw = String(s || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.slice(0, 100);
  } catch {
    // 이미 호스트만 들어온 경우 도메인 형식만 허용
    if (/^[a-z0-9.-]+$/i.test(raw)) return raw.slice(0, 100);
    return "";
  }
}

// ─── 봇 트래픽 판별 (유입통계 오염 차단) ─────────────────────────
// 사용자 정책: 정상 검색 유입·일반(식별가능) 봇은 살리고, 그 패턴에서
//   벗어난 "위장 봇"만 차단. 비파괴 태깅(IsBot=1) → 집계에서만 제외.
// 신호 ① UA 가 봇/헤드리스/HTTP클라이언트 시그니처거나 비어있음
//      ② 검색엔진 referrer 를 달고 들어왔는데 국가가 KR 이 아님
//         (국내 전용 사업 특성상 해외發 "검색 유입"은 위조 봇으로 간주)
const BOT_UA_RE =
  /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|python|curl|wget|axios|node-fetch|go-http|java\/|okhttp|scrapy|httpclient|libwww|lighthouse|semrush|ahrefs|mj12|petalbot|dataprovider/i;
const SEARCH_REF_RE =
  /(^|\.)(google|naver|bing|daum|yahoo|yandex|baidu|duckduckgo)\./i;

function isBotUserAgent(userAgent) {
  const ua = String(userAgent || "").trim();
  if (!ua) return true; // UA 비어있음 = 봇
  return BOT_UA_RE.test(ua);
}

function isSpoofedSearch(referrerHost, country) {
  const c = String(country || "").toUpperCase();
  if (!c || c === "KR") return false; // 국가 미상/국내는 정상 취급
  return SEARCH_REF_RE.test(String(referrerHost || ""));
}

// 봇 급증 알림 — 1건마다가 아니라 시간당(엣지별) 임계치 초과 시 1회만.
// Cache API 는 콜로별이라 분산공격 시 콜로당 1회 알림될 수 있음(과알림보다 안전).
const BOT_BURST_ALERT_THRESHOLD = 50;

async function maybeAlertBotBurst(env, delta, sample) {
  try {
    const cache = caches.default;
    const hourKey = new Date().toISOString().slice(0, 13); // UTC YYYY-MM-DDThh
    const countKey = `https://bot-burst.heatmap.internal/count/${hourKey}`;
    const alertKey = `https://bot-burst.heatmap.internal/alert/${hourKey}`;

    const cached = await cache.match(countKey);
    let count = cached ? parseInt(await cached.text(), 10) || 0 : 0;
    count += delta;
    await cache.put(
      countKey,
      new Response(String(count), {
        headers: { "cache-control": "max-age=3600" },
      }),
    );
    if (count < BOT_BURST_ALERT_THRESHOLD) return;
    if (await cache.match(alertKey)) return; // 이 시간대 이미 알림함
    await cache.put(
      alertKey,
      new Response("1", { headers: { "cache-control": "max-age=3600" } }),
    );

    const s = sample || {};
    const msg =
      `[day1design/heatmap] 🤖 봇 유입 급증 감지·차단\n` +
      `위장 검색/비정상 봇 트래픽을 집계에서 자동 제외 중입니다.\n\n` +
      `• 시각(UTC): ${escapeHtml(new Date().toISOString())}\n` +
      `• 누적 봇 이벤트(이 엣지/시간): ${count}건 (임계 ${BOT_BURST_ALERT_THRESHOLD})\n` +
      `• 표본 IP: ${escapeHtml(s.ip || "-")} (${escapeHtml(s.country || "-")})\n` +
      `• 표본 유입: ${escapeHtml(s.referrer || "-")} → ${escapeHtml(s.page || "-")}\n\n` +
      `유입통계는 IsBot=0 만 집계하므로 실제 수치 영향 없음.\n` +
      `관리자 › 유입통계에서 정상 수치 확인 가능합니다.`;
    await notifyInfra(env, msg);
  } catch (_) {}
}

export async function handleHeatmap(request, env, ctx, services) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/heatmap/, "") || "/";

  if (path === "/track") {
    if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
    return trackEvents(request, env, ctx);
  }
  if (path === "/events") {
    if (request.method !== "GET") return jsonError(405, "Method Not Allowed");
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return listEvents(request, env);
  }
  if (path === "/pages") {
    if (request.method !== "GET") return jsonError(405, "Method Not Allowed");
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return listPages(request, env);
  }
  if (path === "/screenshots") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    if (request.method === "POST") return upsertScreenshot(request, env);
    if (request.method === "GET") return listScreenshots(request, env);
    return jsonError(405, "Method Not Allowed");
  }

  return jsonError(404, "Not Found");
}

async function trackEvents(request, env, ctx) {
  if (!validateContentType(request)) {
    return jsonError(415, "Unsupported Media Type");
  }
  const ip = clientIP(request);
  const rl = await heatmapRateLimit(ip);
  if (!rl.allowed) return jsonError(429, "Too Many Requests");

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const events = Array.isArray(body?.events) ? body.events : null;
  if (!events || events.length === 0) return jsonError(400, "events required");
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    return jsonError(400, `Too many events (max ${MAX_EVENTS_PER_REQUEST})`);
  }

  const cf = request.cf || {};
  const country = safeStr(cf.country, 4);
  const region = safeStr(cf.region, 80);
  const city = safeStr(cf.city, 80);
  const nowIso = new Date().toISOString();
  const uaBot = isBotUserAgent(request.headers.get("user-agent"));

  const stmts = [];
  let accepted = 0;
  let botCount = 0;
  let botSample = null;

  for (const e of events) {
    const type = e?.type;
    if (type !== "click" && type !== "scroll" && type !== "page_view") continue;
    const page = safePage(e.page);
    if (!page) continue;
    const device = safeDevice(e.device);
    if (!device) continue;

    const xPct = type === "click" ? clamp01(e.x_pct) : null;
    const yPct = type === "click" ? clamp01(e.y_pct) : null;
    const sdPct = type === "scroll" ? clamp01(e.scroll_depth_pct) : null;

    // 클릭은 좌표 필수
    if (type === "click" && (xPct === null || yPct === null)) continue;
    if (type === "scroll" && sdPct === null) continue;
    // page_view는 좌표/스크롤 불필요 (방문 자체만 기록)

    const id = generateId();
    const refHost = safeReferrerHost(e.referrer);
    const evIsBot = uaBot || isSpoofedSearch(refHost, country) ? 1 : 0;
    if (evIsBot) {
      botCount++;
      if (!botSample) {
        botSample = { ip, country, referrer: refHost, page };
      }
    }
    const sql = `INSERT INTO HeatmapEvents
      (id, Page, EventType, Device, XPct, YPct, ScrollDepthPct,
       PageW, PageH, ViewportW, ViewportH,
       SessionId, IP, Country, Region, City,
       Referrer, UtmSource, UtmMedium, UtmCampaign, CreatedAt, IsBot)
      VALUES (?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?)`;
    stmts.push(
      env.DB.prepare(sql).bind(
        id,
        page,
        type,
        device,
        xPct,
        yPct,
        sdPct,
        clampInt(e.page_w, 30000),
        clampInt(e.page_h, 100000),
        clampInt(e.viewport_w, 30000),
        clampInt(e.viewport_h, 30000),
        safeStr(e.session_id, 64),
        ip,
        country,
        region,
        city,
        refHost,
        safeStr(e?.utm?.source, 100),
        safeStr(e?.utm?.medium, 100),
        safeStr(e?.utm?.campaign, 100),
        nowIso,
        evIsBot,
      ),
    );
    accepted++;
  }

  if (stmts.length === 0) return jsonOk({ accepted: 0 });

  try {
    await env.DB.batch(stmts);
  } catch (err) {
    return jsonError(500, "DB error", { detail: String(err?.message || err) });
  }

  // 봇 급증 시 관리자 텔레그램 알림 (조용한 감지 금지 — 시간당 임계치 throttle)
  if (botCount > 0 && ctx?.waitUntil) {
    ctx.waitUntil(maybeAlertBotBurst(env, botCount, botSample));
  }

  return jsonOk({ accepted });
}

async function listEvents(request, env) {
  const url = new URL(request.url);
  const page = safePage(url.searchParams.get("page") || "");
  const device = safeDevice(url.searchParams.get("device") || "");
  const eventType = url.searchParams.get("type") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "5000"),
    5000,
  );

  const where = ["IsBot = 0"];
  const args = [];
  if (page) {
    where.push("Page = ?");
    args.push(page);
  }
  if (device === "pc" || device === "mobile") {
    where.push("Device = ?");
    args.push(device);
  }
  if (eventType === "click" || eventType === "scroll") {
    where.push("EventType = ?");
    args.push(eventType);
  }
  if (from) {
    where.push("CreatedAt >= ?");
    args.push(from);
  }
  if (to) {
    where.push("CreatedAt <= ?");
    args.push(to);
  }

  const sql = `
    SELECT id, Page, EventType, Device, XPct, YPct, ScrollDepthPct,
           PageW, PageH, ViewportW, ViewportH,
           Country, Region, City, Referrer, UtmSource,
           CreatedAt
    FROM HeatmapEvents
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY CreatedAt DESC
    LIMIT ?
  `;
  const res = await env.DB.prepare(sql)
    .bind(...args, limit)
    .all();
  return jsonOk({ events: res.results || [] });
}

async function listPages(request, env) {
  const sql = `
    SELECT
      Page,
      SUM(CASE WHEN Device='pc' THEN 1 ELSE 0 END) AS PcEvents,
      SUM(CASE WHEN Device='mobile' THEN 1 ELSE 0 END) AS MobileEvents,
      SUM(CASE WHEN EventType='click' THEN 1 ELSE 0 END) AS Clicks,
      SUM(CASE WHEN EventType='scroll' THEN 1 ELSE 0 END) AS Scrolls,
      SUM(CASE WHEN EventType='page_view' THEN 1 ELSE 0 END) AS PageViews,
      COUNT(DISTINCT SessionId) AS UniqueSessions,
      MAX(CreatedAt) AS LastEventAt
    FROM HeatmapEvents
    WHERE IsBot = 0
    GROUP BY Page
    ORDER BY Clicks DESC, Scrolls DESC
  `;
  const eventsRes = await env.DB.prepare(sql).all();
  const shotsRes = await env.DB.prepare(
    `SELECT Page, Device, Url, PageW, PageH, CapturedAt FROM HeatmapScreenshots`,
  ).all();
  return jsonOk({
    pages: eventsRes.results || [],
    screenshots: shotsRes.results || [],
  });
}

async function listScreenshots(request, env) {
  const res = await env.DB.prepare(
    `SELECT Page, Device, Url, PageW, PageH, CapturedAt FROM HeatmapScreenshots ORDER BY Page, Device`,
  ).all();
  return jsonOk({ screenshots: res.results || [] });
}

async function upsertScreenshot(request, env) {
  if (!validateContentType(request))
    return jsonError(415, "Unsupported Media Type");
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const page = safePage(body?.page);
  const device = safeDevice(body?.device);
  if (!page || !device) return jsonError(400, "page/device required");
  const url = safeStr(body?.url, 500);
  if (!url) return jsonError(400, "url required");
  const pageW = clampInt(body?.page_w, 30000);
  const pageH = clampInt(body?.page_h, 100000);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO HeatmapScreenshots (Page, Device, Url, PageW, PageH, CapturedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(Page, Device) DO UPDATE SET
       Url=excluded.Url, PageW=excluded.PageW, PageH=excluded.PageH, CapturedAt=excluded.CapturedAt`,
  )
    .bind(page, device, url, pageW, pageH, now)
    .run();

  return jsonOk({ ok: true });
}
