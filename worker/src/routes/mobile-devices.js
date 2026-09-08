import {readCrmJson} from '../lib/crm-request.js';
import {json, jsonError} from '../lib/response.js';

const deviceId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function handleMobileDevices(request,env,auth) {
  const path=new URL(request.url).pathname;
  const match=path.match(/^\/api\/mobile\/devices\/([^/]+)$/);
  if(path!=='/api/mobile/devices' && !match)return null;
  const user=auth.user_id || auth.id, now=new Date().toISOString();
  if(!auth.session_id)return jsonError(401,'authentication required');
  if(match && !deviceId.test(match[1]))return jsonError(400,'invalid device');
  if(request.method==='GET' && !match) {
    const rows=await env.DB.prepare('SELECT id,notifications_enabled,preview_mode,updated_at FROM CrmDevices WHERE tenant_id=? AND user_id=? ORDER BY id LIMIT 5').bind(auth.tenant_id,user).all();
    return json({devices:rows.results || []});
  }
  if(request.method==='DELETE' && match) {
    const result=await env.DB.prepare('DELETE FROM CrmDevices WHERE id=? AND tenant_id=? AND user_id=?').bind(match[1],auth.tenant_id,user).run();
    return result.meta.changes?json({removed:true}):jsonError(404,'device not found');
  }
  if(request.method!=='POST' || match)return jsonError(405,'Method Not Allowed');
  let value;
  try {value=await readCrmJson(request,8192);} catch {return jsonError(400,'invalid device payload');}
  if(!deviceId.test(value.id || '') || typeof value.push_token!=='string' || !/^[A-Za-z0-9_:.-]{20,4096}$/.test(value.push_token)
    || typeof value.notifications_enabled!=='boolean' || !['generic','details'].includes(value.preview_mode || 'generic')
    || Object.keys(value).some(k=>!['id','push_token','notifications_enabled','preview_mode'].includes(k)))return jsonError(400,'invalid device payload');
  const guard=crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO CrmMutationGuard(id,allowed) VALUES(?,CASE WHEN EXISTS(
        SELECT 1 FROM CrmSessions s JOIN CrmUsers u ON u.id=s.user_id JOIN CrmTenants t ON t.id=u.tenant_id
        WHERE s.id=? AND s.user_id=? AND u.tenant_id=? AND s.revoked_at IS NULL AND s.expires_at>?
        AND u.active=1 AND t.suspended=0) THEN 1 ELSE 0 END)`).bind(guard,auth.session_id,user,auth.tenant_id,now),
      env.DB.prepare(`DELETE FROM CrmDevices WHERE (id=? OR push_token=?) AND session_id IN
        (SELECT id FROM CrmSessions WHERE id=CrmDevices.session_id AND (expires_at<=? OR revoked_at IS NOT NULL))`).bind(value.id,value.push_token,now),
      env.DB.prepare(`INSERT INTO CrmMutationGuard(id,allowed) VALUES(?,CASE WHEN
        NOT EXISTS(SELECT 1 FROM CrmDevices WHERE (id=? OR push_token=?) AND (tenant_id<>? OR user_id<>?))
        AND ((SELECT COUNT(*) FROM CrmDevices WHERE tenant_id=? AND user_id=?)<5
        OR EXISTS(SELECT 1 FROM CrmDevices WHERE id=? AND tenant_id=? AND user_id=?)) THEN 1 ELSE 0 END)`)
        .bind(guard+'-limit',value.id,value.push_token,auth.tenant_id,user,auth.tenant_id,user,value.id,auth.tenant_id,user),
      env.DB.prepare(`INSERT INTO CrmDevices(id,tenant_id,user_id,session_id,push_token,notifications_enabled,preview_mode,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,push_token=excluded.push_token,
        notifications_enabled=excluded.notifications_enabled,preview_mode=excluded.preview_mode,updated_at=excluded.updated_at`)
        .bind(value.id,auth.tenant_id,user,auth.session_id,value.push_token,value.notifications_enabled?1:0,value.preview_mode || 'generic',now),
      env.DB.prepare('DELETE FROM CrmMutationGuard WHERE id IN (?,?)').bind(guard,guard+'-limit')
    ]);
    return json({id:value.id,registered:true,delivery_verified:false});
  } catch(error) {
    if(/allowed = 1|UNIQUE constraint/.test(String(error.message)))return jsonError(409,'device registration conflict');
    return jsonError(503,'device registration unavailable');
  }
}
