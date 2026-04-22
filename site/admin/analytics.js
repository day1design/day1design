// ========== 유입통계 (스켈레톤 / 예시 데이터) ==========
// 도메인 연결 후 GA4 Data API + Search Console API 에 연결 예정.
// 유입통계(상단 KPI/차트/인기페이지/유입경로)는 예시 데이터이며,
// 접수통계(하단)는 실제 Airtable 데이터 기반.

const PALETTE = {
  primary: "#1a2f4e",
  accent: "#c2a679",
  muted: "#8a93a6",
  bg: "rgba(26, 47, 78, 0.08)",
  sources: ["#1a2f4e", "#c2a679", "#6b8cae", "#b8c0cc"],
};

const STATUS_COLORS = {
  접수대기: "#f59e0b",
  상담중: "#3b82f6",
  견적완료: "#10b981",
  계약완료: "#059669",
  취소: "#ef4444",
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

// 7일 / 30일 기본 MOCK — 다른 기간은 30일 데이터를 일수에 맞게 스케일
let trendChart = null;
let sourcesChart = null;
let submissionsChart = null;
let statusChart = null;
let submissionRecords = null;
let currentRangeKey = "30";
let customStart = null; // Date (KST 자정)
let customEnd = null; // Date (KST 23:59)

// ========== 공통 유틸 ==========
function fmtInt(n) {
  return Number(n).toLocaleString("ko-KR");
}

function fmtDelta(n, { invert = false } = {}) {
  if (n == null) return "—";
  const sign = n > 0 ? "▲" : n < 0 ? "▼" : "=";
  const good = invert ? n < 0 : n > 0;
  const cls = n === 0 ? "flat" : good ? "up" : "down";
  return `<span class="delta ${cls}">${sign} ${Math.abs(n)}%</span>`;
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

// ========== 기간 범위 해석 ==========
function resolveRange(key) {
  const today = startOfDay(new Date());
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

// ========== 유입통계 (GA4 연결 대기) ==========
// 실 데이터 연결 전: KPI/차트/인기페이지는 빈 상태로 렌더.
function showChartPlaceholder(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  canvas.style.display = "none";
  if (!wrap.querySelector(".chart-placeholder")) {
    const ph = document.createElement("div");
    ph.className = "chart-placeholder";
    ph.textContent = "GA4 연동 후 표시됩니다";
    wrap.appendChild(ph);
  }
}

function renderAnalyticsEmpty() {
  ["kpiVisitors", "kpiPageviews", "kpiDuration", "kpiBounce"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  });
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
  showChartPlaceholder("chartTrend");
  showChartPlaceholder("chartSources");
  const tbody = document.querySelector("#topPagesTable tbody");
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="empty-state">GA4 연동 후 표시됩니다</td></tr>';
  }
}

// pageLabel 은 향후 GA4 데이터 연결 시 path → "영문 - 한글" 라벨 변환용 (아직 미사용).

// ========== 실접수 통계 (Airtable) ==========
function buildDayBuckets(range) {
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
    buckets[k] = { homepage: 0, meta: 0 };
  }
  return { labels, buckets };
}

function renderSubmissionStats(range) {
  if (!submissionRecords) return;
  const { labels, buckets } = buildDayBuckets(range);
  const campaigns = {};
  const statusCount = {};
  let homepageTotal = 0;
  let metaTotal = 0;
  const startTs = range.start.getTime();
  const endTs = range.end.getTime();

  for (const r of submissionRecords) {
    const iso = r.SubmittedAt;
    if (!iso) continue;
    const t = Date.parse(iso);
    if (isNaN(t) || t < startTs || t > endTs) continue;
    const d = new Date(iso);
    const k = dayKey(d);
    const src =
      (r.Source || "homepage").toLowerCase() === "meta" ? "meta" : "homepage";
    if (buckets[k]) buckets[k][src]++;
    if (src === "meta") {
      metaTotal++;
      const c = (r.Campaign || "").trim();
      if (c) campaigns[c] = (campaigns[c] || 0) + 1;
    } else {
      homepageTotal++;
    }
    const st = r.Status || "접수대기";
    statusCount[st] = (statusCount[st] || 0) + 1;
  }

  const total = homepageTotal + metaTotal;
  document.getElementById("subTotal").textContent = fmtInt(total);
  document.getElementById("subHomepage").textContent = fmtInt(homepageTotal);
  document.getElementById("subMeta").textContent = fmtInt(metaTotal);
  document.getElementById("subMetaRatio").textContent =
    total > 0 ? `${Math.round((metaTotal / total) * 100)}%` : "—";

  const homeSeries = [];
  const metaSeries = [];
  for (const k of Object.keys(buckets)) {
    homeSeries.push(buckets[k].homepage);
    metaSeries.push(buckets[k].meta);
  }

  const ctx = document.getElementById("chartSubmissions").getContext("2d");
  if (submissionsChart) submissionsChart.destroy();
  submissionsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "홈페이지",
          data: homeSeries,
          backgroundColor: PALETTE.primary,
          borderRadius: 2,
        },
        {
          label: "Meta 광고",
          data: metaSeries,
          backgroundColor: PALETTE.accent,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
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
  });

  const statusLabels = Object.keys(statusCount);
  const statusValues = statusLabels.map((k) => statusCount[k]);
  const statusColors = statusLabels.map(
    (k) => STATUS_COLORS[k] || PALETTE.muted,
  );
  const sctx = document.getElementById("chartStatus").getContext("2d");
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

  const tbody = document.querySelector("#topCampaignsTable tbody");
  const campEntries = Object.entries(campaigns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!campEntries.length) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="empty-state">Meta 캠페인 접수 없음</td></tr>';
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
  document.querySelectorAll(".seg-btn").forEach((btn) => {
    const on = btn.dataset.range === key;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  const picker = document.getElementById("rangePicker");
  if (picker) picker.hidden = key !== "custom";

  const range = resolveRange(key);
  const label = document.getElementById("rangeLabel");
  if (label) label.textContent = range.label;

  // 유입통계 상단은 GA4 연동 대기 상태로만 렌더. 기간 필터는 하단 실접수에만 영향.
  renderAnalyticsEmpty();
  renderSubmissionStats(range);
}

document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyRange(btn.dataset.range));
});

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
    document.getElementById("subTotal").textContent = "—";
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

applyRange("30");
loadSubmissionRecords();
