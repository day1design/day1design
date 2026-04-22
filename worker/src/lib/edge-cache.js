// ========== Cloudflare Edge Cache helper ==========
// Workers 공용 캐시. 관리자 리스트 응답을 짧은 TTL로 저장해
// 매 요청마다 Airtable을 왕복하지 않도록 한다.
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

export async function edgeCacheDelete(namespace, ctx) {
  try {
    const task = caches.default.delete(cacheKey(namespace));
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  } catch {}
}

// 여러 namespace 동시 invalidate
export async function edgeCacheDeleteMany(namespaces, ctx) {
  const tasks = namespaces.map((ns) => caches.default.delete(cacheKey(ns)));
  const all = Promise.allSettled(tasks);
  if (ctx && ctx.waitUntil) ctx.waitUntil(all);
  else await all;
}
