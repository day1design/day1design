import { verifyAdmin } from '../lib/auth.js';
import { jsonError, jsonOk } from '../lib/response.js';
import { enqueueAdminKpiBatch } from '../lib/admin-kpi-refresh.js';

export async function handleAdminKpiBatches(request, env) {
  if (!(await verifyAdmin(request, env))) return jsonError(401,'Unauthorized');
  if (!env.DB) return jsonError(503,'KPI database unavailable');
  if (request.method === 'POST') {
    if (Number(request.headers.get('content-length')) > 1024) return jsonError(413,'Request too large');
    const reader = request.body?.getReader();
    let text = '', size = 0;
    if (!reader) return jsonError(400,'Body required');
    try {
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 1024) { await reader.cancel(); return jsonError(413,'Request too large'); }
        text += decoder.decode(value,{ stream:true });
      }
      text += decoder.decode();
      const body = JSON.parse(text);
      if (body?.action === 'retry') {
        if (Object.keys(body).some(key => !['action','id'].includes(key)) || typeof body.id !== 'string' || body.id.length > 200) return jsonError(400,'Invalid retry');
        const retried = await env.DB.prepare(`UPDATE AdminKpiJobs SET status='queued',cursor='',payload_json='{}',error_code='',retries=retries+1,updated_at=? WHERE tenant_id='day1design' AND id=? AND status IN ('failed','paused') AND retries<1 RETURNING id`).bind(new Date().toISOString(),body.id).first();
        return retried ? jsonOk({queued:true,id:retried.id}) : jsonError(409,'Batch retry unavailable');
      }
      if (!body || Object.keys(body).some(key => !['kind','startDate','endDate'].includes(key))) return jsonError(400,'Invalid batch fields');
      return jsonOk(await enqueueAdminKpiBatch(env.DB,body));
    } catch { return jsonError(400,'Invalid batch request'); }
  }
  if (request.method !== 'GET') return jsonError(405,'Method Not Allowed');
  const url = new URL(request.url);
  let cursor = ''; 
  try {
    const raw = url.searchParams.get('cursor');
    if (raw) {
      if (raw.length > 512) throw new Error('cursor');
      cursor = raw;
      if (cursor.length > 200) throw new Error('cursor');
    }
  } catch { return jsonError(400,'Invalid cursor'); }
  const result = await env.DB.prepare(`SELECT id,kind,start_date,end_date,status,attempts,error_code,updated_at
    FROM AdminKpiJobs WHERE tenant_id=? AND id>? ORDER BY id LIMIT 21`)
    .bind('day1design',cursor).all();
  const values = result.results || [], items = values.slice(0,20), last = items.at(-1);
  const response = jsonOk({ items,nextCursor:values.length>20 ? last.id : null });
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
