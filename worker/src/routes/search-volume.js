// 검색 트렌드 — 네이버 검색광고 키워드도구 월별 실조회수 (search_volume)
//
// 핵심 원칙:
// - 어드민 페이지 = D1 read-only (GET, verifyAdmin JWT)
// - 적재(POST)는 맥미니 collector(server-to-server) 전용 — 정적 ingest secret 검증
// - 같은 keyword+month 는 UPSERT (ON CONFLICT)
//
// 데이터 성격: 키워드도구 모달 차트값(정확한 달력월). open API "월간검색수"는
// 롤링30일이라 부정확 — 모달 차트만 정확. 매월 1일 이후 직전월 확정(크론 매월 2일).

import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin, timingSafeEqual } from "../lib/auth.js";
import { notifyTelegram } from "../lib/telegram.js";

const YM_RE = /^\d{4}-\d{2}$/;

export async function handleSearchVolume(request, env, ctx) {
  const method = request.method;

  // ── GET — D1 read-only (어드민 대시보드) ──
  if (method === "GET") {
    if (!(await verifyAdmin(request, env))) {
      return jsonError(401, "Unauthorized");
    }
    return listSearchVolume(request, env);
  }

  // ── POST — collector 적재 (server-to-server, ingest secret) ──
  if (method === "POST") {
    const token = (request.headers.get("authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (
      !env.SEARCH_VOLUME_TOKEN ||
      !timingSafeEqual(token, env.SEARCH_VOLUME_TOKEN)
    ) {
      return jsonError(401, "Unauthorized");
    }
    if (
      !(request.headers.get("content-type") || "").includes("application/json")
    ) {
      return jsonError(415, "Content-Type must be application/json");
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "invalid json");
    }
    if (!Array.isArray(body.rows)) {
      return jsonError(400, "rows[] required");
    }
    try {
      const written = await upsertSearchVolume(env, body.rows);
      return jsonOk({ received: body.rows.length, written });
    } catch (e) {
      ctx.waitUntil(
        notifyTelegram(
          env,
          `[day1design/search-volume] POST 실패\n${(e?.message || "").slice(0, 200)}`,
        ),
      );
      return jsonError(500, "Internal Server Error");
    }
  }

  return jsonError(405, "Method Not Allowed");
}

// keyword 미지정 시 전체. { items, total, keywords } 반환.
async function listSearchVolume(request, env) {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 1),
    1000,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") || "0", 10) || 0,
    0,
  );

  const where = keyword ? "WHERE keyword = ?" : "";
  const params = keyword ? [keyword] : [];

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM search_volume ${where}`,
  )
    .bind(...params)
    .first();
  const itemsRes = await env.DB.prepare(
    `SELECT keyword, month, pc, mobile, total, source, collected_at
       FROM search_volume ${where}
       ORDER BY keyword ASC, month DESC
       LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all();
  const kwRes = await env.DB.prepare(
    `SELECT DISTINCT keyword FROM search_volume ORDER BY keyword ASC`,
  ).all();

  return jsonOk({
    items: itemsRes.results || [],
    total: Number(countRow?.c || 0),
    keywords: (kwRes.results || []).map((r) => r.keyword),
  });
}

// 월별 실조회수 upsert (keyword+month 유니크). 반환: 기록된 행 수.
async function upsertSearchVolume(env, rows) {
  const stmts = [];
  for (const r of rows) {
    if (!r || typeof r.keyword !== "string" || !YM_RE.test(r.month || "")) {
      continue;
    }
    const kw = r.keyword.trim().slice(0, 100);
    if (!kw) continue;
    const pc = Math.max(0, Math.round(Number(r.pc) || 0));
    const mo = Math.max(0, Math.round(Number(r.mobile) || 0));
    stmts.push(
      env.DB.prepare(
        `INSERT INTO search_volume (keyword, month, pc, mobile, total, source, collected_at)
         VALUES (?, ?, ?, ?, ?, 'searchad_kwtool', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(keyword, month) DO UPDATE SET
           pc = excluded.pc, mobile = excluded.mobile, total = excluded.total,
           collected_at = excluded.collected_at`,
      ).bind(kw, r.month, pc, mo, pc + mo),
    );
  }
  if (!stmts.length) return 0;
  await env.DB.batch(stmts);
  return stmts.length;
}
