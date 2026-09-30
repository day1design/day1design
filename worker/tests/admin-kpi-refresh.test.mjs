import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { enqueueAdminKpiBatch,enqueueDefaultAdminKpiWarmup,runAdminKpiBatch } from '../src/lib/admin-kpi-refresh.js';
const now = new Date('2026-09-10T00:00:00.000Z');
function fixture() {
 const db = new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE Estimates(id TEXT PRIMARY KEY,CrmTenantId TEXT,SubmittedAt TEXT,ConsultAt TEXT,ConsultCancelledAt TEXT,Status TEXT,Source TEXT,FirstSource TEXT,FirstReferrer TEXT,FirstUtmSource TEXT,UtmSource TEXT,FirstUtmMedium TEXT,UtmMedium TEXT,MetaLeadId TEXT,MetaAdId TEXT,Fbclid TEXT,Detail TEXT,EstimateAmount INTEGER DEFAULT 0,SpaceSize TEXT);
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
 const firstRetry=await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 assert.equal(firstRetry.queued,1);
 const result=await runAdminKpiBatch(env,{now,fetchImpl:()=>{throw new Error('must not call');}});
 assert.equal(result.reused,true);assert.equal(result.externalRequests,0);
});

test('today business day is rejected because only completed KST days are eligible', async () => {
 const env=fixture();
 await assert.rejects(
  enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-11',endDate:'2026-09-11',now:new Date('2026-09-11T00:00:00.000Z')}),
  /kpi_batch_range/,
 );
});
test('missing GA4 batch pauses when request budget unset; does not retry on cron',async()=>{
 const env=fixture();env.GA4_PROPERTY_ID='12345';await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 assert.equal((await runAdminKpiBatch(env,{now})).status,'paused');
 assert.equal((await runAdminKpiBatch(env,{now})).skipped,'no_work');
});
test('default KPI warmup queues current and previous default ranges without raw record reads',async()=>{
 const env=fixture();
 const result=await enqueueDefaultAdminKpiWarmup(env.DB,{now:new Date('2026-09-11T00:00:00.000Z')});
 assert.equal(result.anchor,'2026-09-10');
 assert.deepEqual(env.db.prepare('SELECT kind,start_date,end_date,status FROM AdminKpiJobs ORDER BY kind,start_date,end_date').all().map((job) => ({ ...job })),[
  {kind:'business',start_date:'2026-08-28',end_date:'2026-08-28',status:'queued'},
  {kind:'business',start_date:'2026-08-29',end_date:'2026-08-29',status:'queued'},
  {kind:'business',start_date:'2026-08-30',end_date:'2026-08-30',status:'queued'},
  {kind:'business',start_date:'2026-08-31',end_date:'2026-08-31',status:'queued'},
  {kind:'business',start_date:'2026-09-01',end_date:'2026-09-01',status:'queued'},
  {kind:'business',start_date:'2026-09-02',end_date:'2026-09-02',status:'queued'},
  {kind:'business',start_date:'2026-09-03',end_date:'2026-09-03',status:'queued'},
  {kind:'business',start_date:'2026-09-04',end_date:'2026-09-04',status:'queued'},
  {kind:'business',start_date:'2026-09-05',end_date:'2026-09-05',status:'queued'},
  {kind:'business',start_date:'2026-09-06',end_date:'2026-09-06',status:'queued'},
  {kind:'business',start_date:'2026-09-07',end_date:'2026-09-07',status:'queued'},
  {kind:'business',start_date:'2026-09-08',end_date:'2026-09-08',status:'queued'},
  {kind:'business',start_date:'2026-09-09',end_date:'2026-09-09',status:'queued'},
  {kind:'business',start_date:'2026-09-10',end_date:'2026-09-10',status:'queued'},
  {kind:'ga4',start_date:'2026-08-28',end_date:'2026-09-03',status:'queued'},
  {kind:'ga4',start_date:'2026-09-04',end_date:'2026-09-10',status:'queued'},
 ]);
 assert(!env.queries.some(sql=>/FROM Estimates|FROM EstimateContractHistory/.test(sql)));
});
test('scheduled KPI batch warmup is gated by request budget configuration',async()=>{
 const env=fixture();Object.assign(env,{ADMIN_KPI_WARM_DEFAULTS:'1',ADMIN_KPI_GA4_DAILY_REQUEST_BUDGET:'8',GA4_PROPERTY_ID:'12345'});
 let result;
 for(let i=0;i<3;i++)result=await runAdminKpiBatch(env,{now:new Date('2026-09-11T00:00:00.000Z')});
 assert.equal(result.status,'complete');
 assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM AdminKpiJobs WHERE kind='business'").get().n,14);
 assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM AdminKpiJobs WHERE kind='ga4'").get().n,2);
});
test('revision change across resumable steps fails without publishing mixed totals',async()=>{
 const env=fixture();await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 assert.equal((await runAdminKpiBatch(env,{now})).status,'queued');
 env.db.exec("UPDATE CrmDataRevisions SET version=version+1 WHERE tenant_id='day1design'");
 const result=await runAdminKpiBatch(env,{now});assert.equal(result.reason,'source_changed_during_batch');
 assert.equal(env.db.prepare('SELECT count(*) n FROM AdminKpiDaily').get().n,0);
});
test('dirty business job retries once after its source revision changed',async()=>{
 const env=fixture();await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 assert.equal((await runAdminKpiBatch(env,{now})).status,'queued');
 env.db.exec("UPDATE CrmDataRevisions SET version=version+1 WHERE tenant_id='day1design'");
 assert.equal((await runAdminKpiBatch(env,{now})).reason,'source_changed_during_batch');
 env.db.exec("INSERT INTO AdminKpiDirtyDays VALUES('day1design','2026-09-09','business',1)");
 const retried=await runAdminKpiBatch(env,{now:new Date(now.getTime()+900000)});
 assert.equal(retried.status,'queued');
 assert.equal(env.db.prepare("SELECT retries FROM AdminKpiJobs WHERE kind='business'").get().retries,1);
});
test('failed GA4 job records retry and stops after the attempt cap',async()=>{
 const env=fixture();
 const created=await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 assert.equal(created.queued,1);
 env.db.exec("UPDATE AdminKpiJobs SET status='failed',error_code='batch_step_failed',attempts=3");
 const firstRetry=await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 assert.equal(firstRetry.queued,1);
 const retried=env.db.prepare("SELECT status,retries,error_code FROM AdminKpiJobs").get();
 assert.equal(retried.status,'queued');assert.equal(retried.retries,1);assert.equal(retried.error_code,'');
 env.db.exec("UPDATE AdminKpiJobs SET status='failed',error_code='batch_step_failed'");
 const exhausted=await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 assert.equal(exhausted.queued,0);
 assert.equal(env.db.prepare("SELECT status FROM AdminKpiJobs").get().status,'failed');
});
test('completed GA4 job is requeued when its stored snapshot is still provisional',async()=>{
 const env=fixture(), range={kind:'ga4',startDate:'2026-09-07',endDate:'2026-09-13',sourceId:'12345'}, nextDay=new Date('2026-09-14T00:00:00.000Z');
 await enqueueAdminKpiBatch(env.DB,{...range,now:nextDay});
 env.db.prepare("INSERT INTO CrmGa4AnalyticsSnapshots VALUES(?,?,?,?,?,?,?,?)").run('s','day1design','ga4','12345',range.startDate,range.endDate,JSON.stringify({tenant_id:'day1design',source_kind:'ga4',source_id:'12345',summary:{visitors:1,sessions:1,pageviews:1,complete:false,provisional:true}}),'2026-09-13T00:00:00.000Z');
 env.db.exec("UPDATE AdminKpiJobs SET status='complete'");
 const result=await enqueueAdminKpiBatch(env.DB,{...range,now:nextDay});
 assert.equal(result.queued,1);
 assert.equal(env.db.prepare("SELECT status FROM AdminKpiJobs").get().status,'queued');
});
test('business refresh clears the matching dirty day and records zero as complete',async()=>{
 const env=fixture();env.db.exec("INSERT INTO AdminKpiDirtyDays VALUES('day1design','2026-09-09','business',0)");
 for(let i=0;i<3;i++)await runAdminKpiBatch(env,{now});
 assert.equal(env.db.prepare('SELECT count(*) n FROM AdminKpiDirtyDays').get().n,0);
 assert.equal(env.db.prepare("SELECT coverage_status FROM AdminKpiDaily WHERE metric='inquiries'").get().coverage_status,'complete');
});
test('completed business job is requeued when its day becomes dirty',async()=>{
 const env=fixture();await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 for(let i=0;i<3;i++)await runAdminKpiBatch(env,{now});
 env.db.exec("INSERT INTO AdminKpiDirtyDays VALUES('day1design','2026-09-09','business',1)");
 await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 const job=env.db.prepare("SELECT status,retries FROM AdminKpiJobs WHERE kind='business'").get();
 assert.equal(job.status,'queued');assert.equal(job.retries,0);
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

test('queued business days complete sequentially across advancing scheduler ticks',async()=>{
 const env=fixture();await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-07',endDate:'2026-09-09',now});
 for(let step=0;step<9;step++){const result=await runAdminKpiBatch(env,{now:new Date(now.getTime()+step*900000)});assert.notEqual(result.status,'failed');}
 assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM AdminKpiJobs WHERE status='complete'").get().n,3);
});
test('explicit batch burst completes a low-volume business day within four bounded steps',async()=>{
 const env=fixture();await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 const result=await runAdminKpiBatch(env,{now,maxSteps:4});
 assert.equal(result.status,'complete');assert.equal(result.steps,3);
 assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM AdminKpiDaily WHERE day='2026-09-09'").get().n,18);
});
test('budget-paused GA4 job resumes when a new KST request budget day opens',async()=>{
 const env=fixture();Object.assign(env,{GA4_PROPERTY_ID:'12345',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GA4_REFRESH_TOKEN:'fixture',ADMIN_KPI_GA4_DAILY_REQUEST_BUDGET:'2'});
 await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 env.db.exec("UPDATE AdminKpiJobs SET status='paused',error_code='daily_request_budget',retries=1; INSERT INTO AdminKpiBatchBudget VALUES('day1design','2026-09-10',2)");
 let calls=0;const fetchImpl=async()=>{calls++;return Response.json(calls===1?{access_token:'fixture'}:{metadata:{timeZone:'Asia/Seoul'},rowCount:1,metricHeaders:['activeUsers','sessions','screenPageViews'].map(name=>({name})),rows:[{metricValues:['1','2','3'].map(value=>({value}))}]});};
 const result=await runAdminKpiBatch(env,{now:new Date('2026-09-11T00:00:00.000Z'),fetchImpl});
 assert.equal(result.status,'complete');assert.equal(calls,2);
 assert.equal(env.db.prepare("SELECT retries FROM AdminKpiJobs").get().retries,1);
});
test('prior-day transient GA4 failure retries once when the current budget has headroom',async()=>{
 const env=fixture();Object.assign(env,{GA4_PROPERTY_ID:'12345',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GA4_REFRESH_TOKEN:'fixture',ADMIN_KPI_GA4_DAILY_REQUEST_BUDGET:'16'});
 await enqueueAdminKpiBatch(env.DB,{kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31',now});
 env.db.exec("UPDATE AdminKpiJobs SET status='failed',error_code='batch_step_failed',retries=1; INSERT INTO AdminKpiBatchBudget VALUES('day1design','2026-09-11',8)");
 let calls=0;const fetchImpl=async()=>{calls++;return Response.json(calls===1?{access_token:'fixture'}:{metadata:{timeZone:'Asia/Seoul'},rowCount:1,metricHeaders:['activeUsers','sessions','screenPageViews'].map(name=>({name})),rows:[{metricValues:['1','2','3'].map(value=>({value}))}]});};
 const result=await runAdminKpiBatch(env,{now:new Date('2026-09-11T00:00:00.000Z'),fetchImpl});
 assert.equal(result.status,'complete');assert.equal(calls,2);
 assert.equal(env.db.prepare("SELECT used FROM AdminKpiBatchBudget WHERE day='2026-09-11'").get().used,10);
});
test('explicit recovery processes the requested range before older queued work',async()=>{
 const env=fixture();await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-08',endDate:'2026-09-09',now});
 await runAdminKpiBatch(env,{now,preferredKind:'business',preferredStartDate:'2026-09-09',preferredEndDate:'2026-09-09'});
 const requested=JSON.parse(env.db.prepare("SELECT payload_json FROM AdminKpiJobs WHERE start_date='2026-09-09'").get().payload_json);
 const older=JSON.parse(env.db.prepare("SELECT payload_json FROM AdminKpiJobs WHERE start_date='2026-09-08'").get().payload_json);
 assert.equal(requested.phase,1);assert.equal(older.phase,undefined);
});
test('explicit transient GA4 retries stop after three failed attempts',async()=>{
 const env=fixture(), range={kind:'ga4',startDate:'2026-08-01',endDate:'2026-08-31'};
 await enqueueAdminKpiBatch(env.DB,{...range,now});
 env.db.exec("UPDATE AdminKpiJobs SET status='failed',error_code='kpi_ga4_oauth_transport',attempts=2,retries=1");
 const retry=await enqueueAdminKpiBatch(env.DB,{...range,now});
 assert.equal(retry.queued,1);
 env.db.exec("UPDATE AdminKpiJobs SET status='failed',error_code='kpi_ga4_oauth_transport',attempts=3");
 const exhausted=await enqueueAdminKpiBatch(env.DB,{...range,now});
 assert.equal(exhausted.queued,0);
});

// 규칙 버전이 오르면 옛 규칙으로 분류한 접수를 다시 분류하고 그 날의 예산 구간 수만 옮긴다.
// 날짜를 재집계 대상(dirty)으로 올리지 않는다 — 올리면 KPI 화면이 그 기간을 통째로 숨긴다.
function staleBudgetFixture() {
 const env=fixture();
 env.db.exec(readFileSync(new URL('../migrations/0099_admin_kpi_rule_versions.sql',import.meta.url),'utf8'));
 env.db.exec(`INSERT INTO Estimates(id,CrmTenantId,SubmittedAt,Detail,Status,EstimateAmount,SpaceSize) VALUES
  ('old-a','day1design','2026-07-31T16:00:00.000Z','가용예산: 6-7천','신규',0,'30~40평'),
  ('old-b','day1design','2026-07-31T16:00:00.000Z','가용예산: 미정','신규',0,''),
  ('old-c','day1design','2026-08-01T16:00:00.000Z','가용예산: 3천만원 미만','신규',0,''),
  ('draft','day1design','2026-08-01T16:00:00.000Z','가용예산: 1억','작성중',0,'');
  INSERT INTO AdminKpiNormalized(tenant_id,estimate_id,submitted_day,budget_band,classification_version) VALUES
  ('day1design','old-a','2026-08-01',6,1),('day1design','old-b','2026-08-01',6,1),('day1design','old-c','2026-08-02',1,1),
  ('day1design','draft','2026-08-02',6,1),('day1design','gone','2026-08-02',6,1),
  ('day1design','new','2026-08-03',2,2),('other','x','2026-08-04',6,1);`);
 const daily=env.db.prepare(`INSERT INTO AdminKpiDaily(tenant_id,day,metric,value,source,coverage_status,source_revision,updated_at) VALUES('day1design',?,?,?,'business','complete','0','')`);
 for(let i=0;i<7;i++){daily.run('2026-08-01',`budget${i}`,i===6?2:0);daily.run('2026-08-02',`budget${i}`,i===1?1:0);}
 return env;
}
const budgetDaily=(env,day)=>Object.fromEntries(env.db.prepare(`SELECT metric,value FROM AdminKpiDaily WHERE day=? AND metric LIKE 'budget%'`).all(day).filter(r=>r.value).map(r=>[r.metric,r.value]));

test('a newer budget rule moves old-rule budget counts without hiding any KPI day',async()=>{
 const env=staleBudgetFixture();
 await runAdminKpiBatch(env,{now});
 assert.equal(env.db.prepare('SELECT count(*) n FROM AdminKpiDirtyDays').get().n,0,'no day is hidden from the KPI page');
 assert.deepEqual(budgetDaily(env,'2026-08-01'),{budget2:1,budget6:1},'6-7천 moves from unrecorded to 5~7천');
 assert.deepEqual(budgetDaily(env,'2026-08-02'),{budget0:1},'3천만원 미만 moves to the lowest band');
 const versions=Object.fromEntries(env.db.prepare(`SELECT estimate_id,classification_version v,budget_band b FROM AdminKpiNormalized WHERE tenant_id='day1design'`).all().map(r=>[r.estimate_id,[r.v,r.b]]));
 assert.deepEqual(versions,{'old-a':[2,2],'old-b':[2,6],'old-c':[2,0],draft:[2,6],gone:[2,6],new:[2,2]},'drafts and deleted rows only get the new version');
 assert.equal(env.db.prepare(`SELECT version FROM CrmDataRevisions WHERE tenant_id='day1design'`).get().version,1,'KPI cache revision advances');
 assert.equal(env.db.prepare(`SELECT count(*) n FROM AdminKpiRuleVersions`).get().n,0,'version is recorded only after nothing is left');
 await runAdminKpiBatch(env,{now});
 assert.equal(env.db.prepare(`SELECT version FROM AdminKpiRuleVersions WHERE tenant_id='day1design' AND rule='budget'`).get().version,2);
 const before=env.queries.length;
 await runAdminKpiBatch(env,{now});
 assert(!env.queries.slice(before).some(sql=>/FROM AdminKpiNormalized n LEFT JOIN/.test(sql)),'no rescan after the version is recorded');
});

test('budget refresh waits while a business recount is queued and skips days already marked for recount',async()=>{
 const env=staleBudgetFixture();
 env.db.exec(`INSERT INTO AdminKpiJobs(id,tenant_id,kind,start_date,end_date,status,updated_at) VALUES('day1design:business:2026-09-01:2026-09-01','day1design','business','2026-09-01','2026-09-01','paused','')`);
 await runAdminKpiBatch(env,{now});
 assert.deepEqual(budgetDaily(env,'2026-08-01'),{budget6:2},'untouched while a recount is pending');
 env.db.exec(`DELETE FROM AdminKpiJobs; INSERT INTO AdminKpiDirtyDays(tenant_id,day,source,revision) VALUES('day1design','2026-08-02','business',0)`);
 await runAdminKpiBatch(env,{now:new Date('2026-08-01T00:00:00.000Z')});
 assert.deepEqual(budgetDaily(env,'2026-08-01'),{budget2:1,budget6:1});
 assert.equal(env.db.prepare(`SELECT classification_version v FROM AdminKpiNormalized WHERE estimate_id='old-c'`).get().v,1,'a day waiting for recount is left to that recount');
});

test('without the rule-version table the KPI batch keeps running',async()=>{
 const env=fixture();
 const result=await runAdminKpiBatch(env,{now});
 assert.equal(result.skipped,'no_work');
});

test('budget typed into the customer card is counted by the KPI batch',async()=>{
 const env=fixture();
 env.db.exec(`INSERT INTO Estimates(id,CrmTenantId,SubmittedAt,Source,Detail,Status,EstimateAmount,SpaceSize) VALUES
  ('m','day1design','2026-09-08T16:00:00.000Z','homepage','가용예산: 미정','신규',80000000,'30~40평'),
  ('p','day1design','2026-09-08T16:00:00.000Z','homepage','가용예산: 평당 300','신규',0,'30~40평'),
  ('n','day1design','2026-09-08T16:00:00.000Z','homepage','가용예산: 미정','신규',0,'');`);
 await enqueueAdminKpiBatch(env.DB,{kind:'business',startDate:'2026-09-09',now});
 for(let i=0;i<6;i++){const r=await runAdminKpiBatch(env,{now});if(r.status==='complete')break;}
 const get=k=>env.db.prepare('SELECT value FROM AdminKpiDaily WHERE metric=?').get(k).value;
 assert.equal(get('budget3'),2);assert.equal(get('budget6'),1);
 assert.equal(env.db.prepare(`SELECT budget_reason FROM AdminKpiNormalized WHERE estimate_id='m'`).get().budget_reason,'manual');
});
