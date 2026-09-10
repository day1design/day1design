import { readCrmJson } from '../lib/crm-request.js';
import {
  createInternalNotification, listMyNotifications, getMyNotification, markNotificationRead, markAllNotificationsRead,
  listNotificationTemplates, upsertNotificationTemplate, previewNotificationTemplate,
} from '../lib/crm-notification-store.js';
import { buildCustomerSms } from '../lib/sens.js';
import { json, jsonError } from '../lib/response.js';

async function readBody(request) { return readCrmJson(request, 16384); }

async function listMobileMessageTemplates(db, actor) {
  const templates = await listNotificationTemplates(db, { actor });
  if (actor.tenant_id !== 'day1design') return templates;
  const intake = {
    tenant_id: actor.tenant_id,
    kind: 'intake',
    state: 'configured',
    body: buildCustomerSms('homepage'),
    enabled: true,
    draft_enabled: false,
    operational_enabled: null,
    source: 'homepage',
    message_type: 'LMS',
    editable: false,
  };
  const found = templates.some((item) => item.kind === 'intake');
  return found
    ? templates.map((item) => item.kind === 'intake' ? { ...item, ...intake } : item)
    : [intake, ...templates];
}

export async function handleMobileNotifications(request, env, auth) {
  const url = new URL(request.url);
  const path = url.pathname.slice('/api/mobile'.length);
  const readMatch = path.match(/^\/notifications\/([A-Za-z0-9_-]{1,100})\/read$/);
  const detailMatch = path.match(/^\/notifications\/([A-Za-z0-9_-]{1,100})$/);
  if (!['/notifications','/notifications/read-all','/message-templates','/message-preview'].includes(path) && !readMatch && !detailMatch) return null;
  const actor = {
    id: auth.id || auth.user_id,
    tenant_id: auth.tenant_id,
    role: auth.role,
    support_session_id: auth.support_session_id,
    support_mode: auth.support_mode,
    support_readonly: auth.support_readonly,
    token: auth.token,
  };
  try {
    if (path === '/notifications' && request.method === 'GET') {
      const cursor = url.searchParams.get('cursor');
      if (cursor && !/^[A-Za-z0-9_-]{1,100}$/.test(cursor)) return jsonError(400,'invalid_cursor');
      return json(await listMyNotifications(env.DB,{actor,env,cursor}));
    }
    if (detailMatch && request.method === 'GET') return json(await getMyNotification(env.DB,{actor,env,notificationId:detailMatch[1]}));
    if (path === '/notifications/read-all' && request.method === 'POST') return json(await markAllNotificationsRead(env.DB,{actor,env}));
    if (readMatch && request.method === 'POST') return json(await markNotificationRead(env.DB,{actor,env,notificationId:readMatch[1]}));
    if (path === '/message-templates' && request.method === 'GET') {
      if (actor.role !== 'owner') return jsonError(403,'owner_required');
      return json({templates:await listMobileMessageTemplates(env.DB, actor)});
    }
    if (actor.role !== 'owner') return jsonError(403,'owner_required');
    if (request.method !== 'POST') return jsonError(405,'Method Not Allowed');
    const data=await readBody(request);
    if (path === '/notifications') {
      if (!['all','selected'].includes(data.mode) || !Array.isArray(data.recipient_ids) || data.recipient_ids.length>100 || data.recipient_ids.some(id=>typeof id!=='string' || id.length>100)) return jsonError(400,'invalid_recipients');
      if(typeof data.message!=='string' || !data.message.trim() || data.message.length>2000) return jsonError(400,'invalid_message');
      return json(await createInternalNotification(env.DB,{actor,type:'staff_message',mode:data.mode,recipientIds:data.recipient_ids,payload:{message:data.message.trim()}}),{status:201});
    }
    if (path === '/message-templates') {
      if(data.state && data.state!=='draft') return jsonError(403,'approved_template_requires_platform_review');
      if(typeof data.body!=='string' || data.body.length>5000 || typeof data.enabled!=='boolean') return jsonError(400,'invalid_template');
      return json(await upsertNotificationTemplate(env.DB,{actor,kind:data.kind,state:'draft',body:data.body,enabled:data.enabled}));
    }
    if (path === '/message-preview') {
      if(typeof data.body!=='string' || data.body.length>5000 || !data.variables || typeof data.variables!=='object' || Array.isArray(data.variables)) return jsonError(400,'invalid_preview');
      return json(previewNotificationTemplate({kind:data.kind,templateState:'draft',body:data.body,variables:data.variables}));
    }
    return jsonError(405,'Method Not Allowed');
  } catch(error) {
    if(error.message==='notification_not_found') return jsonError(404,'not_found');
    if(['owner_required','tenant_suspended','actor_inactive','tenant_mismatch','platform_access_required'].includes(error.message)) return jsonError(403,'access_denied');
    if(error instanceof TypeError || error instanceof SyntaxError || ['notification_audience_empty','notification_audience_too_large'].includes(error.message)) return jsonError(400,error.message);
    return jsonError(503,'notification_storage_unavailable');
  }
}
