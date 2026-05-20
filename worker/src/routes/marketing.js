// 마케팅 슬러그 URL 생성기
// - 공개: GET /r/:slug → 쿠키(d1d_src) 30일 + UTM 부여 후 TargetUrl 302
// - 관리자: GET/POST/PATCH/DELETE /api/marketing-links

import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/i;
const COOKIE_NAME = "d1d_src";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30d
const SOURCE_DOMAIN = ".day1design.co.kr";
const HOME_FALLBACK = "https://day1design.co.kr/";

function nowIso() {
  return new Date().toISOString();
}

// KST 기준 YYYY-MM-DD (일일 통계 집계 키)
function kstDateKey(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function sanitizeText(value, max = 120) {
  return String(value || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, max);
}

function deriveUtm(label) {
  const slug = String(label || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "marketing";
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function rowToView(row) {
  if (!row) return null;
  return {
    slug: row.Slug,
    sourceLabel: row.SourceLabel || "",
    targetUrl: row.TargetUrl || "",
    utmSource: row.UtmSource || "",
    utmMedium: row.UtmMedium || "",
    utmCampaign: row.UtmCampaign || "",
    active: !!row.Active,
    clicks: row.Clicks || 0,
    lastClickAt: row.LastClickAt || "",
    createdAt: row.CreatedAt || "",
    updatedAt: row.UpdatedAt || "",
    createdBy: row.CreatedBy || "",
    deletedAt: row.DeletedAt || "",
    archived: !!(row.DeletedAt && row.DeletedAt.length),
  };
}

// ─── 공개 라우트 ─────────────────────────────────────────
export async function handleSlugRedirect(request, env, ctx, slug) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const cleanSlug = String(slug || "").toLowerCase();
  if (!SLUG_RE.test(cleanSlug)) {
    return Response.redirect(HOME_FALLBACK, 302);
  }
  const row = await env.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ? AND Active = 1 AND DeletedAt = '' LIMIT 1",
  )
    .bind(cleanSlug)
    .first();

  if (!row) {
    return Response.redirect(HOME_FALLBACK, 302);
  }

  const target = isHttpUrl(row.TargetUrl) ? row.TargetUrl : HOME_FALLBACK;
  const utmSource = row.UtmSource || deriveUtm(row.SourceLabel);
  const utmMedium = row.UtmMedium || "marketing-slug";
  const utmCampaign = row.UtmCampaign || cleanSlug;

  let dest;
  try {
    dest = new URL(target);
  } catch {
    dest = new URL(HOME_FALLBACK);
  }
  if (!dest.searchParams.get("utm_source")) {
    dest.searchParams.set("utm_source", utmSource);
  }
  if (!dest.searchParams.get("utm_medium")) {
    dest.searchParams.set("utm_medium", utmMedium);
  }
  if (!dest.searchParams.get("utm_campaign")) {
    dest.searchParams.set("utm_campaign", utmCampaign);
  }
  dest.searchParams.set("src", row.SourceLabel || cleanSlug);

  // 클릭 카운트 비동기 갱신 + 일일 통계 upsert (영속화: 슬러그 삭제 후에도 일별 row는 보존)
  const ts = nowIso();
  const dateKey = kstDateKey();
  const sourceLabel = row.SourceLabel || cleanSlug;
  const updateTask = env.DB.batch([
    env.DB.prepare(
      "UPDATE MarketingSlugs SET Clicks = Clicks + 1, LastClickAt = ? WHERE Slug = ?",
    ).bind(ts, cleanSlug),
    env.DB.prepare(
      `INSERT INTO MarketingSlugDaily (Date, Slug, SourceLabel, Clicks, LastClickAt)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(Date, Slug) DO UPDATE SET
         Clicks = Clicks + 1,
         LastClickAt = excluded.LastClickAt,
         SourceLabel = excluded.SourceLabel`,
    ).bind(dateKey, cleanSlug, sourceLabel, ts),
  ]).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(updateTask);

  const cookieValue = encodeURIComponent(
    JSON.stringify({
      label: row.SourceLabel || cleanSlug,
      slug: cleanSlug,
      utm: {
        source: utmSource,
        medium: utmMedium,
        campaign: utmCampaign,
      },
      ts: nowIso(),
    }),
  );

  const headers = new Headers();
  headers.set("location", dest.toString());
  headers.set(
    "set-cookie",
    `${COOKIE_NAME}=${cookieValue}; Domain=${SOURCE_DOMAIN}; Path=/; Max-Age=${COOKIE_MAX_AGE}; Secure; SameSite=Lax`,
  );
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}

// ─── 관리자 라우트 ───────────────────────────────────────
export async function handleMarketingLinks(request, env, ctx) {
  if (!(await verifyAdmin(request, env))) {
    return jsonError(401, "Unauthorized");
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/marketing-links/, "");
  const method = request.method;

  if ((path === "" || path === "/") && method === "GET") {
    return listLinks(env, url);
  }
  if ((path === "" || path === "/") && method === "POST") {
    return createLink(request, env);
  }
  const dailyMatch = path.match(/^\/([a-z0-9-]+)\/daily$/i);
  if (dailyMatch && method === "GET") {
    return listDaily(env, dailyMatch[1].toLowerCase(), url);
  }
  const match = path.match(/^\/([a-z0-9-]+)$/i);
  if (match) {
    const slug = match[1].toLowerCase();
    if (method === "GET") return getLink(env, slug);
    if (method === "PATCH") return updateLink(request, env, slug);
    if (method === "DELETE") return deleteLink(env, slug);
  }
  return jsonError(404, "Not Found");
}

async function listLinks(env, url) {
  // ?archived=1 → soft-deleted만 / ?all=1 → 전체 / 기본 → 활성만
  const archived = url?.searchParams.get("archived") === "1";
  const all = url?.searchParams.get("all") === "1";
  let where = "WHERE DeletedAt = ''";
  if (archived) where = "WHERE DeletedAt <> ''";
  if (all) where = "";
  const { results } = await env.DB.prepare(
    `SELECT * FROM MarketingSlugs ${where} ORDER BY UpdatedAt DESC, CreatedAt DESC`,
  ).all();
  const items = (results || []).map(rowToView);

  // 전환수 집계: Estimates.Referral === SourceLabel
  const labels = items.map((i) => i.sourceLabel).filter(Boolean);
  let conversionMap = {};
  if (labels.length) {
    const placeholders = labels.map(() => "?").join(",");
    const { results: convRows } = await env.DB.prepare(
      `SELECT Referral AS label, COUNT(*) AS n FROM Estimates WHERE Referral IN (${placeholders}) GROUP BY Referral`,
    )
      .bind(...labels)
      .all();
    for (const r of convRows || []) conversionMap[r.label] = r.n;
  }
  const enriched = items.map((i) => ({
    ...i,
    conversions: conversionMap[i.sourceLabel] || 0,
  }));
  return jsonOk({ items: enriched });
}

async function getLink(env, slug) {
  const row = await env.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ? LIMIT 1",
  )
    .bind(slug)
    .first();
  if (!row) return jsonError(404, "Not Found");
  return jsonOk({ item: rowToView(row) });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normalizeSlugInput(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function createLink(request, env) {
  const body = await readJson(request);
  if (!body) return jsonError(400, "Invalid JSON");

  const slug = normalizeSlugInput(body.slug);
  const sourceLabel = sanitizeText(body.sourceLabel, 80);
  const targetUrl = sanitizeText(body.targetUrl, 500);
  if (!slug || !SLUG_RE.test(slug)) {
    return jsonError(400, "slug must be 1-64 chars: a-z, 0-9, -");
  }
  if (!sourceLabel) return jsonError(400, "sourceLabel required");
  if (!isHttpUrl(targetUrl)) return jsonError(400, "targetUrl must be http(s)");

  const utmSource = sanitizeText(body.utmSource, 80) || deriveUtm(sourceLabel);
  const utmMedium = sanitizeText(body.utmMedium, 80) || "marketing-slug";
  const utmCampaign = sanitizeText(body.utmCampaign, 120) || slug;

  const existing = await env.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ? LIMIT 1",
  )
    .bind(slug)
    .first();
  if (existing && !existing.DeletedAt) {
    return jsonError(409, "slug already exists");
  }

  const now = nowIso();
  if (existing && existing.DeletedAt) {
    // 같은 slug가 archived 상태로 남아있으면 부활 (누적 Clicks/일일 통계는 그대로 이어짐)
    await env.DB.prepare(
      `UPDATE MarketingSlugs SET
         SourceLabel = ?, TargetUrl = ?, UtmSource = ?, UtmMedium = ?, UtmCampaign = ?,
         Active = 1, DeletedAt = '', UpdatedAt = ?
       WHERE Slug = ?`,
    )
      .bind(
        sourceLabel,
        targetUrl,
        utmSource,
        utmMedium,
        utmCampaign,
        now,
        slug,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO MarketingSlugs
          (Slug, SourceLabel, TargetUrl, UtmSource, UtmMedium, UtmCampaign,
           Active, Clicks, LastClickAt, CreatedAt, UpdatedAt, CreatedBy, DeletedAt)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, '', ?, ?, ?, '')`,
    )
      .bind(
        slug,
        sourceLabel,
        targetUrl,
        utmSource,
        utmMedium,
        utmCampaign,
        now,
        now,
        sanitizeText(body.createdBy, 40) || "admin",
      )
      .run();
  }

  const row = await env.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ?",
  )
    .bind(slug)
    .first();
  return jsonOk({ item: rowToView(row) });
}

async function updateLink(request, env, slug) {
  const body = await readJson(request);
  if (!body) return jsonError(400, "Invalid JSON");

  const existing = await env.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ? LIMIT 1",
  )
    .bind(slug)
    .first();
  if (!existing) return jsonError(404, "Not Found");

  const updates = {};
  if (typeof body.sourceLabel === "string") {
    const v = sanitizeText(body.sourceLabel, 80);
    if (!v) return jsonError(400, "sourceLabel required");
    updates.SourceLabel = v;
  }
  if (typeof body.targetUrl === "string") {
    const v = sanitizeText(body.targetUrl, 500);
    if (!isHttpUrl(v)) return jsonError(400, "targetUrl must be http(s)");
    updates.TargetUrl = v;
  }
  if (typeof body.utmSource === "string") {
    updates.UtmSource = sanitizeText(body.utmSource, 80);
  }
  if (typeof body.utmMedium === "string") {
    updates.UtmMedium = sanitizeText(body.utmMedium, 80);
  }
  if (typeof body.utmCampaign === "string") {
    updates.UtmCampaign = sanitizeText(body.utmCampaign, 120);
  }
  if (typeof body.active === "boolean") {
    updates.Active = body.active ? 1 : 0;
  }
  if (body.restore === true) {
    updates.DeletedAt = "";
    updates.Active = 1;
  }
  if (!Object.keys(updates).length)
    return jsonError(400, "No fields to update");

  updates.UpdatedAt = nowIso();
  const cols = Object.keys(updates);
  const setSql = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => updates[c]);
  await env.DB.prepare(`UPDATE MarketingSlugs SET ${setSql} WHERE Slug = ?`)
    .bind(...values, slug)
    .run();

  const row = await env.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ?",
  )
    .bind(slug)
    .first();
  return jsonOk({ item: rowToView(row) });
}

// soft-delete: 통계/내역 영구 보존을 위해 row 자체는 남기고 DeletedAt만 마킹
async function deleteLink(env, slug) {
  const existing = await env.DB.prepare(
    "SELECT 1 FROM MarketingSlugs WHERE Slug = ? AND DeletedAt = '' LIMIT 1",
  )
    .bind(slug)
    .first();
  if (!existing) return jsonError(404, "Not Found");
  const res = await env.DB.prepare(
    "UPDATE MarketingSlugs SET DeletedAt = ?, Active = 0, UpdatedAt = ? WHERE Slug = ?",
  )
    .bind(nowIso(), nowIso(), slug)
    .run();
  if (!res.success) return jsonError(500, "Delete failed");
  return jsonOk({ deleted: slug, archived: true });
}

// 일별 클릭 통계 (슬러그 삭제 후에도 호출 가능)
async function listDaily(env, slug, url) {
  const days = Math.max(
    1,
    Math.min(365, parseInt(url?.searchParams.get("days") || "30", 10) || 30),
  );
  const { results } = await env.DB.prepare(
    `SELECT Date, Slug, SourceLabel, Clicks, LastClickAt
       FROM MarketingSlugDaily
      WHERE Slug = ?
      ORDER BY Date DESC
      LIMIT ?`,
  )
    .bind(slug, days)
    .all();
  return jsonOk({
    slug,
    items: (results || []).map((r) => ({
      date: r.Date,
      sourceLabel: r.SourceLabel || "",
      clicks: r.Clicks || 0,
      lastClickAt: r.LastClickAt || "",
    })),
  });
}
