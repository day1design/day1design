// 어드민 검색 트렌드 페이지 — 네이버 검색광고 월별 실조회수.
// D1 read-only: /api/admin/search-volume → Worker → D1(search_volume).
// 수집: 맥미니 launchd 월1회(매월2일) 키워드도구 모달 차트 스크랩.
(function () {
  "use strict";

  const { api, escapeHtml } = window.adminUtil;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");

  const NAVY = "#1e3a8a";
  const SKY = "#60a5fa";
  const ORANGE = "#f59e0b";

  let allItems = [];
  let keywords = [];
  let activeKw = "";

  // ── 데이터 로드 ──
  async function load() {
    try {
      const resp = await api("/api/admin/search-volume");
      allItems = resp.items || [];
      keywords = resp.keywords || [];
      activeKw = keywords[0] || "";
      renderTabs();
      renderActive();
    } catch (e) {
      const el = $("stError");
      el.hidden = false;
      el.textContent = e.message || "불러오기 실패";
      $("stKeywordTabs").innerHTML = "";
    }
  }

  function renderTabs() {
    const wrap = $("stKeywordTabs");
    if (!keywords.length) {
      wrap.innerHTML = "";
      $("stEmpty").hidden = false;
      return;
    }
    wrap.innerHTML = keywords
      .map(
        (k) =>
          `<button type="button" class="seg-btn${
            k === activeKw ? " active" : ""
          }" data-kw="${escapeHtml(k)}">${escapeHtml(k)}</button>`,
      )
      .join("");
    wrap.querySelectorAll("[data-kw]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeKw = btn.dataset.kw;
        wrap
          .querySelectorAll(".seg-btn")
          .forEach((b) => b.classList.toggle("active", b === btn));
        renderActive();
      });
    });
  }

  // 선택 키워드의 월별 행 (오름차순)
  function rowsAsc() {
    return allItems
      .filter((r) => r.keyword === activeKw)
      .slice()
      .sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }

  function renderActive() {
    const asc = rowsAsc();
    if (!asc.length) {
      $("stBody").hidden = true;
      $("stEmpty").hidden = false;
      return;
    }
    $("stEmpty").hidden = true;
    $("stBody").hidden = false;
    renderKpi(asc);
    $("stChart").innerHTML = trendChart(asc);
    renderTable(asc.slice().reverse());
  }

  function renderKpi(asc) {
    const last = asc[asc.length - 1];
    const prev = asc[asc.length - 2];
    const mom = prev
      ? ((last.total - prev.total) / (prev.total || 1)) * 100
      : null;
    const peak = asc.reduce((a, b) => (b.total > a.total ? b : a), asc[0]);
    const mobPct = last.total ? (last.mobile / last.total) * 100 : 0;

    $("stKpiLast").textContent = fmt(last.total);
    $("stKpiLastSub").textContent =
      `${last.month} · PC ${fmt(last.pc)} · 모바일 ${fmt(last.mobile)}`;

    const momEl = $("stKpiMom");
    if (mom == null) {
      momEl.textContent = "–";
      momEl.className = "kpi-value st-muted";
    } else {
      momEl.textContent =
        (mom >= 0 ? "▲ " : "▼ ") + Math.abs(mom).toFixed(0) + "%";
      momEl.className = "kpi-value " + (mom >= 0 ? "st-up" : "st-down");
    }

    $("stKpiPeak").textContent = peak.month;
    $("stKpiPeakSub").textContent = `${fmt(peak.total)}회`;

    $("stKpiMob").textContent = mobPct.toFixed(1) + "%";
    $("stKpiMobSub").textContent = `${fmt(last.mobile)} / ${fmt(last.total)}`;
  }

  function renderTable(desc) {
    $("stTableBody").innerHTML = desc
      .map((r, i) => {
        const next = desc[i + 1];
        const delta = next
          ? ((r.total - next.total) / (next.total || 1)) * 100
          : null;
        const mobPct = r.total ? ((r.mobile / r.total) * 100).toFixed(0) : 0;
        let deltaCell = "–";
        if (delta != null) {
          const cls = delta >= 0 ? "st-up" : "st-down";
          deltaCell = `<span class="${cls}">${
            delta >= 0 ? "▲" : "▼"
          } ${Math.abs(delta).toFixed(0)}%</span>`;
        }
        return `<tr>
          <td><strong>${escapeHtml(r.month)}</strong></td>
          <td style="text-align:right">${fmt(r.pc)}</td>
          <td style="text-align:right">${fmt(r.mobile)}</td>
          <td style="text-align:right"><strong>${fmt(r.total)}</strong></td>
          <td style="text-align:right">${mobPct}%</td>
          <td style="text-align:right">${deltaCell}</td>
        </tr>`;
      })
      .join("");
  }

  // 인라인 SVG 차트 (라이브러리 없음): 합계 막대 + PC/모바일 라인
  function trendChart(rows) {
    const W = 820;
    const H = 280;
    const pad = { l: 36, r: 12, t: 30, b: 28 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const max = Math.max(1, ...rows.map((r) => r.total));
    const n = rows.length;
    const step = plotW / n;
    const barW = Math.min(step * 0.5, 28);
    const y = (v) => pad.t + plotH - (v / max) * plotH;
    const cx = (i) => pad.l + step * i + step / 2;
    const line = (key) => rows.map((r, i) => `${cx(i)},${y(r[key])}`).join(" ");
    const ticks = 4;

    let grid = "";
    for (let i = 0; i <= ticks; i++) {
      const val = (max / ticks) * i;
      const yy = y(val);
      grid += `<line x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}" stroke="#f1f5f9"/>
        <text x="${pad.l - 6}" y="${yy + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${Math.round(val)}</text>`;
    }
    const bars = rows
      .map(
        (r, i) =>
          `<rect x="${cx(i) - barW / 2}" y="${y(r.total)}" width="${barW}" height="${
            pad.t + plotH - y(r.total)
          }" rx="2" fill="${NAVY}" opacity="0.85"/>`,
      )
      .join("");
    const xlabels = rows
      .map(
        (r, i) =>
          `<text x="${cx(i)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#94a3b8">${escapeHtml(
            String(r.month).slice(2),
          )}</text>`,
      )
      .join("");

    // 후버 없이 항상 보이는 값 라벨 + 포인트 마커
    const clampTop = (yy) => Math.max(yy, pad.t + 9);
    // 합계 라벨은 막대 '밖(위)'에 — 막대 top 위 7px, svg 상단 가드만 적용.
    const totalLabels = rows
      .map(
        (r, i) =>
          `<text x="${cx(i)}" y="${Math.max(y(r.total) - 7, 12)}" text-anchor="middle" font-size="10" font-weight="700" fill="${NAVY}">${fmt(r.total)}</text>`,
      )
      .join("");
    const dots = (key, color) =>
      rows
        .map(
          (r, i) =>
            `<circle cx="${cx(i)}" cy="${y(r[key])}" r="2.6" fill="${color}"/>`,
        )
        .join("");
    const seriesLabels = (key, color, dy) =>
      rows
        .map((r, i) =>
          r[key]
            ? `<text x="${cx(i)}" y="${clampTop(y(r[key]) + dy)}" text-anchor="middle" font-size="8" fill="${color}">${fmt(r[key])}</text>`
            : "",
        )
        .join("");

    return `<svg viewBox="0 0 ${W} ${H}" class="st-chart-svg" preserveAspectRatio="xMidYMid meet">
      ${grid}
      ${bars}
      <polyline points="${line("pc")}" fill="none" stroke="${SKY}" stroke-width="2"/>
      <polyline points="${line("mobile")}" fill="none" stroke="${ORANGE}" stroke-width="2"/>
      ${dots("pc", SKY)}
      ${dots("mobile", ORANGE)}
      ${seriesLabels("mobile", ORANGE, -6)}
      ${seriesLabels("pc", SKY, 13)}
      ${totalLabels}
      ${xlabels}
    </svg>`;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
