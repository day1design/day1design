import { normalizeKpiBudget, classifyKpiOrganic } from './admin-kpi-normalize.js';
import { BUDGET_RULE_VERSION } from './estimate-budget.js';
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

export async function enqueueAdminKpiBatch(db, { kind, startDate, endDate = startDate, sourceId = '', now = new Date() }) {
  const latestDay = addDays(kstDay(now), -1);
  if (!['business','ga4'].includes(kind) || !validDate(startDate) || !validDate(endDate) || startDate > endDate || endDate > latestDay) throw new Error('kpi_batch_range');
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
  if (days > (kind === 'business' ? 31 : 366)) throw new Error('kpi_batch_range_limit');
  const propertyId = String(sourceId || '').replace(/^properties\//, '');
  if (kind === 'ga4' && /^\d+$/.test(propertyId)) {
    const snapshot = await db.prepare(`SELECT payload_json,created_at FROM CrmGa4AnalyticsSnapshots
      WHERE tenant_id=? AND source_kind='ga4' AND source_id=? AND start_date=? AND end_date=? ORDER BY created_at DESC LIMIT 1`)
      .bind(TENANT,propertyId,startDate,endDate).first();
    let payload = null;
    try { payload = JSON.parse(snapshot?.payload_json || ''); } catch { payload = null; }
    if (isReusableAdminKpiGa4Snapshot(payload,{tenantId:TENANT,propertyId,startDate,endDate,createdAt:snapshot?.created_at,now}))
      return { queued:0,reused:1,maxRowsPerStep:PAGE };
  }
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
      VALUES(?,?,?,?,?,'queued',?) ON CONFLICT(id) DO UPDATE SET status='queued',cursor='',payload_json='{}',error_code='',
      retries=CASE WHEN AdminKpiJobs.status='failed' THEN AdminKpiJobs.retries+1 ELSE AdminKpiJobs.retries END,updated_at=excluded.updated_at WHERE
      (AdminKpiJobs.status='complete' AND (excluded.kind='ga4' OR (excluded.kind='business' AND EXISTS(SELECT 1 FROM AdminKpiDirtyDays WHERE tenant_id=excluded.tenant_id AND day=excluded.start_date AND source='business')))) OR
      (AdminKpiJobs.status='failed' AND ((excluded.kind='ga4' AND (AdminKpiJobs.retries<1 OR (AdminKpiJobs.attempts<3 AND
      (AdminKpiJobs.error_code='batch_step_failed' OR AdminKpiJobs.error_code IN ('kpi_ga4_oauth_transport','kpi_ga4_report_transport','kpi_ga4_oauth_timeout','kpi_ga4_report_timeout','kpi_ga4_oauth_429','kpi_ga4_report_429')
      OR AdminKpiJobs.error_code GLOB 'kpi_ga4_oauth_5??' OR AdminKpiJobs.error_code GLOB 'kpi_ga4_report_5??')))) OR
      (excluded.kind='business' AND AdminKpiJobs.retries<${BUSINESS_REQUEUE_LIMIT} AND EXISTS(SELECT 1 FROM AdminKpiDirtyDays WHERE tenant_id=excluded.tenant_id AND day=excluded.start_date AND source='business'))))`)
      .bind(`${TENANT}:${kind}:${day}:${end}`, TENANT, kind, day, end, now.toISOString());
  });
  const results = statements.length ? await db.batch(statements) : [];
  const queued = results.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
  return { queued,reused:reusableDays.size, maxRowsPerStep: PAGE };
}

export async function enqueueDefaultAdminKpiWarmup(db, { now = new Date(), includePeriod15 = false, propertyId = '' } = {}) {
  const anchor = addDays(kstDay(now), -1);
  const queued = [];
  queued.push({ kind: 'business', ...(await enqueueAdminKpiBatch(db, { kind: 'business', startDate: addDays(anchor, includePeriod15 ? -29 : -13), endDate: anchor, now })) });
  for (const [startDate, endDate] of [
    [addDays(anchor, -6), anchor],
    [addDays(anchor, -13), addDays(anchor, -7)],
    ...(includePeriod15 ? [[addDays(anchor, -14), anchor], [addDays(anchor, -29), addDays(anchor, -15)]] : []),
  ]) queued.push({ kind: 'ga4', startDate, endDate, ...(await enqueueAdminKpiBatch(db, { kind: 'ga4', startDate, endDate, sourceId:propertyId, now })) });
  return { anchor, queued };
}

async function warmupDefaultKpi(env, now) {
  if (!env.ADMIN_KPI_WARM_DEFAULTS) return null;
  const budget = Number(env.ADMIN_KPI_GA4_DAILY_REQUEST_BUDGET || 0);
  if (!Number.isSafeInteger(budget) || budget < 2 || budget > 100) return { skipped: 'request_budget_unconfigured' };
  return enqueueDefaultAdminKpiWarmup(env.DB, { now, includePeriod15: env.ADMIN_KPI_WARM_PERIOD15 === '1', propertyId:env.GA4_PROPERTY_ID || '' });
}

async function readPage(db, job, phase, cursor) {
  const start = utcStart(job.start_date), end = utcStart(dayAfter(job.start_date));
  const after = cursor ? JSON.parse(cursor) : [start, ''];
  if (phase < 2) {
    const column = phase === 0 ? 'SubmittedAt' : 'ConsultAt';
    const index = phase === 0 ? 'idx_admin_kpi_estimate_intake' : 'idx_admin_kpi_estimate_meeting';
    return rows(await db.prepare(`SELECT id,SubmittedAt,ConsultAt,ConsultCancelledAt,Status,Source,FirstSource,
      FirstReferrer,FirstUtmSource,UtmSource,FirstUtmMedium,UtmMedium,MetaLeadId,MetaAdId,Fbclid,Detail,EstimateAmount,SpaceSize
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
  writes.push(db.prepare(`UPDATE AdminKpiJobs SET status=(CASE WHEN COALESCE((SELECT version FROM CrmDataRevisions WHERE tenant_id=?),0)=? THEN ? ELSE 'failed' END),cursor=?,payload_json=?,lease_until='',updated_at=? WHERE id=? AND status='running'`)
    .bind(TENANT,job.revision,nextPhase === 3 ? 'complete' : 'queued',cursor,JSON.stringify({ phase:nextPhase,totals }),nextPhase === 3 ? now : job.updated_at,job.id));
  await db.batch(writes);
  if (nextPhase === 3) {
    await db.prepare(`UPDATE CrmDataRevisions SET version=version+1,updated_at=? WHERE tenant_id=?`).bind(now,TENANT).run();
    await rebuildKpiMonth(db,job.start_date.slice(0,7),now);
  }
  return { status: nextPhase === 3 ? 'complete' : 'queued', processed:page.length };
}

// 하루치 사업 지표 재집계는 한 회차에 끝까지 돌린다(하루 접수는 수십 건이라 몇 초면 된다).
// 15분마다 한 단계씩 나눠 돌면 그 사이 Meta·GA4 저장이나 다른 날 재집계가 데이터 리비전을
// 올려 "섞인 숫자 방지" 검사에 걸렸고, 재시도 1회까지 실패하면 그 날이 영구 대기가 되어
// KPI 가 그 날이 낀 기간을 계속 가렸다(2026-09-14 → 9/15~9/30).
// 도중에 리비전이 바뀌면 실패로 끝내지 않고 그 날을 처음부터 다시 센다. 한 회차에 3번까지
// 다시 세고 그래도 바뀌면 다음 회차로 넘긴다. 누적 20번이 넘으면 실패로 두고 재대기(5회)에 맡긴다.
const BUSINESS_STEPS_PER_RUN = 12;
const BUSINESS_RESTARTS_PER_RUN = 3;
const BUSINESS_RESTART_LIMIT = 20;
const BUSINESS_REQUEUE_LIMIT = 5;
async function runBusinessJob(db, job, stamp, now) {
  let restarts = 0, result = { status:'queued', processed:0 };
  for (let step = 0; step < BUSINESS_STEPS_PER_RUN; step++) {
    const revision = Number((await db.prepare('SELECT version FROM CrmDataRevisions WHERE tenant_id=?').bind(TENANT).first())?.version || 0);
    const state = JSON.parse(job.payload_json || '{}');
    if (!state.phase && !job.cursor) {
      job.revision = revision;
      await db.prepare('UPDATE AdminKpiJobs SET revision=? WHERE id=?').bind(revision,job.id).run();
    } else if (revision !== Number(job.revision)) {
      if (Number(job.attempts || 0) >= BUSINESS_RESTART_LIMIT) {
        await db.prepare(`UPDATE AdminKpiJobs SET status='failed',error_code='source_changed_during_batch',lease_until='',updated_at=? WHERE id=?`).bind(stamp,job.id).run();
        return { status:'failed',reason:'source_changed_during_batch' };
      }
      if (restarts >= BUSINESS_RESTARTS_PER_RUN) {
        await db.prepare(`UPDATE AdminKpiJobs SET status='queued',cursor='',payload_json='{}',lease_until='' WHERE id=?`).bind(job.id).run();
        return { status:'queued',reason:'source_changing' };
      }
      restarts++;
      job = { ...job, cursor:'', payload_json:'{}', revision, attempts:Number(job.attempts || 0) + 1 };
      await db.prepare(`UPDATE AdminKpiJobs SET cursor='',payload_json='{}',revision=?,attempts=? WHERE id=?`).bind(revision,job.attempts,job.id).run();
    }
    result = await businessStep(db,job,stamp);
    const after = await db.prepare('SELECT status FROM AdminKpiJobs WHERE id=?').bind(job.id).first();
    if (!after || after.status === 'complete') return result;
    // 마지막 기록 순간에 리비전이 바뀌면 businessStep 이 'failed' 로 남긴다 → 다음 바퀴에서 처음부터 다시 센다
    const claim = await db.prepare(`UPDATE AdminKpiJobs SET status='running',lease_until=? WHERE id=? AND status IN ('queued','failed') RETURNING *`)
      .bind(new Date(now.getTime()+60000).toISOString(),job.id).first();
    if (!claim) return result;
    job = claim;
  }
  await db.prepare(`UPDATE AdminKpiJobs SET status='queued',lease_until='' WHERE id=? AND status='running'`).bind(job.id).run();
  return result;
}

async function runBatchStep(env, { now = new Date(), fetchImpl = fetch, preferredKind = '', preferredStartDate = '', preferredEndDate = '' } = {}) {
  const db = env.DB;
  if (!db) return { skipped:'no_database' };
  const stamp = now.toISOString();
  const configuredBudget = Number(env.ADMIN_KPI_GA4_DAILY_REQUEST_BUDGET || 0);
  if (Number.isSafeInteger(configuredBudget) && configuredBudget >= 2 && configuredBudget <= 100) {
    await db.prepare(`UPDATE AdminKpiJobs SET status='queued',error_code='',updated_at=? WHERE id=(
      SELECT id FROM AdminKpiJobs WHERE tenant_id=? AND kind='ga4' AND status='paused'
      AND error_code IN ('daily_request_budget','request_budget_unconfigured') ORDER BY updated_at,id LIMIT 1)
      AND COALESCE((SELECT used FROM AdminKpiBatchBudget WHERE tenant_id=? AND day=?),0)+2<=?`)
      .bind(stamp,TENANT,TENANT,kstDay(now),configuredBudget).run();
    await db.prepare(`UPDATE AdminKpiJobs SET status='queued',error_code='',updated_at=? WHERE id=(
      SELECT id FROM AdminKpiJobs WHERE tenant_id=? AND kind='ga4' AND status='failed' AND updated_at<? AND
      (error_code='batch_step_failed' OR error_code IN ('kpi_ga4_oauth_transport','kpi_ga4_report_transport','kpi_ga4_oauth_timeout','kpi_ga4_report_timeout','kpi_ga4_oauth_429','kpi_ga4_report_429')
      OR error_code GLOB 'kpi_ga4_oauth_5??' OR error_code GLOB 'kpi_ga4_report_5??') ORDER BY updated_at,id LIMIT 1)
      AND COALESCE((SELECT used FROM AdminKpiBatchBudget WHERE tenant_id=? AND day=?),0)+2<=?`)
      .bind(stamp,TENANT,utcStart(kstDay(now)),TENANT,kstDay(now),configuredBudget).run();
  }
  // A crashed or timed-out job fails here. GA4 needs an explicit retry; a business day that
  // still needs recounting is requeued by enqueueAdminKpiBatch up to BUSINESS_REQUEUE_LIMIT times.
  await db.prepare(`UPDATE AdminKpiJobs SET status='failed',error_code='lease_expired',lease_until='' WHERE tenant_id=? AND status='running' AND lease_until<?`).bind(TENANT,stamp).run();
  await warmupDefaultKpi(env, now);
  await refreshStaleBudgetRows(db, stamp);
  const dirty = await db.prepare(`SELECT day FROM AdminKpiDirtyDays WHERE tenant_id=? AND source='business' AND day<=? ORDER BY day LIMIT 1`).bind(TENANT,addDays(kstDay(now),-1)).first();
  if (dirty) await enqueueAdminKpiBatch(db,{kind:'business',startDate:dirty.day,now});
  let job = null;
  if (['business','ga4'].includes(preferredKind) && validDate(preferredStartDate) && validDate(preferredEndDate)) {
    job = await db.prepare(`SELECT * FROM AdminKpiJobs WHERE tenant_id=? AND kind=? AND status='queued'
      AND start_date>=? AND end_date<=? ORDER BY start_date,end_date,id LIMIT 1`)
      .bind(TENANT,preferredKind,preferredStartDate,preferredEndDate).first();
  }
  job ||= await db.prepare(`SELECT * FROM AdminKpiJobs WHERE tenant_id=? AND status='queued' ORDER BY updated_at,id LIMIT 1`).bind(TENANT).first();
  if (!job) return { skipped:'no_work' };
  const claim = await db.prepare(`UPDATE AdminKpiJobs SET status='running',lease_until=?,updated_at=? WHERE id=? AND status='queued' RETURNING id`)
    .bind(new Date(now.getTime()+60000).toISOString(),stamp,job.id).first();
  if (!claim) return { skipped:'claimed_elsewhere' };
  try {
    if (job.kind === 'business') return await runBusinessJob(db,job,stamp,now);
    const propertyId = String(env.GA4_PROPERTY_ID || '').replace(/^properties\//,'');
    const existing = await db.prepare(`SELECT id,payload_json,created_at FROM CrmGa4AnalyticsSnapshots WHERE tenant_id=? AND source_kind='ga4' AND source_id=? AND start_date=? AND end_date=? LIMIT 1`)
      .bind(TENANT,propertyId,job.start_date,job.end_date).first();
    let reusable = false;
    try {
      const payload = JSON.parse(existing?.payload_json || '{}');
      reusable = isReusableAdminKpiGa4Snapshot(payload, { tenantId: TENANT, propertyId, startDate: job.start_date, endDate: job.end_date, createdAt: existing?.created_at, now });
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
      summary:{ ...snapshot.summary,timezone:snapshot.timezone,complete:snapshot.endDate < kstDay(now),provisional:snapshot.endDate >= kstDay(now) },createdAt:stamp });
    await db.prepare(`UPDATE AdminKpiJobs SET status='complete',lease_until='',updated_at=? WHERE id=?`).bind(stamp,job.id).run();
    return { status:'complete',externalRequests:2 };
  } catch (error) {
    const reason = /^kpi_[a-z0-9_]+$/.test(error?.message || '') ? error.message.slice(0,80) : 'batch_step_failed';
    await db.prepare(`UPDATE AdminKpiJobs SET status='failed',error_code=?,attempts=attempts+1,lease_until='',updated_at=? WHERE id=?`).bind(reason,stamp,job.id).run();
    return { status:'failed',reason };
  }
}

// 예산 해석 규칙(estimate-budget.js)의 버전이 오르면 옛 규칙으로 분류해 둔 접수를 회차마다
// 조금씩 다시 분류하고, 그 날의 예산 구간 수만 옮긴다(옛 구간 -1, 새 구간 +1).
// 날짜를 재집계 대상(dirty)으로 올리면 KPI 화면이 그 기간을 통째로 숨기므로 그렇게 하지
// 않는다. 사업 지표 재집계가 돌고 있으면 그 작업이 새 규칙으로 세므로 끝난 뒤에 옮긴다.
// 다 옮기면 버전을 기록해 이후 회차는 한 줄만 읽는다. 표가 없으면(마이그 0099 전) 건너뛴다.
const BUDGET_REFRESH_ROWS = 100;
async function refreshStaleBudgetRows(db, stamp) {
  let applied;
  try {
    applied = await db.prepare(`SELECT version FROM AdminKpiRuleVersions WHERE tenant_id=? AND rule='budget'`).bind(TENANT).first();
  } catch {
    return;
  }
  if (Number(applied?.version || 0) >= BUDGET_RULE_VERSION) return;
  const busy = await db.prepare(`SELECT 1 AS busy FROM AdminKpiJobs WHERE tenant_id=? AND kind='business' AND status IN ('queued','running','paused') LIMIT 1`).bind(TENANT).first();
  if (busy) return;
  const stale = rows(await db.prepare(`SELECT n.estimate_id,n.submitted_day,n.budget_band,e.id AS row_id,e.Status,e.Detail,e.EstimateAmount,e.SpaceSize
    FROM AdminKpiNormalized n LEFT JOIN Estimates e ON e.id=n.estimate_id
    WHERE n.tenant_id=? AND n.classification_version<?
      AND NOT EXISTS(SELECT 1 FROM AdminKpiDirtyDays d WHERE d.tenant_id=n.tenant_id AND d.day=n.submitted_day AND d.source='business')
    LIMIT ?`).bind(TENANT,BUDGET_RULE_VERSION,BUDGET_REFRESH_ROWS).all());
  if (!stale.length) {
    await db.prepare(`INSERT INTO AdminKpiRuleVersions(tenant_id,rule,version,updated_at) VALUES(?,'budget',?,?)
      ON CONFLICT(tenant_id,rule) DO UPDATE SET version=excluded.version,updated_at=excluded.updated_at`).bind(TENANT,BUDGET_RULE_VERSION,stamp).run();
    return;
  }
  const writes = [], months = new Set();
  const moveDaily = (day, band, delta) => writes.push(db.prepare(`UPDATE AdminKpiDaily SET value=MAX(0,value+?),updated_at=?
    WHERE tenant_id=? AND day=? AND source='business' AND metric=?`).bind(delta,stamp,TENANT,day,`budget${band}`));
  for (const row of stale) {
    // 지워졌거나 작성 중인 접수는 그 날 집계에 들어가 있지 않다 → 버전만 올린다
    if (!row.row_id || row.Status === '작성중') {
      writes.push(db.prepare(`UPDATE AdminKpiNormalized SET classification_version=?,updated_at=? WHERE tenant_id=? AND estimate_id=?`)
        .bind(BUDGET_RULE_VERSION,stamp,TENANT,row.estimate_id));
      continue;
    }
    const budget = normalizeKpiBudget(row), before = Number(row.budget_band);
    writes.push(db.prepare(`UPDATE AdminKpiNormalized SET budget_raw=?,budget_band=?,budget_reason=?,classification_version=?,updated_at=? WHERE tenant_id=? AND estimate_id=?`)
      .bind(budget.raw,budget.band,budget.reason,budget.version,stamp,TENANT,row.estimate_id));
    if (budget.band !== before) {
      moveDaily(row.submitted_day, before, -1);
      moveDaily(row.submitted_day, budget.band, 1);
      months.add(row.submitted_day.slice(0,7));
    }
  }
  // KPI 화면 캐시는 이 리비전으로 갈린다. 숫자를 옮겼으면 올려서 새 값을 보이게 한다.
  if (months.size) writes.push(db.prepare(`UPDATE CrmDataRevisions SET version=version+1,updated_at=? WHERE tenant_id=?`).bind(stamp,TENANT));
  await db.batch(writes);
  for (const month of months) await rebuildKpiMonth(db,month,stamp);
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
  try {
    const maxSteps = Number.isSafeInteger(options.maxSteps) ? Math.min(4,Math.max(1,options.maxSteps)) : 1;
    if (maxSteps===1) return await runBatchStep(env,{...options,now});
    let result = {skipped:'no_work'}, steps = 0;
    for (let index=0;index<maxSteps;index++) {
      const next = await runBatchStep(env,{...options,now});
      if (next.skipped) break;
      result=next;steps++;
      if (['failed','paused'].includes(next.status)) break;
    }
    return {...result,steps};
  }
  finally { await env.DB.prepare('DELETE FROM AdminKpiBatchLease WHERE tenant_id=? AND owner=?').bind(TENANT,owner).run(); }
}
