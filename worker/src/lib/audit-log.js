// ────── 관리자 감사 로그 (AdminAuditLogs)
// D1 에 짧은 메타 + R2 에 큰 페이로드 영속. 실패해도 호출부에 영향 안 주게
// try/catch 로 감싸고 ctx.waitUntil 로 비동기 처리.

function randomId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `aud_${t}${r}`;
}

function clientIPFrom(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

function uaFrom(request) {
  return (request.headers.get("user-agent") || "").slice(0, 240);
}

function urlMeta(request) {
  try {
    const u = new URL(request.url);
    return { path: u.pathname, method: request.method || "GET" };
  } catch {
    return { path: "", method: request.method || "GET" };
  }
}

/**
 * 관리자 감사 로그 기록 (실패 안전).
 *
 * @param {object} env  Worker env (DB, IMAGES 바인딩 필요)
 * @param {object} request  원본 요청 (IP/UA/path 추출용, 없어도 됨)
 * @param {object} log
 *   - type      : string (login_ok/login_fail/rate_limit/error_5xx/...)
 *   - severity  : 'info' | 'warn' | 'error' (기본 'info')
 *   - status    : number (HTTP status 0 이면 미기재)
 *   - username  : string (선택)
 *   - message   : string (200자 권장)
 *   - payload   : 객체. 크면 R2 에 JSON 으로 영속, 키만 D1 에 저장
 */
export async function writeAuditLog(env, request, log = {}) {
  if (!env?.DB) return; // D1 없으면 조용히 skip
  try {
    const id = randomId();
    const createdAt = new Date().toISOString();
    const meta = request ? urlMeta(request) : { path: "", method: "" };
    const ip = request ? clientIPFrom(request) : "";
    const ua = request ? uaFrom(request) : "";
    const severity = log.severity || "info";
    const message = String(log.message || "").slice(0, 480);

    let payloadKey = "";
    if (log.payload && env.IMAGES) {
      try {
        const key = `audit/${createdAt.slice(0, 10)}/${id}.json`;
        await env.IMAGES.put(key, JSON.stringify(log.payload), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        payloadKey = key;
      } catch {}
    }

    await env.DB.prepare(
      `INSERT INTO AdminAuditLogs (
         id, Type, Severity, Path, Method, Status, IP, UA, Username, Message, PayloadKey, CreatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        String(log.type || "").slice(0, 60),
        severity,
        meta.path.slice(0, 240),
        meta.method.slice(0, 16),
        Number(log.status || 0) | 0,
        ip.slice(0, 64),
        ua,
        String(log.username || "").slice(0, 80),
        message,
        payloadKey,
        createdAt,
      )
      .run();
  } catch {
    // audit 실패는 호출부에 영향 0 — 조용히 무시
  }
}

/** ctx.waitUntil 안에서 호출하기 편한 wrapper */
export function queueAudit(ctx, env, request, log) {
  if (!ctx?.waitUntil) return;
  ctx.waitUntil(writeAuditLog(env, request, log));
}
