import { runAppointmentAutomation, createDailyBriefing } from './crm-automation.js';
import { createCrmSensDeliveryAdapter } from './crm-sens.js';
import { processPushBatch } from './crm-push.js';

export async function runCrmScheduled(env, { now = new Date(), pushSend = null } = {}) {
  if (env.CRM_ENABLED !== 'true') return { enabled: false };
  const automationEnabled = env.CRM_AUTOMATION_ENABLED === 'true';
  const pushEnabled = env.CRM_PUSH_ENABLED === 'true';
  if (!automationEnabled && !pushEnabled) return { enabled: false };
  const db=env.DB, at=new Date(now).toISOString();
  const deliveryAdapter = env.CRM_CUSTOMER_DELIVERY_ENABLED === 'true'
    ? createCrmSensDeliveryAdapter(env)
    : null;
  const state=await db.prepare("SELECT cursor FROM CrmSchedulerCursors WHERE key='tenants'").first();
  const tenants=(await db.prepare("SELECT id FROM CrmTenants WHERE id>? AND id<>'platform' AND suspended=0 ORDER BY id LIMIT 6").bind(state?.cursor || '').all()).results || [];
  const kst=new Date(new Date(now).getTime()+9*3600000), date=kst.toISOString().slice(0,10), summaries=[];
  for(const tenant of tenants.slice(0,5)) {
    let result={processed:0,next_cursor:null};
    if (automationEnabled) {
      const key='reminders:'+tenant.id;
      const progress=await db.prepare('SELECT cursor FROM CrmSchedulerCursors WHERE key=?').bind(key).first();
      result=await runAppointmentAutomation(db,{tenantId:tenant.id,now,limit:20,cursor:progress?.cursor || null,deliveryAdapter});
      await db.prepare('INSERT INTO CrmSchedulerCursors(key,cursor,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at').bind(key,result.next_cursor,at).run();
    }
    let push=null;
    if (pushEnabled) {
      push=await processPushBatch(db,{env,tenantId:tenant.id,now,send:pushSend || undefined});
    }
    if(automationEnabled && kst.getUTCHours()>=10){
      const owners=(await db.prepare("SELECT id FROM CrmUsers WHERE tenant_id=? AND active=1 AND role='owner' ORDER BY id LIMIT 21").bind(tenant.id).all()).results || [];
      if(owners.length>20)throw new Error('briefing_owner_limit');
      const yesterday=new Date(kst.getTime()-86400000).toISOString().slice(0,10);
      for(const owner of owners) await createDailyBriefing(db,{tenantId:tenant.id,recipientId:owner.id,date,startDate:yesterday,endDate:yesterday,createdAt:now,now});
    }
    summaries.push({tenant_id:tenant.id,processed:result.processed,push});
  }
  await db.prepare("INSERT INTO CrmSchedulerCursors(key,cursor,updated_at) VALUES('tenants',?,?) ON CONFLICT(key) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at").bind(tenants.length>5?tenants[4].id:null,at).run();
  return {enabled:true,tenants:summaries};
}
