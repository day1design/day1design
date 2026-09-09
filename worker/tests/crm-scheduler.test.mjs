import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openLocalD1 } from '../../mobile-crm/server/d1-local.mjs';
import { runCrmScheduled } from '../src/lib/crm-scheduler.js';
function setup(){
 const DB=openLocalD1(':memory:');
 for(const file of ['0001_init.sql','0041_consult_booking.sql','0042_contract_fields.sql','0043_consult_cancel.sql','0044_consult_reminders.sql','0045_mobile_crm.sql','0046_crm_notifications.sql','0047_crm_auth.sql','0048_crm_automation.sql','0049_crm_calendar.sql','0050_crm_scheduler.sql','0051_crm_assignment.sql','0052_crm_devices.sql','0053_crm_push.sql','0054_crm_persistent_sessions.sql'])DB.sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 return DB;
}
test('scheduler is off by default and creates one daily owner briefing after 10 KST',async()=>{
 assert.deepEqual(await runCrmScheduled({}),{enabled:false});
 const DB=setup();try{
 const env={DB,CRM_ENABLED:'true',CRM_AUTOMATION_ENABLED:'true'};
 await runCrmScheduled(env,{now:new Date('2026-09-09T00:59:00Z')});
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM CrmDailyBriefings').get().n,0);
 await runCrmScheduled(env,{now:new Date('2026-09-09T01:00:00Z')});
 await runCrmScheduled(env,{now:new Date('2026-09-09T01:15:00Z')});
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM CrmDailyBriefings').get().n,1);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM CrmNotifications').get().n,1);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM CrmNotificationRecipients').get().n,1);
 }finally{DB.sqlite.close();}
});
test('web booking changes create current visit, cancel previous outbox, and hold short notice',async()=>{
 const DB=setup();try{
 const sqlite=DB.sqlite;
 sqlite.prepare("INSERT INTO Estimates(id,Name,Phone,SubmittedAt) VALUES('web-local','Local','010','2026-09-09T00:00:00Z')").run();
 sqlite.prepare("UPDATE Estimates SET ConsultAt='2099-10-01T00:00:00.000Z',ConsultBranch='Office' WHERE id='web-local'").run();
 const first=sqlite.prepare("SELECT * FROM CrmAppointments WHERE id='web-visit-web-local'").get();assert.equal(first.status,'scheduled');
 sqlite.prepare("UPDATE Estimates SET ConsultCancelledAt='2026-09-09T00:00:00Z' WHERE id='web-local'").run();
 assert.equal(sqlite.prepare("SELECT status FROM CrmAppointments WHERE id=?").get(first.id).status,'cancelled');
 assert.equal(sqlite.prepare("SELECT status FROM CrmNotificationOutbox WHERE appointment_id=?").get(first.id).status,'cancelled');
 const soon=new Date(Date.now()+3600000).toISOString();
 sqlite.prepare("UPDATE Estimates SET ConsultAt=?,ConsultCancelledAt='' WHERE id='web-local'").run(soon);
 const outbox=sqlite.prepare("SELECT * FROM CrmNotificationOutbox WHERE appointment_id=? AND status='queued'").get(first.id);
 assert.equal(outbox.blocked_reason,'short_notice_manual_review');
 }finally{DB.sqlite.close();}
});

test('assignment emits individual notification only for assigned active tenant member',()=>{
 const DB=setup();try{
 const s=DB.sqlite;
 s.exec("INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('assigned','day1design','assigned@local.test','staff'); INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('other','day1design','other@local.test','staff')");
 s.exec("INSERT INTO Estimates(id,Name,Phone) VALUES('assigned-customer','Local','010'); UPDATE Estimates SET Assignee='assigned@local.test' WHERE id='assigned-customer'");
 const notifications=s.prepare("SELECT id FROM CrmNotifications WHERE event_key LIKE 'assignment:%'").all();assert.equal(notifications.length,1);
 assert.deepEqual(s.prepare('SELECT recipient_id FROM CrmNotificationRecipients WHERE notification_id=?').all(notifications[0].id).map(r=>r.recipient_id),['assigned']);
 }finally{DB.sqlite.close();}
});

test('push runs independently when automation is off and keeps push cursor bounded',async()=>{
 const DB=setup();try{
  const s=DB.sqlite;
  s.exec("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES('push-session','push-hash','day1-owner','2099-01-01T00:00:00Z','2026-09-09T00:00:00Z'); INSERT INTO CrmDevices(id,tenant_id,user_id,session_id,push_token,notifications_enabled,preview_mode,updated_at) VALUES('00000000-0000-4000-8000-000000000099','day1design','day1-owner','push-session','push-test-token',1,'generic','2026-09-09T00:00:00Z')");
  const env={DB,CRM_ENABLED:'true',CRM_PUSH_ENABLED:'true',CRM_PUSH_TENANTS:'day1design',CRM_FCM_PROJECT_ID:'test',CRM_FCM_CLIENT_EMAIL:'test',CRM_FCM_PRIVATE_KEY:'test'};
  const first=await runCrmScheduled(env,{now:new Date('2026-09-09T00:00:00Z'),pushSend:async()=>({accepted:true,messageName:'projects/test/messages/1'})});
  assert.equal(first.tenants[0].push.baseline_initialized,true);
  assert.equal(s.prepare('SELECT COUNT(*) n FROM CrmDailyBriefings').get().n,0);
  s.exec("INSERT INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at) VALUES('push-notification','day1design','staff_message','day1-owner','{}','2026-09-09T01:00:00Z'); INSERT INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) VALUES('push-notification','day1design','day1-owner','2026-09-09T01:00:00Z')");
  const second=await runCrmScheduled(env,{now:new Date('2026-09-09T02:00:00Z'),pushSend:async()=>({accepted:true,messageName:'projects/test/messages/2'})});
  assert.equal(second.tenants[0].processed,0);
  assert.equal(second.tenants[0].push.accepted,1);
  assert.equal(s.prepare("SELECT status FROM CrmPushReceipts WHERE notification_id='push-notification'").get().status,'accepted');
  assert.ok(s.prepare("SELECT cursor_created_at FROM CrmPushCursors WHERE tenant_id='day1design'").get());
 }finally{DB.sqlite.close();}
});

test('push allowlist remains fail closed at scheduler boundary',async()=>{
 const DB=setup();try{
  const env={DB,CRM_ENABLED:'true',CRM_PUSH_ENABLED:'true',CRM_FCM_PROJECT_ID:'test',CRM_FCM_CLIENT_EMAIL:'test',CRM_FCM_PRIVATE_KEY:'test'};
  const result=await runCrmScheduled(env,{now:new Date('2026-09-09T00:00:00Z'),pushSend:()=>{throw new Error('must not send')}});
  assert.equal(result.tenants[0].push.configured,false);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM CrmPushCursors').get().n,0);
 }finally{DB.sqlite.close();}
});
