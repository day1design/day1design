import http from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { openLocalD1 } from './d1-local.mjs';
import { handleMobileCrm } from '../../worker/src/routes/mobile-crm.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(root, '.tools', 'worker-runtime');
mkdirSync(runtime, { recursive: true });
const DB = openLocalD1(resolve(runtime, 'local.sqlite3'));
DB.sqlite.exec('CREATE TABLE IF NOT EXISTS LocalMigrations(name TEXT PRIMARY KEY)');
const migrations = ['0001_init.sql','0041_consult_booking.sql','0042_contract_fields.sql','0043_consult_cancel.sql','0044_consult_reminders.sql','0045_mobile_crm.sql','0046_crm_notifications.sql','0047_crm_auth.sql','0048_crm_automation.sql','0049_crm_calendar.sql','0050_crm_scheduler.sql','0051_crm_assignment.sql','0052_crm_devices.sql','0053_crm_push.sql','0054_crm_persistent_sessions.sql'];
for (const name of migrations) {
  const path = resolve(root, '..', 'worker', 'migrations', name);
  if (!existsSync(path)) throw new Error('Local migration not ready: ' + name);
  if (DB.sqlite.prepare('SELECT 1 FROM LocalMigrations WHERE name=?').get(name)) continue;
  DB.sqlite.exec('BEGIN IMMEDIATE');
  try {
    DB.sqlite.exec(readFileSync(path, 'utf8'));
    DB.sqlite.prepare('INSERT INTO LocalMigrations VALUES(?)').run(name);
    DB.sqlite.exec('COMMIT');
  } catch(error) { DB.sqlite.exec('ROLLBACK'); throw error; }
}
DB.sqlite.prepare("UPDATE CrmUsers SET email='owner@day1.local' WHERE id='day1-owner' AND email='gahyun.co@gmail.com'").run();
DB.sqlite.prepare("INSERT OR IGNORE INTO CrmUsers(id,tenant_id,email,role,active,created_at) VALUES('day1-staff','day1design','staff@day1.local','staff',1,?)").run(new Date().toISOString());
DB.sqlite.prepare("INSERT OR IGNORE INTO Estimates(id,Name,Phone,Address,Branch,EstimateAmount,Status,SubmittedAt) VALUES('local-customer-1','로컬 통합 고객','010-0000-0000','서울 테스트 주소','강남',50000000,'new',?)").run(new Date().toISOString());
DB.sqlite.prepare("UPDATE CrmUsers SET email='platform@polarad.local' WHERE id='platform-owner' AND email='mkt@polarad.co.kr'").run();
const keyPath=resolve(runtime,'session-key');
if(!existsSync(keyPath)) writeFileSync(keyPath,randomBytes(32).toString('hex'),{flag:'wx'});
const inbox=resolve(runtime,'inbox'); mkdirSync(inbox,{recursive:true});
const env={ DB, CRM_ENABLED:'true', CRM_PLATFORM_EMAILS:'platform@polarad.local', CRM_OTP_SECRET:readFileSync(keyPath,'utf8'), CRM_OTP_DELIVER:async payload=>{
  writeFileSync(resolve(inbox,randomUUID()+'.json'),JSON.stringify(payload),{flag:'wx'});
}};
const server=http.createServer(async(req,res)=>{
  try {
    let size=0; const chunks=[];
    for await(const chunk of req){ size+=chunk.length; if(size>65536){res.writeHead(413);res.end();return;} chunks.push(chunk); }
    const method=req.method || 'GET'; const headers=new Headers(req.headers);
    headers.set('CF-Connecting-IP','127.0.0.1');
    const request=new Request('http://127.0.0.1:18792'+req.url,{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
    const response=await handleMobileCrm(request,env,{waitUntil(promise){promise.catch(()=>{});}});
    res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){ console.error('Local handler failed:',error.name);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'local handler failed'})); }
});
server.listen(18792,'127.0.0.1',()=>console.log('CRM Worker handler local-only on 127.0.0.1:18792'));
