// ─── 상담신청 메모 쓰레드 + 회차 조회 ───
// D1 EstimateMemos 테이블. 1 건당 여러 메모 (쓰레드형).
//   GET    /api/estimates/:id/memos        → 해당 상담의 메모 목록 (오래된 순)
//   POST   /api/estimates/:id/memos        → 새 메모 추가
//   PATCH  /api/estimates/:id/memos/:mid   → 메모 수정
//   DELETE /api/estimates/:id/memos/:mid   → 메모 삭제
//   GET    /api/estimates/:id/history      → 동일 phone 기준 과거 접수 회차

import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { d1Create, d1Get, d1Update, d1Delete, d1ListAll } from "../lib/d1.js";

const TBL_ESTIMATE = "Estimates";
const TBL_MEMO = "EstimateMemos";

function normalizePhone(s) {
  return String(s || "").replace(/\D/g, "");
}

// -- memos ----------------------------------------------------

export async function handleMemos(request, env, ctx, estimateId, memoId) {
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");

  if (request.method === "GET") return listMemos(env, estimateId);
  if (request.method === "POST") return createMemo(request, env, estimateId);
  if (memoId && request.method === "PATCH")
    return updateMemo(request, env, memoId);
  if (memoId && request.method === "DELETE") return deleteMemo(env, memoId);
  return jsonError(404, "Not Found");
}

async function listMemos(env, estimateId) {
  const records = await d1ListAll(env, TBL_MEMO, {
    where: { EstimateId: estimateId },
    sort: [{ field: "CreatedAt", direction: "asc" }],
  });
  const memos = records.map((r) => ({
    id: r.id,
    estimateId: r.fields.EstimateId || "",
    body: r.fields.Body || "",
    author: r.fields.Author || "",
    createdAt: r.fields.CreatedAt || "",
    updatedAt: r.fields.UpdatedAt || "",
  }));
  return jsonOk({ memos });
}

async function createMemo(request, env, estimateId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const text = String(body.body || "").trim();
  if (!text) return jsonError(400, "Body required");
  if (text.length > 4000) return jsonError(400, "Body too long");

  const author = String(body.author || "")
    .trim()
    .slice(0, 40);
  const now = new Date().toISOString();
  const record = await d1Create(env, TBL_MEMO, {
    EstimateId: estimateId,
    Body: text,
    Author: author,
    CreatedAt: now,
    UpdatedAt: now,
  });
  return jsonOk({
    memo: {
      id: record.id,
      estimateId,
      body: text,
      author,
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function updateMemo(request, env, memoId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const text = String(body.body || "").trim();
  if (!text) return jsonError(400, "Body required");
  if (text.length > 4000) return jsonError(400, "Body too long");
  const now = new Date().toISOString();
  const record = await d1Update(env, TBL_MEMO, memoId, {
    Body: text,
    UpdatedAt: now,
  });
  return jsonOk({
    memo: {
      id: record.id,
      estimateId: record.fields.EstimateId || "",
      body: record.fields.Body || "",
      author: record.fields.Author || "",
      createdAt: record.fields.CreatedAt || "",
      updatedAt: record.fields.UpdatedAt || "",
    },
  });
}

async function deleteMemo(env, memoId) {
  await d1Delete(env, TBL_MEMO, memoId);
  return jsonOk({ deleted: memoId });
}

// -- history (회차 조회) --------------------------------------

export async function handleHistory(request, env, ctx, estimateId) {
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");

  // 현재 레코드 → phone 추출
  let current;
  try {
    current = await d1Get(env, TBL_ESTIMATE, estimateId);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Estimate not found");
    throw e;
  }
  const myPhoneDigits = normalizePhone(current.fields.Phone);
  const myEmail = String(current.fields.Email || "")
    .trim()
    .toLowerCase();

  if (!myPhoneDigits && !myEmail) {
    return jsonOk({ sessionNo: 1, previous: [] });
  }

  // 동일 고객 후보군 조회 (단순 equality 비교용으로 전부 로드 후 JS 필터)
  const all = await d1ListAll(env, TBL_ESTIMATE, {
    sort: [{ field: "SubmittedAt", direction: "asc" }],
  });

  const matched = all.filter((r) => {
    const p = normalizePhone(r.fields.Phone);
    const e = String(r.fields.Email || "")
      .trim()
      .toLowerCase();
    if (myPhoneDigits && p && p === myPhoneDigits) return true;
    if (myEmail && e && e === myEmail) return true;
    return false;
  });

  const sessionNo =
    matched.findIndex((r) => r.id === estimateId) + 1 || matched.length;

  const previous = matched
    .filter((r) => r.id !== estimateId)
    .map((r) => ({
      id: r.id,
      submittedAt: r.fields.SubmittedAt || "",
      source: r.fields.Source || "homepage",
      status: r.fields.Status || "",
      branch: r.fields.Branch || "",
      spaceType: r.fields.SpaceType || "",
      spaceSize: r.fields.SpaceSize || "",
    }))
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1)); // 최신이 위

  const prevLatest = previous[0] || null;

  return jsonOk({
    sessionNo,
    total: matched.length,
    previous,
    previousLatest: prevLatest,
  });
}
