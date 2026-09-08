import {openLocalD1} from '../../mobile-crm/server/d1-local.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleMobileCrm } from "../src/routes/mobile-crm.js";

function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["../migrations/0001_init.sql", "../migrations/0041_consult_booking.sql", "../migrations/0042_contract_fields.sql", "../migrations/0043_consult_cancel.sql", "../migrations/0044_consult_reminders.sql", "../migrations/0045_mobile_crm.sql", "../migrations/0046_crm_notifications.sql", "../migrations/0047_crm_auth.sql"]) sqlite.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  sqlite.prepare("INSERT INTO Estimates(id,Name,Phone,Email,Branch,Status,SubmittedAt) VALUES(?,?,?,?,?,?,?)").run("estimate-1", "고객 A", "010", "a@example.com", "강남", "new", new Date().toISOString());
  return sqlite;
}

function d1(sqlite) { return openLocalD1(sqlite); }

function req(path, method = "GET", value, token) {
  const headers = { "content-type": "application/json", "cf-connecting-ip": "127.0.0.1" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://test.local${path}`, { method, headers, body: value === undefined ? undefined : JSON.stringify(value) });
}

async function setup() {
  const sqlite = makeDb(); const delivered = [];
  const env = { DB: d1(sqlite), CRM_ENABLED: "true", CRM_OTP_SECRET: "test-secret", CRM_OTP_DELIVER: async (payload) => delivered.push(payload) };
  return { sqlite, delivered, env };
}

test("feature gate and unknown email are safe", async () => {
  const sqlite = makeDb();
  const disabled = await handleMobileCrm(req("/api/mobile/auth/request-otp", "POST", { email: "x@example.com" }), { DB: d1(sqlite) });
  assert.equal(disabled.status, 404);
  const { env } = await setup();
  const unknown = await handleMobileCrm(req("/api/mobile/auth/request-otp", "POST", { email: "x@example.com" }), env);
  assert.equal(unknown.status, 200); assert.deepEqual(await unknown.json(), { ok: true, requested: true });
  sqlite.close();
});

test("OTP creates scoped session and reads mapped customer", async () => {
  const { sqlite, delivered, env } = await setup();
  const requested = await handleMobileCrm(req("/api/mobile/auth/request-otp", "POST", { email: "gahyun.co@gmail.com" }), env);
  assert.equal(requested.status, 200); assert.equal(delivered.length, 1);
  const verified = await handleMobileCrm(req("/api/mobile/auth/verify-otp", "POST", { email: "gahyun.co@gmail.com", code: delivered[0].code }), env);
  const token = (await verified.json()).token; assert.equal(verified.status, 200); assert.ok(token);
  const me = await handleMobileCrm(req("/api/mobile/me", "GET", undefined, token), env); const meBody = await me.json();
  assert.equal(meBody.tenant.id, "day1design"); assert.match(meBody.branding.logo, /favicon\/favicon-192/);
  const customers = await handleMobileCrm(req("/api/mobile/customers", "GET", undefined, token), env); assert.equal((await customers.json()).customers[0].id, "estimate-1");
  sqlite.close();
});

test("customer update uses tenant scoped CAS", async () => {
  const { sqlite, delivered, env } = await setup();
  await handleMobileCrm(req("/api/mobile/auth/request-otp", "POST", { email: "gahyun.co@gmail.com" }), env);
  const token = (await (await handleMobileCrm(req("/api/mobile/auth/verify-otp", "POST", { email: "gahyun.co@gmail.com", code: delivered[0].code }), env)).json()).token;
  const updated = await handleMobileCrm(req("/api/mobile/customers/estimate-1", "PATCH", { name: "고객 B", version: 1 }, token), env); assert.equal(updated.status, 200);
  const stale = await handleMobileCrm(req("/api/mobile/customers/estimate-1", "PATCH", { name: "고객 C", version: 1 }, token), env); assert.equal(stale.status, 409);
  sqlite.close();
});

test("subrecords use atomic compare and set", async () => {
  const { sqlite, delivered, env } = await setup();
  await handleMobileCrm(req("/api/mobile/auth/request-otp", "POST", { email: "gahyun.co@gmail.com" }), env);
  const token = (await (await handleMobileCrm(req("/api/mobile/auth/verify-otp", "POST", { email: "gahyun.co@gmail.com", code: delivered[0].code }), env)).json()).token;
  const appointment = await handleMobileCrm(req("/api/mobile/appointments", "POST", { customer_id: "estimate-1", version: 1, kind: "measurement", starts_at: "2026-09-10T01:00:00Z", location: "현장", address: "주소" }, token), env);
  assert.equal(appointment.status, 200);
  const stale = await handleMobileCrm(req("/api/mobile/consultations", "POST", { customer_id: "estimate-1", version: 1, result: "stale" }, token), env);
  assert.equal(stale.status, 409);
  const consultation = await handleMobileCrm(req("/api/mobile/consultations", "POST", { customer_id: "estimate-1", version: 2, result: "완료" }, token), env);
  assert.equal(consultation.status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM EstimateMemos WHERE EstimateId=?").get("estimate-1").count, 1);
  sqlite.close();
});

test('web original changes invalidate app version and legacy memo remains visible',async()=>{
 const {sqlite,env}=await setup();try{
 const {createSession}=await import('../src/lib/crm-auth.js');const token=await createSession(env.DB,'day1-owner');
 sqlite.prepare("UPDATE Estimates SET Name='웹 수정',ConsultAt='2026-09-10T01:00:00Z',ContractAt='2026-09-11T01:00:00Z',ContractAmount=62000000 WHERE id='estimate-1'").run();
 sqlite.prepare("INSERT INTO EstimateMemos(id,EstimateId,Body,Author,CreatedAt) VALUES('legacy','estimate-1','기존 웹 메모','web','2026-09-09T00:00:00Z')").run();
 assert.equal((await handleMobileCrm(req('/api/mobile/customers/estimate-1','PATCH',{name:'stale',version:1},token),env)).status,409);
 const response=await handleMobileCrm(req('/api/mobile/customers/estimate-1','GET',undefined,token),env);const detail=await response.json();
 assert.equal(detail.name,'웹 수정');assert.equal(detail.consultations[0].result,'기존 웹 메모');assert.equal(detail.appointments[0].kind,'visit');assert.equal(detail.contracts[0].amount,62000000);
 }finally{sqlite.close();}
});

test('concurrent app writes yield one winner and failed subrecord rolls back original',async()=>{
 const {sqlite,env}=await setup();try{
 const {createSession}=await import('../src/lib/crm-auth.js');const token=await createSession(env.DB,'day1-owner');
 const responses=await Promise.all(['one','two'].map(result=>handleMobileCrm(req('/api/mobile/consultations','POST',{customer_id:'estimate-1',version:1,result},token),env)));
 assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM EstimateMemos').get().n,1);
 const before=sqlite.prepare("SELECT CrmVersion,ContractAt,ContractAmount FROM Estimates WHERE id='estimate-1'").get();
 sqlite.exec("CREATE TRIGGER fail_contract BEFORE INSERT ON CrmContracts BEGIN SELECT RAISE(ABORT,'fixture storage failure'); END");
 const failed=await handleMobileCrm(req('/api/mobile/contracts','POST',{customer_id:'estimate-1',version:before.CrmVersion,amount:500,status:'signed',signed_at:'2026-09-10T00:00:00Z'},token),env);
 assert.equal(failed.status,503);assert.deepEqual(sqlite.prepare("SELECT CrmVersion,ContractAt,ContractAmount FROM Estimates WHERE id='estimate-1'").get(),before);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM CrmMutationGuard').get().n,0);
 }finally{sqlite.close();}
});

test('another tenant cannot read or mutate Dayone original customer',async()=>{
 const {sqlite,env}=await setup();try{
 sqlite.prepare("INSERT INTO CrmTenants(id,name) VALUES('other','Other')").run();sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('other-owner','other','other@test.local','owner')").run();
 const {createSession}=await import('../src/lib/crm-auth.js');const token=await createSession(env.DB,'other-owner');
 for(const [path,method,data] of [['/customers/estimate-1','GET'],['/customers/estimate-1','PATCH',{name:'x',version:1}],['/consultations','POST',{customer_id:'estimate-1',version:1,result:'x'}]]) assert.equal((await handleMobileCrm(req('/api/mobile'+path,method,data,token),env)).status,404);
 }finally{sqlite.close();}
});


test('web cancellation and rebooking override matching mobile visit status',async()=>{
 const {sqlite,env}=await setup();try{
 const {createSession}=await import('../src/lib/crm-auth.js');const token=await createSession(env.DB,'day1-owner');
 const created=await handleMobileCrm(req('/api/mobile/appointments','POST',{customer_id:'estimate-1',version:1,kind:'visit',starts_at:'2026-09-10T01:00:00Z',location:'Office',address:'Address'},token),env);
 assert.equal(created.status,200);
 sqlite.prepare("UPDATE Estimates SET ConsultCancelledAt='2026-09-09T01:00:00Z' WHERE id='estimate-1'").run();
 let detail=await(await handleMobileCrm(req('/api/mobile/customers/estimate-1','GET',undefined,token),env)).json();
 assert.equal(detail.appointments[0].status,'cancelled');
 sqlite.prepare("UPDATE Estimates SET ConsultAt='2026-09-11T01:00:00Z',ConsultCancelledAt='' WHERE id='estimate-1'").run();
 detail=await(await handleMobileCrm(req('/api/mobile/customers/estimate-1','GET',undefined,token),env)).json();
 assert.equal(detail.appointments.filter(x=>x.status==='scheduled').length,1);
 assert.equal(detail.appointments.find(x=>x.status==='scheduled').starts_at,'2026-09-11T01:00:00Z');
 }finally{sqlite.close();}
});

test('appointment PATCH uses customer and appointment CAS and updates web fields', async () => {
 const {sqlite,env}=await setup();try{
  const {createSession}=await import('../src/lib/crm-auth.js');const token=await createSession(env.DB,'day1-owner');
  const created=await handleMobileCrm(req('/api/mobile/appointments','POST',{customer_id:'estimate-1',version:1,kind:'visit',starts_at:'2026-09-10T01:00:00Z',location:'Office',address:'Address'},token),env);
  const appointmentId=(await created.json()).id;
  const changed=await handleMobileCrm(req('/api/mobile/appointments/'+appointmentId,'PATCH',{version:2,appointment_version:1,starts_at:'2026-09-11T01:00:00Z',location:'New office',address:'New address',status:'scheduled'},token),env);
  assert.equal(changed.status,200);const changedOriginal=sqlite.prepare("SELECT ConsultAt,ConsultBranch,ConsultCancelledAt,CrmVersion FROM Estimates WHERE id='estimate-1'").get();assert.equal(changedOriginal.ConsultAt,'2026-09-11T01:00:00.000Z');assert.equal(changedOriginal.ConsultBranch,'New office');assert.equal(changedOriginal.ConsultCancelledAt,'');assert.equal(changedOriginal.CrmVersion,3);
  const stale=await handleMobileCrm(req('/api/mobile/appointments/'+appointmentId,'PATCH',{version:3,appointment_version:1,starts_at:'2026-09-12T01:00:00Z',location:'Stale',address:'Stale',status:'scheduled'},token),env);assert.equal(stale.status,409);
  const cancelled=await handleMobileCrm(req('/api/mobile/appointments/'+appointmentId,'PATCH',{version:3,appointment_version:2,starts_at:'2026-09-11T01:00:00Z',location:'New office',address:'New address',status:'cancelled'},token),env);assert.equal(cancelled.status,200);
  const original=sqlite.prepare("SELECT ConsultAt,ConsultBranch,ConsultCancelledAt FROM Estimates WHERE id='estimate-1'").get();assert.equal(original.ConsultAt,'2026-09-11T01:00:00.000Z');assert.equal(original.ConsultBranch,'New office');assert.ok(original.ConsultCancelledAt);
 }finally{sqlite.close();}
});

test('appointment PATCH rejects historical or cross-tenant records and rolls back atomically', async () => {
 const {sqlite,env}=await setup();try{
  const {createSession}=await import('../src/lib/crm-auth.js');const token=await createSession(env.DB,'day1-owner');
  const created=await handleMobileCrm(req('/api/mobile/appointments','POST',{customer_id:'estimate-1',version:1,kind:'visit',starts_at:'2026-09-10T01:00:00Z',location:'Office',address:'Address'},token),env);const appointmentId=(await created.json()).id;
  sqlite.prepare("UPDATE Estimates SET ConsultAt='2026-09-12T01:00:00Z',ConsultCancelledAt='' WHERE id='estimate-1'").run();
  const historical=await handleMobileCrm(req('/api/mobile/appointments/'+appointmentId,'PATCH',{version:3,appointment_version:1,starts_at:'2026-09-13T01:00:00Z',location:'Old',address:'Old',status:'scheduled'},token),env);assert.equal(historical.status,409);
  sqlite.prepare("UPDATE Estimates SET ConsultAt='2026-09-10T01:00:00.000Z',ConsultCancelledAt='' WHERE id='estimate-1'").run();
  sqlite.exec("CREATE TRIGGER fail_appointment BEFORE UPDATE ON CrmAppointments BEGIN SELECT RAISE(ABORT,'fixture appointment failure'); END");
  const before=sqlite.prepare("SELECT CrmVersion,ConsultAt,ConsultBranch FROM Estimates WHERE id='estimate-1'").get();
  const failed=await handleMobileCrm(req('/api/mobile/appointments/'+appointmentId,'PATCH',{version:4,appointment_version:1,starts_at:'2026-09-13T01:00:00Z',location:'Office',address:'Address',status:'scheduled'},token),env);assert.equal(failed.status,503);assert.deepEqual(sqlite.prepare("SELECT CrmVersion,ConsultAt,ConsultBranch FROM Estimates WHERE id='estimate-1'").get(),before);
  sqlite.prepare("INSERT INTO CrmTenants(id,name) VALUES('other','Other')").run();sqlite.prepare("INSERT INTO CrmUsers(id,tenant_id,email,role) VALUES('other-owner','other','other@test.local','owner')").run();
  const other=await handleMobileCrm(req('/api/mobile/appointments/'+appointmentId,'PATCH',{version:1,appointment_version:1,starts_at:'2026-09-13T01:00:00Z',location:'x',address:'x',status:'cancelled'},await createSession(env.DB,'other-owner')),env);assert.equal(other.status,404);
 }finally{sqlite.close();}
});


test('Android partial appointment payload uses customer CAS without separate version',async()=>{
 const {sqlite,env}=await setup();try{
 const {createSession}=await import('../src/lib/crm-auth.js');const token=await createSession(env.DB,'day1-owner');
 const created=await(await handleMobileCrm(req('/api/mobile/appointments','POST',{customer_id:'estimate-1',version:1,kind:'visit',starts_at:'2026-09-10T01:00:00Z',location:'Office',address:'Address'},token),env)).json();
 assert.equal((await handleMobileCrm(req('/api/mobile/appointments/'+created.id,'PATCH',{version:2,location:'New office'},token),env)).status,200);
 assert.equal((await handleMobileCrm(req('/api/mobile/appointments/'+created.id,'PATCH',{version:3,status:'cancelled'},token),env)).status,200);
 assert.ok(sqlite.prepare("SELECT ConsultCancelledAt FROM Estimates WHERE id='estimate-1'").get().ConsultCancelledAt);
 }finally{sqlite.close();}
});
