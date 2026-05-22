import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { createServices } from "../lib/services.js";
import {
  edgeCacheGet,
  edgeCachePut,
  edgeCacheDelete,
} from "../lib/edge-cache.js";

const CACHE_NS = "popups:list";
const CACHE_TTL = 5;
const DISPLAY_MODES = new Set(["parallel", "sequential"]);
const DEFAULT_MODE = "sequential";
const MODE_KEY = "popup_display_mode";

export async function handlePopups(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/popups/, "") || "/";
  const method = request.method;

  if (path === "/" && method === "GET") {
    return listPublic(env, ctx, services);
  }
  if (path === "/all" && method === "GET") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return listAll(env, services);
  }
  if (path === "/config" && method === "PUT") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return setConfig(request, env, ctx, services);
  }
  if (path === "/" && method === "POST") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return createPopup(request, env, ctx, services);
  }

  const idMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    if (method === "PATCH") {
      if (!(await verifyAdmin(request, env)))
        return jsonError(401, "Unauthorized");
      return updatePopup(request, env, ctx, services, id);
    }
    if (method === "DELETE") {
      if (!(await verifyAdmin(request, env)))
        return jsonError(401, "Unauthorized");
      return deletePopup(env, ctx, services, id);
    }
  }

  return jsonError(404, "Not Found");
}

async function getDisplayMode(services) {
  try {
    const r = await services.adminSettings.get(MODE_KEY);
    const v = r?.fields?.Value || "";
    return DISPLAY_MODES.has(v) ? v : DEFAULT_MODE;
  } catch (e) {
    if (e?.notFound) return DEFAULT_MODE;
    throw e;
  }
}

function recordToDto(r) {
  const f = r.fields || {};
  return {
    id: r.id,
    title: f.Title || "",
    imageUrl: f.ImageUrl || "",
    alt: f.Alt || "",
    linkUrl: f.LinkUrl || "",
    widthPx: f.WidthPx ?? null,
    topPx: Number(f.TopPx) || 0,
    leftPx: Number(f.LeftPx) || 0,
    active: f.Active === true,
    order: Number(f.Order) || 0,
    createdAt: f.CreatedAt || "",
    updatedAt: f.UpdatedAt || "",
  };
}

async function listPublic(env, ctx, services) {
  const cached = await edgeCacheGet(CACHE_NS);
  if (cached) return jsonOk(cached);
  const [records, displayMode] = await Promise.all([
    services.popups.listAll({ sort: [{ field: "Order", direction: "asc" }] }),
    getDisplayMode(services),
  ]);
  const popups = records.map(recordToDto).filter((p) => p.active && p.imageUrl);
  const payload = { popups, displayMode };
  await edgeCachePut(CACHE_NS, payload, CACHE_TTL, ctx);
  return jsonOk(payload);
}

async function listAll(env, services) {
  const [records, displayMode] = await Promise.all([
    services.popups.listAll({ sort: [{ field: "Order", direction: "asc" }] }),
    getDisplayMode(services),
  ]);
  const popups = records.map(recordToDto);
  return jsonOk({ popups, displayMode });
}

function sanitizeBody(body, { partial = false } = {}) {
  const out = {};
  const setStr = (key, max = 500) => {
    if (key in body) out[key] = String(body[key] || "").slice(0, max);
  };
  const setIntOpt = (key) => {
    if (key in body) {
      const v = body[key];
      if (v === null || v === "" || v === undefined) {
        out[key] = null;
      } else {
        const n = Number(v);
        out[key] = Number.isFinite(n) ? Math.round(n) : null;
      }
    }
  };
  const setIntDef = (key, def = 0) => {
    if (key in body) {
      const n = Number(body[key]);
      out[key] = Number.isFinite(n) ? Math.round(n) : def;
    } else if (!partial) {
      out[key] = def;
    }
  };
  setStr("Title", 200);
  setStr("ImageUrl", 1000);
  setStr("Alt", 300);
  setStr("LinkUrl", 1000);
  setIntOpt("WidthPx");
  setIntDef("TopPx", 0);
  setIntDef("LeftPx", 0);
  if ("Active" in body) out.Active = !!body.Active;
  setIntDef("Order", 0);
  return out;
}

async function createPopup(request, env, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  if (!body || typeof body !== "object") return jsonError(400, "Invalid body");
  if (!body.ImageUrl) return jsonError(400, "ImageUrl required");
  const fields = sanitizeBody(body);
  const now = new Date().toISOString();
  fields.CreatedAt = now;
  fields.UpdatedAt = now;
  if (!("Active" in fields)) fields.Active = false;
  if (!("Order" in fields)) fields.Order = 0;
  const created = await services.popups.create(fields);
  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk(recordToDto(created));
}

async function updatePopup(request, env, ctx, services, id) {
  const existing = await services.popups.get(id);
  if (!existing) return jsonError(404, "Not Found");
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = sanitizeBody(body, { partial: true });
  fields.UpdatedAt = new Date().toISOString();
  // 이미지 교체 시 옛 R2 객체 정리
  const oldUrl = existing.fields?.ImageUrl;
  const newUrl = fields.ImageUrl;
  if (newUrl && oldUrl && newUrl !== oldUrl) {
    const task = services.media.deleteMany([oldUrl]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  const updated = await services.popups.update(id, fields);
  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk(recordToDto(updated));
}

async function deletePopup(env, ctx, services, id) {
  let existing = null;
  try {
    existing = await services.popups.get(id);
  } catch (e) {
    if (e?.notFound) return jsonError(404, "Not Found");
    throw e;
  }
  const url = existing?.fields?.ImageUrl;
  await services.popups.delete(id);
  if (url) {
    const task = services.media.deleteMany([url]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk({ ok: true });
}

async function setConfig(request, env, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const mode = String(body?.displayMode || "");
  if (!DISPLAY_MODES.has(mode))
    return jsonError(400, "displayMode must be 'parallel' or 'sequential'");
  const now = new Date().toISOString();
  // 항상 upsert — get() 이 not-found 에 throw 라서 분기 대신 raw SQL 사용
  await env.DB.prepare(
    "INSERT INTO AdminSettings (id, Value, UpdatedAt) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET Value=excluded.Value, UpdatedAt=excluded.UpdatedAt",
  )
    .bind(MODE_KEY, mode, now)
    .run();
  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk({ displayMode: mode });
}
