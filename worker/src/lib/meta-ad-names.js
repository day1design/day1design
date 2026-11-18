// 랜딩 접수 알림에 실제 캠페인·광고 이름을 싣는다(2026-11-18 사용자 지시: "utm 축약어가 들어오면
// 먼지 모르니깐 출처부분에 캠페인 / 광고명").
// 랜딩 주소에는 캠페인 ID(utm_id)와 소재 코드(utm_content: p1·p1a 등)만 오므로, Meta 에서 그
// 캠페인의 광고 이름 목록을 받아 이름을 '_' 로 나눈 조각에 소재 코드가 있는 광고 하나를 고른다
// (예: p1 → 261107_C_P1_내 삶의 가장 큰 결심). 1시간 캐시·3초 제한, 실패하면 null 이고 알림은
// 예전처럼 코드로 나간다. 알림 발송 단계에서만 부르므로 고객 응답은 기다리지 않는다.
const GRAPH = "https://graph.facebook.com/v21.0/";
const CACHE_PREFIX = "https://meta-ad-names.internal/campaign/";
const TTL_SECONDS = 3600;

async function fetchCampaign(id, token) {
  const url = `${GRAPH}${id}?fields=name,ads.limit(50){name}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.name) return null;
  return { name: String(j.name), ads: (j.ads?.data || []).map((a) => String(a?.name || "")).filter(Boolean) };
}

async function campaignInfo(id, token, { fresh = false } = {}) {
  const cache = globalThis.caches?.default;
  const key = new Request(CACHE_PREFIX + id);
  if (cache && !fresh) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) return { ...(await hit.json()), cached: true };
  }
  const info = await fetchCampaign(id, token);
  if (info && cache) {
    await cache
      .put(key, Response.json(info, { headers: { "Cache-Control": `max-age=${TTL_SECONDS}` } }))
      .catch(() => {});
  }
  return info;
}

function pickAd(ads, code) {
  const want = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(want)) return "";
  const hits = ads.filter((name) => name.toUpperCase().split("_").includes(want));
  return hits.length === 1 ? hits[0] : "";
}

export async function lookupLandingAdNames(env, { campaignId, code }) {
  const id = String(campaignId || "").trim();
  const token = env?.META_AD_ACCESS_TOKEN;
  if (!token || !/^\d{6,25}$/.test(id)) return null;
  try {
    let info = await campaignInfo(id, token);
    if (!info) return null;
    let ad = pickAd(info.ads, code);
    // 캐시 뒤에 광고를 새로 더했을 수 있으니 못 찾으면 한 번만 새로 받는다.
    if (!ad && code && info.cached) {
      info = (await campaignInfo(id, token, { fresh: true })) || info;
      ad = pickAd(info.ads, code);
    }
    return { campaign: info.name, ad };
  } catch {
    return null;
  }
}
