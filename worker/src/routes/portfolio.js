import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { createServices } from "../lib/services.js";
import {
  edgeCacheGet,
  edgeCachePut,
  edgeCacheDelete,
} from "../lib/edge-cache.js";

const CACHE_NS = "portfolio:list";
const CACHE_TTL = 60;

export async function handlePortfolio(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/portfolio/, "") || "/";

  if (path === "/" && request.method === "GET")
    return listPortfolio(env, ctx, services);
  if (path === "/" && request.method === "POST") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return createProject(request, env, ctx, services);
  }
  const m = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const id = m[1];
    if (request.method === "GET") return getProject(env, id, services);
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    if (request.method === "PATCH")
      return patchProject(request, env, id, ctx, services);
    if (request.method === "DELETE")
      return deleteProject(env, id, ctx, services);
  }
  return jsonError(404, "Not Found");
}

function collectUrls(record) {
  if (!record) return [];
  const out = [];
  if (record.thumbAfter) out.push(record.thumbAfter);
  if (record.thumbBefore) out.push(record.thumbBefore);
  if (Array.isArray(record.images)) out.push(...record.images.filter(Boolean));
  return out;
}

function toClient(r) {
  const f = r.fields;
  return {
    id: r.id,
    name: f.Name || "",
    folder: f.Folder || "",
    count: f.Count || 0,
    category: f.Category || "HOUSE",
    order: f.Order ?? 0,
    rightFolder: f.RightFolder || undefined,
    rightCount: f.RightCount || undefined,
    rightName: f.RightName || undefined,
    thumbAfter: f.ThumbAfter || undefined,
    thumbBefore: f.ThumbBefore || undefined,
    images: safeJsonParse(f.Images),
  };
}

function safeJsonParse(s, fallback = []) {
  if (!s) return fallback;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

async function listPortfolio(env, ctx, services) {
  const cached = await edgeCacheGet(CACHE_NS);
  if (cached) return jsonOk(cached);

  const records = await services.portfolio.listAll({
    sort: [{ field: "Order", direction: "asc" }],
  });
  const payload = { records: records.map(toClient) };
  await edgeCachePut(CACHE_NS, payload, CACHE_TTL, ctx);
  return jsonOk(payload);
}

async function getProject(env, id, services) {
  const r = await services.portfolio.get(id);
  return jsonOk({ record: toClient(r) });
}

async function createProject(request, env, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = mapFields(body);
  if (!fields.Name || !fields.Folder) {
    return jsonError(400, "Name and Folder required");
  }
  const r = await services.portfolio.create(fields);
  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk({ record: toClient(r) });
}

async function patchProject(request, env, id, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = mapFields(body);
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");

  // 기존 상태 → 변경 후 diff에서 사라진 이미지 URL 수집
  const before = toClient(await services.portfolio.get(id));
  const r = await services.portfolio.update(id, fields);
  const after = toClient(r);
  const orphan = collectUrls(before).filter(
    (u) => !collectUrls(after).includes(u),
  );
  if (orphan.length > 0) {
    const task = services.media.deleteMany(orphan);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk({ record: after, cleaned: orphan.length });
}

async function deleteProject(env, id, ctx, services) {
  const before = toClient(await services.portfolio.get(id));
  await services.portfolio.delete(id);
  const urls = collectUrls(before);
  if (urls.length > 0) {
    const task = services.media.deleteMany(urls);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk({ deleted: id, cleaned: urls.length });
}

function mapFields(body) {
  const out = {};
  if ("name" in body) out.Name = body.name;
  if ("folder" in body) out.Folder = body.folder;
  if ("count" in body) out.Count = Number(body.count) || 0;
  if ("category" in body) out.Category = body.category;
  if ("order" in body) out.Order = Number(body.order) || 0;
  if ("rightFolder" in body) out.RightFolder = body.rightFolder || "";
  if ("rightCount" in body) out.RightCount = Number(body.rightCount) || 0;
  if ("rightName" in body) out.RightName = body.rightName || "";
  if ("thumbAfter" in body) out.ThumbAfter = body.thumbAfter || "";
  if ("thumbBefore" in body) out.ThumbBefore = body.thumbBefore || "";
  if ("images" in body) {
    const arr = Array.isArray(body.images)
      ? body.images.filter((x) => typeof x === "string")
      : [];
    out.Images = JSON.stringify(arr);
    out.Count = arr.length; // 자동 동기화
  }
  return out;
}
