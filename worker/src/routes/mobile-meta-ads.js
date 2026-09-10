import { readCachedCrmMetaAdCards } from '../lib/crm-meta-ad-cards.js';
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

async function latestMetaCreative(env, tenantId, adId) {
  let catalog = null;
  try {
    catalog = await env.DB.prepare("SELECT SnapshotDate AS Date,CreativeId,VideoId,Status FROM MetaAdsCreativeCatalog INDEXED BY idx_meta_creative_catalog_tenant_adid_date WHERE CrmTenantId=? AND AdId=? AND SnapshotDate=(SELECT SnapshotDate FROM MetaAdsCreativeCatalog INDEXED BY idx_meta_creative_catalog_tenant_date_adid WHERE CrmTenantId=? ORDER BY SnapshotDate DESC LIMIT 1) LIMIT 1").bind(tenantId, adId, tenantId).first();
  } catch (_) {}
  return catalog;
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
      requireCurrentCatalog: true,
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
        const active = ['ACTIVE', 'ON'].includes(String(card.status || '').toUpperCase());
        return { ...card, creative: {
          id: card.creative?.id || null,
          type: card.creative?.type || null,
          imagePath: card.creative?.id && adId && active && card.creative?.imageAssetReady === true ? `/api/mobile/meta/ads/${adId}/image?start=${query.startDate}&end=${query.endDate}` : null,
          videoId,
          videoPreviewPath: null,
        } };
      });
      return jsonOk({ ...data, creativeColumns: undefined, cards });
    } catch {
      return jsonError(503, 'meta_ad_cards_unavailable');
    }
  }
  const videoMatch = /^\/meta\/ads\/([0-9]{1,30})\/video-preview$/.exec(path);
  if (videoMatch) {
    return jsonError(410, 'meta_video_preview_unsupported');
  }
  const match = /^\/meta\/ads\/([0-9]{1,30})\/image$/.exec(path);
  if (!match) return jsonError(404, 'not found');
  const imageUrl = new URL(request.url);
  let range;
  try {
    range = dateRange(imageUrl.searchParams.get('start'), imageUrl.searchParams.get('end'));
    if (range.days > 31) throw new Error('range');
  } catch { return jsonError(400, 'meta_query_invalid'); }
  const row = await latestMetaCreative(env, auth.tenant_id, match[1]);
  if (!row?.CreativeId || !['ACTIVE', 'ON'].includes(String(row.Status || '').toUpperCase()) || !env.CRM_CACHE) return jsonError(404, 'meta_preview_unavailable');
  let key = '';
  try {
    const asset = await env.DB.prepare("SELECT R2Key FROM MetaAdsMediaAssets WHERE CrmTenantId=? AND Kind='image' AND MediaId=? AND State='ready' LIMIT 1").bind(auth.tenant_id, String(row.CreativeId)).first();
    key = String(asset?.R2Key || '');
  } catch { return jsonError(404, 'meta_preview_unavailable'); }
  if (!/^meta-ads\/(?:thumbs|images)\/[A-Za-z0-9._-]{1,200}$/.test(key)) return jsonError(404, 'meta_preview_unavailable');
  const object = await env.CRM_CACHE.get(key);
  if (!object) return jsonError(404, 'meta_preview_unavailable');
  const mime = String(object.httpMetadata?.contentType || '').split(';')[0];
  if (!Number.isSafeInteger(object.size) || object.size <= 0 || object.size > 2 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(mime)) {
    if (object.body?.cancel) await object.body.cancel();
    return jsonError(503, 'meta_preview_invalid');
  }
  return new Response(object.body, { headers: { 'content-type': mime, 'content-length': String(object.size), 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
