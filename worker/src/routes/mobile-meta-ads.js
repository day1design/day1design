import { readCachedCrmMetaAdCards } from '../lib/crm-meta-ad-cards.js';
import { metaCreativeThumbKey } from '../lib/crm-meta-preview.js';
import { jsonError, jsonOk } from '../lib/response.js';
import { dateRange } from '../lib/crm-analytics.js';

const budgets = new Map();
function consume(auth) {
  const key = `${auth.tenant_id}:${auth.id}`;
  const now = Date.now();
  let row = budgets.get(key);
  if (!row || now - row.at >= 60_000) {
    if (budgets.size >= 2048) budgets.delete(budgets.keys().next().value);
    row = { at: now, count: 0 };
    budgets.set(key, row);
  }
  return ++row.count <= 120;
}

async function latestMetaCreative(env, tenantId, adId, startDate, endDate) {
  let insight = null;
  let catalog = null;
  try {
    insight = await env.DB.prepare("SELECT Date,CreativeId,VideoId FROM MetaAdsAd INDEXED BY idx_meta_ads_ad_tenant_adid_date WHERE CrmTenantId=? AND AdId=? AND Date BETWEEN ? AND ? ORDER BY Date DESC LIMIT 1").bind(tenantId, adId, startDate, endDate).first();
  } catch (_) {}
  try {
    catalog = await env.DB.prepare("SELECT SnapshotDate AS Date,CreativeId,VideoId FROM MetaAdsCreativeCatalog INDEXED BY idx_meta_creative_catalog_tenant_adid_date WHERE CrmTenantId=? AND AdId=? AND SnapshotDate BETWEEN ? AND ? ORDER BY SnapshotDate DESC LIMIT 1").bind(tenantId, adId, startDate, endDate).first();
  } catch (_) {}
  if (!insight) return catalog;
  if (!catalog) return insight;
  return String(catalog.Date || '') >= String(insight.Date || '') ? catalog : insight;
}

export async function handleMobileMetaAdCards(request, env, auth, path) {
  if (path !== '/meta/ads' && !path.startsWith('/meta/ads/')) return null;
  if (!auth?.id || !auth.tenant_id) return jsonError(401, 'authentication required');
  if (auth.role !== 'owner' || auth.tenant_id !== 'day1design') return jsonError(403, 'owner tenant required');
  if (request.method !== 'GET') return jsonError(405, 'method not allowed');
  if (!consume(auth)) return jsonError(429, 'meta_request_limit');
  if (path === '/meta/ads') {
    const url = new URL(request.url);
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const query = {
      tenantId: auth.tenant_id,
      startDate: url.searchParams.get('start') || today,
      endDate: url.searchParams.get('end') || today,
      limit: url.searchParams.get('limit') || '20',
      cursor: url.searchParams.get('cursor') || '',
    };
    if (!/^(?:[1-9]|1[0-9]|20)$/.test(query.limit) || !/^[0-9]{0,30}$/.test(query.cursor)) return jsonError(400, 'meta_query_invalid');
    try {
      if (dateRange(query.startDate, query.endDate).days > 31) return jsonError(400, 'meta_query_invalid');
    } catch { return jsonError(400, 'meta_query_invalid'); }
    try {
      const data = await readCachedCrmMetaAdCards(env.DB, query);
      const cards = (data.cards || []).map(card => {
        const adId = /^[0-9]{1,30}$/.test(card.adId) ? card.adId : null;
        const videoId = /^[A-Za-z0-9_-]{1,120}$/.test(String(card.creative?.videoId || '')) ? String(card.creative.videoId) : null;
        return { ...card, creative: {
          id: card.creative?.id || null,
          type: card.creative?.type || null,
          imagePath: card.creative?.id && adId ? `/api/mobile/meta/ads/${adId}/image?start=${query.startDate}&end=${query.endDate}` : null,
          videoId,
          videoPreviewPath: videoId && adId ? `/api/mobile/meta/ads/${adId}/video-preview?start=${query.startDate}&end=${query.endDate}` : null,
        } };
      });
      return jsonOk({ ...data, creativeColumns: undefined, cards });
    } catch {
      return jsonError(503, 'meta_ad_cards_unavailable');
    }
  }
  const videoMatch = /^\/meta\/ads\/([0-9]{1,30})\/video-preview$/.exec(path);
  if (videoMatch) {
    const videoUrl = new URL(request.url);
    let range;
    try {
      range = dateRange(videoUrl.searchParams.get('start'), videoUrl.searchParams.get('end'));
      if (range.days > 31) throw new Error('range');
    } catch { return jsonError(400, 'meta_query_invalid'); }
    const row = await latestMetaCreative(env, auth.tenant_id, videoMatch[1], range.startDate, range.endDate);
    const videoId = String(row?.VideoId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(videoId) || !env.CRM_CACHE?.get) return jsonError(404, 'meta_video_unavailable');
    const object = await env.CRM_CACHE.get(`meta-ads/video-previews/${videoId}.json`);
    const size = Number(object?.size);
    if (!object?.body || !Number.isSafeInteger(size) || size <= 0 || size > 8192) { if (object?.body?.cancel) await object.body.cancel(); return jsonError(404, 'meta_video_unavailable'); }
    let payload;
    try { payload = JSON.parse(await new Response(object.body).text()); } catch { return jsonError(404, 'meta_video_unavailable'); }
    const embed = String(payload?.url || '');
    let parsed;
    try { parsed = new URL(embed); } catch { return jsonError(404, 'meta_video_unavailable'); }
    const validPath = parsed.pathname === '/plugins/video.php' || parsed.pathname === '/video/embed' || parsed.pathname.startsWith('/video/embed/');
    const hasAccessToken = [...parsed.searchParams.keys()].some((key) => key.toLowerCase() === 'access_token');
    if (payload?.kind !== 'facebook_embed' || parsed.protocol !== 'https:' || !['facebook.com', 'www.facebook.com'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port || !validPath || hasAccessToken || (payload.video_id && String(payload.video_id) !== videoId)) return jsonError(404, 'meta_video_unavailable');
    return new Response(JSON.stringify({ kind: 'facebook_embed', url: parsed.toString(), updatedAt: String(payload.updatedAt || '').slice(0, 50) }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  }
  const match = /^\/meta\/ads\/([0-9]{1,30})\/image$/.exec(path);
  if (!match) return jsonError(404, 'not found');
  const imageUrl = new URL(request.url);
  let range;
  try {
    range = dateRange(imageUrl.searchParams.get('start'), imageUrl.searchParams.get('end'));
    if (range.days > 31) throw new Error('range');
  } catch { return jsonError(400, 'meta_query_invalid'); }
  const row = await latestMetaCreative(env, auth.tenant_id, match[1], range.startDate, range.endDate);
  if (!row?.CreativeId || !env.CRM_CACHE) return jsonError(404, 'meta_preview_unavailable');
  let key;
  try { key = metaCreativeThumbKey(row.CreativeId); } catch { return jsonError(404, 'meta_preview_unavailable'); }
  const object = await env.CRM_CACHE.get(key);
  if (!object) return jsonError(404, 'meta_preview_unavailable');
  const mime = String(object.httpMetadata?.contentType || '').split(';')[0];
  if (!Number.isSafeInteger(object.size) || object.size <= 0 || object.size > 2 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(mime)) {
    if (object.body?.cancel) await object.body.cancel();
    return jsonError(503, 'meta_preview_invalid');
  }
  return new Response(object.body, { headers: { 'content-type': mime, 'content-length': String(object.size), 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
