// ========== DASHBOARD ==========
// 각 관리 메뉴 카드의 카운트 + 유입/접수 요약 KPI + 최근 접수 미리보기.
// admin.js 이후에 defer 로드되어 adminUtil 이 준비된 상태에서 실행됨.

(function () {
  const $ = (id) => document.getElementById(id);

  async function loadCount(path, id, key = "records") {
    try {
      const d = await adminUtil.apiCached(path, { ttl: 60_000 });
      let n = null;
      if (Array.isArray(d?.[key])) n = d[key].length;
      else if (Array.isArray(d?.records)) n = d.records.length;
      else if (Array.isArray(d?.posts)) n = d.posts.length;
      else if (Array.isArray(d?.slides)) n = d.slides.length;
      else if (typeof d?.total === "number") n = d.total;
      const el = $(id);
      if (el) el.textContent = n !== null ? n.toLocaleString("ko-KR") : "—";
    } catch (e) {
      console.warn(`[dashboard] loadCount failed: ${path}`, e);
      const el = $(id);
      if (el) el.textContent = "—";
    }
  }

  // 유입 요약(예시) — analytics.js 30일 기준 MOCK 와 일치
  function renderAnalyticsSummary() {
    $("dashVisitors").textContent = (1234).toLocaleString("ko-KR");
    $("dashPageviews").textContent = (5678).toLocaleString("ko-KR");
    $("dashDuration").textContent = "2:34";
    $("dashBounce").textContent = "42%";
  }

  async function loadSubmissionSummary() {
    try {
      const d = await adminUtil.apiCached("/api/estimates", { ttl: 60_000 });
      const all = Array.isArray(d?.records) ? d.records : [];
      $("statEstimates").textContent = all.length.toLocaleString("ko-KR");

      const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let total = 0,
        meta = 0,
        home = 0,
        pending = 0;
      for (const r of all) {
        const t = Date.parse(r.SubmittedAt || "");
        if (isNaN(t) || t < since) continue;
        total++;
        if ((r.Source || "").toLowerCase() === "meta") meta++;
        else home++;
        if ((r.Status || "접수대기") === "접수대기") pending++;
      }

      $("dashSubTotal").textContent = total.toLocaleString("ko-KR");
      $("dashSubTotalAll").textContent =
        `전체 ${all.length.toLocaleString("ko-KR")}건`;
      $("dashSubHomepage").textContent = home.toLocaleString("ko-KR");
      $("dashSubHomepageRatio").textContent =
        total > 0 ? `${Math.round((home / total) * 100)}%` : "—";
      $("dashSubMeta").textContent = meta.toLocaleString("ko-KR");
      $("dashSubMetaRatio").textContent =
        total > 0 ? `${Math.round((meta / total) * 100)}%` : "—";
      $("dashSubPending").textContent = pending.toLocaleString("ko-KR");

      renderRecentList(all);
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
        const d = new Date(r.SubmittedAt);
        const date = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
    loadCount("/api/hero/slides", "statHero", "slides");
    loadCount("/api/portfolio", "statPortfolio", "records");
    loadCount("/api/community", "statCommunity", "posts");
    loadSubmissionSummary();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
