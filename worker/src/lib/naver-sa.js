// 네이버 검색광고 일별 통계 수집 (2026-11-26)
//
// 검색광고 API(CUSTOMER_ID 2799816)에서 캠페인·광고그룹 일별 실적을 받아 D1 NaverSaDaily 에 쌓는다.
// 로그인 세션을 쓰지 않는다 — 네이버 로그인 자동화는 보호조치·캡챠로 계정을 잃는 경로라
// 공식 API 키(엑세스라이선스·비밀키)만 쓴다.
//
// - KST 09시 회차: 최근 3일(어제 포함)을 다시 받아 바뀐 행만 갱신한다. 늦게 확정되는 전환까지 반영.
// - 그 밖의 매시간 회차: 과거분을 BACKFILL_DAYS 일씩 거슬러 채운다. API 는 730일까지만 준다.
// - /stats 는 하루 단위 분할(timeIncrement)을 지원하지 않아(11002) 날짜마다 따로 부른다.
// - 실적이 없는 엔티티는 응답에 빠진다. 다시 받은 날에 빠진 엔티티는 0이 된 것이므로 그 행을 지운다.

const API_BASE = "https://api.searchad.naver.com";
const FIELDS = ["impCnt", "clkCnt", "salesAmt", "ccnt", "convAmt", "avgRnk"];
const DAILY_HOUR_KST = 9;
const RECENT_DAYS = 3;
const BACKFILL_DAYS = 7;
const HISTORY_LIMIT_DAYS = 729; // 오늘 기준 730일 이내만 조회 가능 (11004)
const IDS_PER_CALL = 100;
const FETCH_TIMEOUT_MS = 10000;
const DAY_MS = 86400000;
const KST_MS = 9 * 3600000;

export function hasNaverSaConfig(env) {
  return Boolean(
    env?.NAVER_SA_API_KEY &&
    env?.NAVER_SA_SECRET_KEY &&
    env?.NAVER_SA_CUSTOMER_ID,
  );
}

export function kstDate(offsetDays = 0, now = Date.now()) {
  return new Date(now + KST_MS + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function kstHour(now = Date.now()) {
  return new Date(now + KST_MS).getUTCHours();
}

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export async function signRequest(secret, timestamp, method, uri) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${timestamp}.${method}.${uri}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function saGet(env, uri, params, fetchImpl) {
  const timestamp = String(Date.now());
  const signature = await signRequest(
    env.NAVER_SA_SECRET_KEY,
    timestamp,
    "GET",
    uri,
  );
  const query = params ? `?${new URLSearchParams(params)}` : "";
  const res = await fetchImpl(`${API_BASE}${uri}${query}`, {
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": env.NAVER_SA_API_KEY,
      "X-Customer": String(env.NAVER_SA_CUSTOMER_ID),
      "X-Signature": signature,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`naver-sa ${uri} ${res.status} ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

// API 목록 → 이름표 행. 캠페인과 광고그룹을 한 모양으로 맞춘다.
export function toEntities(campaigns, adgroups) {
  const list = [];
  for (const c of campaigns || []) {
    list.push({
      id: c.nccCampaignId,
      level: "campaign",
      campaignId: c.nccCampaignId,
      name: c.name || "",
      type: c.campaignTp || "",
      locked: c.userLock ? 1 : 0,
      dailyBudget: Number(c.dailyBudget) || 0,
    });
  }
  for (const g of adgroups || []) {
    list.push({
      id: g.nccAdgroupId,
      level: "adgroup",
      campaignId: g.nccCampaignId || "",
      name: g.name || "",
      type: g.adgroupType || "",
      locked: g.userLock ? 1 : 0,
      dailyBudget: Number(g.dailyBudget) || 0,
    });
  }
  return list.filter((e) => e.id);
}

function entityStatements(db, entities, at) {
  return entities.map((e) =>
    db
      .prepare(
        `INSERT INTO NaverSaEntities (EntityId, Level, CampaignId, Name, Type, Locked, DailyBudget, UpdatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(EntityId) DO UPDATE SET
           Level = excluded.Level, CampaignId = excluded.CampaignId, Name = excluded.Name,
           Type = excluded.Type, Locked = excluded.Locked, DailyBudget = excluded.DailyBudget,
           UpdatedAt = excluded.UpdatedAt
         WHERE NaverSaEntities.Name IS NOT excluded.Name
            OR NaverSaEntities.Type IS NOT excluded.Type
            OR NaverSaEntities.Locked IS NOT excluded.Locked
            OR NaverSaEntities.DailyBudget IS NOT excluded.DailyBudget
            OR NaverSaEntities.CampaignId IS NOT excluded.CampaignId`,
      )
      .bind(
        e.id,
        e.level,
        e.campaignId,
        e.name,
        e.type,
        e.locked,
        e.dailyBudget,
        at,
      ),
  );
}

// 하루치 응답 → 갱신 문장. 값이 같으면 쓰지 않고, 이번에 요청했는데 응답에서 빠진
// 엔티티(실적 0)만 지운다. 요청하지 않은 엔티티(목록에서 사라진 캠페인 등)의 기록은 남긴다.
export function dailyStatements(
  db,
  { date, level, requested, rows, campaignOf, at },
) {
  const seen = [];
  const statements = [];
  for (const r of rows || []) {
    if (!r?.id) continue;
    seen.push(r.id);
    statements.push(
      db
        .prepare(
          `INSERT INTO NaverSaDaily
             (Date, EntityId, Level, CampaignId, Impressions, Clicks, Cost, Conversions, ConvAmount, AvgRank, FetchedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(Date, EntityId) DO UPDATE SET
             Level = excluded.Level, CampaignId = excluded.CampaignId,
             Impressions = excluded.Impressions, Clicks = excluded.Clicks, Cost = excluded.Cost,
             Conversions = excluded.Conversions, ConvAmount = excluded.ConvAmount,
             AvgRank = excluded.AvgRank, FetchedAt = excluded.FetchedAt
           WHERE NaverSaDaily.Impressions IS NOT excluded.Impressions
              OR NaverSaDaily.Clicks IS NOT excluded.Clicks
              OR NaverSaDaily.Cost IS NOT excluded.Cost
              OR NaverSaDaily.Conversions IS NOT excluded.Conversions
              OR NaverSaDaily.ConvAmount IS NOT excluded.ConvAmount
              OR NaverSaDaily.AvgRank IS NOT excluded.AvgRank`,
        )
        .bind(
          date,
          r.id,
          level,
          campaignOf(r.id),
          Number(r.impCnt) || 0,
          Number(r.clkCnt) || 0,
          Number(r.salesAmt) || 0,
          Number(r.ccnt) || 0,
          Number(r.convAmt) || 0,
          Number(r.avgRnk) || 0,
          at,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        `DELETE FROM NaverSaDaily
         WHERE Date = ? AND Level = ?
           AND EntityId IN (SELECT value FROM json_each(?))
           AND EntityId NOT IN (SELECT value FROM json_each(?))`,
      )
      .bind(date, level, JSON.stringify(requested || []), JSON.stringify(seen)),
  );
  return statements;
}

async function fetchDayStats(env, ids, date, fetchImpl) {
  const rows = [];
  for (let i = 0; i < ids.length; i += IDS_PER_CALL) {
    const body = await saGet(
      env,
      "/stats",
      {
        ids: ids.slice(i, i + IDS_PER_CALL).join(","),
        fields: JSON.stringify(FIELDS),
        timeRange: JSON.stringify({ since: date, until: date }),
      },
      fetchImpl,
    );
    rows.push(...(body?.data || []));
  }
  return rows;
}

async function loadEntitiesFromApi(env, fetchImpl) {
  const [campaigns, adgroups] = await Promise.all([
    saGet(env, "/ncc/campaigns", null, fetchImpl),
    saGet(env, "/ncc/adgroups", null, fetchImpl),
  ]);
  return toEntities(campaigns, adgroups);
}

async function loadEntitiesFromDb(env) {
  const res = await env.DB.prepare(
    `SELECT EntityId AS id, Level AS level, CampaignId AS campaignId FROM NaverSaEntities LIMIT 2000`,
  ).all();
  return res?.results || [];
}

// 날짜 목록을 받아 캠페인·광고그룹 실적을 한 번의 batch 로 저장한다.
async function syncDates(env, entities, dates, fetchImpl, at) {
  const campaignOf = new Map(entities.map((e) => [e.id, e.campaignId]));
  const lookup = (id) => campaignOf.get(id) || "";
  const byLevel = {
    campaign: entities.filter((e) => e.level === "campaign").map((e) => e.id),
    adgroup: entities.filter((e) => e.level === "adgroup").map((e) => e.id),
  };
  const statements = [];
  let rowCount = 0;
  for (const date of dates) {
    for (const level of ["campaign", "adgroup"]) {
      if (!byLevel[level].length) continue;
      const rows = await fetchDayStats(env, byLevel[level], date, fetchImpl);
      rowCount += rows.length;
      statements.push(
        ...dailyStatements(env.DB, {
          date,
          level,
          requested: byLevel[level],
          rows,
          campaignOf: lookup,
          at,
        }),
      );
    }
  }
  if (statements.length) await env.DB.batch(statements);
  return rowCount;
}

async function readState(env, key) {
  const row = await env.DB.prepare(
    `SELECT Value FROM NaverSaSyncState WHERE Key = ?`,
  )
    .bind(key)
    .first();
  return row?.Value || "";
}

function stateStatement(env, key, value, at) {
  return env.DB.prepare(
    `INSERT INTO NaverSaSyncState (Key, Value, UpdatedAt) VALUES (?, ?, ?)
     ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = excluded.UpdatedAt`,
  ).bind(key, value, at);
}

// 매일 회차: 이름표 갱신 + 최근 3일 재수집
export async function runNaverSaDaily(
  env,
  { now = Date.now(), fetchImpl = fetch } = {},
) {
  const at = new Date(now).toISOString();
  const entities = await loadEntitiesFromApi(env, fetchImpl);
  if (entities.length)
    await env.DB.batch(entityStatements(env.DB, entities, at));
  const dates = Array.from({ length: RECENT_DAYS }, (_, i) =>
    kstDate(-(i + 1), now),
  );
  const rows = await syncDates(env, entities, dates, fetchImpl, at);
  return { mode: "daily", dates, entities: entities.length, rows };
}

// 백필 회차: 커서 날짜부터 BACKFILL_DAYS 일씩 과거로. 730일 한계에 닿으면 끝 표시.
export async function runNaverSaBackfill(
  env,
  { now = Date.now(), fetchImpl = fetch } = {},
) {
  if ((await readState(env, "backfill_done")) === "1")
    return { mode: "backfill", skipped: "done" };
  const at = new Date(now).toISOString();
  const oldest = kstDate(-HISTORY_LIMIT_DAYS, now);
  // 첫 커서는 어제부터 — 배포가 09시 이후면 그날 매일 회차가 없어 3일 전이 빈다.
  // 매일 회차와 겹치는 날은 값이 같으면 쓰지 않으므로 해가 없다.
  const cursor =
    (await readState(env, "backfill_cursor")) || kstDate(-1, now);
  const dates = [];
  for (
    let d = cursor;
    dates.length < BACKFILL_DAYS && d >= oldest;
    d = shiftDate(d, -1)
  )
    dates.push(d);

  let entities = await loadEntitiesFromDb(env);
  if (!entities.length) {
    entities = await loadEntitiesFromApi(env, fetchImpl);
    if (entities.length)
      await env.DB.batch(entityStatements(env.DB, entities, at));
  }
  const rows = dates.length
    ? await syncDates(env, entities, dates, fetchImpl, at)
    : 0;
  const next = dates.length ? shiftDate(dates[dates.length - 1], -1) : oldest;
  const done = next < oldest;
  await env.DB.batch([
    stateStatement(env, "backfill_cursor", next, at),
    ...(done ? [stateStatement(env, "backfill_done", "1", at)] : []),
  ]);
  return { mode: "backfill", dates, rows, next, done };
}

// 매시간 cron 진입점. 키가 없으면 아무것도 하지 않는다.
export async function runNaverSaCron(
  env,
  { now = Date.now(), fetchImpl = fetch } = {},
) {
  if (!hasNaverSaConfig(env) || !env?.DB) return { skipped: "no_config" };
  if (kstHour(now) === DAILY_HOUR_KST)
    return runNaverSaDaily(env, { now, fetchImpl });
  return runNaverSaBackfill(env, { now, fetchImpl });
}
