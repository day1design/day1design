// ─── D1 레코드 어댑터 ───
// Worker 라우트가 공유하는 {id, fields:{...}} 형태로 반환한다.
//
// 주요 차이점:
//  - filterByFormula 문자열 대신 where 객체 사용: { Status: '접수대기' }
//  - sort/limit는 동일
//  - id 형식: rec + 14자 (이관 데이터 id 보존, 신규는 새로 발급)
//  - JSON 필드(ConceptFiles/FloorPlans/Images/ContentBlocks)는 TEXT로 직렬화 보관 (라우트가 JSON.parse)
//  - PrivacyAgreed/Active는 INTEGER 0/1 → boolean으로 변환

const ID_CHARSET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateId() {
  let s = "";
  const buf = crypto.getRandomValues(new Uint8Array(14));
  for (const b of buf) s += ID_CHARSET[b % ID_CHARSET.length];
  return "rec" + s;
}

// 테이블별 컬럼 화이트리스트 (보안: 외부 입력에서 임의 컬럼 주입 차단)
const SCHEMA = {
  Estimates: [
    "Name",
    "Phone",
    "Email",
    "SpaceType",
    "SpaceSize",
    "Postcode",
    "Address",
    "AddressDetail",
    "Schedule",
    "Referral",
    "Branch",
    "Detail",
    "PrivacyAgreed",
    "ConceptFiles",
    "FloorPlans",
    "SubmittedAt",
    "IP",
    "Status",
    "Assignee",
    "ContactedAt",
    "Memo",
    "EstimateAmount",
    "Source",
    "Platform",
    "Campaign",
    "SessionId",
    "FirstSource",
    "FirstPlatform",
    "FirstCampaign",
    "FirstReferrer",
    "FirstUtmSource",
    "FirstUtmMedium",
    "FirstUtmCampaign",
  ],
  EstimateMemos: ["EstimateId", "Body", "Author", "CreatedAt", "UpdatedAt"],
  Clients: ["Brand", "Phone4", "Order"],
  Works: [
    "ClientId",
    "Date",
    "Type",
    "Title",
    "Body",
    "AuthorLabel",
    "IP",
    "CreatedAt",
    "CompletedAt",
  ],
  WorkComments: ["WorkId", "Role", "Label", "Body", "IP", "CreatedAt"],
  HeroSlides: ["Image", "Href", "Alt", "Order", "Active"],
  Portfolio: [
    "Name",
    "Folder",
    "Count",
    "Category",
    "Order",
    "RightId",
    "RightFolder",
    "RightCount",
    "RightName",
    "ThumbAfter",
    "ThumbBefore",
    "Images",
  ],
  Community: [
    "Idx",
    "Title",
    "Category",
    "Date",
    "Board",
    "Thumb",
    "Views",
    "Excerpt",
    "BodyText",
    "BodyHtml",
    "Images",
    "ContentBlocks",
  ],
  AnalyticsSnapshots: [
    "RangeKey",
    "StartDate",
    "EndDate",
    "Source",
    "Payload",
    "RawR2Key",
    "CreatedAt",
  ],
  AdminSettings: ["Value", "UpdatedAt"],
  Popups: [
    "Title",
    "ImageUrl",
    "Alt",
    "LinkUrl",
    "WidthPx",
    "TopPx",
    "LeftPx",
    "Active",
    "Order",
    "CreatedAt",
    "UpdatedAt",
  ],
  MessageTemplates: ["Name", "Subject", "Content", "CreatedAt", "UpdatedAt"],
  SmsLogs: [
    "EstimateId",
    "TemplateId",
    "ToPhone",
    "Subject",
    "Content",
    "SmsType",
    "Status",
    "Detail",
    "SentAt",
    "SentBy",
  ],
  MetaAdsDaily: [
    "Date",
    "Level",
    "EntityId",
    "EntityName",
    "Status",
    "Objective",
    "Impressions",
    "Clicks",
    "LinkClicks",
    "Spend",
    "Ctr",
    "Cpc",
    "Reach",
    "Frequency",
    "Leads",
    "ActionsJson",
    "VideoP25Watched",
    "VideoP50Watched",
    "VideoP75Watched",
    "VideoP100Watched",
    "VideoAvgWatchSec",
    "ThruPlay",
    "UniqueClicks",
    "UniqueLinkClicks",
    "CostPerLinkClick",
    "FetchedAt",
    "CreatedAt",
  ],
  MetaAdsAd: [
    "Date",
    "AdId",
    "AdName",
    "AdsetId",
    "AdsetName",
    "CampaignId",
    "CampaignName",
    "CreativeId",
    "CreativeType",
    "ThumbnailUrl",
    "Status",
    "Impressions",
    "Clicks",
    "LinkClicks",
    "Spend",
    "Ctr",
    "Cpc",
    "Reach",
    "Leads",
    "ThruPlay",
    "VideoAvgWatchSec",
    "FetchedAt",
    "CreatedAt",
  ],
  MetaAdsBreakdown: [
    "Date",
    "Dimension",
    "DimensionValue",
    "DimensionSub",
    "Impressions",
    "Clicks",
    "LinkClicks",
    "Spend",
    "Ctr",
    "Cpc",
    "Reach",
    "Leads",
    "FetchedAt",
    "CreatedAt",
  ],
  MetaSyncLog: [
    "SyncType",
    "Status",
    "DateRangeStart",
    "DateRangeEnd",
    "ApiCallsUsed",
    "RecordsUpdated",
    "ErrorCode",
    "ErrorMessage",
    "StartedAt",
    "CompletedAt",
    "CreatedAt",
  ],
};

// 정수→불리언 환원이 필요한 컬럼
const BOOL_COLS = new Set(["PrivacyAgreed", "Active"]);

// SQL 예약어 → "..." 인용 필요
const RESERVED = new Set(["Order"]);
const q = (col) => (RESERVED.has(col) ? `"${col}"` : col);

function rowToRecord(row, table) {
  if (!row) return null;
  const fields = {};
  for (const col of SCHEMA[table]) {
    if (!(col in row)) continue;
    let v = row[col];
    if (BOOL_COLS.has(col)) v = v ? true : false;
    fields[col] = v;
  }
  return { id: row.id, fields };
}

function fieldsToRow(fields, table) {
  const cols = [];
  const vals = [];
  const placeholders = [];
  for (const col of SCHEMA[table]) {
    if (!(col in fields)) continue;
    cols.push(q(col));
    let v = fields[col];
    if (BOOL_COLS.has(col)) {
      v = v ? 1 : 0;
    } else if (Array.isArray(v) || (v && typeof v === "object")) {
      v = JSON.stringify(v);
    } else if (v === null || v === undefined) {
      v = "";
    } else if (typeof v === "boolean") {
      v = v ? 1 : 0;
    }
    vals.push(v);
    placeholders.push("?");
  }
  return { cols, vals, placeholders };
}

function assertTable(table) {
  if (!SCHEMA[table]) throw new Error(`Unknown table: ${table}`);
}

// ─── 공개 API ───────────────────────────────────────────────────────

export async function d1List(
  env,
  table,
  { where, sort, limit, pageSize } = {},
) {
  assertTable(table);
  if (!env.DB) throw new Error("D1 binding (DB) missing");
  let sql = `SELECT * FROM ${table}`;
  const binds = [];
  if (where && Object.keys(where).length) {
    const conds = [];
    for (const [k, v] of Object.entries(where)) {
      if (!SCHEMA[table].includes(k) && k !== "id") {
        throw new Error(`Unknown where column: ${table}.${k}`);
      }
      conds.push(`${q(k)} = ?`);
      let vv = v;
      if (BOOL_COLS.has(k)) vv = v ? 1 : 0;
      binds.push(vv);
    }
    sql += " WHERE " + conds.join(" AND ");
  }
  if (sort && sort.length) {
    const orders = sort.map((s) => {
      if (!SCHEMA[table].includes(s.field) && s.field !== "id") {
        throw new Error(`Unknown sort column: ${table}.${s.field}`);
      }
      return `${q(s.field)} ${s.direction === "desc" ? "DESC" : "ASC"}`;
    });
    sql += " ORDER BY " + orders.join(", ");
  }
  const lim = limit || pageSize;
  if (lim) {
    const n = Math.max(1, Math.min(parseInt(lim, 10) || 100, 1000));
    sql += " LIMIT " + n;
  }
  const result = await env.DB.prepare(sql)
    .bind(...binds)
    .all();
  return { records: (result.results || []).map((r) => rowToRecord(r, table)) };
}

/** 전체 레코드 — D1는 페이지네이션 불필요, LIMIT 5000 */
export async function d1ListAll(env, table, opts = {}) {
  const r = await d1List(env, table, { ...opts, limit: 5000 });
  return r.records;
}

export async function d1Get(env, table, id) {
  assertTable(table);
  if (typeof id !== "string" || !id) throw new Error("d1Get: invalid id");
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) {
    const err = new Error(`d1 get ${table}/${id}: not found`);
    err.notFound = true;
    throw err;
  }
  return rowToRecord(row, table);
}

export async function d1Create(env, table, fields) {
  assertTable(table);
  const id = fields.__id || generateId(); // 마이그레이션 시 기존 id 보존을 위한 옵션
  const cleanFields = { ...fields };
  delete cleanFields.__id;
  const { cols, vals, placeholders } = fieldsToRow(cleanFields, table);
  const allCols = ["id", ...cols];
  const allVals = [id, ...vals];
  const allPlaceholders = ["?", ...placeholders];
  const sql = `INSERT INTO ${table} (${allCols.join(",")}) VALUES (${allPlaceholders.join(",")})`;
  await env.DB.prepare(sql)
    .bind(...allVals)
    .run();
  return d1Get(env, table, id);
}

export async function d1Update(env, table, id, fields) {
  assertTable(table);
  const { cols, vals } = fieldsToRow(fields, table);
  if (!cols.length) return d1Get(env, table, id);
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const sql = `UPDATE ${table} SET ${sets} WHERE id = ?`;
  const result = await env.DB.prepare(sql)
    .bind(...vals, id)
    .run();
  if (result.meta && result.meta.changes === 0) {
    const err = new Error(`d1 update ${table}/${id}: not found`);
    err.notFound = true;
    throw err;
  }
  return d1Get(env, table, id);
}

export async function d1Delete(env, table, id) {
  assertTable(table);
  const result = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`)
    .bind(id)
    .run();
  if (result.meta && result.meta.changes === 0) {
    const err = new Error(`d1 delete ${table}/${id}: not found`);
    err.notFound = true;
    throw err;
  }
  return { deleted: true, id };
}

/**
 * 한 컬럼만 여러 row 일괄 업데이트 (D1 batch). subrequest 1회로 처리되어
 * 다건 reorder 같은 시나리오에서 한도(50)·트랜잭션 안전성 모두 보장.
 * column 은 SCHEMA 화이트리스트로 검증.
 * @param {*} env
 * @param {string} table
 * @param {string} column  업데이트 대상 컬럼명
 * @param {Array<{id:string, value:any}>} updates
 */
export async function d1BatchUpdateColumn(env, table, column, updates) {
  if (!updates || !updates.length) return { updated: 0 };
  assertTable(table);
  const allowed = SCHEMA[table] || [];
  if (!allowed.includes(column)) {
    throw new Error(`column ${column} not allowed for ${table}`);
  }
  const safeCol = `"${column}"`;
  const sql = `UPDATE ${table} SET ${safeCol} = ? WHERE id = ?`;
  const stmts = updates.map((u) =>
    env.DB.prepare(sql).bind(u.value, String(u.id)),
  );
  await env.DB.batch(stmts);
  return { updated: updates.length };
}

/** 일괄 생성 (D1 batch 사용) — 마이그레이션·hero putSlides에서 사용 */
export async function d1CreateMany(env, table, recordsFields) {
  if (!recordsFields.length) return [];
  assertTable(table);
  const stmts = [];
  const ids = [];
  for (const fields of recordsFields) {
    const id = fields.__id || generateId();
    ids.push(id);
    const cleanFields = { ...fields };
    delete cleanFields.__id;
    const { cols, vals, placeholders } = fieldsToRow(cleanFields, table);
    const allCols = ["id", ...cols];
    const allVals = [id, ...vals];
    const allPlaceholders = ["?", ...placeholders];
    const sql = `INSERT INTO ${table} (${allCols.join(",")}) VALUES (${allPlaceholders.join(",")})`;
    stmts.push(env.DB.prepare(sql).bind(...allVals));
  }
  await env.DB.batch(stmts);
  const out = [];
  for (const id of ids) out.push(await d1Get(env, table, id));
  return out;
}

/** 전체 삭제 + 배치 생성 (HeroSlides putSlides 같은 replace-all 패턴) */
export async function d1ReplaceAll(env, table, recordsFields) {
  assertTable(table);
  await env.DB.prepare(`DELETE FROM ${table}`).run();
  return d1CreateMany(env, table, recordsFields);
}
