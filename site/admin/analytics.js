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
    sources: { Direct: 41, Organic: 32, Social: 18, Referral: 9 },
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
    sources: { Direct: 45, Organic: 30, Social: 15, Referral: 10 },
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
    sources: { Direct: 43, Organic: 34, Social: 14, Referral: 9 },
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
}

document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyRange(Number(btn.dataset.range)));
});

applyRange(30);
