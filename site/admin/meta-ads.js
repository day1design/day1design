// 어드민 Meta 광고 페이지
// - D1 캐시 데이터만 표시 (Meta API 직접 호출 X)
// - 사용자 액션으로 동기화 트리거 없음 (cron 매일 KST 04:00 자동)
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmtInt = (n) => Number(n || 0).toLocaleString("ko-KR");
  const fmtUsd = (n) => {
    const v = Number(n || 0);
    return "$" + v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  };
  const fmtPct = (n) => (Number(n || 0) * 100).toFixed(2) + "%";

  // 유입통계와 동일한 키: today/7/30/cur-month/prev-month/all/custom
  let currentRangeKey = "today";
  let customStart = "";
  let customEnd = "";
  let trendChart = null;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function ymd(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function rangeLabel(key) {
    const map = {
      today: "오늘",
      7: "최근 7일",
      30: "최근 30일",
      "cur-month": "당월",
      "prev-month": "전월",
      all: "전체 기간",
      custom:
        customStart && customEnd ? `${customStart} ~ ${customEnd}` : "선택기간",
    };
    return map[key] || "최근 30일";
  }
  function setRangeLabel(key) {
    const el = $("madsRangeLabel");
    if (el) el.textContent = rangeLabel(key);
  }
  function buildQuery(key) {
    const p = new URLSearchParams({ range: String(key) });
    if (key === "custom") {
      if (customStart) p.set("start", customStart);
      if (customEnd) p.set("end", customEnd);
    }
    return p.toString();
  }

  function renderSummary(data) {
    const s = data?.summary || {};
    $("madsSpend").textContent = fmtUsd(s.spend);
    $("madsImpressions").textContent = fmtInt(s.impressions);
    $("madsClicks").textContent = fmtInt(s.clicks);
    $("madsCtr").textContent = fmtPct(s.ctr);
    $("madsCpc").textContent = fmtUsd(s.cpc);
    $("madsLeads").textContent = fmtInt(s.leads);
    $("madsCpl").textContent =
      s.leads > 0 ? "CPL " + fmtUsd(s.cpl) : "리드 없음";

    const lastSync = $("madsLastSync");
    if (lastSync) {
      if (data?.lastSyncedAt) {
        const d = new Date(data.lastSyncedAt);
        const diff = Math.floor((Date.now() - d.getTime()) / 60000);
        const ago =
          diff < 60
            ? `${diff}분 전`
            : diff < 1440
              ? `${Math.floor(diff / 60)}시간 전`
              : `${Math.floor(diff / 1440)}일 전`;
        lastSync.textContent = `마지막 동기화: ${ago}`;
        lastSync.title = data.lastSyncedAt;
      } else {
        lastSync.textContent = "동기화 정보 없음";
      }
    }
  }

  function renderCampaigns(rows) {
    const tbody = document.querySelector("#madsCampaignsTable tbody");
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="empty-state">데이터 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td class="path">${adminUtil.escapeHtml(r.name || "이름 없음")}</td>
          <td>${statusBadge(r.status)}</td>
          <td class="num" style="text-align:right">${fmtUsd(r.spend)}</td>
          <td class="num" style="text-align:right">${fmtInt(r.impressions)}</td>
          <td class="num" style="text-align:right">${fmtInt(r.clicks)}</td>
          <td class="num" style="text-align:right">${fmtPct(r.ctr)}</td>
          <td class="num" style="text-align:right">${fmtUsd(r.cpc)}</td>
          <td class="num" style="text-align:right">${fmtInt(r.leads)}</td>
        </tr>`,
      )
      .join("");
  }

  function statusBadge(s) {
    const st = String(s || "").toUpperCase();
    const cls =
      st === "ACTIVE"
        ? "status-confirmed"
        : st === "PAUSED"
          ? "status-muted"
          : "status-default";
    const label = st === "ACTIVE" ? "활성" : st === "PAUSED" ? "일시중지" : st;
    return `<span class="badge ${cls}">${adminUtil.escapeHtml(label || "—")}</span>`;
  }

  function renderTrend(rows) {
    const canvas = $("madsTrendChart");
    if (!canvas || !window.Chart) return;
    if (trendChart) {
      trendChart.destroy();
      trendChart = null;
    }
    if (!rows || !rows.length) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const labels = rows.map((r) => {
      const d = new Date(r.date + "T00:00:00");
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    trendChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "지출(USD)",
            data: rows.map((r) => Number(r.spend || 0)),
            borderColor: "#1a73e8",
            backgroundColor: "rgba(26,115,232,0.1)",
            tension: 0.3,
            yAxisID: "y",
            fill: true,
          },
          {
            label: "리드",
            data: rows.map((r) => Number(r.leads || 0)),
            borderColor: "#16a34a",
            backgroundColor: "rgba(22,163,74,0.1)",
            tension: 0.3,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: {
            type: "linear",
            position: "left",
            ticks: { callback: (v) => "$" + v },
          },
          y1: {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { precision: 0 },
          },
        },
      },
    });
  }

  function renderSyncLog(rows) {
    const tbody = document.querySelector("#madsSyncLogTable tbody");
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="empty-state">이력 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((r) => {
        const t = r.StartedAt
          ? new Date(r.StartedAt).toLocaleString("ko-KR")
          : "—";
        const statusCls =
          r.Status === "success"
            ? "status-confirmed"
            : r.Status === "rate_limited"
              ? "status-warning"
              : r.Status === "failed"
                ? "status-danger"
                : "status-muted";
        return `<tr>
          <td>${adminUtil.escapeHtml(t)}</td>
          <td>${adminUtil.escapeHtml(r.SyncType || "")}</td>
          <td><span class="badge ${statusCls}">${adminUtil.escapeHtml(r.Status || "")}</span></td>
          <td>${adminUtil.escapeHtml((r.DateRangeStart || "") + " ~ " + (r.DateRangeEnd || ""))}</td>
          <td class="num" style="text-align:right">${fmtInt(r.ApiCallsUsed)}</td>
          <td class="num" style="text-align:right">${fmtInt(r.RecordsUpdated)}</td>
          <td>${adminUtil.escapeHtml((r.ErrorMessage || "").slice(0, 80))}</td>
        </tr>`;
      })
      .join("");
  }

  async function loadAll(key) {
    currentRangeKey = key;
    setRangeLabel(key);

    // custom 인데 시작/종료 미지정이면 호출 보류
    if (key === "custom" && (!customStart || !customEnd)) return;

    try {
      await adminUtil.ensureAuth();
      const qs = buildQuery(key);
      const [summary, campaigns, daily, syncLog] = await Promise.all([
        adminUtil.api(`/api/meta-ads/summary?${qs}`),
        adminUtil.api(`/api/meta-ads/campaigns?${qs}`),
        adminUtil.api(`/api/meta-ads/daily?${qs}`),
        adminUtil.api(`/api/meta-ads/sync-log`),
      ]);

      renderSummary(summary);
      renderCampaigns(campaigns?.campaigns);
      renderTrend(daily?.rows);
      renderSyncLog(syncLog?.logs);
    } catch (e) {
      console.error("meta-ads load failed:", e);
      adminUtil.toast?.("Meta 광고 데이터 로드 실패", "error");
    }
  }

  // 기간 버튼
  document.querySelectorAll("[data-mads-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.madsRange;
      document.querySelectorAll("[data-mads-range]").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const picker = $("madsRangePicker");
      if (picker) picker.hidden = key !== "custom";
      loadAll(key);
    });
  });

  // 선택기간 적용
  const applyBtn = $("madsApplyRange");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const s = $("madsRangeStart")?.value;
      const e = $("madsRangeEnd")?.value;
      if (!s || !e) {
        adminUtil.toast?.("시작·종료 날짜를 모두 선택하세요", "error");
        return;
      }
      if (s > e) {
        adminUtil.toast?.("시작이 종료보다 늦을 수 없습니다", "error");
        return;
      }
      customStart = s;
      customEnd = e;
      loadAll("custom");
    });
  }

  // 초기 로드 (당일 기본 — 유입통계와 동일)
  loadAll("today");
})();
