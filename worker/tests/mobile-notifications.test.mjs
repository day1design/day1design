import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openLocalD1} from '../../mobile-crm/server/d1-local.mjs';
import {handleMobileNotifications} from '../src/routes/mobile-notifications.js';
import {hashToken} from '../src/lib/crm-auth.js';

function fixture() {
  const DB=openLocalD1(':memory:');
  for(const name of ['0001_init.sql','0041_consult_booking.sql','0042_contract_fields.sql','0043_consult_cancel.sql','0044_consult_reminders.sql','0045_mobile_crm.sql','0046_crm_notifications.sql','0064_crm_notification_read_all.sql','0064_crm_notification_read_all.sql','0047_crm_auth.sql','0070_crm_support_sessions.sql']) DB.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  DB.sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('test-staff','day1design','staff@test.local','staff')").run();
  DB.sqlite.prepare("INSERT INTO CrmTenants(id,name,brand,logo_url,suspended,created_at) VALUES('other-tenant','Other','other','',0,'2026-09-09T00:00:00Z')").run();
  DB.sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('foreign-owner','other-tenant','owner@other.test','owner')").run();
  return {DB};
}
const owner={id:'day1-owner',tenant_id:'day1design',role:'owner'};
const staff={id:'test-staff',tenant_id:'day1design',role:'staff'};
function request(path,method='GET',body){return new Request('http://localhost/api/mobile'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});}

test('HTTP notification stores selected audience and allows only recipient read',async()=>{
 const env=fixture();try {
 const sent=await handleMobileNotifications(request('/notifications','POST',{mode:'selected',recipient_ids:['test-staff'],message:'가상 업무 확인'}),env,owner);
 assert.equal(sent.status,201); const created=await sent.json();
 const inbox=await handleMobileNotifications(request('/notifications'),env,staff);assert.equal((await inbox.json()).notifications[0].id,created.id);
 assert.equal((await handleMobileNotifications(request('/notifications/'+created.id+'/read','POST'),env,owner)).status,404);
 assert.equal((await handleMobileNotifications(request('/notifications/'+created.id+'/read','POST'),env,staff)).status,200);
 }finally{env.DB.sqlite.close();}
});

test('staff cannot compose and tenant cannot self-approve customer templates',async()=>{
 const env=fixture();try {
 assert.equal((await handleMobileNotifications(request('/notifications','POST',{mode:'all',recipient_ids:[],message:'x'}),env,staff)).status,403);
 assert.equal((await handleMobileNotifications(request('/message-templates','POST',{kind:'visit',state:'approved',body:'x',enabled:true}),env,owner)).status,403);
 const draft=await handleMobileNotifications(request('/message-templates','POST',{kind:'visit',state:'draft',body:'{{name}} {{date}} {{time}} {{location}} {{address}} {{map}} {{phone}}',enabled:false}),env,owner);
 assert.equal(draft.status,200); assert.equal((await draft.json()).state,'draft');
 }finally{env.DB.sqlite.close();}
});

test('edited message preview substitutes customer variables without sending',async()=>{
 const env=fixture();try{
 const response=await handleMobileNotifications(request('/message-preview','POST',{kind:'measurement',body:'수정 {{name}} {{address}} {{map}}',variables:{name:'가상',address:'테스트현장',map:'https://example.test/map'}}),env,owner);
 assert.equal(response.status,200);assert.equal((await response.json()).text,'수정 가상 테스트현장 https://example.test/map');
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM CrmNotificationOutbox').get().n,0);
 }finally{env.DB.sqlite.close();}
});

test('support template reads revalidate the platform actor and target tenant without impersonation',async()=>{
 const env=fixture();try{
  const token='crm_support_template_read';
  env.DB.sqlite.prepare("INSERT INTO CrmSupportSessions(id,token_hash,tenant_id,actor_id,reason,expires_at,created_at) VALUES(?,?,?,?,?,?,?)")
    .run('support-template-read',await hashToken(token),'day1design','platform-owner','',new Date(Date.now()+60000).toISOString(),new Date().toISOString());
  env.DB.sqlite.prepare("INSERT INTO CrmNotificationTemplates(tenant_id,kind,state,body,enabled,updated_by,updated_at) VALUES('day1design','visit','approved','상담 {{name}}',1,'platform-owner',?)").run(new Date().toISOString());
  const support={id:'platform-owner',user_id:'platform-owner',tenant_id:'day1design',role:'owner',support_session_id:'support-template-read',support_mode:'admin',support_readonly:true,token};
  const response=await handleMobileNotifications(request('/message-templates'),env,support);
  assert.equal(response.status,200);
  assert.equal((await response.json()).templates.some((item)=>item.body==='상담 {{name}}'),true);
  env.DB.sqlite.prepare("UPDATE CrmSupportSessions SET revoked_at=? WHERE id='support-template-read'").run(new Date().toISOString());
  assert.equal((await handleMobileNotifications(request('/message-templates'),env,support)).status,403);
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM CrmNotificationOutbox").get().n,0);
 }finally{env.DB.sqlite.close();}
});

test('homepage intake template is scoped to day1design',async()=>{
 const env=fixture();try{
  env.DB.sqlite.prepare("INSERT INTO CrmNotificationTemplates(tenant_id,kind,state,body,enabled,updated_by,updated_at) VALUES('other-tenant','visit','approved','타 업체 문구',1,'foreign-owner',?)").run(new Date().toISOString());
  const response=await handleMobileNotifications(request('/message-templates'),env,{id:'foreign-owner',tenant_id:'other-tenant',role:'owner'});
  assert.equal(response.status,200);
  const templates=(await response.json()).templates;
  assert.equal(templates.some((item)=>item.kind==='intake'),false);
  assert.equal(templates.some((item)=>item.body==='타 업체 문구'),true);
 }finally{env.DB.sqlite.close();}
});
