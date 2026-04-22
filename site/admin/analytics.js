// ========== 유입통계 (스켈레톤 / 예시 데이터) ==========
// 도메인 연결 후 GA4 Data API + Search Console API 에 연결 예정.
// 현재는 mock 데이터로 레이아웃/차트만 구성한다.

const MOCK = {
  7: {
    visitors: 287,
    pageviews: 842,
    duration: "1:48",
    bounce: "46%",
    delta: { visitors: +8, pageviews: +11, duration: -3, bounce: +2 },
    trend: {
      labels: ["5/22", "5/23", "5/24", "5/25", "5/26", "5/27", "5/28"],
      visitors: [34, 41, 28, 47, 52, 39, 46],
      pageviews: [98, 121, 74, 142, 156, 118, 133],
    },
    topPages: [
      { path: "/", views: 312 },
      { path: "/pages/portfolio.html", views: 186 },
      { path: "/pages/community.html", views: 94 },
      { path: "/pages/estimates.html", views: 72 },
      { path: "/pages/about.html", views: 58 },
      { path: "/pages/residential.html", views: 44 },
      { path: "/pages/commercial.html", views: 38 },
      { path: "/pages/community-detail.html", views: 21 },
      { path: "/pages/portfolio-detail.html", views: 12 },
      { path: "/pages/process.html", views: 5 },
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
    trend: {
      labels: Array.from({ length: 30 }, (_, i) => `D-${29 - i}`),
      visitors: [
        28, 34, 41, 39, 46, 52, 38, 45, 51, 48, 44, 39, 42, 47, 53, 58, 55, 49,
        42, 46, 51, 54, 60, 52, 47, 44, 48, 53, 58, 62,
      ],
      pageviews: [
        82, 112, 134, 128, 146, 162, 124, 138, 152, 148, 142, 126, 136, 148,
        164, 178, 172, 156, 138, 146, 158, 168, 184, 164, 152, 144, 156, 168,
        182, 196,
      ],
    },
    topPages: [
      { path: "/", views: 1842 },
      { path: "/pages/portfolio.html", views: 1124 },
      { path: "/pages/community.html", views: 648 },
      { path: "/pages/estimates.html", views: 512 },
      { path: "/pages/about.html", views: 384 },
      { path: "/pages/residential.html", views: 296 },
      { path: "/pages/commercial.html", views: 248 },
      { path: "/pages/community-detail.html", views: 156 },
      { path: "/pages/portfolio-detail.html", views: 104 },
      { path: "/pages/process.html", views: 68 },
    ],
    sources: {
      "직접 유입": 45,
      "검색 유입": 30,
      "소셜 유입": 15,
      "추천 유입": 10,
    },
  },
  90: {
    visitors: 3812,
    pageviews: 16240,
    duration: "2:22",
    bounce: "44%",
    delta: { visitors: +18, pageviews: +14, duration: +2, bounce: -1 },
    trend: {
      labels: Array.from({ length: 12 }, (_, i) => `W${i + 1}`),
      visitors: [248, 286, 312, 298, 324, 356, 384, 392, 358, 342, 368, 412],
      pageviews: [
        1042, 1186, 1324, 1268, 1384, 1512, 1638, 1672, 1526, 1458, 1568, 1762,
      ],
    },
    topPages: [
      { path: "/", views: 5284 },
      { path: "/pages/portfolio.html", views: 3124 },
      { path: "/pages/community.html", views: 1884 },
      { path: "/pages/estimates.html", views: 1412 },
      { path: "/pages/about.html", views: 1058 },
      { path: "/pages/residential.html", views: 842 },
      { path: "/pages/commercial.html", views: 694 },
      { path: "/pages/community-detail.html", views: 442 },
      { path: "/pages/portfolio-detail.html", views: 284 },
      { path: "/pages/process.html", views: 196 },
    ],
    sources: {
      "직접 유입": 43,
      "검색 유입": 34,
      "소셜 유입": 14,
      "추천 유입": 9,
    },
  },
};

const PALETTE = {
  primary: "#1a2f4e",
  accent: "#c2a679",
  muted: "#8a93a6",
  bg: "rgba(26, 47, 78, 0.08)",
  sources: ["#1a2f4e", "#c2a679", "#6b8cae", "#b8c0cc"],
};

let trendChart = null;
let sourcesChart = null;
let currentRange = 30;

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
  // 이탈률은 낮을수록 좋음 → invert
  document.getElementById("kpiBounceDelta").innerHTML = fmtDelta(
    data.delta.bounce,
    { invert: true },
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
          position: "right",
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
        <td class="path">${adminUtil.escapeHtml(p.path)}</td>
        <td class="num" style="text-align:right">${fmtInt(p.views)}</td>
      </tr>`,
    )
    .join("");
}

function applyRange(range) {
  currentRange = range;
  document.querySelectorAll(".seg-btn").forEach((btn) => {
    const on = Number(btn.dataset.range) === range;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const data = MOCK[range] || MOCK[30];
  renderKPI(data);
  renderTrend(data);
  renderSources(data);
  renderTopPages(data);
  // 실접수 통계도 기간에 맞춰 재계산
  renderSubmissionStats(range);
}

document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyRange(Number(btn.dataset.range)));
});

// ========== 실접수 통계 (Airtable 실데이터) ==========
let submissionRecords = null;
let submissionsChart = null;
let statusChart = null;
const STATUS_COLORS = {
  접수대기: "#f59e0b",
  상담중: "#3b82f6",
  견적완료: "#10b981",
  계약완료: "#059669",
  취소: "#ef4444",
};

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDayBuckets(range) {
  const labels = [];
  const buckets = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
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
  const sinceTs = Date.now() - range * 24 * 60 * 60 * 1000;

  for (const r of submissionRecords) {
    const iso = r.SubmittedAt;
    if (!iso) continue;
    const t = Date.parse(iso);
    if (isNaN(t) || t < sinceTs) continue;
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

  // 접수 추이 스택 바 차트
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

  // 상태별 분포
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
          position: "right",
          labels: { usePointStyle: true, boxWidth: 8 },
        },
      },
    },
  });

  // 캠페인 TOP 5
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

async function loadSubmissionRecords() {
  try {
    await adminUtil.ensureAuth();
    const d = await adminUtil.apiCached("/api/estimates", { ttl: 60_000 });
    submissionRecords = d.records || [];
    renderSubmissionStats(currentRange);
  } catch (e) {
    document.getElementById("subTotal").textContent = "—";
    console.error("submission stats load failed:", e);
  }
}

applyRange(30);
loadSubmissionRecords();
