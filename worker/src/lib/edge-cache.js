// ========== Cloudflare Edge Cache helper ==========
// Workers 공용 캐시. 관리자 리스트 응답을 짧은 TTL로 저장해
// 동일 데이터에 대한 D1 왕복을 줄인다.
// 관리자 인증이 이미 통과된 후에 호출하는 것을 전제한다.

export function cacheKey(namespace) {
  // 프로젝트 내부 전용 key. 외부 접근 불가.
  return new Request(
    `https://cache.internal/day1design/${encodeURIComponent(namespace)}`,
    { method: "GET" },
  );
}

export async function edgeCacheGet(namespace) {
  try {
    const res = await caches.default.match(cacheKey(namespace));
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function edgeCachePut(namespace, data, ttlSeconds = 30, ctx) {
  try {
    const res = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${ttlSeconds}`,
      },
    });
    const task = caches.default.put(cacheKey(namespace), res);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  } catch {}
}

// ── SWR(stale-while-revalidate) 캐시 ────────────────────────────────
//
// 물리 보관은 길게(기본 24시간), 논리 신선도는 짧게 둔다. 캐시가 논리적으로
// 만료돼도 값 자체는 남아 있으므로, D1 이 응답하지 못하면 옛 값이라도 내보낸다.
//
// 2026-09-03 사고: D1 무료 플랜 하루 읽기 한도가 소진되자 포트폴리오·유입통계가
// 그대로 500(Worker 예외)을 냈다. 캐시는 있었지만 max-age 가 지나면 match 가
// null 을 반환해 stale 을 꺼낼 방법이 없었다. 공개 화면은 옛 데이터라도 보이는
// 편이 빈 화면보다 낫다.
const SWR_KEEP_SECONDS = 24 * 60 * 60;

export async function edgeCacheGetSwr(namespace, freshSeconds) {
  try {
    const res = await caches.default.match(cacheKey(namespace));
    if (!res) return null;
    const body = await res.json();
    if (!body || typeof body.__cachedAt !== "number") return null;
    const ageSec = (Date.now() - body.__cachedAt) / 1000;
    return { data: body.data, fresh: ageSec <= freshSeconds, ageSec };
  } catch {
    return null;
  }
}

export async function edgeCachePutSwr(
  namespace,
  data,
  ctx,
  keepSeconds = SWR_KEEP_SECONDS,
) {
  try {
    const res = new Response(JSON.stringify({ __cachedAt: Date.now(), data }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${keepSeconds}`,
      },
    });
    const task = caches.default.put(cacheKey(namespace), res);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  } catch {}
}

export async function edgeCacheDelete(namespace, ctx) {
  try {
    const task = caches.default.delete(cacheKey(namespace));
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    await task;
  } catch {}
}

// 여러 namespace 동시 invalidate
export async function edgeCacheDeleteMany(namespaces, ctx) {
  try {
    const tasks = namespaces.map((ns) => caches.default.delete(cacheKey(ns)));
    const all = Promise.allSettled(tasks);
    if (ctx && ctx.waitUntil) ctx.waitUntil(all);
    await all;
  } catch {}
}
