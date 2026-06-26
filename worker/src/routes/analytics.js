import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { randomId } from "../lib/r2.js";
import { createServices } from "../lib/services.js";
import { clientIP, rateLimit, validateContentType } from "../lib/security.js";

const SOURCE = "google";
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
// 구글 API(GA4/GSC/OAuth) 동기 대기 상한. 초과 시 AbortSignal 로 즉시 실패 →
// getSummary 가 stale 스냅샷으로 폴백. (옛: 타임아웃 없어 구글 지연 시 최대 30초 행 → 500)
const EXTERNAL_FETCH_TIMEOUT_MS = 4500;
// 자체측정 통계 엣지 캐시(초). /summary 는 캐시 hit 여도 fetchSelfStats(8 D1쿼리)를
// 매번 재실행하던 것을 60초 캐시로 절감. 60초 staleness 는 유입통계에 무해.
const SELF_STATS_TTL_S = 60;
const DEFAULT_SITE_URL = "https://day1design.co.kr/";
const VISIT_TRACK_RATE_LIMIT_PER_HOUR = 240;
const VISITOR_LOCATION_LIMIT = 5;
const VISITOR_DETAIL_MONTH_LIMIT = 36;
const VISITOR_DETAIL_DAY_LIMIT = 370;
const VISITOR_DETAIL_EVENT_LIMIT = 80;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SOURCE_CHANNELS = {
  instagram_ad: "[AD]IG",
  instagram: "IG",
  facebook_ad: "[AD]FB",
  facebook: "FB",
  threads: "Threads",
  meta: "Meta",
  google: "Google",
  naver: "Naver",
  youtube: "YouTube",
  kakao: "Kakao",
  direct: "Direct",
  search: "Search",
  social: "Social",
  referral: "Referral",
  other: "Other",
};

export async function handleAnalytics(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/analytics/, "") || "/";

  if (path === "/visit") {
    if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
    return trackVisitor(request, env, ctx, services);
  }

  if (path === "/visitor-locations" && request.method === "GET") {
    if (!(await verifyAdmin(request, env))) {
      return jsonError(401, "Unauthorized");
    }
    return getVisitorLocations(request, env);
  }

  if (path === "/visitor-locations/detail" && request.method === "GET") {
    if (!(await verifyAdmin(request, env))) {
      return jsonError(401, "Unauthorized");
    }
    return getVisitorLocationDetail(request, env);
  }

  if (path === "/summary" && request.method === "GET") {
    if (!(await verifyAdmin(request, env))) {
      return jsonError(401, "Unauthorized");
    }
    return getSummary(request, env, services, ctx);
  }

  if (
    path === "/target" &&
    (request.method === "GET" || request.method === "PUT")
  ) {
    if (!(await verifyAdmin(request, env))) {
      return jsonError(401, "Unauthorized");
    }
    return handleTarget(request, services);
  }

  if (path === "/funnel" && request.method === "GET") {
    if (!(await verifyAdmin(request, env))) {
      return jsonError(401, "Unauthorized");
    }
    return getFunnel(request, env);
  }

  return jsonError(404, "Not Found");
}

// 퍼널 이동경로 — 자체 트래커 SessionId 기반 3단계 흐름
//   1) 최초 진입 페이지 TOP 5
//   2) 같은 SessionId 의 2번째 page_view 페이지 TOP 5
//   3) 전환율 = 견적 접수 / 터치
async function getFunnel(request, env) {
  const range = resolveRange(new URL(request.url));
  const startDate = range.startDate;
  const endDate = range.endDate;

  const result = {
    range,
    firstPages: [],
    secondPages: [],
    touches: 0,
    submissions: 0,
    conversionRate: 0,
  };

  try {
    // SessionId 별 첫 page_view (가장 오래된 CreatedAt) 의 Page → 1단계
    const stage1 = await env.DB.prepare(
      `WITH first_event AS (
         SELECT SessionId, Page,
                ROW_NUMBER() OVER (PARTITION BY SessionId ORDER BY CreatedAt ASC) AS rn
         FROM HeatmapEvents
         WHERE EventType = 'page_view'
           AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
           AND SessionId != ''
           AND IsBot = 0
       )
       SELECT Page, COUNT(*) AS Cnt
       FROM first_event
       WHERE rn = 1
       GROUP BY Page
       ORDER BY Cnt DESC
       LIMIT 5`,
    )
      .bind(startDate, endDate)
      .all();

    // SessionId 별 두 번째 page_view 페이지 → 2단계
    const stage2 = await env.DB.prepare(
      `WITH ordered AS (
         SELECT SessionId, Page,
                ROW_NUMBER() OVER (PARTITION BY SessionId ORDER BY CreatedAt ASC) AS rn
         FROM HeatmapEvents
         WHERE EventType = 'page_view'
           AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
           AND SessionId != ''
           AND IsBot = 0
       )
       SELECT Page, COUNT(*) AS Cnt
       FROM ordered
       WHERE rn = 2
       GROUP BY Page
       ORDER BY Cnt DESC
       LIMIT 5`,
    )
      .bind(startDate, endDate)
      .all();

    // 터치(고유 SessionId 수)
    const touchesRow = await env.DB.prepare(
      `SELECT COUNT(DISTINCT SessionId) AS Cnt
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND SessionId != ''
         AND IsBot = 0`,
    )
      .bind(startDate, endDate)
      .first();

    // 견적 접수 수 (KST 변환 없이 SubmittedAt UTC ISO 첫 10자 비교 — Estimates는 UTC 저장)
    const subsRow = await env.DB.prepare(
      `SELECT COUNT(*) AS Cnt FROM Estimates
       WHERE substr(datetime(SubmittedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?`,
    )
      .bind(startDate, endDate)
      .first();

    const touches = Number(touchesRow?.Cnt || 0);
    const submissions = Number(subsRow?.Cnt || 0);
    const total1 = (stage1.results || []).reduce(
      (a, b) => a + Number(b.Cnt || 0),
      0,
    );
    const total2 = (stage2.results || []).reduce(
      (a, b) => a + Number(b.Cnt || 0),
      0,
    );

    result.firstPages = (stage1.results || []).map((r) => ({
      page: String(r.Page || "/"),
      count: Number(r.Cnt || 0),
      pct: total1 > 0 ? Number(r.Cnt || 0) / total1 : 0,
    }));
    result.secondPages = (stage2.results || []).map((r) => ({
      page: String(r.Page || "/"),
      count: Number(r.Cnt || 0),
      pct: total2 > 0 ? Number(r.Cnt || 0) / total2 : 0,
    }));
    result.touches = touches;
    result.submissions = submissions;
    result.conversionRate = touches > 0 ? submissions / touches : 0;
  } catch (e) {
    // SQL 실패해도 빈 결과 반환 (404 아닌)
  }

  return jsonOk(result);
}

async function handleTarget(request, services) {
  if (!services.adminSettings) return jsonError(500, "Settings unavailable");
  if (request.method === "GET") {
    const url = new URL(request.url);
    const raw =
      url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const monthKey = normalizeMonthKey(raw);
    if (!monthKey) return jsonError(400, "Invalid month");
    return jsonOk(await readTargetSetting(services, monthKey));
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const monthKey = normalizeMonthKey(body?.monthKey || body?.month);
  if (!monthKey) return jsonError(400, "Invalid month");
  const manual = Boolean(body?.manual);
  const rawValue = Number(body?.value || 0);
  const value = Math.max(0, Math.min(100000, Math.round(rawValue)));
  const payload = {
    monthKey,
    manual,
    value,
    updatedAt: new Date().toISOString(),
  };
  const id = targetSettingId(monthKey);
  const fields = {
    Value: JSON.stringify(payload),
    UpdatedAt: payload.updatedAt,
  };
  try {
    await services.adminSettings.update(id, fields);
  } catch (e) {
    if (!e?.notFound) throw e;
    await services.adminSettings.create({ __id: id, ...fields });
  }
  return jsonOk(payload);
}

async function readTargetSetting(services, monthKey) {
  try {
    const record = await services.adminSettings.get(targetSettingId(monthKey));
    const value = JSON.parse(record.fields?.Value || "{}");
    return {
      monthKey,
      manual: Boolean(value.manual),
      value: Math.max(0, Math.round(Number(value.value || 0))),
      updatedAt: value.updatedAt || record.fields?.UpdatedAt || null,
    };
  } catch (e) {
    if (!e?.notFound) throw e;
    return { monthKey, manual: false, value: 0, updatedAt: null };
  }
}

function targetSettingId(monthKey) {
  return `analytics-target:${monthKey}`;
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : "";
}

async function trackVisitor(request, env, ctx, services) {
  if (!validateContentType(request, "application/json")) {
    return jsonError(415, "Unsupported Media Type");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const ip = primaryIp(clientIP(request));
  const limit = await visitorTrackLimit(ip);
  if (!limit.allowed) {
    return jsonOk({ tracked: false, limited: true });
  }

  try {
    const event = await buildVisitorEvent(request, env, body, ip);
    if (isSkippableVisitPath(event.path)) {
      return jsonOk({ tracked: false, skipped: true });
    }
    const stored = await writeVisitorD1(env, event);
    if (stored) archiveVisitorEvent(ctx, services, event);
    return jsonOk({ tracked: Boolean(stored) });
  } catch (e) {
    console.warn("[analytics/visit] tracking skipped:", e?.message || e);
    return jsonOk({ tracked: false });
  }
}

async function visitorTrackLimit(ip) {
  try {
    return await rateLimit(
      `analytics-visit:${ip || "unknown"}`,
      VISIT_TRACK_RATE_LIMIT_PER_HOUR,
    );
  } catch {
    return { allowed: true, count: 0 };
  }
}

async function buildVisitorEvent(request, env, body, ip) {
  const now = new Date();
  const { dayKey: eventDayKey, hourKey } = kstKeys(now);
  const cf = request.cf || {};
  const country = cleanGeo(cf.country || request.headers.get("cf-ipcountry"));
  const region = cleanGeo(cf.region || cf.regionCode);
  const city = cleanGeo(cf.city);
  const timezone = cleanGeo(cf.timezone) || "Asia/Seoul";
  const locationKey =
    [country, region, city]
      .map((value) => value.toLowerCase())
      .filter(Boolean)
      .join("|") || "unknown";
  const path = safeText(body?.path || "/", 240);
  const rawR2Key = `analytics/ip-checks/${eventDayKey}/${hourKey.slice(11)}-${Date.now()}-${randomId(10)}.json`;
  const salt = env.IP_HASH_SALT || env.JWT_SECRET || "";

  return {
    id: `vst${Date.now().toString(36)}${randomId(10)}`,
    eventAt: now.toISOString(),
    dayKey: eventDayKey,
    hourKey,
    ipHash: await hashText(`${salt}:${ip}`),
    ipPrefix: maskIp(ip),
    country,
    region,
    city,
    timezone,
    latitude: cleanGeo(cf.latitude),
    longitude: cleanGeo(cf.longitude),
    locationKey,
    path,
    referrerHost: referrerHost(body?.referrer || ""),
    userAgentHash: await hashText(request.headers.get("user-agent") || ""),
    rawR2Key,
    createdAt: now.toISOString(),
  };
}

function primaryIp(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .slice(0, 80);
}

function cleanGeo(value) {
  return safeText(value, 80);
}

function safeText(value, max = 120) {
  return String(value || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, max);
}

function referrerHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return safeText(new URL(raw).hostname, 120);
  } catch {
    return "";
  }
}

function isSkippableVisitPath(path) {
  const p = String(path || "").toLowerCase();
  return (
    p.startsWith("/admin") ||
    p.startsWith("/api") ||
    /\.(css|js|png|jpe?g|webp|gif|svg|ico|woff2?)$/.test(p)
  );
}

function kstKeys(date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  return { dayKey: day, hourKey: `${day}T${h}` };
}

async function hashText(value) {
  const input = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function maskIp(ip) {
  const text = primaryIp(ip);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)) {
    const parts = text.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (text.includes(":")) {
    const parts = text.split(":").filter(Boolean).slice(0, 4);
    return parts.length ? `${parts.join(":")}::/64` : "";
  }
  return "";
}

async function writeVisitorD1(env, event) {
  if (!env.DB) return false;
  const existing = await env.DB.prepare(
    `SELECT 1 FROM VisitorLocationIpHourly
       WHERE HourKey = ? AND LocationKey = ? AND IpHash = ?
       LIMIT 1`,
  )
    .bind(event.hourKey, event.locationKey, event.ipHash)
    .first();
  const uniqueDelta = existing ? 0 : 1;

  await env.DB.prepare(
    `INSERT INTO VisitorIpEvents (
        id, EventAt, DayKey, HourKey, IpHash, IpPrefix, Country, Region, City,
        Timezone, Latitude, Longitude, LocationKey, Path, ReferrerHost,
        UserAgentHash, RawR2Key, CreatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      event.id,
      event.eventAt,
      event.dayKey,
      event.hourKey,
      event.ipHash,
      event.ipPrefix,
      event.country,
      event.region,
      event.city,
      event.timezone,
      event.latitude,
      event.longitude,
      event.locationKey,
      event.path,
      event.referrerHost,
      event.userAgentHash,
      event.rawR2Key,
      event.createdAt,
    )
    .run();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO VisitorLocationIpHourly
          (HourKey, LocationKey, IpHash, SeenAt)
         VALUES (?, ?, ?, ?)`,
    )
      .bind(event.hourKey, event.locationKey, event.ipHash, event.createdAt)
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO VisitorLocationHourly (
        HourKey, LocationKey, DayKey, Country, Region, City, Timezone,
        Visits, UniqueIps, UpdatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(HourKey, LocationKey) DO UPDATE SET
        Visits = Visits + 1,
        UniqueIps = UniqueIps + excluded.UniqueIps,
        UpdatedAt = excluded.UpdatedAt`,
  )
    .bind(
      event.hourKey,
      event.locationKey,
      event.dayKey,
      event.country,
      event.region,
      event.city,
      event.timezone,
      uniqueDelta,
      event.createdAt,
    )
    .run();

  return true;
}

function archiveVisitorEvent(ctx, services, event) {
  if (!services?.analyticsRaw) return;
  const payload = {
    eventAt: event.eventAt,
    dayKey: event.dayKey,
    hourKey: event.hourKey,
    ipHash: event.ipHash,
    ipPrefix: event.ipPrefix,
    location: {
      country: event.country,
      region: event.region,
      city: event.city,
      timezone: event.timezone,
      latitude: event.latitude,
      longitude: event.longitude,
    },
    path: event.path,
    referrerHost: event.referrerHost,
    userAgentHash: event.userAgentHash,
  };
  const task = services.analyticsRaw
    .putJson(event.rawR2Key, payload)
    .catch((e) =>
      console.warn("[analytics/visit] R2 archive skipped:", e?.message || e),
    );
  if (ctx?.waitUntil) ctx.waitUntil(task);
}

async function getVisitorLocations(request, env) {
  const range = resolveRange(new URL(request.url));
  const storage = { d1: Boolean(env.DB), r2: Boolean(env.IMAGES) };
  if (!env.DB) {
    return jsonOk({ range, storage, configured: false, topLocations: [] });
  }

  try {
    const result = await env.DB.prepare(
      `SELECT
          LocationKey,
          MAX(Country) AS Country,
          MAX(Region) AS Region,
          MAX(City) AS City,
          MAX(Timezone) AS Timezone,
          SUM(Visits) AS Visits,
          SUM(UniqueIps) AS UniqueIps,
          MAX(UpdatedAt) AS LastSeenAt
        FROM VisitorLocationHourly
        WHERE DayKey >= ? AND DayKey <= ?
        GROUP BY LocationKey
        ORDER BY Visits DESC, UniqueIps DESC, LastSeenAt DESC
        LIMIT ?`,
    )
      .bind(range.startDate, range.endDate, VISITOR_LOCATION_LIMIT)
      .all();
    const rows = result.results || [];
    const topLocations = await Promise.all(
      rows.slice(0, VISITOR_LOCATION_LIMIT).map(async (row) => {
        const peak = await visitorLocationPeak(env, range, row.LocationKey);
        return {
          key: row.LocationKey,
          name: visitorLocationName(row),
          country: row.Country || "",
          region: row.Region || "",
          city: row.City || "",
          timezone: row.Timezone || "",
          visits: Number(row.Visits || 0),
          uniqueIps: Number(row.UniqueIps || 0),
          lastSeenAt: row.LastSeenAt || "",
          peakHour: peak.hour,
          peakHourLabel: peak.label,
          peakHourVisits: peak.visits,
        };
      }),
    );
    return jsonOk({ range, storage, configured: true, topLocations });
  } catch (e) {
    if (isMissingVisitorTable(e)) {
      return jsonOk({ range, storage, configured: false, topLocations: [] });
    }
    throw e;
  }
}

async function getVisitorLocationDetail(request, env) {
  const range = resolveRange(new URL(request.url));
  const storage = { d1: Boolean(env.DB), r2: Boolean(env.IMAGES) };
  const empty = {
    range,
    storage,
    configured: Boolean(env.DB),
    cumulative: {
      visits: 0,
      uniqueIps: 0,
      locations: 0,
      firstSeenAt: "",
      lastSeenAt: "",
    },
    topLocations: [],
    months: [],
    recentEvents: [],
    limits: {
      months: VISITOR_DETAIL_MONTH_LIMIT,
      days: VISITOR_DETAIL_DAY_LIMIT,
      events: VISITOR_DETAIL_EVENT_LIMIT,
    },
  };
  if (!env.DB) return jsonOk({ ...empty, configured: false });

  try {
    const cumulative = await env.DB.prepare(
      `SELECT
          COUNT(*) AS Visits,
          COUNT(DISTINCT IpHash) AS UniqueIps,
          COUNT(DISTINCT LocationKey) AS Locations,
          MIN(EventAt) AS FirstSeenAt,
          MAX(EventAt) AS LastSeenAt
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?`,
    )
      .bind(range.startDate, range.endDate)
      .first();

    const top = await env.DB.prepare(
      `SELECT
          LocationKey,
          MAX(Country) AS Country,
          MAX(Region) AS Region,
          MAX(City) AS City,
          MAX(Timezone) AS Timezone,
          COUNT(*) AS Visits,
          COUNT(DISTINCT IpHash) AS UniqueIps,
          MAX(EventAt) AS LastSeenAt
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?
        GROUP BY LocationKey
        ORDER BY Visits DESC, UniqueIps DESC, LastSeenAt DESC
        LIMIT ?`,
    )
      .bind(range.startDate, range.endDate, VISITOR_LOCATION_LIMIT)
      .all();

    const monthly = await env.DB.prepare(
      `SELECT
          substr(DayKey, 1, 7) AS MonthKey,
          COUNT(*) AS Visits,
          COUNT(DISTINCT IpHash) AS UniqueIps,
          COUNT(DISTINCT LocationKey) AS Locations
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?
        GROUP BY substr(DayKey, 1, 7)
        ORDER BY MonthKey DESC
        LIMIT ?`,
    )
      .bind(range.startDate, range.endDate, VISITOR_DETAIL_MONTH_LIMIT)
      .all();

    const dayRows = await env.DB.prepare(
      `SELECT
          substr(DayKey, 1, 7) AS MonthKey,
          DayKey,
          COUNT(*) AS Visits,
          COUNT(DISTINCT IpHash) AS UniqueIps,
          COUNT(DISTINCT LocationKey) AS Locations
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?
        GROUP BY DayKey
        ORDER BY DayKey DESC
        LIMIT ?`,
    )
      .bind(range.startDate, range.endDate, VISITOR_DETAIL_DAY_LIMIT)
      .all();

    const recent = await env.DB.prepare(
      `SELECT
          EventAt,
          DayKey,
          HourKey,
          IpPrefix,
          Country,
          Region,
          City,
          Timezone,
          LocationKey,
          Path,
          ReferrerHost
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?
        ORDER BY EventAt DESC
        LIMIT ?`,
    )
      .bind(range.startDate, range.endDate, VISITOR_DETAIL_EVENT_LIMIT)
      .all();

    return jsonOk({
      ...empty,
      configured: true,
      cumulative: {
        visits: Number(cumulative?.Visits || 0),
        uniqueIps: Number(cumulative?.UniqueIps || 0),
        locations: Number(cumulative?.Locations || 0),
        firstSeenAt: cumulative?.FirstSeenAt || "",
        lastSeenAt: cumulative?.LastSeenAt || "",
      },
      topLocations: (top.results || []).map((row) => ({
        key: row.LocationKey,
        name: visitorLocationName(row),
        country: row.Country || "",
        region: row.Region || "",
        city: row.City || "",
        timezone: row.Timezone || "",
        visits: Number(row.Visits || 0),
        uniqueIps: Number(row.UniqueIps || 0),
        lastSeenAt: row.LastSeenAt || "",
      })),
      months: groupVisitorDetailDays(
        dayRows.results || [],
        monthly.results || [],
      ),
      recentEvents: (recent.results || []).map((row) => ({
        eventAt: row.EventAt || "",
        dayKey: row.DayKey || "",
        hourKey: row.HourKey || "",
        ipPrefix: row.IpPrefix || "",
        location: visitorLocationName(row),
        country: row.Country || "",
        region: row.Region || "",
        city: row.City || "",
        timezone: row.Timezone || "",
        path: row.Path || "",
        referrerHost: row.ReferrerHost || "",
      })),
    });
  } catch (e) {
    if (isMissingVisitorTable(e)) {
      return jsonOk({ ...empty, configured: false });
    }
    throw e;
  }
}

function groupVisitorDetailDays(dayRows, monthRows = []) {
  const months = new Map();
  for (const row of monthRows) {
    const monthKey = row.MonthKey || "";
    if (!monthKey) continue;
    months.set(monthKey, {
      monthKey,
      visits: Number(row.Visits || 0),
      uniqueIps: Number(row.UniqueIps || 0),
      locations: Number(row.Locations || 0),
      days: [],
    });
  }
  for (const row of dayRows) {
    const monthKey = row.MonthKey || String(row.DayKey || "").slice(0, 7);
    if (!monthKey) continue;
    const month = months.get(monthKey) || {
      monthKey,
      visits: 0,
      uniqueIps: 0,
      locations: 0,
      days: [],
    };
    const day = {
      date: row.DayKey || "",
      visits: Number(row.Visits || 0),
      uniqueIps: Number(row.UniqueIps || 0),
      locations: Number(row.Locations || 0),
    };
    if (!monthRows.length) {
      month.visits += day.visits;
      month.uniqueIps += day.uniqueIps;
      month.locations = Math.max(month.locations, day.locations);
    }
    month.days.push(day);
    months.set(monthKey, month);
  }
  return Array.from(months.values());
}

async function visitorLocationPeak(env, range, locationKey) {
  const row = await env.DB.prepare(
    `SELECT substr(HourKey, 12, 2) AS Hour, SUM(Visits) AS Visits
       FROM VisitorLocationHourly
       WHERE DayKey >= ? AND DayKey <= ? AND LocationKey = ?
       GROUP BY substr(HourKey, 12, 2)
       ORDER BY Visits DESC, Hour ASC
       LIMIT 1`,
  )
    .bind(range.startDate, range.endDate, locationKey)
    .first();
  const hour = row?.Hour || "";
  return {
    hour,
    label: hour ? `${Number(hour)}시` : "",
    visits: Number(row?.Visits || 0),
  };
}

function visitorLocationName(row) {
  const city = row.City || "";
  const region = row.Region || "";
  const country = row.Country || "";
  if (city && region && city !== region) return `${city} · ${region}`;
  return city || region || country || "위치 미확인";
}

function isMissingVisitorTable(error) {
  return /no such table|VisitorLocationHourly|VisitorIpEvents/i.test(
    String(error?.message || ""),
  );
}

async function getSummary(request, env, services, ctx) {
  const url = new URL(request.url);
  const range = resolveRange(url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const latest = await latestSnapshot(services, range);

  // 캐시 hit 시에도 자체측정 통계는 D1에서 실시간 머지 (GA4 캐시와 별개로 항상 최신)
  const selfStats = await fetchSelfStats(env, range);

  // 응답 머지 헬퍼 — visitors/pageviews/trend 는 자체 측정(D1 HeatmapEvents)을
  // 우선. self 측정값이 0/빈 배열이면 GA4 캐시 값으로 fallback.
  // sources 는 cached 의 rawSources 를 현재 classifyTrafficSource 로 재분류
  // → 옛 snapshot 의 "Meta 합산" 이 새 분류(Instagram/Facebook/Threads 분리)로
  //   즉시 반영. snapshot 재생성 안 기다림.
  const mergeWithSelf = (base, extra = {}) => ({
    ...base,
    summary: {
      ...(base.summary || {}),
      // visitors / pageviews / avgDuration / bounceRate 는 GA4 본연 값 그대로 —
      // 자체측정 터치와 의미가 달라 머지 금지. (옛 사고: GA4 lag 우회한다고
      // self.touches 를 visitors 로 덮어써서 두 메트릭이 한 값으로 합쳐졌던 것 분리.)
      // 자체측정 카드(touches / newVisitors / returningVisitors) 는 self 그대로.
      touches: selfStats.touches,
      newVisitors: selfStats.newVisitors,
      returningVisitors: selfStats.returningVisitors,
    },
    trend:
      selfStats.trend && selfStats.trend.length
        ? selfStats.trend
        : base.trend || [],
    sources:
      selfStats.sources && selfStats.sources.length
        ? selfStats.sources
        : reclassifySources(base.sources),
    self: selfStats,
    ...extra,
  });

  if (!forceRefresh && latest && !isExpired(latest.createdAt)) {
    const cached = latest.payload || {};
    return jsonOk(
      mergeWithSelf(cached, { persisted: latest.persisted, cached: true }),
    );
  }

  // SWR(stale-while-revalidate): 캐시가 만료됐어도 옛 스냅샷이 있으면 즉시 반환하고
  // GA4/GSC 라이브 갱신(3~5초)은 백그라운드로 이연 — 방문자가 매 6시간마다 첫
  // 로드에서 3~5초 대기하던 체감 지연 제거. forceRefresh(?refresh=1)는 동기 갱신 유지.
  if (!forceRefresh && latest && ctx?.waitUntil) {
    ctx.waitUntil(
      (async () => {
        try {
          const fresh = await collectGoogleSummary(env, range);
          if (fresh.ok) {
            await persistSnapshot(services, range, {
              ...fresh,
              self: await fetchSelfStats(env, range),
            });
          }
        } catch {}
      })(),
    );
    return jsonOk(
      mergeWithSelf(latest.payload || {}, {
        persisted: latest.persisted,
        cached: true,
        stale: true,
        revalidating: true,
      }),
    );
  }

  const fresh = await collectGoogleSummary(env, range);
  if (!fresh.ok) {
    if (latest) {
      const cached = latest.payload || {};
      return jsonOk(
        mergeWithSelf(cached, {
          persisted: latest.persisted,
          cached: true,
          stale: true,
          errors: fresh.errors,
        }),
      );
    }
    // GA4 fetch 실패 + 캐시 없음 — 자체 측정만으로 응답 (옛 동작은 fresh 그대로
    // 반환했지만 그러면 visitors/trend 전부 빈 값. 자체 측정으로 폴백)
    return jsonOk(mergeWithSelf(fresh, { cached: false }));
  }

  const persisted = await persistSnapshot(services, range, {
    ...fresh,
    self: selfStats,
  });
  return jsonOk(mergeWithSelf(fresh, { persisted, cached: false }));
}

async function fetchLiveTouches(env, range) {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(DISTINCT SessionId) AS Touches
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND SessionId != ''
         AND IsBot = 0`,
    )
      .bind(range.startDate, range.endDate)
      .first();
    return Number(row?.Touches || 0);
  } catch {
    return 0;
  }
}

// 자체측정 통계 — 60초 엣지 캐시 래퍼. /summary 가 캐시 hit 여도 매 호출
// computeSelfStats(8 D1쿼리, ~200~500ms)를 재실행하던 비용 절감. 실패 시 라이브 폴백.
async function fetchSelfStats(env, range) {
  const cache = caches.default;
  const key = `https://selfstats.internal/${encodeURIComponent(range.startDate)}/${encodeURIComponent(range.endDate)}`;
  try {
    const hit = await cache.match(key);
    if (hit) {
      const cached = await hit.json();
      if (cached) return cached;
    }
  } catch {}
  const result = await computeSelfStats(env, range);
  try {
    await cache.put(
      key,
      new Response(JSON.stringify(result), {
        headers: {
          "content-type": "application/json",
          "cache-control": `max-age=${SELF_STATS_TTL_S}`,
        },
      }),
    );
  } catch {}
  return result;
}

// 자체측정 통계 — 30일 SessionId 기준 신규/재방문 + 보조 지표 6종
async function computeSelfStats(env, range) {
  const startDate = range.startDate;
  const endDate = range.endDate;
  const result = {
    touches: 0,
    pageviews: 0,
    newVisitors: 0,
    returningVisitors: 0,
    avgPageviewsPerSession: 0,
    avgDwellSec: 0,
    peakHour: null,
    devices: { pc: 0, mobile: 0 },
    topLocations: [],
    submissions: 0,
    conversionRate: 0,
    trend: [],
    sources: [],
  };

  // 1) 터치 + 신규 + 재방문 (단순 정의: 기간 시작 이전 등장 이력 유무)
  // 옛 코드는 WITH InRange + IN 서브쿼리 조합인데 D1 에서 silent fail —
  // touches=0 으로 떨어져 어드민 KPI 가 0 표시되던 사고. 3 개 분리 쿼리로 교체.
  try {
    const touchesRow = await env.DB.prepare(
      `SELECT COUNT(DISTINCT SessionId) AS Cnt
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND SessionId != ''
         AND IsBot = 0`,
    )
      .bind(startDate, endDate)
      .first();
    result.touches = Number(touchesRow?.Cnt || 0);

    // 재방문 정의: 기간 내 등장한 SessionId 중, 같은 SessionId 가 history 전체
    // 어느 다른 날에도 등장한 적 있음 (기간 시작 이전이든 기간 안 다른 날이든).
    // → 옛 정의는 "기간 시작 이전 only" 라 첫 데이터일을 포함하는 range 에서 항상
    //   0이 나와 직관과 안 맞던 사고 차단 (7일 range 재방문 0 사고).
    const returningRow = await env.DB.prepare(
      `SELECT COUNT(DISTINCT a.SessionId) AS Cnt
       FROM HeatmapEvents a
       WHERE a.EventType = 'page_view'
         AND substr(datetime(a.CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND a.SessionId != ''
         AND a.IsBot = 0
         AND EXISTS (
           SELECT 1 FROM HeatmapEvents b
           WHERE b.SessionId = a.SessionId
             AND b.EventType = 'page_view'
             AND b.IsBot = 0
             AND substr(datetime(b.CreatedAt, '+9 hours'), 1, 10) != substr(datetime(a.CreatedAt, '+9 hours'), 1, 10)
         )`,
    )
      .bind(startDate, endDate)
      .first();
    result.returningVisitors = Number(returningRow?.Cnt || 0);
    result.newVisitors = Math.max(0, result.touches - result.returningVisitors);
  } catch {}

  // 2) 평균 페이지뷰 / 세션
  try {
    const row = await env.DB.prepare(
      `SELECT
         COUNT(*) AS TotalPv,
         COUNT(DISTINCT SessionId) AS Sessions
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND SessionId != ''
         AND IsBot = 0`,
    )
      .bind(startDate, endDate)
      .first();
    const tot = Number(row?.TotalPv || 0);
    const sess = Number(row?.Sessions || 0);
    result.avgPageviewsPerSession = sess > 0 ? tot / sess : 0;
  } catch {}

  // 3) 평균 접속시간 (SessionId·날짜별 첫·마지막 이벤트 차이의 평균, 초)
  try {
    const row = await env.DB.prepare(
      `SELECT AVG(DwellSec) AS AvgDwell FROM (
         SELECT
           (julianday(MAX(CreatedAt)) - julianday(MIN(CreatedAt))) * 86400 AS DwellSec
         FROM HeatmapEvents
         WHERE substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
           AND SessionId != ''
           AND IsBot = 0
         GROUP BY SessionId, substr(datetime(CreatedAt, '+9 hours'), 1, 10)
         HAVING COUNT(*) > 1
       )`,
    )
      .bind(startDate, endDate)
      .first();
    result.avgDwellSec = Number(row?.AvgDwell || 0);
  } catch {}

  // 4) 피크 시간대 (UTC 기준 — 표시 시 KST 보정 필요)
  try {
    const row = await env.DB.prepare(
      `SELECT substr(CreatedAt, 12, 2) AS Hour, COUNT(*) AS Cnt
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND IsBot = 0
       GROUP BY Hour
       ORDER BY Cnt DESC
       LIMIT 1`,
    )
      .bind(startDate, endDate)
      .first();
    if (row?.Hour) {
      const utcHour = parseInt(row.Hour, 10);
      const kstHour = (utcHour + 9) % 24;
      result.peakHour = kstHour;
    }
  } catch {}

  // 5) 디바이스 비중 (세션 단위)
  try {
    const res = await env.DB.prepare(
      `SELECT Device, COUNT(DISTINCT SessionId) AS Cnt
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND SessionId != ''
         AND IsBot = 0
       GROUP BY Device`,
    )
      .bind(startDate, endDate)
      .all();
    for (const r of res.results || []) {
      if (r.Device === "pc" || r.Device === "mobile") {
        result.devices[r.Device] = Number(r.Cnt || 0);
      }
    }
  } catch {}

  // 6) 접속 위치 TOP 5 (CF cf.city·country, 세션 단위)
  try {
    const res = await env.DB.prepare(
      `SELECT
         COALESCE(NULLIF(City, ''), 'Unknown') AS City,
         COALESCE(NULLIF(Country, ''), '') AS Country,
         COUNT(DISTINCT SessionId) AS Cnt
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND SessionId != ''
         AND IsBot = 0
       GROUP BY City, Country
       ORDER BY Cnt DESC
       LIMIT 5`,
    )
      .bind(startDate, endDate)
      .all();
    result.topLocations = (res.results || []).map((r) => ({
      city: String(r.City || "Unknown"),
      country: String(r.Country || ""),
      sessions: Number(r.Cnt || 0),
    }));
  } catch {}

  // 7) 전환율 (Estimates 접수 / 터치)
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS Cnt FROM Estimates
       WHERE substr(datetime(SubmittedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?`,
    )
      .bind(startDate, endDate)
      .first();
    result.submissions = Number(row?.Cnt || 0);
    result.conversionRate =
      result.touches > 0 ? result.submissions / result.touches : 0;
  } catch {}

  // 8a) 출처 (UTM source/medium + Referrer 기반 자체 측정)
  //   GA4 측정이 끊겨도 자체 sources 가 admin 에 표시됨. 라이브에서 사용자가
  //   ig/paid · fb/paid 등으로 들어오는 트래픽이 1000명 단위인데 admin sources
  //   에 안 보이던 사고 차단.
  try {
    const res = await env.DB.prepare(
      `SELECT
         COALESCE(NULLIF(UtmSource, ''), '(none)') AS src,
         COALESCE(NULLIF(UtmMedium, ''), '') AS med,
         COALESCE(NULLIF(Referrer, ''), '') AS ref,
         COUNT(DISTINCT SessionId) AS Visitors,
         COUNT(*) AS Sessions
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND SessionId != ''
         AND IsBot = 0
       GROUP BY src, med, ref`,
    )
      .bind(startDate, endDate)
      .all();
    const fakeRows = (res.results || []).map((r) => {
      const srcVal = r.src === "(none)" && r.ref ? r.ref : r.src;
      return {
        dimensionValues: [
          { value: String(srcVal || "") },
          { value: String(r.med || "") },
          { value: "" },
        ],
        metricValues: [
          { value: String(r.Sessions || 0) },
          { value: String(r.Visitors || 0) },
        ],
      };
    });
    result.sources = aggregateTrafficSources(fakeRows);
  } catch {}

  // 8b) 일별 trend (자체 측정 — visitors=고유세션, pageviews=총 페이지뷰)
  //   GA4 lag·누락에 영향 없이 차트/히트맵이 항상 실시간 D1 기준으로 동작.
  try {
    const res = await env.DB.prepare(
      `SELECT
         substr(datetime(CreatedAt, '+9 hours'), 1, 10) AS d,
         COUNT(DISTINCT SessionId) AS Visitors,
         COUNT(*) AS Pageviews
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND SessionId != ''
         AND IsBot = 0
       GROUP BY d
       ORDER BY d ASC`,
    )
      .bind(startDate, endDate)
      .all();
    result.trend = (res.results || []).map((r) => ({
      date: String(r.d),
      visitors: Number(r.Visitors || 0),
      pageviews: Number(r.Pageviews || 0),
    }));
    result.pageviews = result.trend.reduce((sum, x) => sum + x.pageviews, 0);
  } catch {}

  return result;
}

// KST 자정 기준 "오늘" 을 구함 — Worker 는 UTC 환경이므로 new Date() 의
// getFullYear/Month/Date 가 UTC date 를 반환. KST(+9h) 로 보정해야 사용자
// 직관과 일치 (KST 자정~09시 트래픽이 어제로 묶이던 사고 차단).
function kstToday() {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  // KST 자정 → 동일 시각의 Date 객체 반환 (이후 dayKey 가 같은 calendar date 반환)
  return new Date(Date.UTC(y, m, d));
}

function resolveRange(url) {
  const key = url.searchParams.get("range") || "30";
  const today = kstToday();
  let start = new Date(today);
  let end = endOfDay(today);
  let rangeKey = key;

  if (key === "today") {
    // start = today, end = endOfDay(today) — 초기값 그대로
  } else if (key === "7" || key === "30") {
    const days = Number(key);
    start.setDate(start.getDate() - (days - 1));
  } else if (key === "cur-month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (key === "prev-month") {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
  } else if (key === "all") {
    start = new Date(2020, 0, 1);
  } else if (key === "custom") {
    const qsStart = parseDateParam(url.searchParams.get("start"));
    const qsEnd = parseDateParam(url.searchParams.get("end"));
    start = qsStart || today;
    end = endOfDay(qsEnd || today);
  } else {
    // 알 수 없는 키 → 30일 fallback
    rangeKey = "30";
    start.setDate(start.getDate() - 29);
  }

  return {
    key: rangeKey,
    startDate: dayKey(start),
    endDate: dayKey(end),
  };
}

function parseDateParam(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(+date) ? null : startOfDay(date);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isExpired(iso) {
  const t = Date.parse(iso || "");
  return !t || Date.now() - t > SNAPSHOT_TTL_MS;
}

async function latestSnapshot(services, range) {
  if (!services.analyticsSnapshots) return null;
  const result = await services.analyticsSnapshots.list({
    where: {
      RangeKey: range.key,
      StartDate: range.startDate,
      EndDate: range.endDate,
      Source: SOURCE,
    },
    sort: [{ field: "CreatedAt", direction: "desc" }],
    limit: 1,
  });
  const record = result.records?.[0];
  if (!record) return null;
  return snapshotFromRecord(record);
}

function snapshotFromRecord(record) {
  let payload = {};
  try {
    payload = JSON.parse(record.fields.Payload || "{}");
  } catch {}
  return {
    payload,
    createdAt: record.fields.CreatedAt,
    persisted: {
      id: record.id,
      createdAt: record.fields.CreatedAt,
      rawR2Key: record.fields.RawR2Key || "",
    },
  };
}

// cron 진입점 — 매일 KST 04:00 (UTC 19:00) 에 호출되어 today/7/30/cur-month
// range 의 fresh GA4 fetch + self stats 머지 + persistSnapshot.
// admin 안 들어가도 데일리 누적 보장. 6h TTL 이라 cron 직후 사용자 진입 시 즉시
// fresh 응답.
export async function runScheduledAnalyticsSnapshot(env, ctx) {
  const services = createServices(env);
  const rangeKeys = ["today", "7", "30", "cur-month"];
  const fakeUrl = new URL("https://internal/api/analytics/summary");
  const errors = [];
  for (const key of rangeKeys) {
    try {
      fakeUrl.searchParams.set("range", key);
      fakeUrl.searchParams.set("refresh", "1");
      const range = resolveRange(fakeUrl);
      const selfStats = await fetchSelfStats(env, range);
      const fresh = await collectGoogleSummary(env, range);
      const payload = fresh.ok ? { ...fresh, self: selfStats } : fresh;
      if (fresh.ok) {
        await persistSnapshot(services, range, payload);
      }
    } catch (e) {
      errors.push({ key, code: safeErrorCode(e) });
    }
  }
  return { ok: errors.length === 0, errors };
}

async function persistSnapshot(services, range, payload) {
  const createdAt = new Date().toISOString();
  const rawR2Key = `analytics/snapshots/${range.endDate}/${range.key}-${Date.now()}-${randomId()}.json`;

  let storedKey = "";
  if (services.analyticsRaw) {
    storedKey = await services.analyticsRaw.putJson(rawR2Key, payload);
  }

  const record = await services.analyticsSnapshots.create({
    RangeKey: range.key,
    StartDate: range.startDate,
    EndDate: range.endDate,
    Source: SOURCE,
    Payload: JSON.stringify(payload),
    RawR2Key: storedKey,
    CreatedAt: createdAt,
  });

  return {
    id: record.id,
    createdAt,
    rawR2Key: storedKey,
  };
}

function hasOauth(env, refreshToken) {
  return Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && refreshToken,
  );
}

function ga4RefreshToken(env) {
  return (
    env.GA4_REFRESH_TOKEN ||
    env.GOOGLE_ANALYTICS_REFRESH_TOKEN ||
    env.GOOGLE_REFRESH_TOKEN ||
    ""
  );
}

function gscRefreshToken(env) {
  return (
    env.GSC_REFRESH_TOKEN ||
    env.GOOGLE_WEBMASTERS_REFRESH_TOKEN ||
    env.GOOGLE_REFRESH_TOKEN ||
    ""
  );
}

async function googleAccessToken(env, refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`oauth_refresh_${res.status}`);
  const body = await res.json();
  if (!body.access_token) throw new Error("oauth_no_access_token");
  return body.access_token;
}

async function collectGoogleSummary(env, range) {
  const propertyId = String(env.GA4_PROPERTY_ID || "").trim();
  const siteUrl = String(env.GSC_SITE_URL || DEFAULT_SITE_URL).trim();
  const errors = [];

  const payload = {
    ok: false,
    source: SOURCE,
    range,
    propertyId,
    siteUrl,
    fetchedAt: new Date().toISOString(),
    configured: {
      ga4: Boolean(propertyId && hasOauth(env, ga4RefreshToken(env))),
      gsc: Boolean(siteUrl && hasOauth(env, gscRefreshToken(env))),
    },
    summary: null,
    trend: [],
    sources: [],
    topPages: [],
    searchQueries: [],
    errors,
  };

  if (payload.configured.ga4) {
    try {
      Object.assign(
        payload,
        await collectGa4(env, propertyId, ga4RefreshToken(env), range),
      );
      payload.ok = true;
    } catch (e) {
      errors.push({ source: "ga4", code: safeErrorCode(e) });
    }
  }

  if (payload.configured.gsc) {
    try {
      payload.searchQueries = await collectSearchConsole(
        env,
        siteUrl,
        gscRefreshToken(env),
        range,
      );
      payload.ok = true;
    } catch (e) {
      errors.push({ source: "gsc", code: safeErrorCode(e) });
    }
  }

  if (!payload.configured.ga4) {
    errors.push({ source: "ga4", code: "not_configured" });
  }
  if (!payload.configured.gsc) {
    errors.push({ source: "gsc", code: "not_configured" });
  }

  // 자체 트래커(D1) 기반 "터치" 카운트 — page_view 이벤트의 unique session 수
  // 정의: 페이지 진입 즉시 sendBeacon 발사. 1초 미만 이탈도 잡힘 (GA4는 못 잡음)
  try {
    const touchRow = await env.DB.prepare(
      `SELECT COUNT(DISTINCT SessionId) AS Touches
       FROM HeatmapEvents
       WHERE EventType = 'page_view'
         AND substr(datetime(CreatedAt, '+9 hours'), 1, 10) BETWEEN ? AND ?
         AND IsBot = 0`,
    )
      .bind(range.startDate, range.endDate)
      .first();
    const touches = Number(touchRow?.Touches || 0);
    payload.summary = { ...(payload.summary || {}), touches };
  } catch (e) {
    errors.push({ source: "d1_touches", code: safeErrorCode(e) });
  }

  return payload;
}

function safeErrorCode(error) {
  return String(error?.message || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

async function collectGa4(env, propertyId, refreshToken, range) {
  const token = await googleAccessToken(env, refreshToken);
  const base = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
  };
  const [totals, trend, pages, sources] = await Promise.all([
    runGa4Report(token, propertyId, {
      ...base,
      metrics: [
        { name: "activeUsers" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "sessions" },
      ],
    }),
    runGa4Report(token, propertyId, {
      ...base,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: "120",
    }),
    runGa4Report(token, propertyId, {
      ...base,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "10",
    }),
    runGa4Report(token, propertyId, {
      ...base,
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "sessionDefaultChannelGroup" },
      ],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "50",
    }),
  ]);

  const totalMetrics = metricValues(totals.rows?.[0], [
    "activeUsers",
    "screenPageViews",
    "averageSessionDuration",
    "bounceRate",
    "sessions",
  ]);

  return {
    summary: {
      visitors: totalMetrics.activeUsers,
      pageviews: totalMetrics.screenPageViews,
      avgDurationSec: totalMetrics.averageSessionDuration,
      bounceRate: totalMetrics.bounceRate,
      sessions: totalMetrics.sessions,
    },
    trend: (trend.rows || []).map((row) => {
      const m = metricValues(row, ["activeUsers", "screenPageViews"]);
      return {
        date: formatGaDate(row.dimensionValues?.[0]?.value || ""),
        visitors: m.activeUsers,
        pageviews: m.screenPageViews,
      };
    }),
    topPages: (pages.rows || []).map((row) => {
      const m = metricValues(row, ["screenPageViews", "activeUsers"]);
      return {
        path: row.dimensionValues?.[0]?.value || "",
        views: m.screenPageViews,
        visitors: m.activeUsers,
      };
    }),
    sources: aggregateTrafficSources(sources.rows || []),
  };
}

// cached snapshot 의 sources (옛 분류) 를 raw 기반으로 재분류.
// snapshot 안 갈아엎고도 새 채널 정의를 응답에 즉시 반영.
function reclassifySources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return sources || [];
  const fakeRows = [];
  for (const src of sources) {
    const rawList = Array.isArray(src.rawSources) ? src.rawSources : [];
    if (rawList.length === 0) {
      // raw 없으면 옛 source 키를 dimension 으로 흉내 (보수적 폴백)
      fakeRows.push({
        dimensionValues: [
          { value: src.name || "" },
          { value: "" },
          { value: "" },
        ],
        metricValues: [
          { value: String(src.sessions || 0) },
          { value: String(src.visitors || 0) },
        ],
      });
      continue;
    }
    for (const r of rawList) {
      fakeRows.push({
        dimensionValues: [
          { value: r.source || "" },
          { value: r.medium || "" },
          { value: r.channelGroup || "" },
        ],
        metricValues: [
          { value: String(r.sessions || 0) },
          { value: String(r.visitors || 0) },
        ],
      });
    }
  }
  return aggregateTrafficSources(fakeRows);
}

function aggregateTrafficSources(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const source = cleanDimension(row.dimensionValues?.[0]?.value);
    const medium = cleanDimension(row.dimensionValues?.[1]?.value);
    const channelGroup = cleanDimension(row.dimensionValues?.[2]?.value);
    const m = metricValues(row, ["sessions", "activeUsers"]);
    const channel = classifyTrafficSource({ source, medium, channelGroup });
    const current = grouped.get(channel.key) || {
      key: channel.key,
      name: channel.name,
      sessions: 0,
      visitors: 0,
      rawSources: [],
    };

    current.sessions += m.sessions;
    current.visitors += m.activeUsers;
    current.rawSources.push({
      source,
      medium,
      channelGroup,
      sessions: m.sessions,
      visitors: m.activeUsers,
    });
    grouped.set(channel.key, current);
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      rawSources: item.rawSources
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 5),
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

function cleanDimension(value) {
  const text = String(value || "").trim();
  return text || "(not set)";
}

function classifyTrafficSource({ source, medium, channelGroup }) {
  const src = String(source || "").toLowerCase();
  const med = String(medium || "").toLowerCase();
  const group = String(channelGroup || "").toLowerCase();
  const haystack = `${src} ${med} ${group}`;

  if (
    src === "(direct)" ||
    src === "direct" ||
    (group === "direct" && (!src || src === "(not set)"))
  ) {
    return sourceChannel("direct");
  }
  // Meta 가족은 정확히 분리 — instagram / facebook / threads 별도 채널 +
  // 광고(paid)/자연 분기. UtmMedium='paid' (또는 channelGroup 에 paid 포함) 이면
  // *_ad 채널로 분류 → admin 에서 [AD]IG/[AD]FB 라벨로 진한 색 표시.
  const isPaid = med === "paid" || /paid/.test(group);
  if (/\b(instagram|ig)\b|ig\.com/.test(haystack)) {
    return sourceChannel(isPaid ? "instagram_ad" : "instagram");
  }
  if (/\bthreads\b/.test(haystack)) return sourceChannel("threads");
  if (
    /\b(facebook|fb)\b|fb\.|fbclid|l\.facebook|lm\.facebook|m\.facebook/.test(
      haystack,
    )
  ) {
    return sourceChannel(isPaid ? "facebook_ad" : "facebook");
  }
  if (/\bmeta\b/.test(haystack)) return sourceChannel("meta");
  if (/(youtube|youtu\.be)/.test(haystack)) return sourceChannel("youtube");
  if (/(naver|search\.naver|blog\.naver|cafe\.naver)/.test(haystack)) {
    return sourceChannel("naver");
  }
  if (/(google|googleads|adwords|gclid|doubleclick)/.test(haystack)) {
    return sourceChannel("google");
  }
  if (/(kakao|daum|tistory)/.test(haystack)) return sourceChannel("kakao");
  if (group.includes("search")) return sourceChannel("search");
  if (group.includes("social")) return sourceChannel("social");
  if (group.includes("referral")) return sourceChannel("referral");
  return sourceChannel("other");
}

function sourceChannel(key) {
  return { key, name: SOURCE_CHANNELS[key] || SOURCE_CHANNELS.other };
}

async function runGa4Report(accessToken, propertyId, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`ga4_report_${res.status}`);
  return res.json();
}

function metricValues(row, names) {
  const values = {};
  names.forEach((name, index) => {
    values[name] = Number(row?.metricValues?.[index]?.value || 0);
  });
  return values;
}

function formatGaDate(value) {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

async function collectSearchConsole(env, siteUrl, refreshToken, range) {
  const token = await googleAccessToken(env, refreshToken);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ["query"],
        rowLimit: 10,
      }),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`gsc_query_${res.status}`);
  const body = await res.json();
  return (body.rows || []).map((row) => ({
    query: row.keys?.[0] || "",
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  }));
}
