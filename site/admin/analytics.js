// ========== 유입통계 ==========
// 상단 유입통계는 Worker가 집계한 외부 유입 데이터를 읽는다.
// 접수통계(하단)는 실제 Worker API 데이터 기반.

const PALETTE = {
  primary: "#1a2f4e",
  accent: "#c2a679",
  muted: "#8a93a6",
  bg: "rgba(26, 47, 78, 0.08)",
  sources: ["#1877f2", "#4285f4", "#03c75a", "#ff0033", "#f7d600", "#6b7280"],
};

const STATUS_COLORS = {
  접수대기: "#f59e0b",
  상담중: "#3b82f6",
  견적완료: "#10b981",
  계약완료: "#059669",
  취소: "#ef4444",
};

const SOURCE_LABELS = {
  homepage: "홈페이지",
  meta: "Meta",
  google: "Google",
  naver: "Naver",
  youtube: "YouTube",
  kakao: "Kakao",
  direct: "Direct",
  search: "Search",
  social: "Social",
  referral: "Referral",
  other: "기타",
};

const SOURCE_COLORS = {
  homepage: "#1a2f4e",
  meta: "#1877f2",
  google: "#4285f4",
  naver: "#03c75a",
  youtube: "#ff0033",
  kakao: "#f7d600",
  direct: "#6b7280",
  search: "#0ea5e9",
  social: "#8b5cf6",
  referral: "#14b8a6",
  other: "#b8c0cc",
};

const SUBMISSION_SOURCE_ORDER = [
  "homepage",
  "meta",
  "google",
  "naver",
  "youtube",
  "kakao",
  "referral",
  "other",
];

const PERIOD_LIMITS = {
  month: 6,
  week: 8,
  day: 14,
};
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const TARGET_SETTINGS_KEY = "day1_ops_target_settings";

const barTotalLabelPlugin = {
  id: "barTotalLabel",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const labels = chart.data.labels || [];
    ctx.save();
    ctx.fillStyle = "#1a2f4e";
    ctx.font = "600 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    labels.forEach((_, index) => {
      let total = 0;
      let topY = Infinity;
      let x = null;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (!chart.isDatasetVisible(datasetIndex)) return;
        const value = Number(dataset.data[index] || 0);
        if (!value) return;
        const element = chart.getDatasetMeta(datasetIndex).data[index];
        if (!element) return;
        const point = element.getProps(["x", "y"], true);
        total += value;
        topY = Math.min(topY, point.y);
        x = point.x;
      });
      if (!total || x == null || !isFinite(topY)) return;
      ctx.fillText(fmtInt(total), x, Math.max(12, topY - 6));
    });
    ctx.restore();
  },
};

const trendPointValueLabelPlugin = {
  id: "trendPointValueLabel",
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.enabled) return;
    const { ctx } = chart;
    const labels = chart.data.labels || [];
    const maxLabels = isNarrow() ? 12 : 31;
    const step = Math.max(1, Math.ceil(labels.length / maxLabels));

    ctx.save();
    ctx.fillStyle = "#1a2f4e";
    ctx.font = "700 10.5px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    labels.forEach((_, index) => {
      if (index % step !== 0 && index !== labels.length - 1) return;
      const points = [];
      const parts = [];
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (!chart.isDatasetVisible(datasetIndex)) return;
        const value = Number(dataset.data[index] || 0);
        if (!value) return;
        const element = chart.getDatasetMeta(datasetIndex).data[index];
        if (!element) return;
        const point = element.getProps(["x", "y"], true);
        points.push(point);
        parts.push(fmtCompact(value));
      });
      if (!parts.length || !points.length) return;
      const x =
        points.reduce((sum, point) => sum + point.x, 0) /
        Math.max(1, points.length);
      const y = Math.min(...points.map((point) => point.y));
      ctx.fillText(parts.join(" / "), x, Math.max(12, y - 8));
    });
    ctx.restore();
  },
};

function isNarrow() {
  return window.matchMedia("(max-width: 640px)").matches;
}
function doughnutLegendPos() {
  return isNarrow() ? "bottom" : "right";
}

// 페이지 경로 → "영문 - 한글" 라벨 (사이트 헤더 네비 기준)
const PAGE_LABELS = [
  { match: (p) => p === "/" || p === "/index.html", label: "HOME - 메인" },
  { match: (p) => p.startsWith("/pages/about"), label: "ABOUT US - 회사소개" },
  {
    match: (p) => p.startsWith("/pages/project-flow"),
    label: "ABOUT US - 프로젝트 플로우",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]cat=office/.test(p),
    label: "PORTFOLIO - OFFICE",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]size=20-30/.test(p),
    label: "PORTFOLIO - 20~30평",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]size=30-40/.test(p),
    label: "PORTFOLIO - 30~40평",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]size=40-50/.test(p),
    label: "PORTFOLIO - 40~50평",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]size=50/.test(p),
    label: "PORTFOLIO - 50평 이상",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio-detail"),
    label: "PORTFOLIO - 상세",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio"),
    label: "PORTFOLIO - 포트폴리오",
  },
  {
    match: (p) => p.startsWith("/pages/community-detail"),
    label: "COMMUNITY - 상세글",
  },
  {
    match: (p) => p.startsWith("/pages/community"),
    label: "COMMUNITY - 커뮤니티",
  },
  {
    match: (p) => p.startsWith("/pages/estimates"),
    label: "ESTIMATE - 견적문의",
  },
];

function pageLabel(path) {
  if (!path) return "";
  for (const row of PAGE_LABELS) {
    if (row.match(path)) return row.label;
  }
  return path;
}

let trendChart = null;
let sourcesChart = null;
let submissionsChart = null;
let statusChart = null;
let submissionRecords = null;
let currentTrafficSummary = null;
let currentTrafficTrendRows = [];
let currentTrafficSourceRows = [];
let currentTopPagesRows = [];
let currentSubmissionRows = [];
let currentVisitorLocationRows = null;
let currentRangeKey = "today";
let visitorDetailRangeKey = "today";
let submissionPeriodKey = "month";
let customStart = null; // Date (KST 자정)
let customEnd = null; // Date (KST 23:59)
let visitorDetailStart = null;
let visitorDetailEnd = null;
let analyticsLoadSeq = 0;
let visitorLocationLoadSeq = 0;
let visitorLocationDetailLoadSeq = 0;
let targetSettingsCache = readTargetSettings();
const targetSettingsLoaded = new Set();
const targetSettingsLoading = new Set();

// ========== 공통 유틸 ==========
function fmtInt(n) {
  return Number(n).toLocaleString("ko-KR");
}

function fmtCompact(n) {
  const value = Number(n) || 0;
  if (Math.abs(value) >= 10000) return `${Math.round(value / 1000) / 10}만`;
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}천`;
  return fmtInt(value);
}

function fmtDelta(n, { invert = false } = {}) {
  if (n == null) return "—";
  const sign = n > 0 ? "▲" : n < 0 ? "▼" : "=";
  const good = invert ? n < 0 : n > 0;
  const cls = n === 0 ? "flat" : good ? "up" : "down";
  return `<span class="delta ${cls}">${sign} ${Math.abs(n)}%</span>`;
}

function fmtDuration(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m ? `${m}분 ${s}초` : `${s}초`;
}

function fmtPercent(value) {
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function fmtConversionRate(numerator, denominator) {
  const top = Number(numerator) || 0;
  const base = Number(denominator) || 0;
  if (!base) return "—";
  const pct = (top / base) * 100;
  if (pct > 0 && pct < 10) return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(pct)}%`;
}

function sourceKey(value) {
  const key = String(value || "other").toLowerCase();
  return SOURCE_LABELS[key] ? key : "other";
}

function sourceLabel(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  return SOURCE_LABELS[key] || raw || SOURCE_LABELS.other;
}

function sourceColor(value, index = 0) {
  const key = sourceKey(value);
  return SOURCE_COLORS[key] || PALETTE.sources[index % PALETTE.sources.length];
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysBetween(start, end) {
  const ms = endOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function clampPercent(value) {
  const n = Number(value) || 0;
  return Math.max(0, Math.min(100, n));
}

function recordDate(record) {
  const t = Date.parse(record?.SubmittedAt || "");
  return isNaN(t) ? null : new Date(t);
}

function countRecordsInRange(records, start, end) {
  const startTs = start.getTime();
  const endTs = end.getTime();
  return (records || []).reduce((sum, record) => {
    const d = recordDate(record);
    if (!d) return sum;
    const t = d.getTime();
    return t >= startTs && t <= endTs ? sum + 1 : sum;
  }, 0);
}

function branchLabel(value) {
  return String(value || "").trim() || "지점 미정";
}

function sortEntriesDesc(map) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function weekStart(d) {
  const x = startOfDay(d);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x;
}

function periodKeyForDate(d, period) {
  if (period === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (period === "week") {
    return dayKey(weekStart(d));
  }
  return dayKey(d);
}

function periodLabelForKey(key, period) {
  if (period === "month") {
    const [, mm] = key.split("-");
    return `${Number(mm)}월`;
  }
  const d = new Date(`${key}T00:00:00`);
  if (isNaN(+d)) return key;
  if (period === "week") return `${d.getMonth() + 1}/${d.getDate()}주`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function periodSortTime(key, period) {
  if (period === "month") {
    const [yyyy, mm] = key.split("-").map(Number);
    return new Date(yyyy, mm - 1, 1).getTime();
  }
  const d = new Date(`${key}T00:00:00`);
  return isNaN(+d) ? 0 : d.getTime();
}

function readTargetSettings() {
  try {
    return JSON.parse(localStorage.getItem(TARGET_SETTINGS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeTargetSettings(settings) {
  try {
    localStorage.setItem(TARGET_SETTINGS_KEY, JSON.stringify(settings || {}));
  } catch {}
}

function targetSettingFor(monthKey) {
  return targetSettingsCache[monthKey] || {};
}

function saveTargetSetting(monthKey, patch) {
  targetSettingsCache[monthKey] = {
    ...(targetSettingsCache[monthKey] || {}),
    ...patch,
  };
  targetSettingsLoaded.add(monthKey);
  writeTargetSettings(targetSettingsCache);
  return adminUtil
    .api("/api/analytics/target", {
      method: "PUT",
      json: { monthKey, ...targetSettingsCache[monthKey] },
    })
    .then((saved) => {
      targetSettingsCache[monthKey] = saved || targetSettingsCache[monthKey];
      writeTargetSettings(targetSettingsCache);
    })
    .catch((e) => {
      adminUtil.toast("목표량 저장에 실패했습니다", "error");
      console.error("target setting save failed:", e);
    });
}

function loadTargetSetting(monthKey) {
  if (
    !monthKey ||
    targetSettingsLoaded.has(monthKey) ||
    targetSettingsLoading.has(monthKey)
  ) {
    return;
  }
  targetSettingsLoading.add(monthKey);
  adminUtil
    .api(`/api/analytics/target?month=${encodeURIComponent(monthKey)}`)
    .then((data) => {
      targetSettingsCache[monthKey] = data || {};
      targetSettingsLoaded.add(monthKey);
      writeTargetSettings(targetSettingsCache);
      renderSubmissionStats(resolveRange(currentRangeKey));
    })
    .catch((e) => {
      targetSettingsLoaded.add(monthKey);
      console.warn("target setting load failed:", e);
    })
    .finally(() => {
      targetSettingsLoading.delete(monthKey);
    });
}

function effectiveTargetFor(forecastStats) {
  const defaultValue = Number(forecastStats.targetCount || 0);
  const setting = targetSettingFor(forecastStats.monthKey);
  const manualValue = Math.max(0, Math.round(Number(setting.value || 0)));
  const useManual = Boolean(setting.manual) && manualValue > 0;
  return {
    value: useManual ? manualValue : defaultValue,
    manual: useManual,
    defaultValue,
  };
}

function syncTargetControl(forecastStats, effectiveTarget) {
  const text = document.getElementById("opsTargetDefaultText");
  const manual = document.getElementById("opsTargetManual");
  const input = document.getElementById("opsTargetInput");
  if (text) {
    text.textContent = effectiveTarget.defaultValue
      ? `기본: ${forecastStats.targetLabel} 접수량 ${fmtInt(effectiveTarget.defaultValue)}건 기준`
      : `기본: ${forecastStats.targetLabel} 접수 데이터 없음`;
  }
  if (manual) manual.checked = effectiveTarget.manual;
  if (input) {
    input.disabled = !effectiveTarget.manual;
    input.value = String(
      effectiveTarget.value || effectiveTarget.defaultValue || "",
    );
    input.placeholder = effectiveTarget.defaultValue
      ? String(effectiveTarget.defaultValue)
      : "목표량";
  }
}

// ========== 기간 범위 해석 ==========
function resolveRange(key) {
  const today = startOfDay(new Date());
  if (key === "today") {
    return {
      key,
      start: today,
      end: endOfDay(today),
      days: 1,
      label: "오늘",
    };
  }
  if (key === "7" || key === "30") {
    const days = Number(key);
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    return {
      key,
      start,
      end: endOfDay(today),
      days,
      label: `최근 ${days}일`,
    };
  }
  if (key === "cur-month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      key,
      start,
      end: endOfDay(today),
      days: daysBetween(start, today),
      label: `${start.getMonth() + 1}월 (당월)`,
    };
  }
  if (key === "prev-month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
    return {
      key,
      start,
      end,
      days: daysBetween(start, end),
      label: `${start.getMonth() + 1}월 (전월)`,
    };
  }
  if (key === "all") {
    const start = new Date(2020, 0, 1);
    return {
      key,
      start,
      end: endOfDay(today),
      days: daysBetween(start, today),
      label: "전체 기간",
    };
  }
  if (key === "custom") {
    const s = customStart || today;
    const e = customEnd || today;
    const start = startOfDay(s);
    const end = endOfDay(e);
    return {
      key,
      start,
      end,
      days: daysBetween(start, end),
      label: `${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`,
    };
  }
  // fallback
  return resolveRange("30");
}

function resolveVisitorDetailRange(key) {
  if (key !== "custom") return resolveRange(key);
  const oldStart = customStart;
  const oldEnd = customEnd;
  customStart = visitorDetailStart;
  customEnd = visitorDetailEnd;
  const range = resolveRange("custom");
  customStart = oldStart;
  customEnd = oldEnd;
  return range;
}

// ========== 유입통계 ==========
function showChartPlaceholder(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  canvas.style.display = "none";
  if (!wrap.querySelector(".chart-placeholder")) {
    const ph = document.createElement("div");
    ph.className = "chart-placeholder";
    ph.textContent = "통계 데이터가 없습니다";
    wrap.appendChild(ph);
  }
}

function restoreChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  canvas.style.display = "";
  canvas.parentElement?.querySelector(".chart-placeholder")?.remove();
  return canvas.getContext("2d");
}

function renderAnalyticsEmpty() {
  [
    "kpiTouches",
    "kpiVisitors",
    "kpiPageviews",
    "kpiDuration",
    "kpiBounce",
    "kpiNew",
    "kpiReturning",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  });
  // 게이지 초기화
  ["gaugeNew", "gaugeReturning"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.width = "0%";
  });
  // 자체측정 패널 빈 상태
  renderSelfPanel(null);
  [
    "kpiVisitorsDelta",
    "kpiPageviewsDelta",
    "kpiDurationDelta",
    "kpiBounceDelta",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  });
  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }
  if (sourcesChart) {
    sourcesChart.destroy();
    sourcesChart = null;
  }
  currentTrafficSummary = null;
  currentTrafficTrendRows = [];
  currentTrafficSourceRows = [];
  currentTopPagesRows = [];
  showChartPlaceholder("chartTrend");
  showChartPlaceholder("chartSources");
  renderSourceSummary([]);
  renderOpsActivityHeatmap(resolveRange(currentRangeKey));
  renderOpsInsights(resolveRange(currentRangeKey));
  const tbody = document.querySelector("#topPagesTable tbody");
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="empty-state">통계 데이터가 없습니다</td></tr>';
  }
}

function renderTrafficAnalytics(data) {
  const summary = data?.summary;
  if (!summary) {
    renderAnalyticsEmpty();
    return;
  }

  // KPI 카드 6개 — 자체측정(터치·재방문) + GA4(체류·페이지뷰·평균체류·이탈률)
  const touchEl = document.getElementById("kpiTouches");
  if (touchEl) touchEl.textContent = fmtInt(summary.touches || 0);
  document.getElementById("kpiVisitors").textContent = fmtInt(
    summary.visitors || 0,
  );
  document.getElementById("kpiPageviews").textContent = fmtInt(
    summary.pageviews || 0,
  );
  document.getElementById("kpiDuration").textContent = fmtDuration(
    summary.avgDurationSec,
  );
  document.getElementById("kpiBounce").textContent = fmtPercent(
    summary.bounceRate,
  );

  // 재방문 카드 (신규/재방문 + 게이지)
  const newCnt = Number(summary.newVisitors || 0);
  const retCnt = Number(summary.returningVisitors || 0);
  const total = newCnt + retCnt;
  const newEl = document.getElementById("kpiNew");
  const retEl = document.getElementById("kpiReturning");
  if (newEl) newEl.textContent = fmtInt(newCnt);
  if (retEl) retEl.textContent = fmtInt(retCnt);
  const gNew = document.getElementById("gaugeNew");
  const gRet = document.getElementById("gaugeReturning");
  if (gNew && gRet) {
    const newPct = total > 0 ? (newCnt / total) * 100 : 0;
    const retPct = total > 0 ? (retCnt / total) * 100 : 0;
    gNew.style.width = newPct.toFixed(1) + "%";
    gRet.style.width = retPct.toFixed(1) + "%";
  }

  // 자체측정 상세 패널
  renderSelfPanel(data.self);

  [
    "kpiTouchesDelta",
    "kpiVisitorsDelta",
    "kpiPageviewsDelta",
    "kpiDurationDelta",
    "kpiBounceDelta",
    "kpiReturningDelta",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });

  currentTrafficSummary = summary;
  currentTrafficTrendRows = data.trend || [];
  currentTrafficSourceRows = data.sources || [];
  currentTopPagesRows = data.topPages || [];
  renderTrendChart(currentTrafficTrendRows);
  renderSourceSummary(currentTrafficSourceRows);
  renderSourcesChart(currentTrafficSourceRows);
  renderTopPages(currentTopPagesRows);
  renderOpsActivityHeatmap(resolveRange(currentRangeKey));
  renderOpsInsights(resolveRange(currentRangeKey));
}

// 자체측정 상세 패널 렌더 (접속위치/디바이스/피크시간/평균PV/평균접속시간/전환율)
function renderSelfPanel(self) {
  const locEl = document.getElementById("selfLocations");
  const devEl = document.getElementById("selfDevices");
  const peakEl = document.getElementById("selfPeakHour");
  const avgPvEl = document.getElementById("selfAvgPv");
  const dwellEl = document.getElementById("selfAvgDwell");
  const convEl = document.getElementById("selfConversion");
  const convSubEl = document.getElementById("selfConversionSub");

  if (!self) {
    if (locEl) locEl.innerHTML = '<li class="empty-state">데이터 없음</li>';
    if (devEl) devEl.innerHTML = '<span class="empty-state">데이터 없음</span>';
    if (peakEl) peakEl.textContent = "—";
    if (avgPvEl) avgPvEl.textContent = "—";
    if (dwellEl) dwellEl.textContent = "—";
    if (convEl) convEl.textContent = "—";
    return;
  }

  // 접속 위치 TOP 5
  if (locEl) {
    const rows = self.topLocations || [];
    if (!rows.length) {
      locEl.innerHTML = '<li class="empty-state">데이터 없음</li>';
    } else {
      locEl.innerHTML = rows
        .map((r) => {
          const place = r.country
            ? `${adminUtil.escapeHtml(r.city)} <span class="loc-country">${adminUtil.escapeHtml(r.country)}</span>`
            : adminUtil.escapeHtml(r.city);
          return `<li><span class="loc-name">${place}</span><span class="loc-cnt">${fmtInt(r.sessions)}</span></li>`;
        })
        .join("");
    }
  }

  // 디바이스 비중
  if (devEl) {
    const pc = Number(self.devices?.pc || 0);
    const mo = Number(self.devices?.mobile || 0);
    const tot = pc + mo;
    if (!tot) {
      devEl.innerHTML = '<span class="empty-state">데이터 없음</span>';
    } else {
      const pcPct = (pc / tot) * 100;
      const moPct = (mo / tot) * 100;
      devEl.innerHTML = `
        <div class="device-row">
          <span class="device-name">PC</span>
          <span class="device-bar-track"><span class="device-bar-fill device-pc" style="width:${pcPct.toFixed(1)}%"></span></span>
          <span class="device-val">${pcPct.toFixed(0)}% · ${fmtInt(pc)}</span>
        </div>
        <div class="device-row">
          <span class="device-name">모바일</span>
          <span class="device-bar-track"><span class="device-bar-fill device-mo" style="width:${moPct.toFixed(1)}%"></span></span>
          <span class="device-val">${moPct.toFixed(0)}% · ${fmtInt(mo)}</span>
        </div>`;
    }
  }

  // 피크 시간대 (KST 기준 — Worker에서 보정 완료)
  if (peakEl) {
    if (self.peakHour === null || self.peakHour === undefined) {
      peakEl.textContent = "—";
    } else {
      const h = Number(self.peakHour);
      const hh = String(h).padStart(2, "0");
      peakEl.textContent = `${hh}시`;
    }
  }

  // 평균 페이지뷰
  if (avgPvEl) {
    const pv = Number(self.avgPageviewsPerSession || 0);
    avgPvEl.textContent = pv > 0 ? pv.toFixed(1) : "—";
  }

  // 평균 접속시간
  if (dwellEl) {
    const sec = Number(self.avgDwellSec || 0);
    dwellEl.textContent = sec > 0 ? fmtDuration(sec) : "—";
  }

  // 전환율
  if (convEl) {
    const rate = Number(self.conversionRate || 0);
    convEl.textContent = rate > 0 ? (rate * 100).toFixed(2) + "%" : "—";
  }
  if (convSubEl) {
    const subs = Number(self.submissions || 0);
    const touches = Number(self.touches || 0);
    convSubEl.textContent = `${fmtInt(subs)} 건 / 터치 ${fmtInt(touches)}`;
  }
}

function renderTrendChart(rows) {
  const ctx = restoreChart("chartTrend");
  if (!ctx) return;
  if (trendChart) trendChart.destroy();
  if (!rows.length) {
    showChartPlaceholder("chartTrend");
    return;
  }
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map((row) => {
        const d = new Date(`${row.date}T00:00:00`);
        return isNaN(+d) ? row.date : `${d.getMonth() + 1}/${d.getDate()}`;
      }),
      datasets: [
        {
          label: "방문자",
          data: rows.map((row) => row.visitors || 0),
          borderColor: PALETTE.primary,
          backgroundColor: "rgba(26, 47, 78, 0.12)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: "페이지뷰",
          data: rows.map((row) => row.pageviews || 0),
          borderColor: PALETTE.accent,
          backgroundColor: "rgba(194, 166, 121, 0.12)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 26 } },
      plugins: {
        trendPointValueLabel: { enabled: true },
        legend: { position: "bottom", labels: { usePointStyle: true } },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
    plugins: [trendPointValueLabelPlugin],
  });
}

function renderSourceSummary(rows) {
  const wrap = document.getElementById("sourceSummary");
  if (!wrap) return;
  const total = rows.reduce((sum, row) => sum + Number(row.sessions || 0), 0);
  if (!rows.length || !total) {
    wrap.innerHTML =
      '<div class="source-kpi-item"><div class="source-kpi-name"><span>출처</span></div><div class="source-kpi-value">—</div><div class="source-kpi-sub">데이터 없음</div></div>';
    return;
  }
  wrap.innerHTML = rows
    .slice(0, 6)
    .map((row, index) => {
      const rawKey = row.key || row.name;
      const key = sourceKey(rawKey);
      const sessions = Number(row.sessions || 0);
      const visitors = Number(row.visitors || 0);
      const percent = total ? Math.round((sessions / total) * 100) : 0;
      const visitorText = visitors ? ` · 방문자 ${fmtInt(visitors)}` : "";
      return `
        <div class="source-kpi-item">
          <div class="source-kpi-name">
            <span class="source-kpi-dot" style="background:${sourceColor(key, index)}"></span>
            <span>${adminUtil.escapeHtml(sourceLabel(rawKey))}</span>
          </div>
          <div class="source-kpi-value">${fmtInt(sessions)}</div>
          <div class="source-kpi-sub">${percent}%${visitorText}</div>
        </div>`;
    })
    .join("");
}

function renderSourcesChart(rows) {
  const ctx = restoreChart("chartSources");
  if (!ctx) return;
  if (sourcesChart) sourcesChart.destroy();
  if (!rows.length) {
    showChartPlaceholder("chartSources");
    return;
  }
  sourcesChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: rows.map((row) => sourceLabel(row.key || row.name)),
      datasets: [
        {
          data: rows.map((row) => row.sessions || 0),
          backgroundColor: rows.map((row, index) =>
            sourceColor(row.key || row.name, index),
          ),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: doughnutLegendPos(),
          labels: { usePointStyle: true, boxWidth: 8 },
        },
      },
    },
  });
}

function renderTopPages(rows) {
  const tbody = document.querySelector("#topPagesTable tbody");
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="empty-state">통계 데이터가 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (row, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td class="path">${adminUtil.escapeHtml(pageLabel(row.path || ""))}</td>
          <td class="num" style="text-align:right">${fmtInt(row.views || 0)}</td>
        </tr>`,
    )
    .join("");
}

async function loadTrafficAnalytics(range) {
  const seq = ++analyticsLoadSeq;
  try {
    await adminUtil.ensureAuth();
    const params = new URLSearchParams({
      range: currentRangeKey,
      start: dayKey(range.start),
      end: dayKey(range.end),
    });
    const data = await adminUtil.apiCached(`/api/analytics/summary?${params}`, {
      ttl: 10 * 60_000,
    });
    if (seq !== analyticsLoadSeq) return;
    renderTrafficAnalytics(data);
  } catch (e) {
    if (seq !== analyticsLoadSeq) return;
    renderAnalyticsEmpty();
    console.error("traffic analytics load failed:", e);
  }
}

async function loadVisitorLocations(range) {
  const seq = ++visitorLocationLoadSeq;
  try {
    await adminUtil.ensureAuth();
    const params = new URLSearchParams({
      range: currentRangeKey,
      start: dayKey(range.start),
      end: dayKey(range.end),
    });
    const data = await adminUtil.apiCached(
      `/api/analytics/visitor-locations?${params}`,
      { ttl: 60_000 },
    );
    if (seq !== visitorLocationLoadSeq) return;
    currentVisitorLocationRows = (data?.topLocations || []).slice(0, 5);
    renderVisitorLocations(currentVisitorLocationRows);
  } catch (e) {
    if (seq !== visitorLocationLoadSeq) return;
    currentVisitorLocationRows = [];
    renderVisitorLocations([]);
    console.error("visitor locations load failed:", e);
  }
}

function renderVisitorLocations(rows = currentVisitorLocationRows) {
  const wrap = document.getElementById("visitorLocationTop");
  if (!wrap) return;
  if (rows == null) {
    wrap.innerHTML = '<div class="ops-empty">불러오는 중...</div>';
    return;
  }
  if (!rows.length) {
    wrap.innerHTML = '<div class="ops-empty">접속위치 데이터가 없습니다</div>';
    return;
  }

  const items = rows.slice(0, 5);
  const maxVisits = Math.max(
    ...items.map((item) => Number(item.visits || 0)),
    1,
  );
  wrap.innerHTML =
    items
      .map((item, index) => {
        const visits = Number(item.visits || 0);
        const uniqueIps = Number(item.uniqueIps || 0);
        const width = clampPercent((visits / maxVisits) * 100);
        const peakText = item.peakHourLabel
          ? `피크 ${item.peakHourLabel} ${fmtInt(item.peakHourVisits || 0)}회`
          : "피크 시간 없음";
        return `
        <div class="ops-location-row">
          <span class="ops-location-rank">${index + 1}</span>
          <div class="ops-location-main">
            <div class="ops-location-title">
              <strong>${adminUtil.escapeHtml(item.name || "위치 미확인")}</strong>
              <b>${fmtInt(visits)}회</b>
            </div>
            <em>고유 IP ${fmtInt(uniqueIps)} · ${adminUtil.escapeHtml(peakText)}</em>
            <div class="ops-location-track" aria-hidden="true">
              <i style="width:${width}%"></i>
            </div>
          </div>
        </div>`;
      })
      .join("") +
    `<button type="button" class="ops-location-detail-btn" id="visitorLocationDetailOpen">
      <strong>IP 접속 상세보기</strong>
      <span>기간별 누적 · 월별 일자 데이터</span>
    </button>`;
}

function syncVisitorDetailControls() {
  document.querySelectorAll("[data-visitor-detail-range]").forEach((btn) => {
    const on = btn.dataset.visitorDetailRange === visitorDetailRangeKey;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const picker = document.getElementById("visitorDetailPicker");
  if (picker) picker.hidden = visitorDetailRangeKey !== "custom";
  const startInput = document.getElementById("visitorDetailStart");
  const endInput = document.getElementById("visitorDetailEnd");
  if (startInput && visitorDetailStart)
    startInput.value = dayKey(visitorDetailStart);
  if (endInput && visitorDetailEnd) endInput.value = dayKey(visitorDetailEnd);
  const label = document.getElementById("visitorDetailRangeLabel");
  if (label)
    label.textContent = resolveVisitorDetailRange(visitorDetailRangeKey).label;
}

function openVisitorLocationDetail() {
  const modal = document.getElementById("visitorLocationModal");
  if (!modal) return;
  if (visitorDetailRangeKey !== currentRangeKey) {
    visitorDetailRangeKey = currentRangeKey;
  }
  if (currentRangeKey === "custom") {
    visitorDetailStart = customStart;
    visitorDetailEnd = customEnd;
  }
  modal.hidden = false;
  document.body.classList.add("modal-open");
  syncVisitorDetailControls();
  renderVisitorLocationDetail(null);
  loadVisitorLocationDetail(resolveVisitorDetailRange(visitorDetailRangeKey));
}

function closeVisitorLocationDetail() {
  const modal = document.getElementById("visitorLocationModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

async function loadVisitorLocationDetail(range) {
  const seq = ++visitorLocationDetailLoadSeq;
  try {
    await adminUtil.ensureAuth();
    const params = new URLSearchParams({
      range: visitorDetailRangeKey,
      start: dayKey(range.start),
      end: dayKey(range.end),
    });
    const data = await adminUtil.api(
      `/api/analytics/visitor-locations/detail?${params}`,
    );
    if (seq !== visitorLocationDetailLoadSeq) return;
    renderVisitorLocationDetail(data);
  } catch (e) {
    if (seq !== visitorLocationDetailLoadSeq) return;
    renderVisitorLocationDetail({ error: true });
    console.error("visitor location detail load failed:", e);
  }
}

function renderVisitorLocationDetail(data) {
  const wrap = document.getElementById("visitorLocationDetail");
  if (!wrap) return;
  if (data == null) {
    wrap.innerHTML = '<div class="ops-empty">상세기록을 불러오는 중...</div>';
    return;
  }
  if (data.error) {
    wrap.innerHTML =
      '<div class="ops-empty">상세기록을 불러오지 못했습니다</div>';
    return;
  }
  if (!data.configured) {
    wrap.innerHTML =
      '<div class="ops-empty">IP 접속 기록 저장소가 준비되지 않았습니다</div>';
    return;
  }

  const cumulative = data.cumulative || {};
  const months = data.months || [];
  const topLocations = data.topLocations || [];
  const recentEvents = data.recentEvents || [];

  wrap.innerHTML = `
    <div class="visitor-detail-summary">
      ${visitorDetailMetric("누적 접속", fmtInt(cumulative.visits || 0), "전체 방문 기록")}
      ${visitorDetailMetric("고유 IP", fmtInt(cumulative.uniqueIps || 0), "마스킹 기준")}
      ${visitorDetailMetric("접속 위치", fmtInt(cumulative.locations || 0), "시/지역 단위")}
      ${visitorDetailMetric(
        "최근 접속",
        formatVisitorDetailTime(cumulative.lastSeenAt),
        "마지막 기록",
      )}
    </div>
    <div class="visitor-detail-section">
      <div class="visitor-detail-section-head">
        <h3>누적 위치 데이터</h3>
        <span>상위 5곳</span>
      </div>
      ${renderVisitorDetailTopLocations(topLocations)}
    </div>
    <div class="visitor-detail-section">
      <div class="visitor-detail-section-head">
        <h3>월별 일자 데이터</h3>
        <span>${months.length ? `${fmtInt(months.length)}개월` : "데이터 없음"}</span>
      </div>
      ${renderVisitorDetailMonths(months)}
    </div>
    <div class="visitor-detail-section">
      <div class="visitor-detail-section-head">
        <h3>최근 IP 접속 로그</h3>
        <span>마스킹 IP만 표시</span>
      </div>
      ${renderVisitorDetailEvents(recentEvents)}
    </div>`;
}

function visitorDetailMetric(label, value, sub) {
  return `
    <div class="visitor-detail-metric">
      <span>${adminUtil.escapeHtml(label)}</span>
      <strong>${adminUtil.escapeHtml(String(value || "—"))}</strong>
      <em>${adminUtil.escapeHtml(sub || "")}</em>
    </div>`;
}

function renderVisitorDetailTopLocations(rows) {
  if (!rows.length)
    return '<div class="ops-empty">위치 데이터가 없습니다</div>';
  const maxVisits = Math.max(...rows.map((row) => Number(row.visits || 0)), 1);
  return `<div class="visitor-detail-top-list">
    ${rows
      .slice(0, 5)
      .map((row, index) => {
        const visits = Number(row.visits || 0);
        const width = clampPercent((visits / maxVisits) * 100);
        return `
          <div class="visitor-detail-top-row">
            <span>${index + 1}</span>
            <strong>${adminUtil.escapeHtml(row.name || "위치 미확인")}</strong>
            <em>${fmtInt(visits)}회 · 고유 IP ${fmtInt(row.uniqueIps || 0)}</em>
            <i style="width:${width}%"></i>
          </div>`;
      })
      .join("")}
  </div>`;
}

function renderVisitorDetailMonths(months) {
  if (!months.length)
    return '<div class="ops-empty">일자별 데이터가 없습니다</div>';
  return months
    .map(
      (month) => `
      <details class="visitor-detail-month" open>
        <summary>
          <strong>${formatMonthKey(month.monthKey)}</strong>
          <span>${fmtInt(month.visits || 0)}회 · 고유 IP ${fmtInt(month.uniqueIps || 0)}</span>
        </summary>
        <div class="visitor-detail-day-list">
          ${(month.days || [])
            .map(
              (day) => `
              <div class="visitor-detail-day-row">
                <span>${formatDayKey(day.date)}</span>
                <strong>${fmtInt(day.visits || 0)}회</strong>
                <em>IP ${fmtInt(day.uniqueIps || 0)} · 위치 ${fmtInt(day.locations || 0)}</em>
              </div>`,
            )
            .join("")}
        </div>
      </details>`,
    )
    .join("");
}

function renderVisitorDetailEvents(events) {
  if (!events.length)
    return '<div class="ops-empty">최근 접속 로그가 없습니다</div>';
  return `<div class="visitor-detail-event-list">
    ${events
      .map(
        (event) => `
        <div class="visitor-detail-event-row">
          <div>
            <strong>${adminUtil.escapeHtml(event.ipPrefix || "IP 미확인")}</strong>
            <span>${adminUtil.escapeHtml(event.location || "위치 미확인")}</span>
          </div>
          <em>${adminUtil.escapeHtml(formatVisitorDetailTime(event.eventAt))}</em>
          <p>${adminUtil.escapeHtml(event.path || "/")}${
            event.referrerHost
              ? ` · ${adminUtil.escapeHtml(event.referrerHost)}`
              : ""
          }</p>
        </div>`,
      )
      .join("")}
  </div>`;
}

function formatMonthKey(key) {
  const [year, month] = String(key || "").split("-");
  return year && month ? `${year}년 ${Number(month)}월` : key || "월 미확인";
}

function formatDayKey(key) {
  const date = new Date(`${key}T00:00:00`);
  if (isNaN(+date)) return key || "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatVisitorDetailTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(+date)) return value;
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ========== 실접수 통계 ==========
function normalizeSubmissionSource(value) {
  const key = String(value || "homepage").toLowerCase();
  if (SOURCE_LABELS[key]) return key;
  if (key.includes("facebook") || key.includes("instagram")) return "meta";
  if (key.includes("google")) return "google";
  if (key.includes("naver")) return "naver";
  if (key.includes("youtube")) return "youtube";
  if (key.includes("kakao") || key.includes("daum")) return "kakao";
  return "other";
}

function normalizeTrafficSource(value) {
  const key = String(value || "other").toLowerCase();
  if (SOURCE_LABELS[key]) return key;
  if (
    key.includes("facebook") ||
    key.includes("instagram") ||
    key.includes("meta")
  ) {
    return "meta";
  }
  if (key.includes("google")) return "google";
  if (key.includes("naver")) return "naver";
  if (key.includes("youtube")) return "youtube";
  if (key.includes("kakao") || key.includes("daum")) return "kakao";
  if (key.includes("direct") || key.includes("(direct)")) return "direct";
  if (key.includes("organic") || key.includes("search")) return "search";
  if (key.includes("social")) return "social";
  if (key.includes("referral")) return "referral";
  return sourceKey(value);
}

function buildDayBuckets(range, sourceKeys) {
  const labels = [];
  const buckets = {};
  const days = Math.min(range.days, 120); // 너무 길면 차트 가독성 위해 최근 120일만
  const effectiveStart = new Date(range.end);
  effectiveStart.setHours(0, 0, 0, 0);
  effectiveStart.setDate(effectiveStart.getDate() - (days - 1));

  // 실제 range.start 보다 작지 않게
  const start =
    effectiveStart < range.start ? startOfDay(range.start) : effectiveStart;
  const actualDays = daysBetween(start, range.end);

  for (let i = 0; i < actualDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const k = dayKey(d);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    buckets[k] = {};
    sourceKeys.forEach((source) => {
      buckets[k][source] = 0;
    });
  }
  return { labels, buckets };
}

function renderSubmissionKpis(total, sourceCounts, activeSources) {
  const wrap = document.getElementById("subKpi");
  if (!wrap) return;
  const sourceItems = activeSources
    .map((source) => ({
      source,
      count: Number(sourceCounts[source] || 0),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const items = [
    {
      label: "총 접수",
      value: fmtInt(total),
      sub: total > 0 ? "기간 내 실데이터" : "접수 없음",
    },
    ...sourceItems.map((item) => ({
      label: sourceLabel(item.source),
      value: fmtInt(item.count),
      sub: total > 0 ? `${Math.round((item.count / total) * 100)}%` : "0%",
      source: item.source,
    })),
  ];

  wrap.innerHTML = items
    .map(
      (item) => `
        <div class="sub-kpi-item">
          <div class="sub-kpi-label">
            ${item.source ? `<span class="source-kpi-dot" style="background:${sourceColor(item.source)}"></span>` : ""}
            ${adminUtil.escapeHtml(item.label)}
          </div>
          <div class="sub-kpi-value">${item.value}</div>
          <div class="source-kpi-sub">${adminUtil.escapeHtml(item.sub)}</div>
        </div>`,
    )
    .join("");
}

function buildPeriodRows(rows, period) {
  const buckets = {};
  for (const row of rows) {
    const d = recordDate(row);
    if (!d) continue;
    const key = periodKeyForDate(d, period);
    if (!buckets[key]) {
      buckets[key] = {
        key,
        label: periodLabelForKey(key, period),
        count: 0,
        sort: periodSortTime(key, period),
      };
    }
    buckets[key].count++;
  }
  return Object.values(buckets)
    .sort((a, b) => a.sort - b.sort)
    .slice(-PERIOD_LIMITS[period])
    .reverse();
}

function getForecastStats(range) {
  const today = startOfDay(new Date());
  const basisDate = range.end < today ? startOfDay(range.end) : today;
  const monthStart = new Date(basisDate.getFullYear(), basisDate.getMonth(), 1);
  const monthEnd = endOfDay(
    new Date(basisDate.getFullYear(), basisDate.getMonth() + 1, 0),
  );
  const isCurrentMonth = sameMonth(basisDate, today);
  const countEnd = isCurrentMonth ? endOfDay(today) : monthEnd;
  const previousMonthStart = new Date(
    basisDate.getFullYear(),
    basisDate.getMonth() - 1,
    1,
  );
  const previousMonthEnd = endOfDay(
    new Date(basisDate.getFullYear(), basisDate.getMonth(), 0),
  );
  const monthCount = countRecordsInRange(
    submissionRecords,
    monthStart,
    countEnd,
  );
  const targetCount = countRecordsInRange(
    submissionRecords,
    previousMonthStart,
    previousMonthEnd,
  );
  const elapsedDays = isCurrentMonth
    ? daysBetween(monthStart, today)
    : daysBetween(monthStart, monthEnd);
  const totalDays = daysBetween(monthStart, monthEnd);
  const forecast = isCurrentMonth
    ? Math.round((monthCount / elapsedDays) * totalDays)
    : monthCount;

  return {
    forecast,
    monthCount,
    elapsedDays,
    totalDays,
    targetCount,
    isCurrentMonth,
    monthKey: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
    monthLabel: `${monthStart.getMonth() + 1}월`,
    targetLabel: `${previousMonthStart.getMonth() + 1}월`,
  };
}

function getPreviousRangeStats(range, total) {
  if (range.key === "all") return null;
  const prevEnd = endOfDay(new Date(range.start));
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = startOfDay(new Date(prevEnd));
  prevStart.setDate(prevStart.getDate() - (range.days - 1));
  const prevTotal = countRecordsInRange(submissionRecords, prevStart, prevEnd);
  if (!prevTotal) {
    return total ? "이전 동일기간 0건" : "이전 동일기간 변화 없음";
  }
  const delta = Math.round(((total - prevTotal) / prevTotal) * 100);
  const sign = delta > 0 ? "+" : "";
  return `이전 동일기간 ${sign}${delta}%`;
}

function renderOpsBars(rows, forecastStats) {
  const wrap = document.getElementById("opsBars");
  if (!wrap) return;
  const periodRows = buildPeriodRows(rows, submissionPeriodKey);
  const displayRows = [...periodRows];
  if (
    submissionPeriodKey === "month" &&
    forecastStats?.isCurrentMonth &&
    forecastStats.forecast > forecastStats.monthCount
  ) {
    displayRows.unshift({
      key: "forecast",
      label: `${forecastStats.monthLabel} 예상`,
      count: forecastStats.forecast,
      isForecast: true,
    });
  }
  if (!displayRows.length) {
    wrap.innerHTML = '<div class="ops-empty">접수 데이터가 없습니다</div>';
    return;
  }

  const maxCount = Math.max(...displayRows.map((row) => row.count), 1);
  wrap.innerHTML = displayRows
    .map((row) => {
      const pct = row.count ? clampPercent((row.count / maxCount) * 100) : 0;
      return `
        <div class="ops-bar-row ${row.isForecast ? "is-forecast" : ""}">
          <div class="ops-bar-label">${adminUtil.escapeHtml(row.label)}</div>
          <div class="ops-bar-track" aria-hidden="true">
            <span class="ops-bar-fill" style="width:${pct}%"></span>
          </div>
          <div class="ops-bar-value">${fmtInt(row.count)}건</div>
        </div>`;
    })
    .join("");
}

function renderOpsWeekdays(rows) {
  const wrap = document.getElementById("opsWeekdays");
  if (!wrap) return;
  const counts = Array(7).fill(0);
  for (const row of rows) {
    const d = recordDate(row);
    if (!d) continue;
    counts[(d.getDay() + 6) % 7]++;
  }
  const maxCount = Math.max(...counts, 1);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const avg = total / 7;
  wrap.innerHTML = WEEKDAY_LABELS.map((label, index) => {
    const count = counts[index];
    const pct = count ? clampPercent((count / maxCount) * 100) : 0;
    let tier = "is-neutral";
    if (total > 0) {
      if (!count || count <= avg * 0.45) tier = "is-cold";
      else if (count < avg) tier = "is-cool";
      else if (count === maxCount || count >= avg * 1.35) tier = "is-hot";
      else if (count > avg) tier = "is-warm";
    }
    return `
      <div class="ops-weekday ${tier}">
        <strong>${label}</strong>
        <span>${fmtInt(count)}</span>
        <div class="ops-weekday-meter" aria-hidden="true"><i style="width:${pct}%"></i></div>
      </div>`;
  }).join("");
}

function renderOpsActions(rows, sourceCounts, statusCount, branchCounts) {
  const wrap = document.getElementById("opsActions");
  if (!wrap) return;
  const weekdayCounts = Array(7).fill(0);
  for (const row of rows) {
    const d = recordDate(row);
    if (!d) continue;
    weekdayCounts[(d.getDay() + 6) % 7]++;
  }
  const topWeekdayIndex = weekdayCounts.reduce(
    (best, count, index) => (count > weekdayCounts[best] ? index : best),
    0,
  );
  const topSource = sortEntriesDesc(sourceCounts)[0];
  const topBranch = sortEntriesDesc(branchCounts)[0];
  const pending = Number(statusCount["접수대기"] || 0);
  const dayAgo = Date.now() - 86400000;
  const agedPending = rows.filter((row) => {
    const d = recordDate(row);
    return (
      (row.Status || "접수대기") === "접수대기" && d && d.getTime() < dayAgo
    );
  }).length;
  const items = [
    {
      label: "상담 집중",
      value: rows.length
        ? `${WEEKDAY_LABELS[topWeekdayIndex]}요일 ${fmtInt(weekdayCounts[topWeekdayIndex])}건`
        : "데이터 없음",
    },
    {
      label: "처리 우선",
      value: agedPending
        ? `24시간 초과 ${fmtInt(agedPending)}건`
        : pending
          ? `접수대기 ${fmtInt(pending)}건`
          : "대기 없음",
    },
    {
      label: "유입 집중",
      value: topSource
        ? `${sourceLabel(topSource[0])} ${fmtInt(topSource[1])}건`
        : "데이터 없음",
    },
    {
      label: "지점 확인",
      value: topBranch
        ? `${topBranch[0]} ${fmtInt(topBranch[1])}건`
        : "데이터 없음",
    },
  ];

  wrap.innerHTML = items
    .map(
      (item) => `
        <div class="ops-action">
          <span>${adminUtil.escapeHtml(item.label)}</span>
          <strong>${adminUtil.escapeHtml(item.value)}</strong>
        </div>`,
    )
    .join("");
}

function renderOpsMiniRanks(sourceCounts, branchCounts) {
  const wrap = document.getElementById("opsMiniRanks");
  if (!wrap) return;
  const items = [
    ...sortEntriesDesc(sourceCounts)
      .slice(0, 2)
      .map(([name, count], index) => ({
        label: `출처 ${index + 1}`,
        name: sourceLabel(name),
        count,
      })),
    ...sortEntriesDesc(branchCounts)
      .slice(0, 2)
      .map(([name, count], index) => ({
        label: `지점 ${index + 1}`,
        name,
        count,
      })),
  ];
  if (!items.length) {
    wrap.innerHTML = '<div class="ops-empty">순위 데이터가 없습니다</div>';
    return;
  }
  wrap.innerHTML = items
    .map(
      (item) => `
        <div class="ops-rank">
          <span>${adminUtil.escapeHtml(item.label)}</span>
          <strong>
            <span>${adminUtil.escapeHtml(item.name)}</span>
            <b>${fmtInt(item.count)}건</b>
          </strong>
        </div>`,
    )
    .join("");
}

function buildHeatmapDates(range) {
  const visibleDays = Math.min(daysBetween(range.start, range.end), 35);
  const start = new Date(range.end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (visibleDays - 1));
  const actualStart = start < range.start ? startOfDay(range.start) : start;
  const actualDays = daysBetween(actualStart, range.end);
  return Array.from({ length: actualDays }, (_, index) => {
    const d = new Date(actualStart);
    d.setDate(d.getDate() + index);
    return d;
  });
}

function heatmapLevel(value, maxValue) {
  const n = Number(value) || 0;
  const max = Number(maxValue) || 0;
  if (!n || !max) return 0;
  const ratio = n / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function renderOpsActivityHeatmap(range) {
  const wraps = Array.from(document.querySelectorAll("[data-ops-heatmap]"));
  if (!wraps.length) return;

  const dates = buildHeatmapDates(range);
  const trafficByDate = new Map(
    currentTrafficTrendRows.map((row) => [
      row.date,
      {
        visitors: Number(row.visitors || 0),
        pageviews: Number(row.pageviews || 0),
      },
    ]),
  );
  const submissionsByDate = {};
  for (const row of currentSubmissionRows) {
    const d = recordDate(row);
    if (!d) continue;
    const key = dayKey(d);
    submissionsByDate[key] = (submissionsByDate[key] || 0) + 1;
  }

  const rows = dates.map((date) => {
    const key = dayKey(date);
    const traffic = trafficByDate.get(key) || {};
    return {
      date,
      key,
      visitors: Number(traffic.visitors || 0),
      pageviews: Number(traffic.pageviews || 0),
      submissions: Number(submissionsByDate[key] || 0),
    };
  });
  const totals = rows.reduce(
    (sum, row) => ({
      visitors: sum.visitors + row.visitors,
      pageviews: sum.pageviews + row.pageviews,
      submissions: sum.submissions + row.submissions,
    }),
    { visitors: 0, pageviews: 0, submissions: 0 },
  );
  const hasData = totals.visitors || totals.pageviews || totals.submissions;
  const subText =
    range.days > dates.length
      ? `${range.label} 중 최근 ${dates.length}일`
      : `${range.label} 기준`;
  document.querySelectorAll("[data-ops-heatmap-sub]").forEach((el) => {
    el.textContent = subText;
  });

  if (!hasData) {
    wraps.forEach((wrap) => {
      wrap.innerHTML = '<div class="ops-empty">히트맵 데이터가 없습니다</div>';
      const summary = wrap
        .closest(".ops-heatmap-panel")
        ?.querySelector("[data-ops-heatmap-summary]");
      if (summary) summary.textContent = "";
    });
    return;
  }

  const metrics = [
    {
      key: "visitors",
      label: "방문자",
      className: "is-visitors",
      total: totals.visitors,
      max: Math.max(...rows.map((row) => row.visitors), 0),
    },
    {
      key: "pageviews",
      label: "페이지뷰",
      className: "is-pageviews",
      total: totals.pageviews,
      max: Math.max(...rows.map((row) => row.pageviews), 0),
    },
    {
      key: "submissions",
      label: "접수",
      className: "is-submissions",
      total: totals.submissions,
      max: Math.max(...rows.map((row) => row.submissions), 0),
    },
  ];

  const dateHeaders = dates
    .map((date, index) => {
      const showLabel =
        index === 0 || index === dates.length - 1 || index % 5 === 0;
      return `<div class="ops-heatmap-date">${
        showLabel ? `${date.getMonth() + 1}/${date.getDate()}` : ""
      }</div>`;
    })
    .join("");
  const metricRows = metrics
    .map((metric) => {
      const cells = rows
        .map((row) => {
          const value = Number(row[metric.key] || 0);
          const level = heatmapLevel(value, metric.max);
          const detail = `${row.date.getMonth() + 1}/${row.date.getDate()} · 방문자 ${fmtInt(row.visitors)} · 페이지뷰 ${fmtInt(row.pageviews)} · 접수 ${fmtInt(row.submissions)}`;
          return `
            <button
              type="button"
              class="ops-heatmap-cell ${metric.className} level-${level}"
              title="${adminUtil.escapeHtml(detail)}"
              aria-label="${adminUtil.escapeHtml(detail)}"
              data-detail="${adminUtil.escapeHtml(detail)}"
            ><span>${
              value ? adminUtil.escapeHtml(fmtCompact(value)) : ""
            }</span></button>`;
        })
        .join("");
      return `
        <div class="ops-heatmap-label">
          <strong>${adminUtil.escapeHtml(metric.label)}</strong>
          <span>${fmtCompact(metric.total)}</span>
        </div>
        ${cells}`;
    })
    .join("");

  const gridHtml = `
    <div class="ops-heatmap-grid" style="--heatmap-days:${dates.length}">
      <div class="ops-heatmap-corner"></div>
      ${dateHeaders}
      ${metricRows}
    </div>`;
  const defaultSummary = `합계 방문자 ${fmtInt(totals.visitors)} · 페이지뷰 ${fmtInt(totals.pageviews)} · 접수 ${fmtInt(totals.submissions)}`;
  wraps.forEach((wrap) => {
    const summary = wrap
      .closest(".ops-heatmap-panel")
      ?.querySelector("[data-ops-heatmap-summary]");
    wrap.innerHTML = gridHtml;
    if (summary) summary.textContent = defaultSummary;
    wrap.querySelectorAll(".ops-heatmap-cell").forEach((cell) => {
      const updateSummary = () => {
        if (summary)
          summary.textContent = cell.dataset.detail || defaultSummary;
      };
      cell.addEventListener("mouseenter", updateSummary);
      cell.addEventListener("focus", updateSummary);
      cell.addEventListener("click", updateSummary);
    });
  });
}

function normalizedPathValue(path) {
  const raw = String(path || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.origin);
    return `${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return raw;
  }
}

function isEstimatePagePath(path) {
  const value = normalizedPathValue(path);
  return (
    value.includes("/pages/estimates") ||
    value === "/estimates" ||
    value.startsWith("/estimates?") ||
    value.includes("estimate")
  );
}

function getTrafficTotals() {
  const trendTotals = currentTrafficTrendRows.reduce(
    (sum, row) => ({
      visitors: sum.visitors + Number(row.visitors || 0),
      pageviews: sum.pageviews + Number(row.pageviews || 0),
    }),
    { visitors: 0, pageviews: 0 },
  );
  return {
    visitors:
      Number(currentTrafficSummary?.visitors || 0) || trendTotals.visitors,
    pageviews:
      Number(currentTrafficSummary?.pageviews || 0) || trendTotals.pageviews,
  };
}

function getEstimatePageTraffic() {
  return currentTopPagesRows
    .filter((row) => isEstimatePagePath(row.path || row.page || ""))
    .reduce(
      (sum, row) => ({
        views: sum.views + Number(row.views || row.pageviews || 0),
        visitors: sum.visitors + Number(row.visitors || row.users || 0),
      }),
      { views: 0, visitors: 0 },
    );
}

function renderOpsConversionFunnel() {
  const wrap = document.getElementById("opsConversionFunnel");
  if (!wrap) return;
  const summary = document.getElementById("opsConversionSummary");
  const traffic = getTrafficTotals();
  const estimate = getEstimatePageTraffic();
  const submissions = currentSubmissionRows.length;
  const waitingTraffic =
    !currentTrafficSummary &&
    !currentTrafficTrendRows.length &&
    !currentTopPagesRows.length;
  const waitingSubmissions = submissionRecords == null;

  if (waitingTraffic && waitingSubmissions) {
    wrap.innerHTML = '<div class="ops-empty">불러오는 중...</div>';
    if (summary) summary.textContent = "";
    return;
  }

  if (
    !traffic.visitors &&
    !traffic.pageviews &&
    !estimate.views &&
    !submissions
  ) {
    wrap.innerHTML = '<div class="ops-empty">전환 데이터가 없습니다</div>';
    if (summary) summary.textContent = "";
    return;
  }

  const maxValue = Math.max(traffic.visitors, estimate.views, submissions, 1);
  const estimateSub = estimate.views
    ? `전체 PV 중 ${fmtConversionRate(estimate.views, traffic.pageviews)}`
    : currentTopPagesRows.length
      ? "견적페이지 조회 없음"
      : "인기 페이지 데이터 없음";
  const submissionSub = estimate.views
    ? `견적조회 대비 ${fmtConversionRate(submissions, estimate.views)}`
    : `방문 대비 ${fmtConversionRate(submissions, traffic.visitors)}`;
  const steps = [
    {
      label: "방문자",
      value: traffic.visitors,
      unit: "명",
      sub: `페이지뷰 ${fmtInt(traffic.pageviews)}`,
    },
    {
      label: "견적페이지",
      value: estimate.views,
      unit: "뷰",
      sub: estimateSub,
    },
    {
      label: "접수",
      value: submissions,
      unit: "건",
      sub: submissionSub,
    },
  ];

  wrap.innerHTML = steps
    .map((step, index) => {
      const width = step.value
        ? clampPercent((step.value / maxValue) * 100)
        : 0;
      return `
        <div class="ops-funnel-step">
          <div class="ops-funnel-head">
            <span>${index + 1}. ${adminUtil.escapeHtml(step.label)}</span>
            <strong>${fmtInt(step.value)}${step.unit}</strong>
          </div>
          <div class="ops-funnel-track" aria-hidden="true">
            <i style="width:${width}%"></i>
          </div>
          <em>${adminUtil.escapeHtml(step.sub)}</em>
        </div>`;
    })
    .join("");

  if (summary) {
    summary.textContent = `방문 대비 접수 ${fmtConversionRate(
      submissions,
      traffic.visitors,
    )} · 견적조회 대비 접수 ${fmtConversionRate(submissions, estimate.views)}`;
  }
}

function buildCurrentSubmissionSourceCounts() {
  return currentSubmissionRows.reduce((counts, row) => {
    const key = row.sourceKey || normalizeSubmissionSource(row.Source);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function renderSourceConversion() {
  const wrap = document.getElementById("sourceConversion");
  if (!wrap) return;
  const submissionCounts = buildCurrentSubmissionSourceCounts();
  const trafficMap = new Map();

  currentTrafficSourceRows.forEach((row) => {
    const key = normalizeTrafficSource(row.key || row.name);
    const current = trafficMap.get(key) || {
      key,
      visitors: 0,
      sessions: 0,
    };
    current.visitors += Number(
      row.visitors || row.users || row.activeUsers || 0,
    );
    current.sessions += Number(row.sessions || 0);
    trafficMap.set(key, current);
  });

  const keys = new Set([
    ...trafficMap.keys(),
    ...Object.keys(submissionCounts),
  ]);
  keys.delete("meta");
  if (
    !keys.size &&
    submissionRecords == null &&
    !currentTrafficSourceRows.length
  ) {
    wrap.innerHTML = '<div class="ops-empty">불러오는 중...</div>';
    return;
  }

  const items = Array.from(keys)
    .map((key) => {
      const traffic = trafficMap.get(key) || { visitors: 0, sessions: 0 };
      const denominator = traffic.visitors || traffic.sessions;
      const submissions = Number(submissionCounts[key] || 0);
      const rate = denominator ? submissions / denominator : null;
      return {
        key,
        visitors: traffic.visitors,
        sessions: traffic.sessions,
        denominator,
        submissions,
        rate,
      };
    })
    .filter((item) => item.denominator || item.submissions)
    .sort(
      (a, b) =>
        b.submissions - a.submissions ||
        (b.rate || 0) - (a.rate || 0) ||
        b.denominator - a.denominator,
    )
    .slice(0, 9);

  if (!items.length) {
    wrap.innerHTML =
      '<div class="ops-empty">소스별 전환 데이터가 없습니다</div>';
    return;
  }

  const maxRate = Math.max(...items.map((item) => item.rate || 0), 0.01);
  wrap.innerHTML = items
    .map((item, index) => {
      const trafficName = item.visitors ? "방문자" : "세션";
      const trafficValue = item.denominator ? fmtInt(item.denominator) : "—";
      const width = item.rate ? clampPercent((item.rate / maxRate) * 100) : 0;
      return `
        <div class="ops-conversion-row">
          <div class="ops-conversion-source">
            <span class="source-kpi-dot" style="background:${sourceColor(item.key, index)}"></span>
            <strong>${adminUtil.escapeHtml(sourceLabel(item.key))}</strong>
            <em>${trafficName} ${trafficValue} · 접수 ${fmtInt(item.submissions)}</em>
          </div>
          <div class="ops-conversion-rate">${fmtConversionRate(
            item.submissions,
            item.denominator,
          )}</div>
          <div class="ops-conversion-track" aria-hidden="true">
            <i style="width:${width}%"></i>
          </div>
        </div>`;
    })
    .join("");
}

function renderHourlySubmissionPattern() {
  const wrap = document.getElementById("hourlySubmissions");
  const summary = document.getElementById("hourlySubmissionSummary");
  if (!wrap) return;
  if (submissionRecords == null) {
    wrap.innerHTML = '<div class="ops-empty">불러오는 중...</div>';
    if (summary) summary.innerHTML = "";
    return;
  }
  if (!currentSubmissionRows.length) {
    wrap.innerHTML = '<div class="ops-empty">접수 데이터가 없습니다</div>';
    if (summary) summary.innerHTML = "";
    return;
  }

  const buckets = [
    { label: "심야", time: "00-08시", match: (hour) => hour < 9, late: true },
    {
      label: "오전",
      time: "09-11시",
      match: (hour) => hour >= 9 && hour < 12,
      business: true,
    },
    {
      label: "점심",
      time: "12-13시",
      match: (hour) => hour >= 12 && hour < 14,
      business: true,
    },
    {
      label: "오후",
      time: "14-16시",
      match: (hour) => hour >= 14 && hour < 17,
      business: true,
    },
    {
      label: "저녁",
      time: "17-19시",
      match: (hour) => hour >= 17 && hour < 20,
      business: true,
    },
    { label: "야간", time: "20-23시", match: (hour) => hour >= 20, late: true },
  ].map((bucket) => ({ ...bucket, count: 0 }));

  currentSubmissionRows.forEach((row) => {
    const d = recordDate(row);
    if (!d) return;
    const bucket = buckets.find((item) => item.match(d.getHours()));
    if (bucket) bucket.count++;
  });

  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const avg = total / buckets.length;
  const peakIndex = buckets.reduce(
    (best, bucket, index) =>
      bucket.count > buckets[best].count ? index : best,
    0,
  );
  wrap.innerHTML = buckets
    .map((bucket, index) => {
      const width = bucket.count
        ? clampPercent((bucket.count / maxCount) * 100)
        : 0;
      const tier = !bucket.count
        ? "is-empty"
        : index === peakIndex
          ? "is-hot"
          : bucket.count >= avg
            ? "is-warm"
            : "is-cool";
      return `
        <div class="ops-hour-item ${tier}">
          <div class="ops-hour-head">
            <span>${adminUtil.escapeHtml(bucket.label)}</span>
            <strong>${fmtInt(bucket.count)}건</strong>
          </div>
          <em>${adminUtil.escapeHtml(bucket.time)}</em>
          <div class="ops-hour-meter" aria-hidden="true">
            <i style="width:${width}%"></i>
          </div>
        </div>`;
    })
    .join("");

  if (summary) {
    const peak = buckets[peakIndex];
    const businessCount = buckets
      .filter((bucket) => bucket.business)
      .reduce((sum, bucket) => sum + bucket.count, 0);
    const lateCount = buckets
      .filter((bucket) => bucket.late)
      .reduce((sum, bucket) => sum + bucket.count, 0);
    const summaryItems = [
      {
        label: "피크",
        value: `${peak.label} ${fmtInt(peak.count)}건`,
        sub: peak.time,
      },
      {
        label: "업무시간",
        value: fmtConversionRate(businessCount, total),
        sub: `${fmtInt(businessCount)}건`,
      },
      {
        label: "야간·심야",
        value: fmtConversionRate(lateCount, total),
        sub: `${fmtInt(lateCount)}건`,
      },
    ];
    summary.innerHTML = summaryItems
      .map(
        (item) => `
          <div class="ops-hour-summary-item">
            <span>${adminUtil.escapeHtml(item.label)}</span>
            <strong>${adminUtil.escapeHtml(item.value)}</strong>
            <em>${adminUtil.escapeHtml(item.sub)}</em>
          </div>`,
      )
      .join("");
  }
}

function renderOpsInsights() {
  renderOpsConversionFunnel();
  renderSourceConversion();
  renderHourlySubmissionPattern();
}

function renderOpsCampaigns(campaigns, total) {
  const wrap = document.getElementById("opsCampaigns");
  if (!wrap) return;
  const entries = sortEntriesDesc(campaigns).slice(0, 5);
  if (!entries.length) {
    wrap.innerHTML =
      '<div class="ops-empty">광고명 접수 데이터가 없습니다</div>';
    return;
  }
  const maxCount = Math.max(...entries.map(([, count]) => count), 1);
  wrap.innerHTML = entries
    .map(([name, count], index) => {
      const pct = total ? Math.round((count / total) * 100) : 0;
      const width = clampPercent((count / maxCount) * 100);
      return `
        <div class="ops-campaign">
          <div class="ops-campaign-head">
            <span>${index + 1}</span>
            <strong>${adminUtil.escapeHtml(name)}</strong>
            <b>${fmtInt(count)}건</b>
          </div>
          <div class="ops-campaign-track" aria-hidden="true">
            <i style="width:${width}%"></i>
          </div>
          <em>전체 접수 ${fmtInt(pct)}%</em>
        </div>`;
    })
    .join("");
}

function renderOpsDashboard(
  range,
  rowsInRange,
  sourceCounts,
  statusCount,
  campaigns,
) {
  const total = rowsInRange.length;
  const forecastStats = getForecastStats(range);
  loadTargetSetting(forecastStats.monthKey);
  const effectiveTarget = effectiveTargetFor(forecastStats);
  const targetCount = Number(effectiveTarget.value || 0);
  const targetRate = targetCount
    ? Math.round((forecastStats.forecast / targetCount) * 100)
    : null;
  const currentTargetRate = targetCount
    ? Math.round((forecastStats.monthCount / targetCount) * 100)
    : null;
  const pending = Number(statusCount["접수대기"] || 0);
  const dayAgo = Date.now() - 86400000;
  const agedPending = rowsInRange.filter((row) => {
    const d = recordDate(row);
    return (
      (row.Status || "접수대기") === "접수대기" && d && d.getTime() < dayAgo
    );
  }).length;
  const avg = total / Math.max(1, range.days);
  const branchCounts = {};
  for (const row of rowsInRange) {
    const branch = branchLabel(row.Branch);
    branchCounts[branch] = (branchCounts[branch] || 0) + 1;
  }

  setText("opsCurrent", `${fmtInt(total)}건`);
  setText("opsCurrentSub", `${range.label} · 일평균 ${avg.toFixed(1)}건`);
  setText("opsForecast", `${fmtInt(forecastStats.forecast)}건`);
  setText(
    "opsForecastSub",
    forecastStats.isCurrentMonth
      ? `${forecastStats.monthLabel} ${forecastStats.elapsedDays}일차 기준`
      : `${forecastStats.monthLabel} 실제 마감 기준`,
  );
  setText("opsTargetRate", targetRate == null ? "—" : `${fmtInt(targetRate)}%`);
  setText(
    "opsTargetSub",
    targetCount
      ? effectiveTarget.manual
        ? `현재 ${fmtInt(currentTargetRate)}% · 수동목표 ${fmtInt(targetCount)}건`
        : `현재 ${fmtInt(currentTargetRate)}% · ${forecastStats.targetLabel} ${fmtInt(targetCount)}건 기준`
      : `${forecastStats.targetLabel} 접수 데이터 없음`,
  );
  setText("opsPending", `${fmtInt(pending)}건`);
  setText(
    "opsPendingSub",
    agedPending ? `24시간 초과 ${fmtInt(agedPending)}건` : "즉시 처리 가능",
  );

  const titleMap = {
    month: "월별 접수량 + 예상치",
    week: "주별 접수량 추이",
    day: "일별 접수량 추이",
  };
  setText("opsBarTitle", titleMap[submissionPeriodKey]);
  setText("opsBarSub", `${range.label} 기준`);

  const prevText = getPreviousRangeStats(range, total);
  const target = document.getElementById("opsTarget");
  if (target) {
    target.textContent = prevText
      ? `${range.label} 일평균 ${avg.toFixed(1)}건 · ${prevText}`
      : targetCount
        ? `전체 누적 ${fmtInt(total)}건 · ${effectiveTarget.manual ? "수동목표" : forecastStats.targetLabel + " 기준"} ${fmtInt(targetCount)}건`
        : `전체 누적 ${fmtInt(total)}건 · 전월 기준 데이터 없음`;
  }

  syncTargetControl(forecastStats, effectiveTarget);
  renderOpsBars(rowsInRange, forecastStats);
  renderOpsWeekdays(rowsInRange);
  renderOpsActions(rowsInRange, sourceCounts, statusCount, branchCounts);
  renderOpsCampaigns(campaigns, total);
  renderOpsMiniRanks(sourceCounts, branchCounts);
}

function renderSubmissionStats(range) {
  if (!submissionRecords) return;
  const campaigns = {};
  const statusCount = {};
  const sourceCounts = {};
  const rowsInRange = [];
  const startTs = range.start.getTime();
  const endTs = range.end.getTime();

  for (const r of submissionRecords) {
    const iso = r.SubmittedAt;
    if (!iso) continue;
    const t = Date.parse(iso);
    if (isNaN(t) || t < startTs || t > endTs) continue;
    const src = normalizeSubmissionSource(r.Source);
    rowsInRange.push({ ...r, sourceKey: src });
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    const c = (r.Campaign || "").trim();
    if (c) campaigns[c] = (campaigns[c] || 0) + 1;
    const st = r.Status || "접수대기";
    statusCount[st] = (statusCount[st] || 0) + 1;
  }

  currentSubmissionRows = rowsInRange;
  const activeSources = SUBMISSION_SOURCE_ORDER.filter(
    (source) => sourceCounts[source],
  );
  if (!activeSources.length) activeSources.push("homepage", "meta");

  const { labels, buckets } = buildDayBuckets(range, activeSources);
  for (const r of rowsInRange) {
    const d = new Date(r.SubmittedAt);
    const k = dayKey(d);
    if (buckets[k] && r.sourceKey in buckets[k]) buckets[k][r.sourceKey]++;
  }

  const total = rowsInRange.length;
  renderSubmissionKpis(total, sourceCounts, activeSources);
  renderOpsDashboard(range, rowsInRange, sourceCounts, statusCount, campaigns);
  renderOpsActivityHeatmap(range);
  renderOpsInsights(range);

  const series = {};
  activeSources.forEach((source) => {
    series[source] = [];
  });
  for (const k of Object.keys(buckets)) {
    activeSources.forEach((source) => {
      series[source].push(buckets[k][source] || 0);
    });
  }

  const submissionsCanvas = document.getElementById("chartSubmissions");
  if (submissionsCanvas) {
    const ctx = submissionsCanvas.getContext("2d");
    if (submissionsChart) submissionsChart.destroy();
    submissionsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: activeSources.map((source) => ({
          label: sourceLabel(source),
          data: series[source],
          backgroundColor: sourceColor(source),
          borderRadius: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: {
          barTotalLabel: {},
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, boxWidth: 8 },
          },
          tooltip: { mode: "index", intersect: false },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: "rgba(0,0,0,0.06)" },
          },
        },
      },
      plugins: [barTotalLabelPlugin],
    });
  } else if (submissionsChart) {
    submissionsChart.destroy();
    submissionsChart = null;
  }

  const statusLabels = Object.keys(statusCount);
  const statusValues = statusLabels.map((k) => statusCount[k]);
  const statusColors = statusLabels.map(
    (k) => STATUS_COLORS[k] || PALETTE.muted,
  );
  const statusCanvas = document.getElementById("chartStatus");
  if (statusCanvas) {
    const sctx = statusCanvas.getContext("2d");
    if (statusChart) statusChart.destroy();
    statusChart = new Chart(sctx, {
      type: "doughnut",
      data: {
        labels: statusLabels.length ? statusLabels : ["데이터 없음"],
        datasets: [
          {
            data: statusValues.length ? statusValues : [1],
            backgroundColor: statusColors.length ? statusColors : ["#e5e7eb"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: doughnutLegendPos(),
            labels: { usePointStyle: true, boxWidth: 8 },
          },
        },
      },
    });
  }

  const tbody = document.querySelector("#topCampaignsTable tbody");
  if (!tbody) return;
  const campEntries = Object.entries(campaigns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!campEntries.length) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="empty-state">캠페인 데이터 없음</td></tr>';
  } else {
    tbody.innerHTML = campEntries
      .map(
        ([name, count], i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td class="path">${adminUtil.escapeHtml(name)}</td>
          <td class="num" style="text-align:right">${fmtInt(count)}</td>
        </tr>`,
      )
      .join("");
  }
}

// ========== 기간 적용 ==========
function applyRange(key) {
  currentRangeKey = key;
  document.querySelectorAll(".seg-btn[data-range]").forEach((btn) => {
    const on = btn.dataset.range === key;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  const picker = document.getElementById("rangePicker");
  if (picker) picker.hidden = key !== "custom";

  const range = resolveRange(key);
  const label = document.getElementById("rangeLabel");
  if (label) label.textContent = range.label;

  renderAnalyticsEmpty();
  renderVisitorLocations(null);
  loadTrafficAnalytics(range);
  loadVisitorLocations(range);
  renderSubmissionStats(range);
}

function setSubmissionPeriod(period) {
  if (!PERIOD_LIMITS[period]) return;
  submissionPeriodKey = period;
  document.querySelectorAll(".ops-period-btn").forEach((btn) => {
    const on = btn.dataset.period === period;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  renderSubmissionStats(resolveRange(currentRangeKey));
}

document.querySelectorAll(".seg-btn[data-range]").forEach((btn) => {
  btn.addEventListener("click", () => applyRange(btn.dataset.range));
});

document.querySelectorAll(".ops-period-btn").forEach((btn) => {
  btn.addEventListener("click", () => setSubmissionPeriod(btn.dataset.period));
});

(function initVisitorLocationDetailModal() {
  document.addEventListener("click", (event) => {
    const open = event.target.closest("#visitorLocationDetailOpen");
    if (open) {
      openVisitorLocationDetail();
      return;
    }
    if (event.target.closest("[data-visitor-location-close]")) {
      closeVisitorLocationDetail();
    }
  });

  document.querySelectorAll("[data-visitor-detail-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      visitorDetailRangeKey = btn.dataset.visitorDetailRange || "30";
      syncVisitorDetailControls();
      if (visitorDetailRangeKey !== "custom") {
        loadVisitorLocationDetail(
          resolveVisitorDetailRange(visitorDetailRangeKey),
        );
      }
    });
  });

  const apply = document.getElementById("visitorDetailApply");
  if (apply) {
    apply.addEventListener("click", () => {
      const startInput = document.getElementById("visitorDetailStart");
      const endInput = document.getElementById("visitorDetailEnd");
      const start = startInput?.value
        ? new Date(`${startInput.value}T00:00:00`)
        : null;
      const end = endInput?.value
        ? new Date(`${endInput.value}T00:00:00`)
        : null;
      if (!start || !end || isNaN(+start) || isNaN(+end) || start > end) {
        adminUtil.toast("상세조회 기간을 확인해주세요", "error");
        return;
      }
      visitorDetailStart = start;
      visitorDetailEnd = end;
      visitorDetailRangeKey = "custom";
      syncVisitorDetailControls();
      loadVisitorLocationDetail(resolveVisitorDetailRange("custom"));
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeVisitorLocationDetail();
  });
})();

(function initTargetControl() {
  const manual = document.getElementById("opsTargetManual");
  const input = document.getElementById("opsTargetInput");
  if (!manual || !input) return;

  manual.addEventListener("change", () => {
    if (!submissionRecords) return;
    const forecastStats = getForecastStats(resolveRange(currentRangeKey));
    const current = targetSettingFor(forecastStats.monthKey);
    const value = Math.max(
      0,
      Math.round(
        Number(input.value || current.value || forecastStats.targetCount || 0),
      ),
    );
    saveTargetSetting(forecastStats.monthKey, {
      manual: manual.checked,
      value,
    });
    input.disabled = !manual.checked;
    renderSubmissionStats(resolveRange(currentRangeKey));
  });

  input.addEventListener("change", () => {
    if (!submissionRecords || !manual.checked) return;
    const forecastStats = getForecastStats(resolveRange(currentRangeKey));
    const value = Math.max(0, Math.round(Number(input.value || 0)));
    saveTargetSetting(forecastStats.monthKey, { manual: true, value });
    renderSubmissionStats(resolveRange(currentRangeKey));
  });
})();

// 선택기간: 적용 버튼 / 날짜 변경 핸들러
(function initRangePicker() {
  const today = startOfDay(new Date());
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 29);

  const inpStart = document.getElementById("rangeStart");
  const inpEnd = document.getElementById("rangeEnd");
  if (inpStart) inpStart.value = dayKey(monthAgo);
  if (inpEnd) inpEnd.value = dayKey(today);

  const btn = document.getElementById("btnApplyRange");
  btn?.addEventListener("click", () => {
    const s = inpStart?.value ? new Date(inpStart.value) : null;
    const e = inpEnd?.value ? new Date(inpEnd.value) : null;
    if (!s || !e || isNaN(+s) || isNaN(+e)) {
      adminUtil.toast("시작·종료 날짜를 모두 선택해주세요");
      return;
    }
    if (s > e) {
      adminUtil.toast("시작일이 종료일보다 뒤에 있습니다");
      return;
    }
    customStart = s;
    customEnd = e;
    applyRange("custom");
  });
})();

async function loadSubmissionRecords() {
  try {
    await adminUtil.ensureAuth();
    const d = await adminUtil.apiCached("/api/estimates", { ttl: 60_000 });
    submissionRecords = d.records || [];
    renderSubmissionStats(resolveRange(currentRangeKey));
  } catch (e) {
    currentSubmissionRows = [];
    renderOpsActivityHeatmap(resolveRange(currentRangeKey));
    renderOpsInsights(resolveRange(currentRangeKey));
    const subKpi = document.getElementById("subKpi");
    if (subKpi) {
      subKpi.innerHTML =
        '<div class="sub-kpi-item"><div class="sub-kpi-label">총 접수</div><div class="sub-kpi-value">—</div><div class="source-kpi-sub">불러오기 실패</div></div>';
    }
    console.error("submission stats load failed:", e);
  }
}

// 창 폭이 바뀌면 legend 위치 갱신을 위해 다시 렌더
let resizeT = null;
let lastNarrow = isNarrow();
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    const narrow = isNarrow();
    if (narrow !== lastNarrow) {
      lastNarrow = narrow;
      applyRange(currentRangeKey);
    }
  }, 200);
});

applyRange("today");
loadSubmissionRecords();
