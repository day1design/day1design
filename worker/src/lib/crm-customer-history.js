const PAGE_SIZE = 50;
const CURSOR_MAX = 500;

function rowsOf(result) { return result?.results || (Array.isArray(result) ? result : []); }
function bounded(value, max) { return String(value || "").slice(0, max); }
async function one(db, sql, bindings) {
  const statement = db.prepare(sql);
  if (typeof statement.bind === "function") return statement.bind(...bindings).first();
  return statement.get(...bindings);
}
async function all(db, sql, bindings) {
  const statement = db.prepare(sql);
  if (typeof statement.bind === "function") return statement.bind(...bindings).all();
  return statement.all(...bindings);
}
function cursorParts(cursor) {
  const value = String(cursor || "");
  if (!value) return null;
  if (value.length > CURSOR_MAX || !/^[^|]{1,50}\|[A-Za-z0-9_-]{1,120}$/.test(value)) throw new Error("crm_customer_history_cursor_invalid");
  const split = value.indexOf("|");
  return [value.slice(0, split), value.slice(split + 1)];
}
function cursorValue(row) { return `${String(row.createdAt || "")}|${String(row.id || "")}`; }

export async function readCrmCustomerVisitHistory(db, { tenantId, customerId, cursor = "" } = {}) {
  if (!db?.prepare) throw new Error("crm_customer_history_db_required");
  const tenant = String(tenantId || "");
  const customer = String(customerId || "");
  if (!tenant || !customer) throw new Error("crm_customer_history_identity_required");
  const parts = cursorParts(cursor);
  const estimate = await one(db, "SELECT SessionId FROM Estimates WHERE id=? AND CrmTenantId=?", [customer, tenant]);
  const sessionId = String(estimate?.SessionId || "");
  if (!sessionId) return { linked: false, events: [], nextCursor: null };
  const after = parts ? " AND (CreatedAt,id)>(?,?)" : "";
  const bindings = parts ? [tenant, sessionId, parts[0], parts[1]] : [tenant, sessionId];
  const result = await all(db, `SELECT id,Page,Device,Referrer,UtmSource,UtmMedium,UtmCampaign,CreatedAt
    FROM HeatmapEvents INDEXED BY idx_heatmap_crm_tenant_session_event_bot_created_id
    WHERE CrmTenantId=? AND SessionId=? AND EventType='page_view' AND IsBot=0${after}
    ORDER BY CreatedAt ASC,id ASC LIMIT ${PAGE_SIZE + 1}`, bindings);
  const source = rowsOf(result);
  const page = source.slice(0, PAGE_SIZE).map((row) => ({ id: bounded(row.id, 120), page: bounded(row.Page, 2000), device: bounded(row.Device, 100), referrer: bounded(row.Referrer, 2000), utmSource: bounded(row.UtmSource, 500), utmMedium: bounded(row.UtmMedium, 500), utmCampaign: bounded(row.UtmCampaign, 500), createdAt: bounded(row.CreatedAt, 50) }));
  return { linked: true, events: page, nextCursor: source.length > PAGE_SIZE && page.length ? cursorValue(page[page.length - 1]) : null };
}

export const CRM_CUSTOMER_HISTORY_CONTRACT = Object.freeze({ pageSize: PAGE_SIZE, cursor: "CreatedAt|id keyset", excludes: "IsBot=1", tenantScoped: true });
