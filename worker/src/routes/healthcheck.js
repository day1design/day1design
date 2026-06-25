// ─── 시스템 상태(헬스 점검 + 작동로그) 어드민 라우트 ───
//   GET  /api/admin/health           → 최신 점검 + 이력(30)
//   GET  /api/admin/health/events    → 실시간 작동로그(접수 이벤트) 피드. ?status=ok|warn|fail&limit=
//   POST /api/admin/health/run       → 지금 점검(수동) 실행 + 기록 + 텔레그램
// 모두 admin origin + 어드민 로그인(verifyAdmin) 필요.

import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin, timingSafeEqual } from "../lib/auth.js";
import { createServices } from "../lib/services.js";
import { runAndReportHealth } from "../lib/healthcheck.js";

function parseResults(row) {
  let results = [];
  try {
    results = JSON.parse(row.fields.Results || "[]");
  } catch {}
  return {
    id: row.id,
    checkedAt: row.fields.CheckedAt || "",
    overall: row.fields.Overall || "ok",
    triggeredBy: row.fields.TriggeredBy || "cron",
    results,
  };
}

function eventToJson(row) {
  const f = row.fields;
  let steps = {};
  try {
    steps = JSON.parse(f.Steps || "{}");
  } catch {}
  return {
    id: row.id,
    at: f.At || "",
    channel: f.Channel || "",
    source: f.Source || "",
    branch: f.Branch || "",
    name: f.RefName || "",
    phone: f.RefPhone || "",
    geo: f.Geo || "",
    estimateId: f.EstimateId || "",
    steps,
    overall: f.Overall || "ok",
  };
}

export async function handleHealth(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 점검 실행 — 내부 시크릿(서버-서버) 또는 어드민. 사용자 UI 버튼 없음(cron 자동 + 내부 트리거 전용).
  if (path === "/api/admin/health/run" && method === "POST") {
    const provided = request.headers.get("x-health-secret") || "";
    const expected = env.HEALTHCHECK_RUN_SECRET || "";
    const internalOk = !!expected && timingSafeEqual(provided, expected);
    if (!internalOk && !(await verifyAdmin(request, env))) {
      return jsonError(403, "Forbidden");
    }
    const summary = await runAndReportHealth(env, services, {
      triggeredBy: "manual",
      alertOnlyOnIssue: false,
    });
    return jsonOk({
      latest: {
        id: summary.id,
        checkedAt: summary.checkedAt,
        overall: summary.overall,
        triggeredBy: summary.triggeredBy,
        results: summary.results,
      },
    });
  }

  // 조회(목록/이벤트)는 어드민 로그인 필요
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");

  // 작동로그 피드
  if (path === "/api/admin/health/events" && method === "GET") {
    const status = url.searchParams.get("status") || "";
    const limit = Math.min(
      500,
      Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200),
    );
    const where = {};
    if (["ok", "warn", "fail"].includes(status)) where.Overall = status;
    const rows = await services.intakeEvents.list({
      where,
      sort: [{ field: "At", direction: "desc" }],
      limit,
    });
    return jsonOk({ items: rows.records.map(eventToJson) });
  }

  // 최신 + 이력
  if (path === "/api/admin/health" && method === "GET") {
    const rows = await services.healthChecks.list({
      sort: [{ field: "CheckedAt", direction: "desc" }],
      limit: 30,
    });
    const list = rows.records.map(parseResults);
    return jsonOk({ latest: list[0] || null, history: list });
  }

  return jsonError(404, "Not Found");
}
