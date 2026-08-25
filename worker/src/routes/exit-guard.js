// ─── 이탈 방지 팝업 성과 기록·집계 ───────────────────────────────
//
// 팝업이 뜬 뒤 방문자가 어떻게 됐는지를 D1 에 남긴다. 브라우저 저장소는
// 방문자가 지우면 사라지고 집계도 불가능하므로 서버에 영속 기록한다.
//
// 붙잡은 뒤 몇 페이지를 더 봤는지는 프런트가 세지 않는다. SessionId 가 자체
// 트래커와 같은 값이라, 노출 시각 이후의 HeatmapEvents page_view 를 세면
// 서버에서 정확히 계산된다. 판정 규칙을 한 곳(서버)에만 두기 위해서다.
import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import {
  clientIP,
  validateContentType,
  safeInflowApp,
} from "../lib/security.js";
import { generateId } from "../lib/d1.js";
import {
  safePage,
  safeStr,
  safeDevice,
  safeReferrerHost,
  safeReferrerPath,
  isBotUserAgent,
  isSpoofedSearch,
} from "./heatmap.js";

const RATE_LIMIT_PER_HOUR = 300;
const MAX_EVENTS_PER_REQUEST = 5;

// 팝업 노출 뒤 결과. 이 목록에 없는 값은 버린다.
const EVENT_TYPES = new Set([
  "shown", // 팝업 노출
  "submit", // 이름·연락처 입력 후 견적 폼으로 이동
  "form_view", // 견적 폼에 실제로 도착
  "stayed", // 팝업을 닫고 사이트에 계속 머묾 (= 이탈을 막음)
  "dismissed", // "다음에 볼게요" 로 나감
  "escaped", // 팝업이 뜬 상태에서 뒤로가기로 나감
]);

// 붙잡힌 것으로 세는 결과. 폼까지 갔거나, 닫고도 사이트에 남은 경우다.
const HELD_TYPES = ["submit", "form_view", "stayed"];

async function guardRateLimit(ip) {
  const cache = caches.default;
  const key = `https://rate-limit.exitguard.internal/${ip}`;
  const cached = await cache.match(key);
  let count = 0;
  if (cached) count = parseInt((await cached.text()) || "0", 10) || 0;
  count++;
  if (count > RATE_LIMIT_PER_HOUR) return { allowed: false, count };
  await cache.put(
    key,
    new Response(String(count), {
      headers: { "cache-control": "max-age=3600" },
    }),
  );
  return { allowed: true, count };
}

export async function handleExitGuard(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/exit-guard/, "") || "/";

  if (path === "/track" && request.method === "POST") {
    return trackEvents(request, env, ctx);
  }
  if (path === "/stats" && request.method === "GET") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return stats(request, env);
  }
  return jsonError(404, "Not found");
}

async function trackEvents(request, env, ctx) {
  const ip = clientIP(request);
  if (!validateContentType(request)) return jsonError(415, "Unsupported type");

  const rl = await guardRateLimit(ip);
  if (!rl.allowed) return jsonError(429, "Too many requests");

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const events = Array.isArray(body?.events)
    ? body.events.slice(0, MAX_EVENTS_PER_REQUEST)
    : [];
  if (!events.length) return jsonOk({ stored: 0 });

  const cf = request.cf || {};
  const country = safeStr(cf.country, 2);
  const region = safeStr(cf.region, 100);
  const city = safeStr(cf.city, 100);
  const uaBot = isBotUserAgent(request.headers.get("user-agent"));
  const nowIso = new Date().toISOString();
  const dayKey = nowIso.slice(0, 10);

  const rows = [];
  for (const e of events) {
    const type = String(e?.type || "");
    if (!EVENT_TYPES.has(type)) continue;
    const page = safePage(e.page);
    if (!page) continue;
    const refHost = safeReferrerHost(e.referrer);
    const isBot = uaBot || isSpoofedSearch(refHost, country) ? 1 : 0;
    rows.push([
      generateId(),
      safeStr(e.session_id, 64),
      type,
      page,
      safeDevice(e.device),
      Math.max(0, Math.min(99, parseInt(e.shown_seq, 10) || 0)),
      Math.max(0, Math.min(86400000, parseInt(e.held_ms, 10) || 0)),
      refHost,
      refHost ? safeReferrerPath(e.referrer_path) : "",
      safeStr(e?.utm?.source, 100),
      safeStr(e?.utm?.medium, 100),
      safeStr(e?.utm?.campaign, 100),
      safeInflowApp(e.inflow_app),
      ip,
      country,
      region,
      city,
      isBot,
      nowIso,
      dayKey,
    ]);
  }
  if (!rows.length) return jsonOk({ stored: 0 });

  const values = rows
    .map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .join(", ");
  const stmt = env.DB.prepare(
    `INSERT INTO ExitGuardEvents
       (id, SessionId, EventType, Page, Device, ShownSeq, HeldMs,
        Referrer, RefPath, UtmSource, UtmMedium, UtmCampaign, InflowApp,
        IP, Country, Region, City, IsBot, CreatedAt, DayKey)
     VALUES ${values}`,
  ).bind(...rows.flat());

  // 적재 실패가 방문자 화면을 막지 않게 waitUntil 로 분리한다. 이 기록은
  // 통계용이라 유실돼도 접수에는 영향이 없다.
  ctx.waitUntil(stmt.run().catch(() => {}));
  return jsonOk({ stored: rows.length });
}

async function stats(request, env) {
  const url = new URL(request.url);
  const days = Math.min(
    365,
    Math.max(1, parseInt(url.searchParams.get("days"), 10) || 30),
  );
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const sinceDay = sinceIso.slice(0, 10);

  const heldList = HELD_TYPES.map((t) => `'${t}'`).join(",");

  // D1 subrequest 상한을 고려해 batch 한 번으로 묶는다.
  const [byType, byDay, byChannel, retention, converted] = await env.DB.batch([
    env.DB.prepare(
      `SELECT EventType, COUNT(*) AS n, COUNT(DISTINCT SessionId) AS sessions
         FROM ExitGuardEvents
        WHERE IsBot = 0 AND DayKey >= ?
        GROUP BY EventType`,
    ).bind(sinceDay),
    env.DB.prepare(
      `SELECT DayKey,
              SUM(CASE WHEN EventType = 'shown' THEN 1 ELSE 0 END) AS shown,
              SUM(CASE WHEN EventType IN (${heldList}) THEN 1 ELSE 0 END) AS held
         FROM ExitGuardEvents
        WHERE IsBot = 0 AND DayKey >= ?
        GROUP BY DayKey
        ORDER BY DayKey`,
    ).bind(sinceDay),
    env.DB.prepare(
      `SELECT CASE WHEN UtmSource <> '' THEN UtmSource
                   WHEN Referrer <> '' THEN Referrer
                   ELSE '(direct)' END AS channel,
              SUM(CASE WHEN EventType = 'shown' THEN 1 ELSE 0 END) AS shown,
              SUM(CASE WHEN EventType IN (${heldList}) THEN 1 ELSE 0 END) AS held
         FROM ExitGuardEvents
        WHERE IsBot = 0 AND DayKey >= ?
        GROUP BY channel
        ORDER BY shown DESC
        LIMIT 15`,
    ).bind(sinceDay),
    // 붙잡은 뒤 실제로 더 봤는가 — 노출 시각 이후 같은 세션의 page_view 수.
    // 이 수치가 "얼마나 방문이 유지됐는가" 의 직접 측정이다.
    env.DB.prepare(
      `SELECT COUNT(*) AS held_sessions,
              SUM(after_views) AS after_views,
              SUM(CASE WHEN after_views > 0 THEN 1 ELSE 0 END) AS with_more
         FROM (
           SELECT g.SessionId,
                  (SELECT COUNT(*) FROM HeatmapEvents h
                    WHERE h.SessionId = g.SessionId
                      AND h.EventType = 'page_view'
                      AND h.IsBot = 0
                      AND h.CreatedAt > g.first_shown) AS after_views
             FROM (SELECT SessionId, MIN(CreatedAt) AS first_shown
                     FROM ExitGuardEvents
                    WHERE IsBot = 0 AND DayKey >= ? AND EventType = 'shown'
                      AND SessionId <> ''
                    GROUP BY SessionId) g
         )`,
    ).bind(sinceDay),
    // 팝업을 거쳐 실제 접수까지 간 건수 (작성중 = 아직 미완주)
    env.DB.prepare(
      `SELECT COUNT(*) AS completed,
              SUM(CASE WHEN Status = '작성중' THEN 1 ELSE 0 END) AS pending
         FROM Estimates
        WHERE FormType = 'exit_guard' AND SubmittedAt >= ?`,
    ).bind(sinceIso),
  ]);

  const counts = {};
  const sessions = {};
  for (const r of byType.results || []) {
    counts[r.EventType] = r.n || 0;
    sessions[r.EventType] = r.sessions || 0;
  }
  const shown = counts.shown || 0;
  const held = HELD_TYPES.reduce((sum, t) => sum + (counts[t] || 0), 0);
  const ret = (retention.results || [])[0] || {};
  const conv = (converted.results || [])[0] || {};
  const completed = conv.completed || 0;
  const pending = conv.pending || 0;

  return jsonOk({
    days,
    funnel: {
      shown,
      shownSessions: sessions.shown || 0,
      held,
      stayed: counts.stayed || 0,
      submit: counts.submit || 0,
      formView: counts.form_view || 0,
      dismissed: counts.dismissed || 0,
      escaped: counts.escaped || 0,
      // 팝업을 거쳐 견적 접수를 끝낸 건수 (Estimates 기준, 작성중 제외)
      completed: Math.max(0, completed - pending),
      pending,
      holdRate: shown ? Math.round((held / shown) * 1000) / 10 : 0,
    },
    retention: {
      heldSessions: ret.held_sessions || 0,
      // 붙잡힌 뒤 페이지를 더 본 세션 수와 그 총 페이지뷰
      sessionsWithMoreViews: ret.with_more || 0,
      afterViews: ret.after_views || 0,
      avgAfterViews:
        ret.held_sessions > 0
          ? Math.round(((ret.after_views || 0) / ret.held_sessions) * 100) / 100
          : 0,
    },
    daily: (byDay.results || []).map((r) => ({
      day: r.DayKey,
      shown: r.shown || 0,
      held: r.held || 0,
    })),
    channels: (byChannel.results || []).map((r) => ({
      channel: r.channel,
      shown: r.shown || 0,
      held: r.held || 0,
    })),
  });
}
