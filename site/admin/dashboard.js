// ========== DASHBOARD ==========
// 각 관리 메뉴 카드의 카운트 + 유입/접수 요약 KPI + 최근 접수 미리보기.
// admin.js 이후에 defer 로드되어 adminUtil 이 준비된 상태에서 실행됨.

(function () {
  const $ = (id) => document.getElementById(id);

  // 유입 요약 — GA4 summary 가져와 4종 KPI 표시
  async function renderAnalyticsSummary() {
    const setLoading = () => {
      $("dashVisitors").textContent = "—";
      $("dashPageviews").textContent = "—";
      $("dashDuration").textContent = "—";
      $("dashBounce").textContent = "—";
    };
    setLoading();
    try {
      const d = await adminUtil.apiCached("/api/analytics/summary", {
        ttl: 60_000,
      });
      const s = d?.summary || {};
      const fmt = (v) =>
        typeof v === "number" ? v.toLocaleString("ko-KR") : v ? String(v) : "—";
      const fmtDur = (sec) => {
        const n = Number(sec) || 0;
        const m = Math.floor(n / 60);
        const r = Math.floor(n % 60);
        return `${m}:${String(r).padStart(2, "0")}`;
      };
      const fmtPct = (v) =>
        typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—";
      $("dashVisitors").textContent = fmt(s.visitors);
      $("dashPageviews").textContent = fmt(s.pageviews);
      $("dashDuration").textContent =
        s.avgDurationSec != null ? fmtDur(s.avgDurationSec) : "—";
      $("dashBounce").textContent =
        s.bounceRate != null ? fmtPct(s.bounceRate) : "—";
    } catch (e) {
      console.warn("[dashboard] analytics summary load failed", e);
    }
  }

  async function loadSubmissionSummary() {
    try {
      const d = await adminUtil.api('/api/admin/dashboard');
      const counts = d.counts || {};
      for (const [id, key] of [['statEstimates','estimates'],['statHero','hero'],['statPortfolio','portfolio'],['statCommunity','community']]) {
        if ($(id)) $(id).textContent = Number(counts[key] || 0).toLocaleString('ko-KR');
      }
      const {total=0,meta=0,home=0,pending=0}=d.submissions || {};
      $("dashSubTotal").textContent = total.toLocaleString("ko-KR");
      $("dashSubTotalAll").textContent =
        `전체 ${Number(counts.estimates || 0).toLocaleString("ko-KR")}건`;
      $("dashSubHomepage").textContent = home.toLocaleString("ko-KR");
      $("dashSubHomepageRatio").textContent =
        total > 0 ? `${Math.round((home / total) * 100)}%` : "—";
      $("dashSubMeta").textContent = meta.toLocaleString("ko-KR");
      $("dashSubMetaRatio").textContent =
        total > 0 ? `${Math.round((meta / total) * 100)}%` : "—";
      $("dashSubPending").textContent = pending.toLocaleString("ko-KR");

      renderRecentList(Array.isArray(d.recent) ? d.recent : []);
    } catch (e) {
      console.warn("[dashboard] estimates load failed", e);
      [
        "dashSubTotal",
        "dashSubHomepage",
        "dashSubMeta",
        "dashSubPending",
      ].forEach((id) => {
        const el = $(id);
        if (el) el.textContent = "—";
      });
      const stat = $("statEstimates");
      if (stat) stat.textContent = "—";
    }
  }

  function renderRecentList(all) {
    const tbody = document.querySelector("#dashRecentTable tbody");
    if (!tbody) return;
    const sorted = [...all]
      .filter((r) => r.SubmittedAt)
      .sort((a, b) => Date.parse(b.SubmittedAt) - Date.parse(a.SubmittedAt))
      .slice(0, 5);
    if (!sorted.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="empty-state">최근 접수 없음</td></tr>';
      return;
    }
    tbody.innerHTML = sorted
      .map((r) => {
        const d = new Date(Date.parse(r.SubmittedAt) + 9 * 3600000);
        const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        const name = adminUtil.escapeHtml(r.Name || "-");
        const src = (r.Source || "").toLowerCase() === "meta" ? "Meta" : "홈";
        const status = adminUtil.escapeHtml(r.Status || "접수대기");
        return `<tr>
          <td class="num">${date}</td>
          <td>${name}</td>
          <td><span class="src-chip src-${src === "Meta" ? "meta" : "home"}">${src}</span></td>
          <td><span class="status-chip">${status}</span></td>
        </tr>`;
      })
      .join("");
  }

  async function run() {
    if (typeof adminUtil === "undefined") {
      console.error("[dashboard] adminUtil not ready");
      return;
    }
    renderAnalyticsSummary();
    loadSubmissionSummary();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
