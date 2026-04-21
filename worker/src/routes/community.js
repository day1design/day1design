import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import {
  atListAll,
  atGet,
  atCreate,
  atUpdate,
  atDelete,
  atList,
} from "../lib/airtable.js";

const TABLE = "Community";

export async function handleCommunity(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/community/, "") || "/";

  if (path === "/" && request.method === "GET")
    return listCommunity(request, env);
  if (path === "/" && request.method === "POST") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return createPost(request, env);
  }
  // /:idx — idx는 숫자 문자열
  const m = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const idx = m[1];
    if (request.method === "GET") return getPost(env, idx);
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    if (request.method === "PATCH") return patchPost(request, env, idx);
    if (request.method === "DELETE") return deletePost(env, idx);
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
    images: safeJsonParse(f.Images),
    content_blocks: safeJsonParse(f.ContentBlocks),
  };
}

async function listCommunity(request, env) {
  const url = new URL(request.url);
  const board = url.searchParams.get("board");
  const filter = board ? `{Board}='${board.replace(/'/g, "\\'")}'` : undefined;
  const records = await atListAll(env, TABLE, {
    filter,
    sort: [{ field: "Date", direction: "desc" }],
  });
  return jsonOk({
    total: records.length,
    posts: records.map(toListClient),
  });
}

async function getPost(env, idx) {
  const data = await atList(env, TABLE, {
    filter: `{Idx}='${idx.replace(/'/g, "\\'")}'`,
    pageSize: 1,
  });
  const r = (data.records || [])[0];
  if (!r) return jsonError(404, "Post not found");
  return jsonOk({ post: toDetailClient(r) });
}

async function createPost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = mapFields(body);
  if (!fields.Idx || !fields.Title)
    return jsonError(400, "Idx and Title required");
  const r = await atCreate(env, TABLE, fields);
  return jsonOk({ post: toDetailClient(r) });
}

async function patchPost(request, env, idx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const data = await atList(env, TABLE, {
    filter: `{Idx}='${idx.replace(/'/g, "\\'")}'`,
    pageSize: 1,
  });
  const r = (data.records || [])[0];
  if (!r) return jsonError(404, "Post not found");
  const fields = mapFields(body);
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");
  const updated = await atUpdate(env, TABLE, r.id, fields);
  return jsonOk({ post: toDetailClient(updated) });
}

async function deletePost(env, idx) {
  const data = await atList(env, TABLE, {
    filter: `{Idx}='${idx.replace(/'/g, "\\'")}'`,
    pageSize: 1,
  });
  const r = (data.records || [])[0];
  if (!r) return jsonError(404, "Post not found");
  await atDelete(env, TABLE, r.id);
  return jsonOk({ deleted: idx });
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
