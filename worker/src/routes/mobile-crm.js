import { authenticateTenantPreview, endTenantPreview, isTenantPreview, previewReadAllowed } from '../lib/crm-tenant-preview.js';
import { readThroughCrmHome } from '../lib/crm-home-cache.js';
import { readCrmTrafficSummary } from '../lib/crm-traffic-summary.js';
import { buildCrmHomeMetrics, homeMetricPeriods } from '../lib/crm-home-metrics.js';
import { readMobileBriefing } from '../lib/crm-briefing-reader.js';
import { readCrmFlowAnalysis } from '../lib/crm-flow-analysis.js';
import { readCrmAnalyticsDimensions } from '../lib/crm-analytics-dimensions.js';
import { readThroughCrmAnalytics } from '../lib/crm-read-cache.js';
import { jsonError as baseJsonError, jsonOk as baseJsonOk } from "../lib/response.js";
import { authenticate, nowIso, revokeSession, requestMobileOtp, verifyMobileOtp } from '../lib/crm-auth.js';
import { authenticateSupport, endSupportSession, isSupportAdmin, isSupportReadonly, platformAllowed, renewSupportSession, supportReadAllowed } from '../lib/crm-support.js';
import { handleMobileNotifications } from './mobile-notifications.js';
import { handleMobileDevices } from './mobile-devices.js';
import { handleMobileManagement } from './mobile-management.js';
import { readCrmAnalytics, dateRange } from '../lib/crm-analytics.js';
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

function sourceStatus({ visits = null, saved = null, qualityIssue = false } = {}) {
  const savedNumber = saved === null || saved === undefined ? null : Number(saved);
  const visitNumber = visits === null || visits === undefined ? null : Number(visits);
  if (Number.isFinite(savedNumber) && savedNumber >= 1) return "receipt";
  if (qualityIssue || !Number.isFinite(visitNumber) || !Number.isFinite(savedNumber)) return "quality";
  if (visitNumber >= 100) return "none";
  if (visitNumber >= 1) return "sample";
  return "inactive";
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
async function cachedAnalytics(env, query) {
  dateRange(query.startDate, query.endDate);
  return readThroughCrmAnalytics(env.DB, { ...query, cacheBucket: env.CRM_CACHE, load: async () => {
    const [analytics, dimensions, flowAnalysis, trafficSummary] = await Promise.all([
      readCrmAnalytics(env.DB, query), readCrmAnalyticsDimensions(env.DB, query),
      readCrmFlowAnalysis(env.DB, query), readCrmTrafficSummary(env.DB, { ...query, propertyId: env.GA4_PROPERTY_ID }),
    ]);
    return { ...analytics, dimensions, flowAnalysis, trafficSummary };
  }});
}
async function homeSummary(env,auth) {
  const revision = await env.DB.prepare('SELECT version FROM CrmDataRevisions WHERE tenant_id=?').bind(auth.tenant_id).first();
  const payload = await readThroughCrmHome(env.DB, { tenantId:auth.tenant_id, role:auth.role,
    userId:auth.user_id, revision:revision?.version || 0, load:()=>buildHomePayload(env,auth) });
  return jsonOk(payload);
}
async function buildHomePayload(env,auth) {
  const bounds=homeKstBounds();
  const pending=await env.DB.prepare("SELECT COUNT(*) count FROM Estimates WHERE CrmTenantId=? AND Status IN ('접수대기','new')").bind(auth.tenant_id).first();
  const briefRow=auth.role==='owner' ? await env.DB.prepare("SELECT b.briefing_date,b.created_at,n.type,n.payload_json FROM CrmDailyBriefings b LEFT JOIN CrmNotifications n ON n.id=b.notification_id AND n.tenant_id=b.tenant_id WHERE b.tenant_id=? AND b.recipient_id=? ORDER BY b.briefing_date DESC,b.created_at DESC LIMIT 1").bind(auth.tenant_id,auth.user_id).first() : null;
  const today={};
  for(const kind of ['visit','measurement']) {
    const count=await env.DB.prepare("SELECT COUNT(*) count FROM CrmAppointments WHERE tenant_id=? AND kind=? AND starts_at>=? AND starts_at<? AND status<>'cancelled'").bind(auth.tenant_id,kind,bounds.startUtc,bounds.endExclusiveUtc).first();
    const rows=await env.DB.prepare("SELECT a.*,e.Name customer_name FROM CrmAppointments a LEFT JOIN Estimates e ON e.id=a.estimate_id AND e.CrmTenantId=a.tenant_id WHERE a.tenant_id=? AND a.kind=? AND a.starts_at>=? AND a.starts_at<? AND a.status<>'cancelled' ORDER BY a.starts_at,a.id LIMIT 5").bind(auth.tenant_id,kind,bounds.startUtc,bounds.endExclusiveUtc).all();
    today[kind==='visit'?'consultation':kind]={count:Number(count.count),items:rows.results||[]};
  }
  let home_metrics = null;
  let marketing_flow = null;
  if (auth.role === 'owner') {
    const periods = homeMetricPeriods(bounds.date);
    const [todaySubmissions, recent30Submissions] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) count FROM Estimates WHERE CrmTenantId=? AND SubmittedAt>=? AND SubmittedAt<?")
        .bind(auth.tenant_id, bounds.startUtc, bounds.endExclusiveUtc).first(),
      env.DB.prepare("SELECT COUNT(*) count FROM Estimates WHERE CrmTenantId=? AND SubmittedAt>=? AND SubmittedAt<?")
        .bind(auth.tenant_id, dateRange(periods.recent30.start, bounds.date).startUtc, bounds.endExclusiveUtc).first(),
    ]);
    const submissions = {
      today: { value: Number(todaySubmissions?.count || 0), reason: null },
      recent30: { value: Number(recent30Submissions?.count || 0), reason: null },
    };
    try {
      const [todayAnalytics, recent30Analytics, trafficSummary] = await Promise.all([
        cachedAnalytics(env, { tenantId: auth.tenant_id, startDate: bounds.date, endDate: bounds.date }).catch(() => null),
        cachedAnalytics(env, { tenantId: auth.tenant_id, startDate: periods.recent30.start, endDate: bounds.date }).catch(() => null),
        readCrmTrafficSummary(env.DB, { tenantId: auth.tenant_id, propertyId: env.GA4_PROPERTY_ID, startDate: bounds.date, endDate: bounds.date }).catch(() => null),
      ]);
      home_metrics = buildCrmHomeMetrics({ tenantId: auth.tenant_id, todayAnalytics, recent30Analytics,
        trafficSummary, todayDate: bounds.date });
      home_metrics.submissions = submissions;
      const flowAnalysis=todayAnalytics?.flowAnalysis;
      if (flowAnalysis?.available) marketing_flow={
        date: bounds.date,
        period: flowAnalysis.periods,
        channels: (flowAnalysis.sources || []).slice(0,20).map((source) => ({
          channel: source.channel,
          count: Number(source.current?.savedLeads || 0),
          visits: Number(source.current?.visits || 0),
          conversion_rate: source.current?.rates?.visitToSaved?.value ?? null,
          status: source.judgment?.status || flowAnalysis.judgment?.status || 'unavailable',
          source_status: sourceStatus({
            visits: source.current?.visits,
            saved: source.current?.savedLeads,
            qualityIssue: source.judgment?.status === 'unavailable' || flowAnalysis.judgment?.status === 'unavailable',
          }),
          visits_change_pct: source.previous?.visits > 0 ? ((Number(source.current?.visits || 0) - Number(source.previous.visits || 0)) / Number(source.previous.visits)) * 100 : null,
          receipts_change_pct: source.previous?.savedLeads > 0 ? ((Number(source.current?.savedLeads || 0) - Number(source.previous.savedLeads || 0)) / Number(source.previous.savedLeads)) * 100 : null,
        })),
        has_more: Boolean(flowAnalysis.sourcesHasMore),
      };
    } catch {
      home_metrics = buildCrmHomeMetrics({ tenantId: auth.tenant_id, todayAnalytics: null, recent30Analytics: null,
        todayDate: bounds.date });
      home_metrics.submissions = submissions;
    }
  }
  const daily_brief=briefRow ? { date:briefRow.briefing_date,created_at:briefRow.created_at,type:briefRow.type || 'daily_briefing',payload:(() => { try { return JSON.parse(briefRow.payload_json || '{}'); } catch { return {}; } })() } : null;
  return {date:bounds.date,timezone:'Asia/Seoul',intake:{pending_count:Number(pending.count)},today,home_metrics,daily_brief,marketing_flow};
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
    branch: row.Branch || "",
    detail: row.Detail || "",
    source: row.Source || "",
    platform: row.Platform || "",
    first_source: row.FirstSource || "",
    first_referrer: row.FirstReferrer || "",
    first_inflow_app: row.FirstInflowApp || "",
    budget: Number(row.EstimateAmount || 0),
    budget_text: /가용\s*예산[^\S\r\n]*[:：][^\S\r\n]*([^\n\r]*)/.exec(String(row.Detail || ""))?.[1]?.trim() || "",
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

async function assigneeBatch(db, tenantId, values) {
  const unique = [...new Set(values.filter((value) => typeof value === 'string' && value))].slice(0, 50);
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => '?').join(',');
  const result = await db.prepare(`SELECT id,email FROM CrmUsers WHERE tenant_id=? AND active=1 AND (id IN (${placeholders}) OR email COLLATE NOCASE IN (${placeholders}))`)
    .bind(tenantId, ...unique, ...unique).all();
  const byId = new Map();
  const byEmail = new Map();
  for (const row of result.results || []) {
    byId.set(row.id, row);
    byEmail.set(String(row.email || '').toLowerCase(), row);
  }
  return new Map(unique.map((value) => [value, byId.get(value) || byEmail.get(value.toLowerCase()) || null]));
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

const allowedCustomerStatuses = new Set([
  "접수대기", "고객 부재중", "진행불가 (예산/범위/지역/일정등)", "전화상담 후 미진행",
  "전화상담 후 미팅예약", "전화상담 후 대기중", "보류", "계약완료",
  "상담중", "견적완료", "취소", "작성중",
  "new", "contacted", "scheduled", "quoted", "contracted", "closed",
]);

function encodeCursor(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function listCustomers(request, env, auth) {
  const url=new URL(request.url), q=(url.searchParams.get('q') || '').toLowerCase(), cursor=url.searchParams.get('cursor') || '', status=url.searchParams.get('status') || '', source=url.searchParams.get('source') || '';
  if(q.length>120 || cursor.length>300 || status.length>120 || source.length>120) return jsonError(400,'invalid query');
  let page = null;
  if (cursor) {
    try {
      page = decodeCursor(cursor);
      if (!page || typeof page.id !== 'string' || page.id.length > 120 || (page.submitted_at !== null && typeof page.submitted_at !== 'string')) throw new Error('invalid cursor');
    } catch { return jsonError(400, 'invalid cursor'); }
  }
  const predicates = ['CrmTenantId=?'];
  const binds = [auth.tenant_id];
  if (page) {
    predicates.push("((COALESCE(SubmittedAt,'')='' AND ? IS NOT NULL) OR (COALESCE(SubmittedAt,'')<>'' AND ? IS NOT NULL AND SubmittedAt < ?) OR (SubmittedAt = ? AND id < ?) OR (COALESCE(SubmittedAt,'')='' AND ? IS NULL AND id < ?))");
    binds.push(page.submitted_at, page.submitted_at, page.submitted_at, page.submitted_at, page.id, page.submitted_at, page.id);
  }
  const order = "(CASE WHEN COALESCE(SubmittedAt,'')='' THEN 1 ELSE 0 END), SubmittedAt DESC, id DESC";
  const groups={__pending:['접수대기','new'],__contract:['계약완료','contracted'],__progress:[...allowedCustomerStatuses].filter(value=>!['접수대기','new','계약완료','contracted'].includes(value))};
  const statuses=groups[status];
  if (status && !statuses) { predicates.push('Status=?'); binds.push(status); }
  if (source) { predicates.push('Source=?'); binds.push(source); }
  let result;
  if(statuses){
    const windows=statuses.map(()=>`SELECT * FROM (SELECT * FROM Estimates WHERE ${predicates.join(' AND ')} AND Status=? ORDER BY ${order} LIMIT 51)`);
    result=await env.DB.prepare(`SELECT * FROM (${windows.join(' UNION ALL ')}) ORDER BY ${order} LIMIT 51`).bind(...statuses.flatMap(value=>[...binds,value])).all();
  }else result=await env.DB.prepare(`SELECT * FROM Estimates WHERE ${predicates.join(' AND ')} ORDER BY ${order} LIMIT 51`).bind(...binds).all();
  const rows=result.results || [], window=rows.slice(0,50);
  const items=[];
  for(const row of window) {
    if(q && ![row.Name,row.Phone,row.Email,row.Address,row.AddressDetail,row.Source,row.Platform,row.Campaign,row.FirstSource,row.FirstPlatform,row.FirstCampaign,row.Referral,row.Detail,row.Memo].join(' ').toLowerCase().includes(q)) continue;
    items.push(row);
  }
  const last = window[window.length - 1];
  const next_cursor = rows.length>50 && last ? encodeCursor({ submitted_at: last.SubmittedAt || null, id: last.id }) : null;
  const assignees = await assigneeBatch(env.DB, auth.tenant_id, items.map((row) => row.Assignee));
  return jsonOk({customers:items.map((row) => customer(row, assignees.get(row.Assignee) || null)),next_cursor});
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
  const supportAdmin = isSupportAdmin(auth);
  const guardSql = supportAdmin ? `INSERT INTO CrmMutationGuard(id,allowed) VALUES(?,CASE WHEN EXISTS(
    SELECT 1 FROM Estimates e JOIN CrmTenants t ON t.id=e.CrmTenantId
    WHERE e.id=? AND e.CrmTenantId=? AND e.CrmVersion=? AND t.suspended=0 AND EXISTS(
      SELECT 1 FROM CrmSupportSessions ss JOIN CrmUsers pu ON pu.id=ss.actor_id
      WHERE ss.id=? AND ss.tenant_id=e.CrmTenantId AND ss.revoked_at IS NULL AND ss.expires_at>? AND pu.id=? AND pu.tenant_id='platform' AND pu.active=1 AND pu.role='owner'
    )
  ) THEN 1 ELSE 0 END)` : `INSERT INTO CrmMutationGuard(id,allowed) VALUES(?,CASE WHEN EXISTS(
    SELECT 1 FROM Estimates e JOIN CrmUsers u ON u.id=? JOIN CrmTenants t ON t.id=u.tenant_id
    WHERE e.id=? AND e.CrmTenantId=? AND e.CrmVersion=? AND u.tenant_id=e.CrmTenantId AND u.active=1 AND u.role='owner' AND t.suspended=0
  ) THEN 1 ELSE 0 END)`;
  const guardBinds = supportAdmin ? [guard,customerId,auth.tenant_id,version,auth.support_session_id,created,auth.id] : [guard,auth.id,customerId,auth.tenant_id,version];
  const statements=[env.DB.prepare(guardSql).bind(...guardBinds),
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

async function renewSupport(request, env) {
  const value = await body(request);
  const supportToken = typeof value?.support_token === 'string' ? value.support_token.trim() : '';
  if (!supportToken || supportToken.length > 300 || !supportToken.startsWith('crm_support_')) return jsonError(400, 'invalid support token');
  const platformAuth = await authenticate(env.DB, request);
  if (!platformAllowed(env, platformAuth)) return jsonError(403, 'platform session required');
  const supportRequest = new Request(request.url, { method: 'POST', headers: { authorization: `Bearer ${supportToken}` } });
  return renewSupportSession(env.DB, supportRequest, platformAuth);
}

async function routeMobileCrm(request, env, ctx) {
  if (!enabled(env)) return jsonError(404, "Not Found");
  const path = new URL(request.url).pathname.replace(/^\/api\/mobile/, "") || "/";
  if (path === "/auth/request-otp" && request.method === "POST") return requestMobileOtp(request, env, ctx);
  if (path === "/auth/verify-otp" && request.method === "POST") return verifyMobileOtp(request, env);
  if (path === "/auth/logout" && request.method === "POST") { await revokeSession(env.DB, request); return jsonOk({ loggedIn: false }); }
  if (path === '/support/renew' && request.method === 'POST') return renewSupport(request, env);
  const auth = await authenticateTenantPreview(env.DB, request) || await authenticateSupport(env.DB, request) || await authenticate(env.DB, request);
  if (!auth) return jsonError(401, "authentication required");
  if (path === '/platform/preview-session/end' && request.method === 'POST') return endTenantPreview(request, env, auth);
  if (isTenantPreview(auth) && !previewReadAllowed(request.method, path)) return jsonError(403, 'tenant preview is read-only');
  if (path === '/support/end' && request.method === 'POST') return endSupportSession(request, env, auth);
  if (isSupportReadonly(auth) && !isSupportAdmin(auth)) {
    if(path==='/sync' && request.method==='GET')return jsonOk({readonly:true});
    if(!supportReadAllowed(request.method,path))return jsonError(403,'support session is read-only');
  }
  if (isSupportAdmin(auth) && path === '/notifications' && request.method === 'POST') return jsonError(403, 'support external send blocked');
  if (auth.role === 'staff' && request.method === 'GET' && (path === '/members' || path === '/message-templates' || path === '/message-preferences')) return jsonError(403, 'owner required');
  if (path === '/sync' && request.method === 'GET') {
    const revision = await env.DB.prepare('SELECT version,updated_at FROM CrmDataRevisions WHERE tenant_id=?').bind(auth.tenant_id).first();
    return jsonOk({ version: Number(revision?.version || 0), updated_at: revision?.updated_at || '' });
  }
  if(path==='/home' && request.method==='GET')return homeSummary(env,auth);

  if (request.method === 'PATCH' && new URL(request.url).pathname.startsWith('/api/mobile/appointments/')) {
    return updateAppointment(request, env, auth, new URL(request.url).pathname.slice('/api/mobile/appointments/'.length));
  }
  const briefing=await readMobileBriefing(request,env,auth,path);
  if(briefing)return noStore(briefing);
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
    const query={tenantId:auth.tenant_id,startDate:url.searchParams.get('start') || today,endDate:url.searchParams.get('end') || today};
    dateRange(query.startDate, query.endDate);
    const payload = await cachedAnalytics(env, query);
    return jsonOk(payload);
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
