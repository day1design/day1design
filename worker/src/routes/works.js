// ─── 업무관리(Works) — 캘린더 히트맵 + 날짜별 업무 + 코멘트 스레드 ───
// 폴라애드가 데이원디자인 업무를 기록/완료처리하고, 데이원디자인(광고주)이 코멘트로 피드백.
// 작성자 식별: 전화번호 뒤 4자리(/api/whoami). 폴라애드=WORKS_ADMIN_PHONE4(기본 9834),
//             광고주=Clients.Phone4. 작성/수정/완료처리=관리자(폴라애드)만, 코멘트=양쪽.
//
//   POST   /api/whoami                       → {phone} 뒤4자리로 역할 식별 (미등록은 ok:false 200)
//   GET    /api/clients                      → 광고주 목록 (id, brand) — phone4 비노출
//   GET    /api/works?client=&month=         → 해당 광고주·월 업무 목록
//   POST   /api/works                        → 업무 기록 추가 (관리자만)
//   PATCH  /api/works/:id                    → 업무 수정/완료처리 (관리자만)
//   GET    /api/works/:id/comments           → 코멘트 목록
//   POST   /api/works/:id/comments           → 코멘트 등록 (등록된 번호면 양쪽)
//
// 접근: 모든 엔드포인트는 admin origin + 어드민 로그인(verifyAdmin) 필요(어드민 셸 공통).
//      그 위에 phone4 로 작성권한(역할)을 구분한다.

import { json, jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin, timingSafeEqual } from "../lib/auth.js";
import { clientIP } from "../lib/security.js";
import { createServices } from "../lib/services.js";

const TYPES = ["완료", "진행", "특이사항"];

function phone4Of(p) {
  return String(p || "")
    .replace(/\D/g, "")
    .slice(-4);
}

// YYYY-MM-DD 형식 + 실제 달력 유효성 (2026-13-99 등 차단)
function isYmd(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + "T00:00:00Z");
  return !isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
}

async function identify(env, services, phone) {
  const p4 = phone4Of(phone);
  if (p4.length !== 4) return null;
  const adminP4 = String(env.WORKS_ADMIN_PHONE4 || "9834");
  if (timingSafeEqual(p4, adminP4)) return { role: "admin", label: "폴라애드" };
  const clients = await services.clients.listAll({
    sort: [{ field: "Order", direction: "asc" }],
  });
  const row = clients.find((c) =>
    timingSafeEqual(p4, String(c.fields.Phone4 || "")),
  );
  return row
    ? { role: "client", label: row.fields.Brand || "광고주", clientId: row.id }
    : null;
}

function workToJson(r) {
  const f = r.fields;
  return {
    id: r.id,
    client_id: f.ClientId || "",
    date: f.Date || "",
    type: f.Type || "",
    title: f.Title || "",
    body: f.Body || "",
    author_label: f.AuthorLabel || "",
    ip: f.IP || "",
    created_at: f.CreatedAt || "",
    completed_at: f.CompletedAt || null,
  };
}

function commentToJson(r) {
  const f = r.fields;
  return {
    role: f.Role || "",
    label: f.Label || "",
    body: f.Body || "",
    ip: f.IP || "",
    created_at: f.CreatedAt || "",
  };
}

export async function handleWorks(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const ip = clientIP(request);

  // ── 작성자 식별 ──
  if (path === "/api/whoami") {
    if (method !== "POST") return jsonError(405, "Method Not Allowed");
    let b;
    try {
      b = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const who = await identify(env, services, b.phone);
    // 미등록 번호 = ok:false 200 (401 금지 — 프론트 전역 로그아웃 리다이렉트 방지)
    if (!who) return json({ ok: false });
    return jsonOk({ role: who.role, label: who.label });
  }

  // ── 광고주 목록 (phone4 비노출) ──
  if (path === "/api/clients") {
    if (method !== "GET") return jsonError(405, "Method Not Allowed");
    const clients = await services.clients.listAll({
      sort: [{ field: "Order", direction: "asc" }],
    });
    return jsonOk({
      items: clients.map((c) => ({ id: c.id, brand: c.fields.Brand || "" })),
    });
  }

  // ── 월별 업무 목록 ──
  if (path === "/api/works" && method === "GET") {
    const client = url.searchParams.get("client") || "";
    const month = url.searchParams.get("month") || "";
    if (!/^\d{4}-\d{2}$/.test(month)) return jsonError(400, "bad month");
    const all = await services.works.listAll({
      where: { ClientId: client },
      sort: [
        { field: "Date", direction: "asc" },
        { field: "CreatedAt", direction: "asc" },
      ],
    });
    const items = all
      .filter((r) => String(r.fields.Date || "").startsWith(month + "-"))
      .map(workToJson);
    return jsonOk({ items });
  }

  // ── 업무 기록 추가 (관리자만) ──
  if (path === "/api/works" && method === "POST") {
    let b;
    try {
      b = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const who = await identify(env, services, b.phone);
    if (!who || who.role !== "admin")
      return jsonError(
        403,
        "업무 기록은 폴라애드(관리자)만 작성할 수 있습니다",
      );
    const date = String(b.date || "");
    const type = String(b.type || "완료");
    const title = String(b.title || "").trim();
    if (!isYmd(date)) return jsonError(400, "bad date");
    if (!TYPES.includes(type)) return jsonError(400, "bad type");
    if (!title || title.length > 200) return jsonError(400, "bad title");
    let cl;
    try {
      cl = await services.clients.get(String(b.client_id || ""));
    } catch (e) {
      if (e.notFound) return jsonError(400, "bad client");
      throw e;
    }
    const rec = await services.works.create({
      ClientId: cl.id,
      Date: date,
      Type: type,
      Title: title,
      Body: String(b.body || "").slice(0, 2000),
      AuthorLabel: who.label,
      IP: ip,
      CreatedAt: new Date().toISOString(),
    });
    return jsonOk({ id: rec.id });
  }

  // ── 코멘트 ──
  let m = path.match(/^\/api\/works\/([A-Za-z0-9_-]+)\/comments$/);
  if (m && method === "GET") {
    const all = await services.workComments.listAll({
      where: { WorkId: m[1] },
      sort: [{ field: "CreatedAt", direction: "asc" }],
    });
    return jsonOk({ items: all.map(commentToJson) });
  }
  if (m && method === "POST") {
    let b;
    try {
      b = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const who = await identify(env, services, b.phone);
    if (!who) return jsonError(403, "등록되지 않은 번호입니다");
    const body = String(b.body || "").trim();
    if (!body || body.length > 1000) return jsonError(400, "bad body");
    try {
      await services.works.get(m[1]);
    } catch (e) {
      if (e.notFound) return jsonError(404, "not found");
      throw e;
    }
    await services.workComments.create({
      WorkId: m[1],
      Role: who.role,
      Label: who.label,
      Body: body,
      IP: ip,
      CreatedAt: new Date().toISOString(),
    });
    return jsonOk({});
  }

  // ── 업무 수정/완료처리 (관리자만) ──
  m = path.match(/^\/api\/works\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    let b;
    try {
      b = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const who = await identify(env, services, b.phone);
    if (!who || who.role !== "admin")
      return jsonError(403, "업무 변경은 폴라애드(관리자)만 가능합니다");
    let cur;
    try {
      cur = await services.works.get(m[1]);
    } catch (e) {
      if (e.notFound) return jsonError(404, "not found");
      throw e;
    }
    const fields = {};
    if (b.type !== undefined) {
      if (!TYPES.includes(b.type)) return jsonError(400, "bad type");
      fields.Type = b.type;
      // 완료 전환 시 완료시각 기록(기존 없을 때만), 완료 해제 시 비움
      if (b.type === "완료") {
        if (!cur.fields.CompletedAt)
          fields.CompletedAt = new Date().toISOString();
      } else {
        fields.CompletedAt = "";
      }
    }
    if (b.date !== undefined) {
      const d = String(b.date || "");
      if (!isYmd(d)) return jsonError(400, "bad date");
      fields.Date = d;
    }
    if (b.title !== undefined) {
      const t = String(b.title || "").trim();
      if (!t || t.length > 200) return jsonError(400, "bad title");
      fields.Title = t;
    }
    if (b.body !== undefined) {
      fields.Body = String(b.body || "").slice(0, 2000);
    }
    if (!Object.keys(fields).length) return jsonError(400, "no fields");
    await services.works.update(m[1], fields);
    return jsonOk({});
  }

  return jsonError(404, "Not Found");
}
