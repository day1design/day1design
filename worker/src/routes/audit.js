// ────── 관리자 감사 로그 라우트
// GET /api/audit/logs?limit=&offset=&type=&severity=&from=&to=&q=

import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function handleAudit(request, env) {
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/audit/, "") || "/";

  if (path === "/logs" && request.method === "GET") {
    return listLogs(url, env);
  }
  return jsonError(404, "Not Found");
}

async function listLogs(url, env) {
  if (!env.DB) return jsonError(500, "DB unavailable");
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const type = (url.searchParams.get("type") || "").slice(0, 60);
  const severity = (url.searchParams.get("severity") || "").slice(0, 16);
  const from = (url.searchParams.get("from") || "").slice(0, 32);
  const to = (url.searchParams.get("to") || "").slice(0, 32);
  const q = (url.searchParams.get("q") || "").slice(0, 80);

  const where = [];
  const params = [];
  if (type) {
    where.push("Type = ?");
    params.push(type);
  }
  if (severity) {
    where.push("Severity = ?");
    params.push(severity);
  }
  if (from) {
    where.push("CreatedAt >= ?");
    params.push(from);
  }
  if (to) {
    where.push("CreatedAt <= ?");
    params.push(to);
  }
  if (q) {
    where.push(
      "(IP LIKE ? OR Username LIKE ? OR Message LIKE ? OR Path LIKE ?)",
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM AdminAuditLogs ${whereSql}`,
  )
    .bind(...params)
    .first();
  const total = Number(countRes?.total || 0);

  const rowsRes = await env.DB.prepare(
    `SELECT * FROM AdminAuditLogs ${whereSql}
     ORDER BY CreatedAt DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all();

  return jsonOk({
    total,
    limit,
    offset,
    records: rowsRes.results || [],
  });
}
