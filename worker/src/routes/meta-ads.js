// Meta Ads — D1 영속화 + cron 백필
//
// 핵심 원칙:
// - 어드민 페이지 = D1 read-only (Meta API 직접 호출 X)
// - Meta API 호출은 cron 또는 명시적 backfill 만
// - 같은 날짜·엔티티는 UPSERT (UNIQUE INDEX 기반 REPLACE)
// - rate limit 도달 시 텔레그램 + MetaSyncLog 기록 후 종료
//
// 광고계정 timezone = Asia/Seoul, 데이터는 광고계정 timezone 기준 일자
// 따라서 별도 timezone 변환 불필요 (Meta가 date_start 기준으로 보냄)

import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { notifyTelegram } from "../lib/telegram.js";
import { generateId } from "../lib/d1.js";

const META_API_VERSION = "v18.0";
const CAMPAIGN_FIELDS = "campaign_id,campaign_name";
const INSIGHT_METRICS =
  "impressions,clicks,spend,ctr,cpc,reach,frequency,actions,inline_link_clicks";
// 라이브 캠페인 메타 (status·objective·예산) — 별도 호출
const CAMPAIGN_META_FIELDS =
  "id,name,status,objective,daily_budget,lifetime_budget";

// ─── 어드민 라우터 ────────────────────────────────────────
export async function handleMetaAds(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/meta-ads/, "") || "/";

  // 모든 라우트는 어드민 전용
  if (!(await verifyAdmin(request, env))) {
    return jsonError(401, "Unauthorized");
  }

  // GET /api/meta-ads/summary?days=30 — D1 read-only
  if (path === "/summary" && request.method === "GET") {
    return getSummary(request, env);
  }

  // GET /api/meta-ads/campaigns?days=30 — 캠페인별 집계
  if (path === "/campaigns" && request.method === "GET") {
    return listCampaigns(request, env);
  }

  // GET /api/meta-ads/daily?days=30 — 일별 추이
  if (path === "/daily" && request.method === "GET") {
    return listDaily(request, env);
  }

  // GET /api/meta-ads/sync-log — 최근 동기화 이력
  if (path === "/sync-log" && request.method === "GET") {
    return listSyncLog(env);
  }

  // POST /api/meta-ads/backfill — 초기 백필 (2026-02-02 ~ 어제)
  if (path === "/backfill" && request.method === "POST") {
    return runBackfill(request, env, ctx);
  }

  return jsonError(404, "Not Found");
}

// ─── Cron 자동 sync — 최근 3일치 (attribution window 보정) ──
// Meta 광고는 며칠 뒤에 전환이 소급 추가될 수 있어서 매일 3일치 UPSERT.
// 같은 (Date, Level, EntityId) 는 덮어쓰기라 row 수 안 늘어남, 수치만 보정.
// API 호출은 time_range 한 번에 처리라 비용 동일.
export async function runScheduledSync(env, ctx) {
  const end = kstYesterday();
  const start = kstDaysAgo(3);
  return syncRange(env, ctx, start, end, "cron");
}

// ─── 사용자 응답 (D1 read-only) ───────────────────────────
async function getSummary(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;

  try {
    // account 레벨 일별 합계
    const totals = await env.DB.prepare(
      `SELECT
         COALESCE(SUM(Impressions), 0) AS Impressions,
         COALESCE(SUM(Clicks), 0) AS Clicks,
         COALESCE(SUM(LinkClicks), 0) AS LinkClicks,
         COALESCE(SUM(Spend), 0) AS Spend,
         COALESCE(SUM(Reach), 0) AS Reach,
         COALESCE(SUM(Leads), 0) AS Leads,
         COUNT(DISTINCT Date) AS Days
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?`,
    )
      .bind(startDate, endDate)
      .first();

    // 마지막 동기화 시각
    const lastSync = await env.DB.prepare(
      `SELECT CompletedAt FROM MetaSyncLog
       WHERE Status = 'success'
       ORDER BY CompletedAt DESC LIMIT 1`,
    ).first();

    const imps = Number(totals?.Impressions || 0);
    const clicks = Number(totals?.Clicks || 0);
    const spend = Number(totals?.Spend || 0);
    return jsonOk({
      range,
      summary: {
        impressions: imps,
        clicks,
        linkClicks: Number(totals?.LinkClicks || 0),
        spend,
        reach: Number(totals?.Reach || 0),
        leads: Number(totals?.Leads || 0),
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: Number(totals?.Leads || 0) > 0 ? spend / Number(totals.Leads) : 0,
      },
      lastSyncedAt: lastSync?.CompletedAt || "",
    });
  } catch (e) {
    return jsonError(500, "summary failed: " + (e.message || "").slice(0, 100));
  }
}

async function listCampaigns(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;

  try {
    const res = await env.DB.prepare(
      `SELECT
         EntityId,
         MAX(EntityName) AS EntityName,
         MAX(Status) AS Status,
         MAX(Objective) AS Objective,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(LinkClicks) AS LinkClicks,
         SUM(Spend) AS Spend,
         SUM(Reach) AS Reach,
         SUM(Leads) AS Leads,
         COUNT(*) AS DayCount
       FROM MetaAdsDaily
       WHERE Level = 'campaign' AND Date BETWEEN ? AND ?
       GROUP BY EntityId
       ORDER BY Spend DESC`,
    )
      .bind(startDate, endDate)
      .all();
    const campaigns = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        id: r.EntityId,
        name: r.EntityName || "",
        status: r.Status || "",
        objective: r.Objective || "",
        impressions: imps,
        clicks,
        linkClicks: Number(r.LinkClicks || 0),
        spend,
        reach: Number(r.Reach || 0),
        leads,
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0,
      };
    });
    return jsonOk({ range, campaigns });
  } catch (e) {
    return jsonError(
      500,
      "campaigns failed: " + (e.message || "").slice(0, 100),
    );
  }
}

async function listDaily(request, env) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;

  try {
    const res = await env.DB.prepare(
      `SELECT
         Date,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(Spend) AS Spend,
         SUM(Leads) AS Leads
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?
       GROUP BY Date
       ORDER BY Date ASC`,
    )
      .bind(startDate, endDate)
      .all();
    return jsonOk({
      range,
      rows: (res.results || []).map((r) => ({
        date: r.Date,
        impressions: Number(r.Impressions || 0),
        clicks: Number(r.Clicks || 0),
        spend: Number(r.Spend || 0),
        leads: Number(r.Leads || 0),
      })),
    });
  } catch (e) {
    return jsonError(500, "daily failed: " + (e.message || "").slice(0, 100));
  }
}

async function listSyncLog(env) {
  try {
    const res = await env.DB.prepare(
      `SELECT SyncType, Status, DateRangeStart, DateRangeEnd,
              ApiCallsUsed, RecordsUpdated, ErrorCode, ErrorMessage,
              StartedAt, CompletedAt
       FROM MetaSyncLog
       ORDER BY CreatedAt DESC LIMIT 30`,
    ).all();
    return jsonOk({ logs: res.results || [] });
  } catch (e) {
    return jsonError(500, "sync log failed");
  }
}

// ─── 백필 / Cron sync 공통 ───────────────────────────────
async function runBackfill(request, env, ctx) {
  let body = {};
  try {
    body = await request.json();
  } catch {}
  const startDate = String(body.startDate || "2026-02-02");
  const endDate = String(body.endDate || kstYesterday());
  return syncRange(env, ctx, startDate, endDate, "backfill");
}

async function syncRange(env, ctx, startDate, endDate, syncType) {
  const startedAt = new Date().toISOString();
  const log = {
    SyncType: syncType,
    Status: "running",
    DateRangeStart: startDate,
    DateRangeEnd: endDate,
    ApiCallsUsed: 0,
    RecordsUpdated: 0,
    ErrorCode: "",
    ErrorMessage: "",
    StartedAt: startedAt,
    CompletedAt: "",
    CreatedAt: startedAt,
  };

  try {
    const token = String(env.META_AD_ACCESS_TOKEN || "").trim();
    const accountId = String(env.META_AD_ACCOUNT_ID || "").trim();
    if (!token || !accountId) throw new Error("META_AD_* env not configured");

    // 1) account 레벨 일별 인사이트
    const accountRows = await fetchInsights(
      token,
      accountId,
      startDate,
      endDate,
      "account",
    );
    log.ApiCallsUsed++;

    // 2) campaign 레벨 일별 인사이트
    const campaignRows = await fetchInsights(
      token,
      accountId,
      startDate,
      endDate,
      "campaign",
    );
    log.ApiCallsUsed++;

    // 3) campaign 메타 (status·objective) — 1회 호출, 전부 가져옴
    const campaignMeta = await fetchCampaignMeta(token, accountId);
    log.ApiCallsUsed++;

    // UPSERT
    const fetchedAt = new Date().toISOString();
    let updated = 0;

    for (const row of accountRows) {
      await upsertDaily(env, {
        Date: row.date_start,
        Level: "account",
        EntityId: `act_${accountId}`,
        EntityName: "day1design_marketing",
        Status: "",
        Objective: "",
        ...mapInsight(row),
        FetchedAt: fetchedAt,
      });
      updated++;
    }

    for (const row of campaignRows) {
      const meta = campaignMeta[row.campaign_id] || {};
      await upsertDaily(env, {
        Date: row.date_start,
        Level: "campaign",
        EntityId: String(row.campaign_id || ""),
        EntityName: String(row.campaign_name || meta.name || ""),
        Status: String(meta.status || ""),
        Objective: String(meta.objective || ""),
        ...mapInsight(row),
        FetchedAt: fetchedAt,
      });
      updated++;
    }

    log.Status = "success";
    log.RecordsUpdated = updated;
    log.CompletedAt = new Date().toISOString();
    await writeLog(env, log);
    return jsonOk({
      status: "success",
      syncType,
      range: { startDate, endDate },
      apiCalls: log.ApiCallsUsed,
      recordsUpdated: updated,
    });
  } catch (e) {
    const msg = String(e.message || "unknown").slice(0, 400);
    log.Status = isRateLimit(e) ? "rate_limited" : "failed";
    log.ErrorCode = isRateLimit(e) ? "rate_limit" : "api_error";
    log.ErrorMessage = msg;
    log.CompletedAt = new Date().toISOString();
    await writeLog(env, log);

    // rate limit / sync 실패 → 별도 텔레그램 채널로 알림
    // (env.META_RATE_TELEGRAM_BOT_TOKEN + META_RATE_TELEGRAM_CHAT_ID)
    const text = `[day1design/meta-ads] ${log.Status} (${syncType})\n${startDate} ~ ${endDate}\nAPI 호출: ${log.ApiCallsUsed}\n${msg}`;
    ctx?.waitUntil(
      notifyTelegram(env, text, {
        botToken: env.META_RATE_TELEGRAM_BOT_TOKEN,
        chatId: env.META_RATE_TELEGRAM_CHAT_ID,
      }),
    );
    return jsonError(500, msg, { code: log.ErrorCode });
  }
}

// ─── Meta API 호출 ────────────────────────────────────────
async function fetchInsights(token, accountId, startDate, endDate, level) {
  const params = new URLSearchParams({
    fields:
      INSIGHT_METRICS + (level === "campaign" ? "," + CAMPAIGN_FIELDS : ""),
    level,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: "1",
    limit: "500",
    access_token: token,
  });
  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      `Meta API ${res.status}: ${data?.error?.message || "unknown"}`,
    );
    err.metaError = data?.error;
    throw err;
  }
  return data.data || [];
}

async function fetchCampaignMeta(token, accountId) {
  const params = new URLSearchParams({
    fields: CAMPAIGN_META_FIELDS,
    limit: "200",
    access_token: token,
  });
  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/campaigns?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      `Meta campaigns ${res.status}: ${data?.error?.message || "unknown"}`,
    );
    err.metaError = data?.error;
    throw err;
  }
  const map = {};
  for (const c of data.data || []) {
    map[c.id] = c;
  }
  return map;
}

function isRateLimit(e) {
  const code = e?.metaError?.code;
  return code === 4 || code === 17 || code === 32 || code === 613;
}

// ─── insight row → D1 컬럼 매핑 ───────────────────────────
function mapInsight(row) {
  const actions = Array.isArray(row.actions) ? row.actions : [];
  let leads = 0;
  for (const a of actions) {
    if (
      a.action_type === "offsite_complete_registration_add_meta_leads" ||
      a.action_type === "lead"
    ) {
      leads += Number(a.value || 0);
    }
  }
  return {
    Impressions: Number(row.impressions || 0),
    Clicks: Number(row.clicks || 0),
    LinkClicks: Number(row.inline_link_clicks || 0),
    Spend: Number(row.spend || 0),
    Ctr: Number(row.ctr || 0),
    Cpc: Number(row.cpc || 0),
    Reach: Number(row.reach || 0),
    Frequency: Number(row.frequency || 0),
    Leads: leads,
    ActionsJson: JSON.stringify(actions),
  };
}

// ─── D1 UPSERT (UNIQUE INDEX 활용) ────────────────────────
async function upsertDaily(env, fields) {
  // 기존 row 조회
  const existing = await env.DB.prepare(
    `SELECT id FROM MetaAdsDaily WHERE Date = ? AND Level = ? AND EntityId = ? LIMIT 1`,
  )
    .bind(fields.Date, fields.Level, fields.EntityId)
    .first();
  if (existing?.id) {
    await env.DB.prepare(
      `UPDATE MetaAdsDaily SET
         EntityName = ?, Status = ?, Objective = ?,
         Impressions = ?, Clicks = ?, LinkClicks = ?,
         Spend = ?, Ctr = ?, Cpc = ?,
         Reach = ?, Frequency = ?, Leads = ?,
         ActionsJson = ?, FetchedAt = ?
       WHERE id = ?`,
    )
      .bind(
        fields.EntityName,
        fields.Status,
        fields.Objective,
        fields.Impressions,
        fields.Clicks,
        fields.LinkClicks,
        fields.Spend,
        fields.Ctr,
        fields.Cpc,
        fields.Reach,
        fields.Frequency,
        fields.Leads,
        fields.ActionsJson,
        fields.FetchedAt,
        existing.id,
      )
      .run();
    return;
  }
  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO MetaAdsDaily
       (id, Date, Level, EntityId, EntityName, Status, Objective,
        Impressions, Clicks, LinkClicks, Spend, Ctr, Cpc,
        Reach, Frequency, Leads, ActionsJson, FetchedAt, CreatedAt)
     VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?)`,
  )
    .bind(
      id,
      fields.Date,
      fields.Level,
      fields.EntityId,
      fields.EntityName,
      fields.Status,
      fields.Objective,
      fields.Impressions,
      fields.Clicks,
      fields.LinkClicks,
      fields.Spend,
      fields.Ctr,
      fields.Cpc,
      fields.Reach,
      fields.Frequency,
      fields.Leads,
      fields.ActionsJson,
      fields.FetchedAt,
      new Date().toISOString(),
    )
    .run();
}

async function writeLog(env, fields) {
  try {
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO MetaSyncLog
         (id, SyncType, Status, DateRangeStart, DateRangeEnd,
          ApiCallsUsed, RecordsUpdated, ErrorCode, ErrorMessage,
          StartedAt, CompletedAt, CreatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        fields.SyncType,
        fields.Status,
        fields.DateRangeStart,
        fields.DateRangeEnd,
        fields.ApiCallsUsed,
        fields.RecordsUpdated,
        fields.ErrorCode,
        fields.ErrorMessage,
        fields.StartedAt,
        fields.CompletedAt,
        fields.CreatedAt,
      )
      .run();
  } catch {}
}

// ─── 날짜 헬퍼 (Asia/Seoul KST 기준) ──────────────────────
function kstNow() {
  // UTC + 9h
  return new Date(Date.now() + 9 * 3600 * 1000);
}
function kstYesterday() {
  const d = kstNow();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function kstDaysAgo(n) {
  const d = kstNow();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function kstToday() {
  return kstNow().toISOString().slice(0, 10);
}
function rangeDays(days) {
  const end = kstYesterday(); // 오늘은 제외 (사용자 요구)
  const endDt = new Date(end + "T00:00:00Z");
  const startDt = new Date(endDt);
  startDt.setUTCDate(startDt.getUTCDate() - (days - 1));
  // 광고 시작일 2026-02-02 이전은 자동 클램프
  const minStart = "2026-02-02";
  const startStr = startDt.toISOString().slice(0, 10);
  return {
    startDate: startStr < minStart ? minStart : startStr,
    endDate: end,
  };
}

// 유입통계와 동일한 키: today / 7 / 30 / cur-month / prev-month / all / custom
// Meta 광고는 KST 기준 광고계정 timezone, 광고 시작일 2026-02-02 클램프
function resolveRangeFromQuery(url) {
  const key = String(url.searchParams.get("range") || "30");
  const minStart = "2026-02-02";
  const todayStr = kstToday();
  const yesterdayStr = kstYesterday();

  const clampStart = (s) => (s < minStart ? minStart : s);

  if (key === "today") {
    return { key, startDate: todayStr, endDate: todayStr };
  }
  if (key === "7" || key === "30") {
    return rangeDays(Number(key));
  }
  if (key === "cur-month") {
    const now = kstNow();
    const start = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { key, startDate: clampStart(start), endDate: yesterdayStr };
  }
  if (key === "prev-month") {
    const now = kstNow();
    const prev = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const start = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
    );
    const end = lastDay.toISOString().slice(0, 10);
    return { key, startDate: clampStart(start), endDate: end };
  }
  if (key === "all") {
    return { key, startDate: minStart, endDate: yesterdayStr };
  }
  if (key === "custom") {
    const qsStart = String(url.searchParams.get("start") || "").trim();
    const qsEnd = String(url.searchParams.get("end") || "").trim();
    const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const startDate = validDate(qsStart) ? clampStart(qsStart) : minStart;
    const endDate = validDate(qsEnd) ? qsEnd : yesterdayStr;
    return { key, startDate, endDate };
  }
  // fallback: 30일
  return rangeDays(30);
}
