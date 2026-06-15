import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { createServices } from "../lib/services.js";
import {
  edgeCacheGet,
  edgeCachePut,
  edgeCacheDeleteMany,
} from "../lib/edge-cache.js";

const CACHE_TTL = 60;
function listCacheNs(board) {
  return `community:list:${board || "all"}`;
}
function postCacheNs(idx) {
  return `community:post:${idx}`;
}

// 위지윅 본문(HTML) 안의 <img src="..."> 추출 — orphan 정리용
function extractHtmlImageUrls(html) {
  if (!html || typeof html !== "string") return [];
  const out = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function collectPostUrls(post) {
  if (!post) return [];
  const out = new Set();
  if (post.thumb) out.add(post.thumb);
  (post.images || []).forEach((u) => u && out.add(u));
  (post.content_blocks || []).forEach((b) => {
    if (!b) return;
    if (b.type === "image" || b.type === "gallery") {
      if (b.src) out.add(b.src);
      if (Array.isArray(b.images)) b.images.forEach((u) => u && out.add(u));
    }
  });
  extractHtmlImageUrls(post.body_html).forEach((u) => u && out.add(u));
  return [...out];
}

export async function handleCommunity(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/community/, "") || "/";

  if (path === "/" && request.method === "GET")
    return listCommunity(request, env, ctx, services);
  if (path === "/" && request.method === "POST") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return createPost(request, env, ctx, services);
  }
  // /:idx — idx는 숫자 문자열
  const m = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const idx = m[1];
    if (request.method === "GET") return getPost(env, idx, ctx, services);
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    if (request.method === "PATCH")
      return patchPost(request, env, idx, ctx, services);
    if (request.method === "DELETE") return deletePost(env, idx, ctx, services);
  }
  return jsonError(404, "Not Found");
}

function toListClient(r) {
  const f = r.fields;
  return {
    id: r.id,
    idx: f.Idx || "",
    title: f.Title || "",
    category: f.Category || "",
    date: f.Date || "",
    board: f.Board || "Residential",
    thumb: f.Thumb || "",
    views: f.Views || 0,
    excerpt: f.Excerpt || "",
  };
}

function toDetailClient(r) {
  const f = r.fields;
  return {
    id: r.id,
    idx: f.Idx || "",
    title: f.Title || "",
    category: f.Category || "",
    date: f.Date || "",
    board: f.Board || "Residential",
    thumb: f.Thumb || "",
    views: f.Views || 0,
    excerpt: f.Excerpt || "",
    body_text: f.BodyText || "",
    body_html: f.BodyHtml || "",
    images: safeJsonParse(f.Images),
    content_blocks: safeJsonParse(f.ContentBlocks),
  };
}

async function listCommunity(request, env, ctx, services) {
  const url = new URL(request.url);
  const board = url.searchParams.get("board");
  const ns = listCacheNs(board);
  const cached = await edgeCacheGet(ns);
  if (cached) return jsonOk(cached);

  const where = board ? { Board: board } : undefined;
  const records = await services.community.listAll({
    where,
    sort: [{ field: "Date", direction: "desc" }],
  });
  const payload = {
    total: records.length,
    posts: records.map(toListClient),
  };
  await edgeCachePut(ns, payload, CACHE_TTL, ctx);
  return jsonOk(payload);
}

async function getPost(env, idx, ctx, services) {
  const ns = postCacheNs(idx);
  const cached = await edgeCacheGet(ns);
  if (cached) return jsonOk(cached);

  const data = await services.community.list({
    where: { Idx: idx },
    pageSize: 1,
  });
  const r = (data.records || [])[0];
  if (!r) return jsonError(404, "Post not found");
  const payload = { post: toDetailClient(r) };
  await edgeCachePut(ns, payload, CACHE_TTL, ctx);
  return jsonOk(payload);
}

async function createPost(request, env, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = mapFields(body);
  if (!fields.Idx || !fields.Title)
    return jsonError(400, "Idx and Title required");
  const r = await services.community.create(fields);
  await edgeCacheDeleteMany(
    [listCacheNs(null), listCacheNs("Residential"), listCacheNs("Commercial")],
    ctx,
  );
  return jsonOk({ post: toDetailClient(r) });
}

async function patchPost(request, env, idx, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const data = await services.community.list({
    where: { Idx: idx },
    pageSize: 1,
  });
  const r = (data.records || [])[0];
  if (!r) return jsonError(404, "Post not found");
  const before = toDetailClient(r);
  const fields = mapFields(body);
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");
  const updated = await services.community.update(r.id, fields);
  const after = toDetailClient(updated);

  // 이전에 있었으나 새 상태에는 없는 URL만 정리
  const afterSet = new Set(collectPostUrls(after));
  const orphan = collectPostUrls(before).filter((u) => !afterSet.has(u));
  if (orphan.length > 0) {
    const task = services.media.deleteMany(orphan);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDeleteMany(
    [
      listCacheNs(null),
      listCacheNs("Residential"),
      listCacheNs("Commercial"),
      postCacheNs(idx),
    ],
    ctx,
  );
  return jsonOk({ post: after, cleaned: orphan.length });
}

async function deletePost(env, idx, ctx, services) {
  const data = await services.community.list({
    where: { Idx: idx },
    pageSize: 1,
  });
  const r = (data.records || [])[0];
  if (!r) return jsonError(404, "Post not found");
  const before = toDetailClient(r);
  await services.community.delete(r.id);
  const urls = collectPostUrls(before);
  if (urls.length > 0) {
    const task = services.media.deleteMany(urls);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDeleteMany(
    [
      listCacheNs(null),
      listCacheNs("Residential"),
      listCacheNs("Commercial"),
      postCacheNs(idx),
    ],
    ctx,
  );
  return jsonOk({ deleted: idx, cleaned: urls.length });
}

function mapFields(body) {
  const out = {};
  if ("idx" in body) out.Idx = String(body.idx);
  if ("title" in body) out.Title = body.title;
  if ("category" in body) out.Category = body.category;
  if ("date" in body) out.Date = body.date;
  if ("board" in body) out.Board = body.board;
  if ("thumb" in body) out.Thumb = body.thumb;
  if ("views" in body) out.Views = Number(body.views) || 0;
  if ("excerpt" in body) out.Excerpt = body.excerpt;
  if ("body_text" in body) out.BodyText = body.body_text;
  if ("body_html" in body) out.BodyHtml = body.body_html;
  if ("images" in body) out.Images = JSON.stringify(body.images || []);
  if ("content_blocks" in body)
    out.ContentBlocks = JSON.stringify(body.content_blocks || []);
  return out;
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
