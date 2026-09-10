import { verifyAdmin } from '../lib/auth.js';
import { jsonOk, jsonError } from '../lib/response.js';

const HOUR = 3600000;
const TTL = 30000;
const BOUNDARY_LIMIT = 2000;
const caches = new WeakMap();

export function dashboardBounds(now = Date.now()) {
  const from = now - 30 * 24 * HOUR;
  return { from: new Date(from).toISOString(), to: new Date(now).toISOString(),
    fullFrom: new Date(Math.ceil(from / HOUR) * HOUR).toISOString(),
    fullTo: new Date(Math.floor(now / HOUR) * HOUR).toISOString() };
}

async function readSummary(db, state, now) {
  const bounds = dashboardBounds(now);
  const results = await db.batch([
    db.prepare('SELECT hour,total,meta,pending FROM AdminDashboardHours WHERE hour>=? AND hour<? ORDER BY hour LIMIT 721').bind(bounds.fullFrom, bounds.fullTo),
    db.prepare("SELECT Source,Status FROM Estimates WHERE CrmTenantId=? AND COALESCE(Status,'')<>'작성중' AND SubmittedAt>=? AND SubmittedAt<? ORDER BY SubmittedAt,id LIMIT 2001").bind('day1design',bounds.from,bounds.fullFrom),
    db.prepare("SELECT Source,Status FROM Estimates WHERE CrmTenantId=? AND COALESCE(Status,'')<>'작성중' AND SubmittedAt>=? AND SubmittedAt<=? ORDER BY SubmittedAt,id LIMIT 2001").bind('day1design',bounds.fullTo,bounds.to),
    db.prepare("SELECT id,Name,Source,Status,SubmittedAt FROM Estimates WHERE CrmTenantId=? AND COALESCE(Status,'')<>'작성중' AND SubmittedAt>'' ORDER BY SubmittedAt DESC,id DESC LIMIT 5").bind('day1design'),
  ]);
  if (results.some(r => r.success === false)) throw new Error('summary_query');
  const [hours,first,last,recent] = results.map(r=>r.results || []);
  if (hours.length > 720 || first.length > BOUNDARY_LIMIT || last.length > BOUNDARY_LIMIT) throw new Error('summary_limit');
  const submissions = { total:0,meta:0,home:0,pending:0 };
  for (const h of hours) { submissions.total+=h.total;submissions.meta+=h.meta;submissions.pending+=h.pending; }
  for (const r of [...first,...last]) { submissions.total++;if(String(r.Source||'').toLowerCase()==='meta')submissions.meta++;if((r.Status||'접수대기')==='접수대기')submissions.pending++; }
  submissions.home=submissions.total-submissions.meta;
  return { counts:{estimates:state.estimates,hero:state.hero,portfolio:state.portfolio,community:state.community},submissions,recent,revision:state.revision,asOf:new Date(now).toISOString(),bounds,periodDays:30 };
}

export async function handleAdminDashboard(request, env) {
  if (request.method !== 'GET') return jsonError(405,'Method Not Allowed');
  if (!(await verifyAdmin(request,env))) return jsonError(401,'Unauthorized');
  if (!env.DB) return jsonError(503,'Dashboard database unavailable');
  try {
    const state=await env.DB.prepare("SELECT revision,estimates,hero,portfolio,community FROM AdminDashboardState WHERE id='day1design'").first();
    if (!state) return jsonError(503,'Dashboard summary migration required');
    let cache=caches.get(env.DB);if(!cache){cache=new Map();caches.set(env.DB,cache);}
    const key=state.revision,now=Date.now();
    for(const [k,v] of cache)if(v.value&&v.expires<=now)cache.delete(k);
    const found=cache.get(key);
    let payload;
    if(found?.value&&found.expires>now)payload=found.value;
    else if(found?.pending)payload=await found.pending;
    else {
      if(cache.size>=8)cache.delete(cache.keys().next().value);
      const item={pending:readSummary(env.DB,state,now)};cache.set(key,item);
      try {payload=await item.pending;item.value=payload;item.expires=Date.now()+TTL;delete item.pending;}
      catch(e){if(cache.get(key)===item)cache.delete(key);throw e;}
    }
    const response=jsonOk(payload);response.headers.set('Cache-Control','private, no-store');return response;
  } catch { return jsonError(503,'Dashboard summary unavailable; retry later'); }
}
