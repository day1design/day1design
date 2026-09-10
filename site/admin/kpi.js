(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const PERIODS = ["7", "15", "month", "2months", "3months", "6months", "year"];
  const LABELS = { traffic: "유입통계", ads: "Meta 광고", sales: "상담·계약" };
  const META = {
    users: ["방문 사용자", "GA4", "traffic", "명"], sessions: ["방문 세션", "GA4", "traffic", "회"], views: ["페이지뷰", "GA4", "traffic", "회"],
    spend: ["Meta 광고비", "Meta Ads · USD", "ads", "USD"], impressions: ["광고 노출", "Meta Ads", "ads", "회"], clicks: ["링크 클릭", "Meta Ads", "ads", "회"], linkClicks: ["링크 클릭", "Meta Ads", "ads", "회"], ctr: ["링크 CTR", "Meta Ads", "ads", "%"], cpc: ["링크 CPC", "Meta Ads · USD", "ads", "USD"], leads: ["Meta 리드", "Meta Ads", "ads", "건"], cpl: ["Meta CPL", "Meta Ads · USD", "ads", "USD"],
    inquiries: ["전체 신규 상담", "업무 DB", "sales", "건"], metaReceived: ["Meta 수신 상담", "업무 DB", "sales", "건"], webReceived: ["홈페이지 상담", "업무 DB", "sales", "건"], organic: ["검색 자연유입 접수", "네이버·구글·ChatGPT", "sales", "건"], naverOrganic: ["네이버 검색 접수", "검색광고 제외", "sales", "건"], googleOrganic: ["구글 검색 접수", "검색광고 제외", "sales", "건"], chatgptOrganic: ["ChatGPT 접수", "확인 가능한 출처", "sales", "건"], meetings: ["미팅 일정", "업무 DB", "sales", "건"], contracts: ["신규 확정 계약", "업무 DB", "sales", "건"], amount: ["신규 계약금액", "확정 금액 · KRW", "sales", "만원", 10000], changes: ["기존 계약 변경액", "확정 금액 증감 · KRW", "sales", "만원", 10000],
  };
  const dotDate = (value) => String(value || "").replaceAll("-", ".");
  function normalizeKpiResponse(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    const rawMetrics = source.metrics && typeof source.metrics === "object" ? source.metrics : {};
    const metrics = Object.entries(rawMetrics).map(([rawId, value]) => {
      if (rawId === "clicks" && Object.prototype.hasOwnProperty.call(rawMetrics, "linkClicks")) return null;
      const id = rawId === "linkClicks" ? "clicks" : rawId;
      const meta = META[rawId] || META[id] || [id, "저장 지표", "sales", ""];
      const current = value && typeof value === "object" ? value.current : value;
      const previous = value && typeof value === "object" ? value.previous : null;
      return { id, name: meta[0], source: meta[1], group: meta[2], unit: meta[3], scale: meta[4] || 1, current, previous, featured: ["users", "spend", "leads", "inquiries", "contracts", "amount"].includes(id) };
    }).filter(Boolean);
    const resolved = source.period || {};
    const current = resolved.current || {}, previous = resolved.previous || {};
    const rangeLabel = source.range?.label || (current.start ? `현재 ${dotDate(current.start)}–${dotDate(current.end)} · 이전 ${dotDate(previous.start)}–${dotDate(previous.end)}` : "기간 정보 없음");
    const coverage = source.coverage || {};
    const coverageValues = Object.values(coverage).flatMap((item) => item && typeof item === "object" ? Object.values(item) : []);
    const hasIncomplete = coverageValues.some((item) => item && item.complete === false);
    const normalizedStatus = source.status || (hasIncomplete ? "insufficient" : "ok");
    return { ...source, metrics, range: { label: rangeLabel }, coverage: { ...coverage, status: coverage.status || (hasIncomplete ? "insufficient" : "complete") }, status: normalizedStatus };
  }
  window.adminKpiNormalize = normalizeKpiResponse;
  const state = { period: "7", scope: "all", anchor: "", request: 0, controller: null, data: null };
  const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const escText = (el, value) => { el.textContent = value == null ? "" : String(value); };
  const fmt = (value, unit) => {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    if (unit === "USD") return n < 0 ? `-$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (unit === "%") return `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
    return `${n.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}${unit || ""}`;
  };
  const delta = (current, previous, unit) => {
    if (current == null || previous == null) return { text: "—", kind: "unchanged" };
    const d = Number(current) - Number(previous);
    if (!d) return { text: "0", percentText: "변화율 0.0%", kind: "unchanged" };
    const sign = d > 0 ? "+" : "";
    const percentText = previous === 0 ? "변화율 비교 불가" : `변화율 ${sign}${(d / Math.abs(Number(previous)) * 100).toFixed(1)}%`;
    return { text: `${sign}${fmt(d, unit)}`, percentText, kind: d > 0 ? "increase" : "decrease" };
  };
  const metricParts = (metric) => {
    const scale = Number(metric.scale || 1); const current = metric.current && typeof metric.current === "object" ? metric.current.value : metric.current; const previous = metric.previous && typeof metric.previous === "object" ? metric.previous.value : metric.previous;
    return { current: current == null ? null : Number(current) / scale, previous: previous == null ? null : Number(previous) / scale, unit: metric.current?.unit || metric.unit };
  };
  function barRow(label, value, max, unit, className) {
    const row = document.createElement("div"); row.className = "bar-row";
    const labelEl = document.createElement("span"); labelEl.className = "bar-label"; labelEl.textContent = label;
    const track = document.createElement("span"); track.className = "bar-track"; track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("i"); fill.className = `bar-fill ${className}`; const numeric = Number(value || 0); const signed = className.includes("signed"); const width = max > 0 ? Math.max(0, Math.min(100, Math.abs(numeric) / max * (signed ? 50 : 100))) : 0; fill.style.width = `${width}%`; if (signed) fill.style.left = `${numeric < 0 ? 50 - width : 50}%`; track.append(fill);
    const valueEl = document.createElement("b"); valueEl.textContent = fmt(value, unit); labelEl.append(valueEl); row.append(labelEl, track); return row;
  }
  function comparison(metric) {
    const p = metricParts(metric), max = Math.max(Math.abs(Number(p.current || 0)), Math.abs(Number(p.previous || 0)), 1), wrap = document.createElement("div"); wrap.className = `comparison-bars${p.current < 0 || p.previous < 0 ? " signed-bars" : ""}`;
    const signed = p.current < 0 || p.previous < 0; const d = delta(p.current, p.previous, p.unit); wrap.append(barRow("현재", p.current, max, p.unit, `current ${d.kind}${signed ? " signed" : ""}`), barRow("이전", p.previous, max, p.unit, `previous${signed ? " signed" : ""}`)); return { wrap, delta: d };
  }
  function addMetricRow(parent, metric) {
    const p = metricParts(metric), row = document.createElement("div"); row.className = "metric-row";
    const name = document.createElement("div"); name.className = "metric-name"; const strong = document.createElement("strong"); strong.textContent = metric.name || metric.id || "지표"; const small = document.createElement("small"); small.textContent = metric.source || ""; name.append(strong, small);
    const bars = comparison(metric); const d = document.createElement("div"); d.className = `metric-delta ${bars.delta.kind}`; d.textContent = bars.delta.text; const rate = document.createElement("small"); rate.className = "delta-rate"; rate.textContent = bars.delta.percentText || ""; d.append(rate); row.append(name, bars.wrap, d); parent.append(row);
  }
  function renderCards(metrics) {
    const cards = $("kpiCards"); cards.replaceChildren(); metrics.filter((m) => m.featured).slice(0, 8).forEach((metric) => { const p = metricParts(metric), d = delta(p.current, p.previous, p.unit), card = document.createElement("article"); card.className = "kpi-card"; const h = document.createElement("h3"); h.textContent = metric.name || metric.id; const value = document.createElement("div"); value.className = "kpi-value"; value.textContent = fmt(p.current, p.unit); const change = document.createElement("div"); change.className = `kpi-delta ${d.kind}`; change.textContent = d.text; const rate = document.createElement("small"); rate.className = "delta-rate"; rate.textContent = d.percentText || ""; change.append(rate); const bars = comparison(metric); card.append(h, value, change, bars.wrap); cards.append(card); });
  }
  function renderMetrics(metrics) {
    const groups = $("metricGroups"); groups.replaceChildren(); const grouped = new Map(); metrics.filter((m) => state.scope === "all" || m.group === state.scope).forEach((m) => { const group = m.group || "sales"; if (!grouped.has(group)) grouped.set(group, []); grouped.get(group).push(m); });
    grouped.forEach((items, group) => { const section = document.createElement("section"); section.className = "metric-group"; const title = document.createElement("div"); title.className = "metric-group-title"; title.textContent = LABELS[group] || group; section.append(title); items.forEach((m) => addMetricRow(section, m)); groups.append(section); });
  }
  function renderBudget(bands) {
    const parent = $("budgetRows"); parent.replaceChildren(); if (!Array.isArray(bands) || !bands.length || !["all", "sales"].includes(state.scope)) { $("budgetSection").hidden = true; return; } const totalCurrent = bands.reduce((sum, band) => sum + (Number(band.current) || 0), 0); const totalPrevious = bands.reduce((sum, band) => sum + (Number(band.previous) || 0), 0); $("budgetSection").hidden = false; bands.slice(0, 7).forEach((band) => { const row = document.createElement("div"); row.className = "budget-row"; const label = document.createElement("div"); label.className = "metric-name"; const strong = document.createElement("strong"); strong.textContent = band.name || band.label || "구간"; const shares = document.createElement("small"); shares.textContent = `현재 ${totalCurrent ? (Number(band.current || 0) / totalCurrent * 100).toFixed(1) : "0.0"}% · 이전 ${totalPrevious ? (Number(band.previous || 0) / totalPrevious * 100).toFixed(1) : "0.0"}%`; label.append(strong, shares); const compare = comparison({ current: band.current, previous: band.previous, unit: "건" }); const d = document.createElement("div"); d.className = `metric-delta ${compare.delta.kind}`; d.textContent = compare.delta.text; const currentShare = totalCurrent ? Number(band.current || 0) / totalCurrent * 100 : 0; const previousShare = totalPrevious ? Number(band.previous || 0) / totalPrevious * 100 : 0; const share = document.createElement("small"); share.className = "delta-rate"; share.textContent = `비중 ${currentShare - previousShare >= 0 ? "+" : ""}${(currentShare - previousShare).toFixed(1)}%p`; d.append(share); row.append(label, compare.wrap, d); parent.append(row); });
  }
  function renderOrganic(data) {
    const organic = data?.organic || {}; const value = organic.unitValue ?? organic.value; escText($("organicValue"), value == null ? "산정 불가" : fmt(value, "USD")); const detail = $("organicDetail"); detail.replaceChildren(); const details = [organic.range && `기준 기간 ${organic.range}`, organic.formula, organic.coverage]; details.filter(Boolean).forEach((text) => { const span = document.createElement("span"); span.textContent = text; detail.append(span); }); const saving = $("organicSaving"); saving.replaceChildren(); const metricValue = (id) => { const metric = (data.metrics || []).find((item) => item.id === id); return metric ? metricParts(metric).current : null; }; const spend = metricValue("spend"); const leads = metricValue("leads"); const organicCount = metricValue("organic"); if (organic.savings != null) { const label = document.createElement("small"); label.textContent = "선택 기간 광고비 절약효과(추정)"; const amount = document.createElement("strong"); amount.textContent = fmt(organic.savings, "USD"); saving.append(label, amount); const formula = document.createElement("div"); formula.className = "saving-formula"; formula.textContent = spend != null && leads > 0 && organicCount != null ? `기간 Meta CPL ${fmt(spend / leads, "USD")} × 자연유입 접수 ${organicCount}건` : "선택 기간 Meta 광고비 ÷ 리드 또는 자연유입 접수 데이터 부족"; saving.append(formula); const basis = document.createElement("div"); basis.className = "saving-basis"; basis.textContent = spend != null && leads != null ? `선택 기간 Meta 광고비 ${fmt(spend, "USD")} ÷ Meta 리드 ${leads}건` : "선택 기간 Meta 기준 데이터 부족"; saving.append(basis); } $("organicKpi");
  }
  function render(data) {
    state.data = data; const metrics = Array.isArray(data?.metrics) ? data.metrics : []; const coverage = data?.coverage || {}; const insufficient = ["insufficient", "coverage_insufficient", "insufficient_coverage"].includes(coverage.status) || ["insufficient", "coverage_insufficient", "insufficient_coverage"].includes(data?.status); const preparing = coverage.status === "preparing" || data?.status === "preparing";
    $("kpiAlert").hidden = !insufficient && !preparing; if (insufficient) escText($("kpiAlert"), "기준데이터 누적이 부족합니다. 다른기간을 비교해주세요"); else if (preparing) escText($("kpiAlert"), "저장 지표를 준비 중입니다. 잠시 후 다시 확인해주세요."); $("kpiError").hidden = true; $("retryButton").hidden = true;
    escText($("rangeLabel"), data?.range?.label || data?.period?.label || `${state.period} 기간 · 기준일 ${state.anchor} KST`); const source = data?.sourceStatus || {}; const sourceItems = Array.isArray(source.sources) ? source.sources.slice(0, 3).map((item) => [({business:"상담·계약 DB",meta:"Meta 광고",ga4:"GA4"}[item.name] || item.name), item.binding && `${item.name === "ga4" ? "속성" : "계정"} ${item.binding}`, item.fetchedAt && `갱신 ${new Date(item.fetchedAt).toLocaleString("ko-KR", {timeZone:"Asia/Seoul",hour12:false})} KST`].filter(Boolean).join(" · ")) : []; $("sourceState").replaceChildren(...[source.label || "저장된 지표 기준", ...sourceItems].filter(Boolean).map(text => { const line = document.createElement("span"); line.textContent = text; return line; })); $("metricSection").hidden = insufficient || preparing; $("kpiCards").hidden = insufficient || preparing; $("scopeTabs").hidden = insufficient || preparing; renderOrganic(data); renderCards(metrics); renderMetrics(metrics); renderBudget(insufficient || preparing ? [] : (data?.budgetBands || data?.budget || []));
  }
  async function load() {
    const request = ++state.request; if (state.controller) state.controller.abort(); state.controller = new AbortController(); state.data = null; $("sourceState").textContent = "불러오는 중"; $("rangeLabel").textContent = "기간 확인 중"; $("organicValue").textContent = "불러오는 중"; $("organicDetail").replaceChildren(); $("organicSaving").replaceChildren(); $("kpiError").hidden = true; $("metricGroups").replaceChildren(); $("kpiCards").replaceChildren(); $("budgetRows").replaceChildren(); $("budgetSection").hidden = true;
    const query = new URLSearchParams({ period: state.period, anchor: state.anchor });
    try { const data = await window.adminUtil.apiCached(`/api/admin/kpi?${query.toString()}`, { ttl: 60000, signal: state.controller.signal, dedupe: false }); if (request !== state.request) return; render(normalizeKpiResponse(data || {})); } catch (error) { if (request !== state.request) return; $("sourceState").textContent = "조회 실패"; escText($("kpiError"), "KPI 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); $("kpiError").hidden = false; $("retryButton").hidden = false; }
  }
  function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [year, month, day] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day; }
  function applyAnchor(value) { if (!validDate(value) || value > todayKst()) { escText($("kpiError"), "오늘(KST) 이전의 유효한 기준일을 선택해주세요."); $("kpiError").hidden = false; return; } state.anchor = value; load(); }
  function init() { state.anchor = todayKst(); $("anchorDate").value = state.anchor; $("anchorDate").max = state.anchor; document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => { state.period = button.dataset.period; document.querySelectorAll("[data-period]").forEach((b) => b.setAttribute("aria-pressed", String(b === button))); load(); })); document.querySelectorAll("[data-scope]").forEach((button) => button.addEventListener("click", () => { state.scope = button.dataset.scope; document.querySelectorAll("[data-scope]").forEach((b) => { const active = b === button; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); }); render(state.data || {}); })); $("applyAnchor").addEventListener("click", () => applyAnchor($("anchorDate").value)); $("todayAnchor").addEventListener("click", () => { $("anchorDate").value = todayKst(); applyAnchor($("anchorDate").value); }); $("retryButton").addEventListener("click", load); $("basisToggle").addEventListener("click", () => { const expanded = $("basisToggle").getAttribute("aria-expanded") !== "true"; $("basisToggle").setAttribute("aria-expanded", String(expanded)); $("basisToggle").textContent = expanded ? "산정 근거 접기" : "산정 근거 보기"; $("organicKpi").classList.toggle("basis-expanded", expanded); }); load(); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
