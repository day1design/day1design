import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openLocalD1} from '../../mobile-crm/server/d1-local.mjs';
import {handleMobileNotifications} from '../src/routes/mobile-notifications.js';

function fixture() {
  const DB=openLocalD1(':memory:');
  for(const name of ['0001_init.sql','0041_consult_booking.sql','0042_contract_fields.sql','0043_consult_cancel.sql','0044_consult_reminders.sql','0045_mobile_crm.sql','0046_crm_notifications.sql','0047_crm_auth.sql']) DB.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  DB.sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('test-staff','day1design','staff@test.local','staff')").run();
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
