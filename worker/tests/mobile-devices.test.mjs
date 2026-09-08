import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openLocalD1} from '../../mobile-crm/server/d1-local.mjs';
import {handleMobileDevices} from '../src/routes/mobile-devices.js';

function fixture() {
 const DB=openLocalD1(':memory:');
 for(const name of ['0001_init.sql','0041_consult_booking.sql','0042_contract_fields.sql','0043_consult_cancel.sql','0044_consult_reminders.sql','0045_mobile_crm.sql','0052_crm_devices.sql'])DB.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 DB.sqlite.exec("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES('device-session','test','day1-owner','2099-01-01','2026-01-01')");
 return {DB};
}
const auth={id:'day1-owner',tenant_id:'day1design',session_id:'device-session'};
const id='00000000-0000-4000-8000-000000000001';
const payload={id,push_token:'local-test-token-000001',notifications_enabled:true};
function req(method='POST',body=payload,suffix='') {return new Request('http://localhost/api/mobile/devices'+suffix,{method,...(['POST'].includes(method)?{body:JSON.stringify(body)}:{})});}

test('device registration stores safe preview default and never returns token',async()=>{
 const env=fixture();try {
 const response=await handleMobileDevices(req(),env,auth);assert.equal(response.status,200);assert.equal((await response.json()).delivery_verified,false);
 const list=await (await handleMobileDevices(req('GET'),env,auth)).json();assert.equal(list.devices[0].preview_mode,'generic');assert.equal('push_token' in list.devices[0],false);
 assert.equal((await handleMobileDevices(req('POST',{...payload,push_token:'local-test-token-rotated',preview_mode:'details'}),env,auth)).status,200);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM CrmDevices').get().n,1);
 assert.equal((await handleMobileDevices(req('DELETE',null,'/'+id),env,auth)).status,200);
 }finally{env.DB.sqlite.close();}
});

test('revocation, deactivation and tenant suspension remove device registration',async()=>{
 for(const sql of ["UPDATE CrmSessions SET revoked_at='2026-09-09' WHERE id='device-session'","UPDATE CrmUsers SET active=0 WHERE id='day1-owner'","UPDATE CrmTenants SET suspended=1 WHERE id='day1design'"]) {
 const env=fixture();try {await handleMobileDevices(req(),env,auth);env.DB.sqlite.exec(sql);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM CrmDevices').get().n,0);assert.equal((await handleMobileDevices(req(),env,auth)).status,409);}finally{env.DB.sqlite.close();}
 }
});

test('another tenant cannot claim token or delete device',async()=>{
 const env=fixture();try {
 await handleMobileDevices(req(),env,auth);
 env.DB.sqlite.exec("INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES('other-session','other','platform-owner','2099-01-01','2026-01-01')");
 const other={id:'platform-owner',tenant_id:'platform',session_id:'other-session'};
 assert.equal((await handleMobileDevices(req('DELETE',null,'/'+id),env,other)).status,404);
 assert.equal((await handleMobileDevices(req(),env,other)).status,409);
 assert.equal(env.DB.sqlite.prepare('SELECT user_id FROM CrmDevices').get().user_id,'day1-owner');
 }finally{env.DB.sqlite.close();}
});

test('registration limits devices and rejects oversized or unknown fields',async()=>{
 const env=fixture();try {
 for(let i=1;i<=5;i++)assert.equal((await handleMobileDevices(req('POST',{...payload,id:id.slice(0,-1)+i,push_token:payload.push_token+i}),env,auth)).status,200);
 assert.equal((await handleMobileDevices(req('POST',{...payload,id:id.slice(0,-1)+'6',push_token:payload.push_token+'6'}),env,auth)).status,409);
 assert.equal((await handleMobileDevices(req('POST',{...payload,tenant_id:'other'}),env,auth)).status,400);
 assert.equal((await handleMobileDevices(req('POST',{...payload,push_token:'x'.repeat(9000)}),env,auth)).status,400);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM CrmDevices').get().n,5);
 }finally{env.DB.sqlite.close();}
});

test('expired registrations can be replaced by a fresh session without old logout deleting new binding',async()=>{
 const env=fixture();try {
 await handleMobileDevices(req(),env,auth);
 env.DB.sqlite.exec("UPDATE CrmSessions SET expires_at='2000-01-01' WHERE id='device-session'; INSERT INTO CrmSessions(id,token_hash,user_id,expires_at,created_at) VALUES('fresh-session','fresh','day1-owner','2099-01-01','2026-01-01')");
 assert.equal((await handleMobileDevices(req(),env,auth)).status,409);
 const fresh={...auth,session_id:'fresh-session'};
 assert.equal((await handleMobileDevices(req(),env,fresh)).status,200);
 env.DB.sqlite.exec("UPDATE CrmSessions SET revoked_at='2026-09-09' WHERE id='device-session'");
 assert.equal(env.DB.sqlite.prepare('SELECT session_id FROM CrmDevices').get().session_id,'fresh-session');
 }finally{env.DB.sqlite.close();}
});
