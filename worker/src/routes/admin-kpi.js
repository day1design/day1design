import { verifyAdmin } from "../lib/auth.js";
import { jsonError, jsonOk } from "../lib/response.js";
import { readAdminKpiCached } from "../lib/admin-kpi.js";

const ALLOWED_PERIODS = new Set(["7", "15", "month", "2months", "3months", "6months", "year"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleAdminKpi(request, env) {
  if (request.method !== "GET") return jsonError(405, "Method Not Allowed");
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");
  if (!env?.DB) return jsonError(503, "KPI database unavailable");
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "7";
  const anchor = url.searchParams.get("anchor") || undefined;
  if (!ALLOWED_PERIODS.has(period)) return jsonError(400, "Invalid KPI period");
  if (anchor && !ISO_DATE.test(anchor)) return jsonError(400, "Invalid KPI anchor");
  try {
    const payload = await readAdminKpiCached(env.DB, {
      tenantId: "day1design",
      role: "owner",
      period,
      anchor,
      r2: env.CRM_CACHE || env.KPI_CACHE || null,
      metaAccountId: env.META_AD_ACCOUNT_ID || "",
      ga4PropertyId: env.GA4_PROPERTY_ID || "",
    });
    const response = jsonOk(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const message = error?.message || "";
    const code = message === "kpi_rollup_limit" || message === "kpi_response_limit" || message === "kpi_period_too_large" ? 413
      : message === "kpi_anchor_future" || message === "kpi_anchor_invalid" || message === "kpi_period_invalid" ? 400
        : 503;
    return jsonError(code, code === 413 ? "KPI source limit exceeded" : code === 400 ? "Invalid KPI query" : "KPI summary unavailable; retry later");
  }
}
