import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import {
  atListAll,
  atGet,
  atCreate,
  atUpdate,
  atDelete,
} from "../lib/airtable.js";

const TABLE = "Portfolio";

export async function handlePortfolio(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/portfolio/, "") || "/";

  if (path === "/" && request.method === "GET") return listPortfolio(env);
  if (path === "/" && request.method === "POST") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return createProject(request, env);
  }
  const m = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const id = m[1];
    if (request.method === "GET") return getProject(env, id);
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    if (request.method === "PATCH") return patchProject(request, env, id);
    if (request.method === "DELETE") return deleteProject(env, id);
  }
  return jsonError(404, "Not Found");
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
  };
}

async function listPortfolio(env) {
  const records = await atListAll(env, TABLE, {
    sort: [{ field: "Order", direction: "asc" }],
  });
  return jsonOk({ records: records.map(toClient) });
}

async function getProject(env, id) {
  const r = await atGet(env, TABLE, id);
  return jsonOk({ record: toClient(r) });
}

async function createProject(request, env) {
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
  const r = await atCreate(env, TABLE, fields);
  return jsonOk({ record: toClient(r) });
}

async function patchProject(request, env, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = mapFields(body);
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");
  const r = await atUpdate(env, TABLE, id, fields);
  return jsonOk({ record: toClient(r) });
}

async function deleteProject(env, id) {
  await atDelete(env, TABLE, id);
  return jsonOk({ deleted: id });
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
  return out;
}
