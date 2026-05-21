import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { clientIP, validateContentType } from "../lib/security.js";
import { generateId } from "../lib/d1.js";

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

  const stmts = [];
  let accepted = 0;

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
    const sql = `INSERT INTO HeatmapEvents
      (id, Page, EventType, Device, XPct, YPct, ScrollDepthPct,
       PageW, PageH, ViewportW, ViewportH,
       SessionId, IP, Country, Region, City,
       Referrer, UtmSource, UtmMedium, UtmCampaign, CreatedAt)
      VALUES (?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?,?)`;
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
        safeReferrerHost(e.referrer),
        safeStr(e?.utm?.source, 100),
        safeStr(e?.utm?.medium, 100),
        safeStr(e?.utm?.campaign, 100),
        nowIso,
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

  const where = [];
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
