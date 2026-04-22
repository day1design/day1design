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

// 페이지 경로 → 한글 메뉴명 매핑 (사이트 헤더 네비 기준)
const PAGE_LABELS = [
  { match: (p) => p === "/" || p === "/index.html", label: "메인" },
  { match: (p) => p.startsWith("/pages/about"), label: "회사소개" },
  {
    match: (p) => p.startsWith("/pages/project-flow"),
    label: "프로젝트 플로우",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]cat=office/.test(p),
    label: "포트폴리오 · OFFICE",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]size=20-30/.test(p),
    label: "포트폴리오 · 20~30평",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]size=30-40/.test(p),
    label: "포트폴리오 · 30~40평",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]size=40-50/.test(p),
    label: "포트폴리오 · 40~50평",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio") && /[?&]size=50/.test(p),
    label: "포트폴리오 · 50평 이상",
  },
  {
    match: (p) => p.startsWith("/pages/portfolio-detail"),
    label: "포트폴리오 상세",
  },
  { match: (p) => p.startsWith("/pages/portfolio"), label: "포트폴리오" },
  {
    match: (p) => p.startsWith("/pages/community-detail"),
    label: "커뮤니티 · 상세",
  },
  { match: (p) => p.startsWith("/pages/community"), label: "커뮤니티" },
  { match: (p) => p.startsWith("/pages/estimates"), label: "견적문의" },
];

function pageLabel(path) {
  if (!path) return "";
  for (const row of PAGE_LABELS) {
    if (row.match(path)) return row.label;
  }
  return path;
}

// 7일 / 30일 기본 MOCK — 다른 기간은 30일 데이터를 일수에 맞게 스케일
const MOCK_BASE = {
  7: {
    visitors: 287,
    pageviews: 842,
    duration: "1:48",
    bounce: "46%",
    delta: { visitors: +8, pageviews: +11, duration: -3, bounce: +2 },
    trendDaily: { visitors: 41, pageviews: 120 },
    topPages: [
      { path: "/", views: 312 },
      { path: "/pages/portfolio.html", views: 186 },
      { path: "/pages/community.html", views: 94 },
      { path: "/pages/estimates.html", views: 72 },
      { path: "/pages/about.html", views: 58 },
      { path: "/pages/portfolio.html?cat=office", views: 44 },
      { path: "/pages/portfolio.html?size=30-40", views: 38 },
      { path: "/pages/community-detail.html", views: 21 },
      { path: "/pages/project-flow.html", views: 12 },
      { path: "/pages/portfolio.html?size=20-30", views: 5 },
    ],
    sources: {
      "직접 유입": 41,
      "검색 유입": 32,
      "소셜 유입": 18,
      "추천 유입": 9,
    },
  },
  30: {
    visitors: 1234,
    pageviews: 5678,
    duration: "2:34",
    bounce: "42%",
    delta: { visitors: +12, pageviews: +8, duration: +5, bounce: -3 },
    trendDaily: { visitors: 41, pageviews: 189 },
    topPages: [
      { path: "/", views: 1842 },
      { path: "/pages/portfolio.html", views: 1124 },
      { path: "/pages/community.html", views: 648 },
      { path: "/pages/estimates.html", views: 512 },
      { path: "/pages/about.html", views: 384 },
      { path: "/pages/portfolio.html?cat=office", views: 296 },
      { path: "/pages/portfolio.html?size=30-40", views: 248 },
      { path: "/pages/community-detail.html", views: 156 },
      { path: "/pages/project-flow.html", views: 104 },
      { path: "/pages/portfolio.html?size=20-30", views: 68 },
    ],
    sources: {
      "직접 유입": 45,
      "검색 유입": 30,
      "소셜 유입": 15,
      "추천 유입": 10,
    },
  },
};

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

// ========== 유입통계 (예시) ==========
function mockForRange(range) {
  // 실 데이터 연결 전이라 기간별 근사치 스케일링만 제공.
  const base = range.days <= 14 ? MOCK_BASE[7] : MOCK_BASE[30];
  const baseDays = range.days <= 14 ? 7 : 30;
  const scale = range.days / baseDays;
  const visitors = Math.round(base.visitors * scale);
  const pageviews = Math.round(base.pageviews * scale);

  // 일별 추이
  const labels = [];
  const visitorSeries = [];
  const pageviewSeries = [];
  const seed = range.start.getTime() / 86400000;
  for (let i = 0; i < Math.min(range.days, 60); i++) {
    const d = new Date(range.start);
    d.setDate(d.getDate() + i);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    // 일관된 pseudo-random (seed 기반)
    const r1 =
      ((Math.sin(seed + i * 1.3) + 1) * 0.4 + 0.8) * base.trendDaily.visitors;
    const r2 =
      ((Math.sin(seed + i * 0.9 + 5) + 1) * 0.4 + 0.8) *
      base.trendDaily.pageviews;
    visitorSeries.push(Math.round(r1));
    pageviewSeries.push(Math.round(r2));
  }

  // 60일 넘으면 주 단위로 집계해서 라벨 간소화
  if (range.days > 60) {
    const buckets = Math.min(26, Math.ceil(range.days / 7));
    const wLabels = [];
    const wVisitors = [];
    const wPageviews = [];
    for (let w = 0; w < buckets; w++) {
      wLabels.push(`W${w + 1}`);
      wVisitors.push(
        Math.round(
          base.trendDaily.visitors * 7 * (0.8 + 0.4 * Math.sin(seed + w)),
        ),
      );
      wPageviews.push(
        Math.round(
          base.trendDaily.pageviews * 7 * (0.8 + 0.4 * Math.sin(seed + w + 3)),
        ),
      );
    }
    return {
      visitors,
      pageviews,
      duration: base.duration,
      bounce: base.bounce,
      delta: base.delta,
      trend: {
        labels: wLabels,
        visitors: wVisitors,
        pageviews: wPageviews,
      },
      topPages: base.topPages.map((p) => ({
        ...p,
        views: Math.round(p.views * scale),
      })),
      sources: base.sources,
    };
  }

  return {
    visitors,
    pageviews,
    duration: base.duration,
    bounce: base.bounce,
    delta: base.delta,
    trend: {
      labels,
      visitors: visitorSeries,
      pageviews: pageviewSeries,
    },
    topPages: base.topPages.map((p) => ({
      ...p,
      views: Math.round(p.views * scale),
    })),
    sources: base.sources,
  };
}

function renderKPI(data) {
  document.getElementById("kpiVisitors").textContent = fmtInt(data.visitors);
  document.getElementById("kpiPageviews").textContent = fmtInt(data.pageviews);
  document.getElementById("kpiDuration").textContent = data.duration;
  document.getElementById("kpiBounce").textContent = data.bounce;

  document.getElementById("kpiVisitorsDelta").innerHTML = fmtDelta(
    data.delta.visitors,
  );
  document.getElementById("kpiPageviewsDelta").innerHTML = fmtDelta(
    data.delta.pageviews,
  );
  document.getElementById("kpiDurationDelta").innerHTML = fmtDelta(
    data.delta.duration,
  );
  document.getElementById("kpiBounceDelta").innerHTML = fmtDelta(
    data.delta.bounce,
    {
      invert: true,
    },
  );
}

function renderTrend(data) {
  const ctx = document.getElementById("chartTrend").getContext("2d");
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.trend.labels,
      datasets: [
        {
          label: "방문자",
          data: data.trend.visitors,
          borderColor: PALETTE.primary,
          backgroundColor: PALETTE.bg,
          tension: 0.35,
          fill: true,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: "페이지뷰",
          data: data.trend.pageviews,
          borderColor: PALETTE.accent,
          backgroundColor: "transparent",
          tension: 0.35,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2,
          borderDash: [4, 4],
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
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.06)" } },
      },
      interaction: { mode: "nearest", intersect: false },
    },
  });
}

function renderSources(data) {
  const ctx = document.getElementById("chartSources").getContext("2d");
  if (sourcesChart) sourcesChart.destroy();
  const labels = Object.keys(data.sources);
  const values = Object.values(data.sources);
  sourcesChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: PALETTE.sources,
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
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label} — ${ctx.parsed}%`,
          },
        },
      },
    },
  });
}

function renderTopPages(data) {
  const tbody = document.querySelector("#topPagesTable tbody");
  tbody.innerHTML = data.topPages
    .map(
      (p, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="path" title="${adminUtil.escapeHtml(p.path)}">${adminUtil.escapeHtml(pageLabel(p.path))}</td>
        <td class="num" style="text-align:right">${fmtInt(p.views)}</td>
      </tr>`,
    )
    .join("");
}

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

  const data = mockForRange(range);
  renderKPI(data);
  renderTrend(data);
  renderSources(data);
  renderTopPages(data);
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
