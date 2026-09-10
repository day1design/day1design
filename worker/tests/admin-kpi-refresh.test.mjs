import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { enqueueAdminKpiBatch,runAdminKpiBatch } from '../src/lib/admin-kpi-refresh.js';
const now = new Date('2026-09-10T00:00:00.000Z');
function fixture() {
 const db = new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE Estimates(id TEXT PRIMARY KEY,CrmTenantId TEXT,SubmittedAt TEXT,ConsultAt TEXT,ConsultCancelledAt TEXT,Status TEXT,Source TEXT,FirstSource TEXT,FirstReferrer TEXT,Referrer TEXT,FirstUtmSource TEXT,UtmSource TEXT,FirstUtmMedium TEXT,UtmMedium TEXT,MetaLeadId TEXT,MetaAdId TEXT,Fbclid TEXT,Detail TEXT);
 CREATE TABLE EstimateContractHistory(id TEXT PRIMARY KEY,estimate_id TEXT,saved_at TEXT,stage TEXT,amount REAL,previous_amount REAL);
 CREATE TABLE AdminKpiMonthly(tenant_id TEXT,month TEXT,metric TEXT,value REAL,source TEXT,coverage_status TEXT,source_revision TEXT,updated_at TEXT,PRIMARY KEY(tenant_id,month,metric)); CREATE TABLE CrmDataRevisions(tenant_id TEXT PRIMARY KEY,version INTEGER,updated_at TEXT); INSERT INTO CrmDataRevisions VALUES('day1design',0,''); CREATE TABLE AdminKpiDirtyDays(tenant_id TEXT,day TEXT,source TEXT,revision INTEGER,PRIMARY KEY(tenant_id,day,source)); CREATE TABLE AdminKpiDaily(tenant_id TEXT,day TEXT,metric TEXT,value REAL,source TEXT,coverage_status TEXT,source_revision TEXT,updated_at TEXT,PRIMARY KEY(tenant_id,day,metric));`);
 db.exec(readFileSync(new URL('../migrations/0096_admin_kpi_jobs.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0077_crm_ga4_snapshots.sql',import.meta.url),'utf8'));
 const queries=[];
 function prepare(sql) { return { bind(...args) { return {
  first:async()=>{queries.push(sql);return db.prepare(sql).get(...args)||null;},
  all:async()=>{queries.push(sql);return {results:db.prepare(sql).all(...args)};},
  run:async()=>{queries.push(sql);return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},
 }; } }; }
 const DB={prepare,batch:async statements=>{db.exec('BEGIN');try {const result=[];for(const stmt of statements)result.push(await stmt.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {db,DB,queries};
}
test('saved business data is prepared in bounded resumable pages, preserving empty days',async()=>{
 const env=fixture();
 for(let i=0;i<205;i++)env.db.prepare(`INSERT INTO Estimates(id,CrmTenantId,SubmittedAt,Source,FirstUtmSource,FirstUtmMedium,Detail,Status) VALUES(?,'day1design','2026-09-08T16:00:00.000Z','homepage','google','organic','가용예산: 5천만원','신규')`).run(String(i).padStart(4,'0'));
 env.db.prepare(`INSERT INTO Estimates(id,CrmTenantId,SubmittedAt,Source) VALUES('other','other','2026-09-08T16:00:00.000Z','homepage')`).run();
 await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 let complete=false;
 for(let i=0;i<6;i++){const result=await runAdminKpiBatch(env,{now});assert.notEqual(result.status,'failed');assert((result.processed||0)<=100);if(result.status==='complete'){complete=true;break;}}
 assert(complete);
 const metrics=Object.fromEntries(env.db.prepare('SELECT metric,value FROM AdminKpiDaily').all().map(r=>[r.metric,r.value]));
 assert.equal(metrics.inquiries,205);assert.equal(metrics.organic,205);assert.equal(metrics.budget2,205);
 assert.equal(metrics.meetings,0);assert.equal(metrics.contracts,0);
 assert.equal(env.db.prepare('SELECT count(*) n FROM AdminKpiNormalized').get().n,205);
 const plan=env.db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM Estimates INDEXED BY idx_admin_kpi_estimate_intake WHERE CrmTenantId=? AND SubmittedAt>=? AND SubmittedAt<? AND (SubmittedAt,id)>(?,?) ORDER BY SubmittedAt,id LIMIT ?`).all('day1design','2026-09-08','2026-09-10','2026-09-08','',101);
 assert(plan.some(r=>/SEARCH.*idx_admin_kpi_estimate_intake/.test(r.detail)));
 assert(!plan.some(r=>/TEMP B-TREE/.test(r.detail)));
});
test('first-final before period is never recounted; subsequent corrections keep signed deltas',async()=>{
 const env=fixture();env.db.exec(`INSERT INTO Estimates(id,CrmTenantId,SubmittedAt,ConsultAt,ConsultCancelledAt,Status) VALUES('e','day1design','2026-09-01T00:00:00.000Z','2026-09-09T01:00:00.000Z','','신규');
 INSERT INTO EstimateContractHistory(id,estimate_id,saved_at,stage,amount,previous_amount) VALUES('a','e','2026-09-01T00:00:00.000Z','최종확정',100000000,90000000),('b','e','2026-09-09T00:00:00.000Z','최종확정',110000000,100000000),('c','e','2026-09-09T01:00:00.000Z','정정',105000000,110000000);`);
 await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 for(let i=0;i<3;i++)assert.notEqual((await runAdminKpiBatch(env,{now})).status,'failed');
 const get=k=>env.db.prepare('SELECT value FROM AdminKpiDaily WHERE metric=?').get(k).value;
 assert.equal(get('contracts'),0);assert.equal(get('amount'),0);assert.equal(get('changes'),5000000);assert.equal(get('meetings'),1);
});
test('existing exact GA4 snapshot is reused without transport or budget consumption',async()=>{
 const env=fixture();env.GA4_PROPERTY_ID='12345';env.db.exec(`INSERT INTO CrmGa4AnalyticsSnapshots VALUES('s','day1design','ga4','12345','2026-08-01','2026-08-31','{"tenant_id":"day1design","source_kind":"ga4","source_id":"12345","summary":{"visitors":100,"sessions":120,"pageviews":200}}','2026-09-01')`);
 await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 const result=await runAdminKpiBatch(env,{now,fetchImpl:()=>{throw new Error('must not call');}});
 assert.equal(result.reused,true);assert.equal(result.externalRequests,0);
});
test('missing GA4 batch pauses when request budget unset; does not retry on cron',async()=>{
 const env=fixture();env.GA4_PROPERTY_ID='12345';await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 assert.equal((await runAdminKpiBatch(env,{now})).status,'paused');
 assert.equal((await runAdminKpiBatch(env,{now})).skipped,'no_work');
});
test('revision change across resumable steps fails without publishing mixed totals',async()=>{
 const env=fixture();await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 assert.equal((await runAdminKpiBatch(env,{now})).status,'queued');
 env.db.exec("UPDATE CrmDataRevisions SET version=version+1 WHERE tenant_id='day1design'");
 const result=await runAdminKpiBatch(env,{now});assert.equal(result.reason,'source_changed_during_batch');
 assert.equal(env.db.prepare('SELECT count(*) n FROM AdminKpiDaily').get().n,0);
});
test('business refresh clears the matching dirty day and records zero as complete',async()=>{
 const env=fixture();env.db.exec("INSERT INTO AdminKpiDirtyDays VALUES('day1design','2026-09-09','business',0)");
 for(let i=0;i<3;i++)await runAdminKpiBatch(env,{now});
 assert.equal(env.db.prepare('SELECT count(*) n FROM AdminKpiDirtyDays').get().n,0);
 assert.equal(env.db.prepare("SELECT coverage_status FROM AdminKpiDaily WHERE metric='inquiries'").get().coverage_status,'complete');
});
test('GA4 daily budget is reserved atomically and successful report persists for later reuse',async()=>{
 const env=fixture();Object.assign(env,{GA4_PROPERTY_ID:'12345',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GA4_REFRESH_TOKEN:'fixture',ADMIN_KPI_GA4_DAILY_REQUEST_BUDGET:'2'});
 await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 let calls=0;
 const fetchImpl=async()=>{calls++;return Response.json(calls===1?{access_token:'fixture'}:{metadata:{timeZone:'Asia/Seoul'},rowCount:1,metricHeaders:['activeUsers','sessions','screenPageViews'].map(name=>({name})),rows:[{metricValues:['100','200','300'].map(value=>({value}))}]});};
 assert.equal((await runAdminKpiBatch(env,{now,fetchImpl})).status,'complete');assert.equal(calls,2);
 assert.equal(env.db.prepare('SELECT used FROM AdminKpiBatchBudget').get().used,2);
 assert.equal(env.db.prepare('SELECT count(*) n FROM CrmGa4AnalyticsSnapshots').get().n,1);
 await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-07-01',endDate:'2026-07-31',now});
 assert.equal((await runAdminKpiBatch(env,{now,fetchImpl})).status,'paused');assert.equal(calls,2);
});
test('complete stored business days are reused without raw record reads',async()=>{
 const env=fixture();await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 for(let i=0;i<3;i++)await runAdminKpiBatch(env,{now});env.queries.length=0;
 const result=await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 assert.equal(result.queued,0);assert.equal(result.reused,1);
 assert(!env.queries.some(sql=>/FROM Estimates|FROM EstimateContractHistory/.test(sql)));
});
test('tenant history index avoids visiting foreign customer event pages',async()=>{
 const env=fixture();env.db.exec("INSERT INTO Estimates(id,CrmTenantId) VALUES('foreign','other'),('mine','day1design')");
 const insert=env.db.prepare("INSERT INTO EstimateContractHistory(id,estimate_id,saved_at,stage,amount,previous_amount) VALUES(?,?,'2026-09-09T00:00:00.000Z','최종확정',100,0)");
 for(let i=0;i<1000;i++)insert.run(`f${i}`,'foreign');insert.run('m','mine');
 await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 for(let i=0;i<2;i++)await runAdminKpiBatch(env,{now});
 const result=await runAdminKpiBatch(env,{now});assert.equal(result.processed,1);assert.equal(result.status,'complete');
 const plan=env.db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM EstimateContractHistory INDEXED BY idx_admin_kpi_history_tenant_day WHERE tenant_id=? AND saved_at>=? AND saved_at<? AND (saved_at,id)>(?,?) ORDER BY saved_at,id LIMIT 101`).all('day1design','2026-09-08','2026-09-10','2026-09-08','');
 assert(plan.some(row=>/SEARCH.*idx_admin_kpi_history_tenant_day/.test(row.detail)));
});
