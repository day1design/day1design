import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAdminDashboard, dashboardBounds } from '../src/routes/admin-dashboard.js';
import { sign } from '../src/lib/jwt.js';

function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE Estimates(id TEXT PRIMARY KEY,CrmTenantId TEXT NOT NULL DEFAULT 'day1design',Name TEXT,Source TEXT,Status TEXT,SubmittedAt TEXT);CREATE TABLE HeroSlides(id TEXT PRIMARY KEY,Active INTEGER);CREATE TABLE Portfolio(id TEXT PRIMARY KEY);CREATE TABLE Community(id TEXT PRIMARY KEY);`);
 sqlite.exec(readFileSync(new URL('../migrations/0094_admin_dashboard_summary.sql',import.meta.url),'utf8'));
 let batches=0;
 const db={sqlite,prepare(sql){let args=[];const q={bind(...v){args=v;return q},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {success:true,results:sqlite.prepare(sql).all(...args)}}};return q},async batch(statements){batches++;return Promise.all(statements.map(q=>q.all()))},get batches(){return batches}};
 return db;
}
async function req(){return new Request('https://admin.day1design.co.kr/api/admin/dashboard',{headers:{authorization:'Bearer '+await sign({sub:'admin'},'fixture-secret')}})}
const add=(db,id,at,source='meta',tenant='day1design')=>db.sqlite.prepare('INSERT INTO Estimates VALUES(?,?,?,?,?,?)').run(id,tenant,'가상 고객',source,'접수대기',at);

test('summary tenant scope, counters, exact rolling boundaries, cache hit and mutation invalidation',async()=>{
 const db=fixture();try{
 const now=Date.now();add(db,'recent',new Date(now-3600000).toISOString());add(db,'edge',new Date(now-30*86400000+10000).toISOString(),'homepage');add(db,'expired',new Date(now-30*86400000-10000).toISOString());add(db,'foreign',new Date(now-1000).toISOString(),'meta','other');
 db.sqlite.exec("INSERT INTO HeroSlides VALUES('active',1),('hidden',0);INSERT INTO Portfolio VALUES('p');INSERT INTO Community VALUES('c')");
 const env={DB:db,JWT_SECRET:'fixture-secret'},request=await req();const first=await (await handleAdminDashboard(request,env)).json();assert.equal(first.counts.estimates,3);assert.equal(first.counts.hero,1);assert.equal(first.submissions.total,2);assert.equal(first.submissions.meta,1);assert.equal(first.submissions.home,1);assert.equal(first.recent.some(r=>r.id==='foreign'),false);assert.equal(db.batches,1);
 await handleAdminDashboard(request,env);assert.equal(db.batches,1);
 db.sqlite.prepare("UPDATE Estimates SET Source='homepage',Status='완료' WHERE id='recent'").run();const second=await(await handleAdminDashboard(request,env)).json();assert.equal(second.submissions.meta,0);assert.equal(second.submissions.pending,1);assert.equal(db.batches,2);
 db.sqlite.exec("DELETE FROM Estimates WHERE id='recent';UPDATE HeroSlides SET Active=0 WHERE id='active'");const third=await(await handleAdminDashboard(request,env)).json();assert.equal(third.counts.estimates,2);assert.equal(third.counts.hero,0);assert.equal(third.submissions.total,1);
 }finally{db.sqlite.close()}
});

test('auth before summary cache and same revision concurrent reads coalesce',async()=>{
 const db=fixture();try{add(db,'a',new Date(Date.now()-3600000).toISOString());const env={DB:db,JWT_SECRET:'fixture-secret'},request=await req();await Promise.all(Array.from({length:6},()=>handleAdminDashboard(request,env)));assert.equal(db.batches,1);assert.equal((await handleAdminDashboard(new Request('https://example.com/api/admin/dashboard'),env)).status,401)}finally{db.sqlite.close()}
});

test('100k customers reduce to <=720 hour rows and five recent summaries; index seeks',async()=>{
 const db=fixture();try{const hour=Math.floor((Date.now()-86400000)/3600000)*3600000;db.sqlite.exec('BEGIN');for(let i=0;i<100000;i++)add(db,String(i),new Date(hour-(i%700)*3600000).toISOString());db.sqlite.exec('COMMIT');
 const response=await handleAdminDashboard(await req(),{DB:db,JWT_SECRET:'fixture-secret'});const data=await response.json();assert.equal(response.status,200);assert.equal(data.counts.estimates,100000);assert.equal(data.recent.length,5);assert.ok(JSON.stringify(data).length<3500);
 const bounds=dashboardBounds();const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN SELECT Source,Status FROM Estimates WHERE CrmTenantId=? AND SubmittedAt>=? AND SubmittedAt<? ORDER BY SubmittedAt,id LIMIT 2001').all('day1design',bounds.from,bounds.fullFrom);assert.ok(plan.some(r=>r.detail.includes('idx_estimates_admin_recent')));assert.ok(!plan.some(r=>r.detail.includes('SCAN Estimates')));
 }finally{db.sqlite.close()}
});

test('drafts stay outside visible counts and enter rollups when submitted',async()=>{
 const db=fixture();try{
 const at=new Date(Date.now()-3600000).toISOString();
 db.sqlite.prepare('INSERT INTO Estimates VALUES(?,?,?,?,?,?)').run('draft','day1design','가상 고객','meta','작성중',at);
 const env={DB:db,JWT_SECRET:'fixture-secret'},request=await req();
 const first=await(await handleAdminDashboard(request,env)).json();
 assert.equal(first.counts.estimates,0);assert.equal(first.submissions.total,0);assert.equal(first.recent.length,0);
 db.sqlite.exec("UPDATE Estimates SET Status='접수대기' WHERE id='draft'");
 const next=await(await handleAdminDashboard(request,env)).json();
 assert.equal(next.counts.estimates,1);assert.equal(next.submissions.total,1);assert.equal(next.recent.length,1);
 db.sqlite.exec("UPDATE Estimates SET Status='작성중' WHERE id='draft'");
 const last=await(await handleAdminDashboard(request,env)).json();
 assert.equal(last.counts.estimates,0);assert.equal(last.submissions.total,0);assert.equal(last.recent.length,0);
 }finally{db.sqlite.close()}
});
