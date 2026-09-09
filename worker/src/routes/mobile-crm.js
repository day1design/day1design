import { jsonError as baseJsonError, jsonOk as baseJsonOk } from "../lib/response.js";
import { authenticate, nowIso, revokeSession, requestMobileOtp, verifyMobileOtp } from '../lib/crm-auth.js';
import { authenticateSupport, endSupportSession, isSupportReadonly } from '../lib/crm-support.js';
import { handleMobileNotifications } from './mobile-notifications.js';
import { handleMobileDevices } from './mobile-devices.js';
import { handleMobileManagement } from './mobile-management.js';
import { readCrmAnalytics } from '../lib/crm-analytics.js';
import { readCrmJson } from '../lib/crm-request.js';

const logo = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/favicon/favicon-192.png";
const allowedCustomerFields = { name: "Name", phone: "Phone", email: "Email", region: "Address", budget: "EstimateAmount", status: "Status", assignee_id: "Assignee" };

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function jsonError(status, message, extra) { return noStore(baseJsonError(status, message, extra)); }
function jsonOk(data) { return noStore(baseJsonOk(data)); }

function enabled(env) {
  return String(env.CRM_ENABLED || "").toLowerCase() === "true";
}

async function body(request) {
  try { return await readCrmJson(request); } catch { return null; }
}

function text(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function iso(value) {
  if(typeof value!=="string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value))return "";
  const candidate = new Date(value);
  return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : "";
}

export function homeKstBounds(nowMs = Date.now()) {
  const date = new Date(nowMs + 9 * 3600000).toISOString().slice(0,10);
  const start = Date.parse(date+'T00:00:00+09:00');
  return {date,startUtc:new Date(start).toISOString(),endExclusiveUtc:new Date(start+86400000).toISOString()};
}
async function homeSummary(env,auth) {
  const bounds=homeKstBounds();
  const pending=await env.DB.prepare("SELECT COUNT(*) count FROM Estimates WHERE CrmTenantId=? AND Status IN ('접수대기','new')").bind(auth.tenant_id).first();
  const today={};
  for(const kind of ['visit','measurement']) {
    const count=await env.DB.prepare("SELECT COUNT(*) count FROM CrmAppointments WHERE tenant_id=? AND kind=? AND starts_at>=? AND starts_at<? AND status<>'cancelled'").bind(auth.tenant_id,kind,bounds.startUtc,bounds.endExclusiveUtc).first();
    const rows=await env.DB.prepare("SELECT a.*,e.Name customer_name FROM CrmAppointments a LEFT JOIN Estimates e ON e.id=a.estimate_id AND e.CrmTenantId=a.tenant_id WHERE a.tenant_id=? AND a.kind=? AND a.starts_at>=? AND a.starts_at<? AND a.status<>'cancelled' ORDER BY a.starts_at,a.id LIMIT 5").bind(auth.tenant_id,kind,bounds.startUtc,bounds.endExclusiveUtc).all();
    today[kind==='visit'?'consultation':kind]={count:Number(count.count),items:rows.results||[]};
  }
  return jsonOk({date:bounds.date,timezone:'Asia/Seoul',intake:{pending_count:Number(pending.count)},today});
}

function id() {
  return crypto.randomUUID();
}

function customer(row, assignee) {
  return {
    id: row.id,
    name: row.Name || "",
    phone: row.Phone || "",
    email: row.Email || "",
    region: row.Address || "",
    budget: Number(row.EstimateAmount || 0),
    status: row.Status || "new",
    assignee_id: assignee?.id || null,
    assignee_email: assignee?.email || row.Assignee || "",
    version: Number(row.CrmVersion || 1),
    created_at: row.SubmittedAt || "",
  };
}

async function findCustomer(db, tenantId, customerId) {
  return db.prepare("SELECT * FROM Estimates WHERE id = ? AND CrmTenantId = ?").bind(customerId, tenantId).first();
}

async function assignee(db, tenantId, value) {
  if (!value) return null;
  return (await db.prepare("SELECT id,email FROM CrmUsers WHERE tenant_id=? AND id=? AND active=1").bind(tenantId, value).first())
    || (await db.prepare("SELECT id,email FROM CrmUsers WHERE tenant_id=? AND email=? COLLATE NOCASE AND active=1").bind(tenantId, value).first());
}

async function customerPayload(db, row, tenantId) {
  const owner = await assignee(db, tenantId, row.Assignee);
  return customer(row, owner);
}

async function writeAudit(db, auth, estimateId, action) {
  await db.prepare("INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) VALUES(?,?,?,?,?)")
    .bind(auth.tenant_id, auth.user_id, estimateId || null, action, nowIso()).run();
}

async function me(auth) {
  return jsonOk({ id: auth.user_id, email: auth.email, role: auth.role, tenant: { id: auth.tenant_id, name: auth.tenant_name }, branding: { brand: auth.brand || "tenant", logo: auth.tenant_id === "day1design" ? logo : auth.logo_url || "" } });
}

async function listMembers(request, env, auth) {
  const inactive=new URL(request.url).searchParams.get('include_inactive')==='true';
  if(inactive && auth.role!=='owner')return jsonError(403,'owner required');
  const result=await env.DB.prepare(`SELECT id,email,role,active FROM CrmUsers WHERE tenant_id=? ${inactive?'':'AND active=1'} ORDER BY id LIMIT 100`).bind(auth.tenant_id).all();
  return jsonOk({members:(result.results || []).map(row=>({...row,active:row.active===1}))});
}

async function listCustomers(request, env, auth) {
  const url=new URL(request.url), q=(url.searchParams.get('q') || '').toLowerCase(), cursor=url.searchParams.get('cursor') || '';
  if(q.length>120 || cursor.length>120) return jsonError(400,'invalid query');
  const result=await env.DB.prepare('SELECT * FROM Estimates WHERE CrmTenantId=? AND id>? ORDER BY id LIMIT 51').bind(auth.tenant_id,cursor).all();
  const rows=result.results || [], window=rows.slice(0,50);
  const items=[];
  for(const row of window) if(!q || [row.Name,row.Phone,row.Email,row.Address].join(' ').toLowerCase().includes(q)) items.push(await customerPayload(env.DB,row,auth.tenant_id));
  return jsonOk({customers:items,next_cursor:rows.length>50?window[49].id:null});
}

async function detail(env, auth, customerId) {
  const row = await findCustomer(env.DB, auth.tenant_id, customerId);
  if (!row) return jsonError(404, "customer not found");
  const [base, appointments, consultations, contracts] = await Promise.all([
    customerPayload(env.DB, row, auth.tenant_id),
    env.DB.prepare("SELECT id,kind,starts_at,location,address,status,CrmVersion AS version FROM CrmAppointments WHERE tenant_id=? AND estimate_id=? ORDER BY starts_at,id LIMIT 101").bind(auth.tenant_id, customerId).all(),
    env.DB.prepare("SELECT m.id,m.Body AS result,m.Author AS created_by,m.CreatedAt AS created_at FROM EstimateMemos m JOIN Estimates e ON e.id=m.EstimateId WHERE e.CrmTenantId=? AND m.EstimateId=? ORDER BY m.CreatedAt,m.id LIMIT 101").bind(auth.tenant_id, customerId).all(),
    env.DB.prepare("SELECT id,amount,status,signed_at,created_by,created_at FROM CrmContracts WHERE tenant_id=? AND estimate_id=? ORDER BY signed_at,id LIMIT 101").bind(auth.tenant_id, customerId).all(),
  ]);
  const visits=(appointments.results || []).slice(0,100).map(appointment=>{
    if(appointment.kind!=='visit') return appointment;
    const current=row.ConsultAt && new Date(appointment.starts_at).getTime()===new Date(row.ConsultAt).getTime();
    return {...appointment,status:current && !row.ConsultCancelledAt?'scheduled':'cancelled',...(current?{location:row.ConsultBranch || appointment.location}:{})};
  });
  if(row.ConsultAt && !visits.some(x=>x.kind==='visit' && new Date(x.starts_at).getTime()===new Date(row.ConsultAt).getTime())) visits.unshift({id:'legacy-visit-'+row.id,kind:'visit',starts_at:row.ConsultAt,location:row.ConsultBranch || '',address:'',status:row.ConsultCancelledAt?'cancelled':'scheduled'});
  const agreements=(contracts.results || []).slice(0,100);
  if(row.ContractAt && !agreements.length) agreements.push({id:'legacy-contract-'+row.id,amount:row.ContractAmount,status:'signed',signed_at:row.ContractAt});
  return jsonOk({...base,appointments:visits.slice(0,100),consultations:(consultations.results || []).slice(0,100),contracts:agreements,history_has_more:{appointments:(appointments.results || []).length>100,consultations:(consultations.results || []).length>100,contracts:(contracts.results || []).length>100}});
}

async function mutateCustomer(env, auth, customerId, version, columns, values, records, action) {
  const guard=id(), created=nowIso();
  const statements=[env.DB.prepare('INSERT INTO CrmMutationGuard(id,allowed) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM Estimates e JOIN CrmUsers u ON u.id=? JOIN CrmTenants t ON t.id=u.tenant_id WHERE e.id=? AND e.CrmTenantId=? AND e.CrmVersion=? AND u.tenant_id=e.CrmTenantId AND u.active=1 AND u.role=\'owner\' AND t.suspended=0) THEN 1 ELSE 0 END)').bind(guard,auth.id,customerId,auth.tenant_id,version),
    env.DB.prepare(`UPDATE Estimates SET ${columns.length?columns.join(',')+',':''} CrmVersion=CrmVersion+1 WHERE id=? AND CrmTenantId=? AND CrmVersion=?`).bind(...values,customerId,auth.tenant_id,version),...records,
    env.DB.prepare('INSERT INTO CrmAuditLogs(tenant_id,actor_id,estimate_id,action,created_at) VALUES(?,?,?,?,?)').bind(auth.tenant_id,auth.id,customerId,action,created),
    env.DB.prepare('DELETE FROM CrmMutationGuard WHERE id=?').bind(guard)];
  try { await env.DB.batch(statements); return true; }
  catch(error) { if(String(error.message).includes('allowed = 1')) return false; throw error; }
}

async function updateCustomer(request, env, auth, customerId) {
  if(auth.role!=='owner') return jsonError(403,'owner required');
  const value=await body(request), version=value?.version;
  if(!value || !Number.isSafeInteger(version) || version<1 || Object.keys(value).some(k=>k!=='version' && !Object.hasOwn(allowedCustomerFields,k))) return jsonError(400,'invalid customer fields');
  const row=await findCustomer(env.DB,auth.tenant_id,customerId);
  if(!row)return jsonError(404,'customer not found');
  const columns=[],values=[];
  for(const [key,column] of Object.entries(allowedCustomerFields)) {
    if(!Object.hasOwn(value,key))continue;
    if(key==='budget') { if(!Number.isSafeInteger(value[key]) || value[key]<0 || value[key]>1e12)return jsonError(400,'invalid budget');values.push(value[key]); }
    else if(key==='assignee_id') { const member=await assignee(env.DB,auth.tenant_id,value[key]);if(value[key]!==null && (typeof value[key]!=='string' || !member))return jsonError(400,'invalid assignee');values.push(member?.email || ''); }
    else { if(typeof value[key]!=='string' || value[key].length>500 || (key==='name' && !value[key].trim()))return jsonError(400,'invalid '+key);values.push(value[key].trim()); }
    columns.push(column+'=?');
  }
  if(!columns.length)return jsonError(400,'no changes');
  if(!await mutateCustomer(env,auth,customerId,version,columns,values,[],'customer.update'))return jsonError(409,'latest information required');
  return detail(env,auth,customerId);
}

async function updateAppointment(request, env, auth, appointmentId) {
  if (auth.role !== 'owner') return jsonError(403, 'owner required');
  const value=await body(request),customerVersion=value?.version;
  const keys=['starts_at','location','address','status','version','appointment_version'];
  if(!value || !Number.isSafeInteger(customerVersion) || customerVersion<1 || Object.keys(value).some(key=>!keys.includes(key)))return jsonError(400,'invalid appointment fields');
  const appointment=await env.DB.prepare('SELECT * FROM CrmAppointments WHERE id=? AND tenant_id=?').bind(appointmentId,auth.tenant_id).first();
  if(!appointment)return jsonError(404,'appointment not found');
  const appointmentVersion=value.appointment_version ?? appointment.CrmVersion;
  if(!Number.isSafeInteger(appointmentVersion) || appointmentVersion<1)return jsonError(400,'invalid appointment version');
  const starts=iso(value.starts_at ?? appointment.starts_at),location=value.location ?? appointment.location,address=value.address ?? appointment.address;
  value.status=value.status ?? appointment.status;
  if(!starts || typeof location!=='string' || !location.trim() || location.length>300 || typeof address!=='string' || !address.trim() || address.length>500 || !['scheduled','cancelled'].includes(value.status))return jsonError(400,'invalid appointment');
  if (appointment.kind === 'visit') {
    const current = await env.DB.prepare('SELECT ConsultAt FROM Estimates WHERE id=? AND CrmTenantId=?').bind(appointment.estimate_id, auth.tenant_id).first();
    if (!current || new Date(current.ConsultAt).getTime() !== new Date(appointment.starts_at).getTime()) return jsonError(409, 'latest information required');
  }
  const created = nowIso(), appointmentGuard = id();
  const guard = env.DB.prepare(`INSERT INTO CrmMutationGuard(id,allowed) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM CrmAppointments a WHERE a.id=? AND a.tenant_id=? AND a.estimate_id=? AND a.CrmVersion=?) THEN 1 ELSE 0 END)`).bind(appointmentGuard, appointmentId, auth.tenant_id, appointment.estimate_id, appointmentVersion);
  const columns = appointment.kind === 'visit' ? ['ConsultAt=?', 'ConsultBranch=?', 'ConsultCancelledAt=?', "ConsultRemind1dAt=''", "ConsultRemind2hAt=''"] : [];
  const values = appointment.kind === 'visit' ? [starts, location, value.status === 'cancelled' ? created : ''] : [];
  const update = env.DB.prepare('UPDATE CrmAppointments SET starts_at=?,location=?,address=?,status=?,CrmVersion=CrmVersion+1 WHERE id=? AND tenant_id=? AND estimate_id=? AND CrmVersion=?').bind(starts, location, address, value.status, appointmentId, auth.tenant_id, appointment.estimate_id, appointmentVersion);
  const records = [guard, update, env.DB.prepare('DELETE FROM CrmMutationGuard WHERE id=?').bind(appointmentGuard)];
  if (!await mutateCustomer(env, auth, appointment.estimate_id, customerVersion, columns, values, records, 'appointments.update')) return jsonError(409, 'latest information required');
  return jsonOk({ id: appointmentId, version: customerVersion + 1, appointment_version: appointmentVersion + 1, status: value.status });
}

async function createRecord(request, env, auth, table) {
  if(auth.role!=='owner')return jsonError(403,'owner required');
  const value=await body(request), version=value?.version, customerId=value?.customer_id;
  if(!value || typeof customerId!=='string' || customerId.length>120 || !Number.isSafeInteger(version) || version<1)return jsonError(400,'invalid record');
  if(!await findCustomer(env.DB,auth.tenant_id,customerId))return jsonError(404,'customer not found');
  const recordId=id(), created=nowIso(), statements=[],columns=[],values=[];
  if(table==='appointments') {
    const kind=value.kind, starts=iso(value.starts_at);
    if(!['visit','measurement'].includes(kind) || !starts || typeof value.location!=='string' || !value.location.trim() || value.location.length>300 || typeof value.address!=='string' || !value.address.trim() || value.address.length>500)return jsonError(400,'invalid appointment');
    if(kind==='visit'){columns.push('ConsultAt=?','ConsultBranch=?',"ConsultCancelledAt=''","ConsultRemind1dAt=''","ConsultRemind2hAt=''");values.push(starts,value.location.trim());}
    if(kind==='visit')statements.push(env.DB.prepare("UPDATE CrmAppointments SET status='cancelled',CrmVersion=CrmVersion+1 WHERE tenant_id=? AND estimate_id=? AND kind='visit' AND status='scheduled'").bind(auth.tenant_id,customerId));
    statements.push(env.DB.prepare('INSERT INTO CrmAppointments(id,tenant_id,estimate_id,kind,starts_at,location,address,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(recordId,auth.tenant_id,customerId,kind,starts,value.location.trim(),value.address.trim(),auth.id,created));
  } else if(table==='consultations') {
    if(typeof value.result!=='string' || !value.result.trim() || value.result.length>5000)return jsonError(400,'invalid consultation');
    statements.push(env.DB.prepare('INSERT INTO CrmConsultations(id,tenant_id,estimate_id,result,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(recordId,auth.tenant_id,customerId,value.result.trim(),auth.id,created));
    statements.push(env.DB.prepare('INSERT INTO EstimateMemos(id,EstimateId,Body,Author,CreatedAt,UpdatedAt) VALUES(?,?,?,?,?,?)').bind(recordId,customerId,value.result.trim(),auth.email,created,created));
  } else {
    const amount=value.amount, status=value.status, signed=iso(value.signed_at);
    if(!Number.isSafeInteger(amount) || amount<0 || amount>1e12 || !['draft','signed','cancelled'].includes(status) || !signed)return jsonError(400,'invalid contract');
    if(status==='signed'){columns.push('ContractAt=?','ContractOwner=?','ContractAmount=?');values.push(signed,auth.email,amount);}
    if(status==='cancelled'){columns.push("ContractAt=''","ContractOwner=''",'ContractAmount=0');}
    statements.push(env.DB.prepare('INSERT INTO CrmContracts(id,tenant_id,estimate_id,amount,status,signed_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(recordId,auth.tenant_id,customerId,amount,status,signed,auth.id,created));
  }
  if(!await mutateCustomer(env,auth,customerId,version,columns,values,statements,table+'.create'))return jsonError(409,'latest information required');
  return jsonOk({id:recordId,version:version+1});
}

async function routeMobileCrm(request, env, ctx) {
  if (!enabled(env)) return jsonError(404, "Not Found");
  const path = new URL(request.url).pathname.replace(/^\/api\/mobile/, "") || "/";
  if (path === "/auth/request-otp" && request.method === "POST") return requestMobileOtp(request, env, ctx);
  if (path === "/auth/verify-otp" && request.method === "POST") return verifyMobileOtp(request, env);
  if (path === "/auth/logout" && request.method === "POST") { await revokeSession(env.DB, request); return jsonOk({ loggedIn: false }); }
  const auth = await authenticateSupport(env.DB, request) || await authenticate(env.DB, request);
  if (!auth) return jsonError(401, "authentication required");
  if (isSupportReadonly(auth)) {
    if(path==='/sync' && request.method==='GET')return jsonOk({readonly:true});
    if(path==='/support/end' && request.method==='POST')return endSupportSession(request,env,auth);
    const allowed=['/me','/home','/customers','/appointments','/analytics'].includes(path) || /^\/customers\/[A-Za-z0-9_-]+$/.test(path);
    if(request.method!=='GET'||!allowed)return jsonError(403,'support session is read-only');
  }
  if(path==='/home' && request.method==='GET')return homeSummary(env,auth);

  if (request.method === 'PATCH' && new URL(request.url).pathname.startsWith('/api/mobile/appointments/')) {
    return updateAppointment(request, env, auth, new URL(request.url).pathname.slice('/api/mobile/appointments/'.length));
  }
  const devices = await handleMobileDevices(request, env, auth);
  if (devices) return noStore(devices);
  const management = await handleMobileManagement(request, env, auth);
  if (management) return noStore(management);
  const notification = await handleMobileNotifications(request, env, auth);
  if (notification) return noStore(notification);
  if (path === '/analytics' && request.method === 'GET') {
    if (auth.role !== 'owner') return jsonError(403, 'owner required');
    const url = new URL(request.url);
    const today = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
    return jsonOk(await readCrmAnalytics(env.DB,{tenantId:auth.tenant_id,startDate:url.searchParams.get('start') || today,endDate:url.searchParams.get('end') || today}));
  }
  if (path === "/me" && request.method === "GET") return me(auth);
  if (path === "/members" && request.method === "GET") return listMembers(request, env, auth);
  if (path === "/customers" && request.method === "GET") return listCustomers(request, env, auth);
  const customerMatch = path.match(/^\/customers\/([A-Za-z0-9_-]+)$/);
  if (customerMatch && request.method === "GET") return detail(env, auth, customerMatch[1]);
  if (customerMatch && request.method === "PATCH") return updateCustomer(request, env, auth, customerMatch[1]);
  if (path === "/appointments" && request.method === "POST") return createRecord(request, env, auth, 'appointments');
  if (path === "/consultations" && request.method === "POST") return createRecord(request, env, auth, 'consultations');
  if (path === "/contracts" && request.method === "POST") return createRecord(request, env, auth, 'contracts');
  return jsonError(404, "Not Found");
}

export async function handleMobileCrm(request, env, ctx) {
  try { return noStore(await routeMobileCrm(request,env,ctx)); }
  catch(error) {
    if(String(error.message).startsWith('analytics_')) return jsonError(400,'invalid analytics range');
    return jsonError(503,'CRM temporarily unavailable');
  }
}
