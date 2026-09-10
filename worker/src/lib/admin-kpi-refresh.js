import { normalizeKpiBudget, classifyKpiOrganic } from './admin-kpi-normalize.js';
import { collectAdminKpiGa4, isReusableAdminKpiGa4Snapshot } from './admin-kpi-ga4.js';
import { persistCrmGa4Snapshot } from './crm-traffic-summary.js';
const TENANT = 'day1design';
const PAGE = 100;
const businessMetrics = ['inquiries','metaReceived','webReceived','organic','naverOrganic','googleOrganic','chatgptOrganic','meetings','contracts','amount','changes', ...Array.from({ length: 7 }, (_, i) => `budget${i}`)];
const rows = result => result?.results || [];
const dayAfter = day => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const addDays = (day, amount) => new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
const utcStart = day => new Date(`${day}T00:00:00+09:00`).toISOString();
const kstDay = now => new Date(now.getTime() + 32400000).toISOString().slice(0, 10);
const validDate = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && new Date(`${day}T00:00:00Z`).toISOString().slice(0,10) === day;

export async function enqueueAdminKpiBatch(db, { kind, startDate, endDate = startDate, now = new Date() }) {
  if (!['business','ga4'].includes(kind) || !validDate(startDate) || !validDate(endDate) || startDate > endDate || endDate >= kstDay(now)) throw new Error('kpi_batch_range');
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
  if (days > (kind === 'business' ? 31 : 366)) throw new Error('kpi_batch_range_limit');
  const active = rows(await db.prepare(`SELECT id FROM AdminKpiJobs WHERE tenant_id=? AND status IN ('queued','running','paused') LIMIT 513`).bind(TENANT).all());
  if (active.length + (kind === 'business' ? days : 1) > 512) throw new Error('kpi_batch_queue_limit');
  // Business chunks are individual days; GA4 uniqueness requires the entire requested range.
  const dates = kind === 'business' ? Array.from({ length: days }, (_, i) => new Date(Date.parse(startDate) + i * 86400000).toISOString().slice(0,10)) : [startDate];
  const completeDays = kind === 'business' ? rows(await db.prepare(`SELECT day,COUNT(*) AS count FROM AdminKpiDaily WHERE tenant_id=? AND day>=? AND day<=? AND source='business' AND coverage_status='complete' AND metric IN (${businessMetrics.map(()=>'?').join(',')}) GROUP BY day`).bind(TENANT,startDate,endDate,...businessMetrics).all()) : [];
  const dirtyDays = kind === 'business' ? new Set(rows(await db.prepare(`SELECT day FROM AdminKpiDirtyDays WHERE tenant_id=? AND day>=? AND day<=? AND source='business'`).bind(TENANT,startDate,endDate).all()).map(row=>row.day)) : new Set();
  const reusableDays = new Set(completeDays.filter(row=>row.count===businessMetrics.length && !dirtyDays.has(row.day)).map(row=>row.day));
  const pendingDates=dates.filter(day=>!reusableDays.has(day));
  const statements = pendingDates.map(day => {
    const end = kind === 'business' ? day : endDate;
    return db.prepare(`INSERT INTO AdminKpiJobs(id,tenant_id,kind,start_date,end_date,status,updated_at)
      VALUES(?,?,?,?,?,'queued',?) ON CONFLICT(id) DO UPDATE SET status='queued',cursor='',payload_json='{}',updated_at=excluded.updated_at WHERE AdminKpiJobs.status='complete' AND (excluded.kind='ga4' OR EXISTS(SELECT 1 FROM AdminKpiDirtyDays WHERE tenant_id=excluded.tenant_id AND day=excluded.start_date AND source='business'))`).bind(`${TENANT}:${kind}:${day}:${end}`, TENANT, kind, day, end, now.toISOString());
  });
  if(statements.length) await db.batch(statements);
  return { queued: pendingDates.length,reused:reusableDays.size, maxRowsPerStep: PAGE };
}

export async function enqueueDefaultAdminKpiWarmup(db, { now = new Date(), includePeriod15 = false } = {}) {
  const anchor = kstDay(now);
  const yesterday = addDays(anchor, -1);
  const queued = [];
  queued.push({ kind: 'business', ...(await enqueueAdminKpiBatch(db, { kind: 'business', startDate: addDays(anchor, includePeriod15 ? -30 : -14), endDate: yesterday, now })) });
  for (const [startDate, endDate] of [
    [addDays(anchor, -7), yesterday],
    [addDays(anchor, -14), addDays(anchor, -8)],
    ...(includePeriod15 ? [[addDays(anchor, -15), yesterday], [addDays(anchor, -30), addDays(anchor, -16)]] : []),
  ]) queued.push({ kind: 'ga4', startDate, endDate, ...(await enqueueAdminKpiBatch(db, { kind: 'ga4', startDate, endDate, now })) });
  return { anchor, queued };
}

async function warmupDefaultKpi(env, now) {
  if (!env.ADMIN_KPI_WARM_DEFAULTS) return null;
  const budget = Number(env.ADMIN_KPI_GA4_DAILY_REQUEST_BUDGET || 0);
  if (!Number.isSafeInteger(budget) || budget < 2 || budget > 100) return { skipped: 'request_budget_unconfigured' };
  return enqueueDefaultAdminKpiWarmup(env.DB, { now, includePeriod15: env.ADMIN_KPI_WARM_PERIOD15 === '1' });
}

async function readPage(db, job, phase, cursor) {
  const start = utcStart(job.start_date), end = utcStart(dayAfter(job.start_date));
  const after = cursor ? JSON.parse(cursor) : [start, ''];
  if (phase < 2) {
    const column = phase === 0 ? 'SubmittedAt' : 'ConsultAt';
    const index = phase === 0 ? 'idx_admin_kpi_estimate_intake' : 'idx_admin_kpi_estimate_meeting';
    return rows(await db.prepare(`SELECT id,SubmittedAt,ConsultAt,ConsultCancelledAt,Status,Source,FirstSource,
      FirstReferrer,Referrer,FirstUtmSource,UtmSource,FirstUtmMedium,UtmMedium,MetaLeadId,MetaAdId,Fbclid,Detail
      FROM Estimates INDEXED BY ${index} WHERE CrmTenantId=? AND ${column}>=? AND ${column}<?
      AND (${column},id)>(?,?) ORDER BY ${column},id LIMIT ?`).bind(TENANT,start,end,...after,PAGE+1).all());
  }
  // Only this bounded event page is joined to its owner and indexed first-final event.
  return rows(await db.prepare(`WITH page AS (
    SELECT * FROM EstimateContractHistory INDEXED BY idx_admin_kpi_history_tenant_day
    WHERE tenant_id=? AND saved_at>=? AND saved_at<? AND (saved_at,id)>(?,?) ORDER BY saved_at,id LIMIT ?)
    SELECT p.*,e.CrmTenantId,
      (SELECT h.id FROM EstimateContractHistory h INDEXED BY idx_admin_kpi_contract_first
       WHERE h.estimate_id=p.estimate_id AND h.stage='최종확정' ORDER BY h.saved_at,h.id LIMIT 1) AS first_final_id,
      (SELECT h.saved_at FROM EstimateContractHistory h INDEXED BY idx_admin_kpi_contract_first
       WHERE h.estimate_id=p.estimate_id AND h.stage='최종확정' ORDER BY h.saved_at,h.id LIMIT 1) AS first_final_at
    FROM page p LEFT JOIN Estimates e ON e.id=p.estimate_id ORDER BY p.saved_at,p.id`).bind(TENANT,start,end,...after,PAGE+1).all());
}

async function businessStep(db, job, now) {
  const state = JSON.parse(job.payload_json || '{}');
  const phase = state.phase || 0;
  const totals = state.totals || Object.fromEntries(businessMetrics.map(key => [key,0]));
  const fetched = await readPage(db,job,phase,job.cursor);
  const page = fetched.slice(0,PAGE);
  const writes = [];
  for (const row of page) {
    if (phase === 0) {
      if (row.Status === '작성중') continue;
      totals.inquiries++;
      const meta = Boolean(row.MetaLeadId) || String(row.Source).toLowerCase() === 'meta';
      if (row.MetaLeadId) totals.metaReceived++;
      if (!meta) totals.webReceived++;
      const organic = classifyKpiOrganic(row), budget = normalizeKpiBudget(row);
      if (organic) { totals.organic++; totals[`${organic}Organic`]++; }
      totals[`budget${budget.band}`]++;
      writes.push(db.prepare(`INSERT INTO AdminKpiNormalized(tenant_id,estimate_id,submitted_day,meeting_day,payload_json,budget_raw,budget_band,budget_reason,classification_version,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,estimate_id) DO UPDATE SET submitted_day=excluded.submitted_day,
        meeting_day=excluded.meeting_day,payload_json=excluded.payload_json,budget_raw=excluded.budget_raw,budget_band=excluded.budget_band,
        budget_reason=excluded.budget_reason,classification_version=excluded.classification_version,updated_at=excluded.updated_at`)
        .bind(TENANT,row.id,job.start_date,row.ConsultAt ? kstDay(new Date(row.ConsultAt)) : '',JSON.stringify({ organic, meta }),budget.raw,budget.band,budget.reason,budget.version,now));
    } else if (phase === 1) {
      if (!row.ConsultCancelledAt && row.Status !== '취소') totals.meetings++;
    } else if (row.CrmTenantId === TENANT && row.first_final_id) {
      if (row.id === row.first_final_id) { totals.contracts++; totals.amount += Number(row.amount); }
      else if ((row.saved_at > row.first_final_at || row.saved_at === row.first_final_at && row.id > row.first_final_id) &&
               ['최종확정','정정'].includes(row.stage) && row.previous_amount !== null)
        totals.changes += Number(row.amount) - Number(row.previous_amount);
    }
  }
  const hasMore = fetched.length > PAGE;
  const last = page.at(-1);
  const cursor = hasMore ? JSON.stringify([last[phase === 0 ? 'SubmittedAt' : phase === 1 ? 'ConsultAt' : 'saved_at'],last.id]) : '';
  const nextPhase = hasMore ? phase : phase + 1;
  if (nextPhase === 3) {
    for (const metric of businessMetrics) writes.push(db.prepare(`INSERT INTO AdminKpiDaily(tenant_id,day,metric,value,source,coverage_status,source_revision,updated_at)
      SELECT ?,?,?,?,'business','complete',?,? WHERE COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id='day1design'),0)=? ON CONFLICT(tenant_id,day,metric) DO UPDATE SET value=excluded.value,
      source=excluded.source,coverage_status=excluded.coverage_status,source_revision=excluded.source_revision,updated_at=excluded.updated_at`)
      .bind(TENANT,job.start_date,metric,totals[metric],String(job.revision),now,job.revision));
  }
  if (nextPhase === 3) writes.push(db.prepare(`DELETE FROM AdminKpiDirtyDays WHERE tenant_id=? AND day=? AND source='business' AND revision<=? AND COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=?),0)=?`).bind(TENANT,job.start_date,job.revision,TENANT,job.revision));
  writes.push(db.prepare(`UPDATE AdminKpiJobs SET status=CASE WHEN COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=?),0)=? THEN ? ELSE 'failed' END,cursor=?,payload_json=?,lease_until='',updated_at=? WHERE id=? AND status='running'`)
    .bind(TENANT,job.revision,nextPhase === 3 ? 'complete' : 'queued',cursor,JSON.stringify({ phase:nextPhase,totals }),now,job.id));
  await db.batch(writes);
  if (nextPhase === 3) {
    await db.prepare(`UPDATE CrmDataRevisions SET version=version+1,updated_at=? WHERE tenant_id=?`).bind(now,TENANT).run();
    await rebuildKpiMonth(db,job.start_date.slice(0,7),now);
  }
  return { status: nextPhase === 3 ? 'complete' : 'queued', processed:page.length };
}

async function runBatchStep(env, { now = new Date(), fetchImpl = fetch } = {}) {
  const db = env.DB;
  if (!db) return { skipped:'no_database' };
  const stamp = now.toISOString();
  // A crashed or timed-out job requires an explicit retry; cron cannot loop forever.
  await db.prepare(`UPDATE AdminKpiJobs SET status='failed',error_code='lease_expired',lease_until='' WHERE tenant_id=? AND status='running' AND lease_until<?`).bind(TENANT,stamp).run();
  await warmupDefaultKpi(env, now);
  const dirty = await db.prepare(`SELECT day FROM AdminKpiDirtyDays WHERE tenant_id=? AND source='business' AND day<? ORDER BY day LIMIT 1`).bind(TENANT,kstDay(now)).first();
  if (dirty) await enqueueAdminKpiBatch(db,{kind:'business',startDate:dirty.day,now});
  const job = await db.prepare(`SELECT * FROM AdminKpiJobs WHERE tenant_id=? AND status='queued' ORDER BY updated_at,id LIMIT 1`).bind(TENANT).first();
  if (!job) return { skipped:'no_work' };
  const claim = await db.prepare(`UPDATE AdminKpiJobs SET status='running',lease_until=?,updated_at=? WHERE id=? AND status='queued' RETURNING id`)
    .bind(new Date(now.getTime()+60000).toISOString(),stamp,job.id).first();
  if (!claim) return { skipped:'claimed_elsewhere' };
  try {
    if (job.kind === 'business') {
      const revision = Number((await db.prepare('SELECT version FROM CrmDataRevisions WHERE tenant_id=?').bind(TENANT).first())?.version || 0);
      const state = JSON.parse(job.payload_json || '{}');
      if ((state.phase || job.cursor) && revision !== job.revision) {
        await db.prepare(`UPDATE AdminKpiJobs SET status='failed',error_code='source_changed_during_batch',lease_until='',updated_at=? WHERE id=?`).bind(stamp,job.id).run();
        return {status:'failed',reason:'source_changed_during_batch'};
      }
      if (!state.phase && !job.cursor) {
        job.revision=revision;
        await db.prepare('UPDATE AdminKpiJobs SET revision=? WHERE id=?').bind(revision,job.id).run();
      }
      return await businessStep(db,job,stamp);
    }
    const propertyId = String(env.GA4_PROPERTY_ID || '').replace(/^properties\//,'');
    const existing = await db.prepare(`SELECT id,payload_json FROM CrmGa4AnalyticsSnapshots WHERE tenant_id=? AND source_kind='ga4' AND source_id=? AND start_date=? AND end_date=? LIMIT 1`)
      .bind(TENANT,propertyId,job.start_date,job.end_date).first();
    let reusable = false;
    try {
      const payload = JSON.parse(existing?.payload_json || '{}');
      reusable = isReusableAdminKpiGa4Snapshot(payload, { tenantId: TENANT, propertyId, startDate: job.start_date, endDate: job.end_date });
    } catch {}
    if (reusable) {
      await db.prepare(`UPDATE AdminKpiJobs SET status='complete',lease_until='',updated_at=? WHERE id=?`).bind(stamp,job.id).run();
      return { status:'complete',reused:true,externalRequests:0 };
    }
    const budget = Number(env.ADMIN_KPI_GA4_DAILY_REQUEST_BUDGET || 0);
    if (!Number.isSafeInteger(budget) || budget < 2 || budget > 100) {
      await db.prepare(`UPDATE AdminKpiJobs SET status='paused',error_code='request_budget_unconfigured',lease_until='',updated_at=? WHERE id=?`).bind(stamp,job.id).run();
      return { status:'paused',reason:'request_budget_unconfigured' };
    }
    const day = kstDay(now);
    const reserved = await db.prepare(`INSERT INTO AdminKpiBatchBudget(tenant_id,day,used) VALUES(?,?,2)
      ON CONFLICT(tenant_id,day) DO UPDATE SET used=used+2 WHERE used+2<=? RETURNING used`).bind(TENANT,day,budget).first();
    if (!reserved) {
      await db.prepare(`UPDATE AdminKpiJobs SET status='paused',error_code='daily_request_budget',lease_until='',updated_at=? WHERE id=?`).bind(stamp,job.id).run();
      return { status:'paused',reason:'daily_request_budget' };
    }
    const snapshot = await collectAdminKpiGa4(env,{ startDate:job.start_date,endDate:job.end_date },{ fetchImpl,now });
    await persistCrmGa4Snapshot(db,{ tenantId:TENANT,propertyId,startDate:job.start_date,endDate:job.end_date,
      summary:{ ...snapshot.summary,timezone:snapshot.timezone,complete:true },createdAt:stamp });
    await db.prepare(`UPDATE AdminKpiJobs SET status='complete',lease_until='',updated_at=? WHERE id=?`).bind(stamp,job.id).run();
    return { status:'complete',externalRequests:2 };
  } catch (error) {
    if (env.ADMIN_KPI_DEBUG_ERRORS === '1') console.error('[admin-kpi-debug]', String(error?.message || error).slice(0,500));
    const reason = /^kpi_[a-z0-9_]+$/.test(error?.message || '') ? error.message.slice(0,80) : 'batch_step_failed';
    await db.prepare(`UPDATE AdminKpiJobs SET status='failed',error_code=?,attempts=attempts+1,lease_until='',updated_at=? WHERE id=?`).bind(reason,stamp,job.id).run();
    return { status:'failed',reason };
  }
}

async function rebuildKpiMonth(db, month, now) {
  const start = `${month}-01`, next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1);
  const end = next.toISOString().slice(0,10), days=(Date.parse(end)-Date.parse(start))/86400000;
  const list = rows(await db.prepare(`SELECT metric,SUM(value) AS total,COUNT(*) AS days,
    SUM(CASE WHEN coverage_status='complete' THEN 1 ELSE 0 END) AS complete_days
    FROM AdminKpiDaily WHERE tenant_id=? AND day>=? AND day<? AND source='business'
    AND metric IN (${businessMetrics.map(()=>'?').join(',')}) GROUP BY metric`).bind(TENANT,start,end,...businessMetrics).all());
  const dirty=await db.prepare(`SELECT day FROM AdminKpiDirtyDays WHERE tenant_id=? AND day>=? AND day<? AND source='business' LIMIT 1`).bind(TENANT,start,end).first();
  if(dirty || list.length!==businessMetrics.length || list.some(row=>row.days!==days || row.complete_days!==days)) return;
  await db.batch(list.map(row=>db.prepare(`INSERT INTO AdminKpiMonthly(tenant_id,month,metric,value,source,coverage_status,source_revision,updated_at) VALUES(?,?,?,?,'business','complete','',?) ON CONFLICT(tenant_id,month,metric) DO UPDATE SET value=excluded.value,coverage_status=excluded.coverage_status,updated_at=excluded.updated_at`).bind(TENANT,month,row.metric,row.total,now)));
}

export async function runAdminKpiBatch(env, options = {}) {
  if (!env.DB) return {skipped:'no_database'};
  const now = options.now || new Date(), owner = crypto.randomUUID();
  const lease = await env.DB.prepare(`INSERT INTO AdminKpiBatchLease(tenant_id,owner,lease_until) VALUES(?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until WHERE lease_until<? RETURNING owner`).bind(TENANT,owner,new Date(now.getTime()+120000).toISOString(),now.toISOString()).first();
  if (!lease || lease.owner!==owner) return {skipped:'batch_in_progress'};
  try { return await runBatchStep(env,{...options,now}); }
  finally { await env.DB.prepare('DELETE FROM AdminKpiBatchLease WHERE tenant_id=? AND owner=?').bind(TENANT,owner).run(); }
}
