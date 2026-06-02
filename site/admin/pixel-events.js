// 어드민 픽셀 이벤트 — pixel_events D1 집계 시각화. D1 read-only.
(function () {
  "use strict";

  const { api, escapeHtml } = window.adminUtil;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");

  const NAVY = "#1e3a8a";
  const SKY = "#60a5fa";
  const ORANGE = "#f59e0b";
  const GREEN = "#10b981";

  let days = 30;

  async function load() {
    $("pxError").hidden = true;
    try {
      const r = await api(`/api/admin/pixel-events?days=${days}`);
      render(r);
      $("pxBody").hidden = false;
    } catch (e) {
      $("pxBody").hidden = true;
      $("pxError").hidden = false;
      $("pxError").textContent = e.message || "불러오기 실패";
    }
  }

  function render(r) {
    const k = r.kpi || {};
    $("pxTotal").textContent = fmt(k.total);
    $("pxPv").textContent = fmt(k.pageview);
    $("pxVc").textContent = fmt(k.viewcontent);
    $("pxCt").textContent = fmt((k.contact || 0) + (k.cta || 0));
    $("pxLead").textContent = fmt(k.lead);
    $("pxCr").textContent = "CR " + Number(k.cr || 0).toFixed(2) + "%";
    $("pxDedup").textContent = (k.dedupRate || 0) + "%";

    $("pxChart").innerHTML = stackChart(r.daily || []);
    $("pxFunnel").innerHTML = funnelHtml(r.funnel || {});
    $("pxSource").innerHTML = barsHtml(
      (r.bySource || []).map((s) => ({ label: s.source, val: s.count })),
    );
    renderAds(r.byAd || []);
    renderRows(r.items || []);
  }

  // 일별 스택 막대 (PageView/상호작용/Lead)
  function stackChart(rows) {
    if (!rows.length) return '<div class="empty-state">데이터 없음</div>';
    const W = 840,
      H = 240,
      pad = { l: 34, r: 10, t: 10, b: 26 };
    const plotW = W - pad.l - pad.r,
      plotH = H - pad.t - pad.b;
    const max = Math.max(
      1,
      ...rows.map((d) => d.pageview + d.interaction + d.lead),
    );
    const n = rows.length;
    const step = plotW / n;
    const bw = Math.min(step * 0.6, 26);
    const y = (v) => pad.t + plotH - (v / max) * plotH;
    const cx = (i) => pad.l + step * i + step / 2;
    let bars = "";
    rows.forEach((d, i) => {
      const x = cx(i) - bw / 2;
      let acc = 0;
      const seg = (v, color) => {
        if (v <= 0) return "";
        const h = (v / max) * plotH;
        const yy = pad.t + plotH - acc - h;
        acc += h;
        return `<rect x="${x}" y="${yy}" width="${bw}" height="${h}" fill="${color}"/>`;
      };
      bars +=
        seg(d.pageview, SKY) + seg(d.interaction, ORANGE) + seg(d.lead, GREEN);
    });
    const ticks = 4;
    let grid = "";
    for (let i = 0; i <= ticks; i++) {
      const val = (max / ticks) * i,
        yy = y(val);
      grid += `<line x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}" stroke="#f1f5f9"/><text x="${pad.l - 5}" y="${yy + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${Math.round(val)}</text>`;
    }
    const labels = rows
      .map((d, i) =>
        n > 16 && i % 2
          ? ""
          : `<text x="${cx(i)}" y="${H - 8}" text-anchor="middle" font-size="8" fill="#94a3b8">${escapeHtml(d.date.slice(5))}</text>`,
      )
      .join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="px-chart-svg" preserveAspectRatio="xMidYMid meet">${grid}${bars}${labels}</svg>`;
  }

  function funnelHtml(f) {
    const steps = [
      ["PageView", f.pageview || 0, SKY],
      ["ViewContent", f.viewcontent || 0, "#0ea5e9"],
      ["CTA/Contact", f.cta_contact || 0, ORANGE],
      ["Lead", f.lead || 0, GREEN],
    ];
    const max = Math.max(1, steps[0][1]);
    return steps
      .map(([label, val, color]) => {
        const w = Math.max(2, (val / max) * 100);
        return `<div class="px-bar-row"><div class="px-bar-label">${label}</div><div class="px-bar-track"><div class="px-bar-fill" style="width:${w}%;background:${color}"></div></div><div class="px-bar-val">${fmt(val)}</div></div>`;
      })
      .join("");
  }

  function barsHtml(list) {
    if (!list.length) return '<div class="empty-state">데이터 없음</div>';
    const max = Math.max(1, ...list.map((x) => x.val));
    return list
      .map((x) => {
        const w = Math.max(2, (x.val / max) * 100);
        return `<div class="px-bar-row"><div class="px-bar-label">${escapeHtml(x.label)}</div><div class="px-bar-track"><div class="px-bar-fill" style="width:${w}%"></div></div><div class="px-bar-val">${fmt(x.val)}</div></div>`;
      })
      .join("");
  }

  function renderAds(ads) {
    if (!ads.length) {
      $("pxAds").innerHTML =
        '<div class="empty-state">광고 파라미터가 붙은 유입이 쌓이면 표시됩니다. (마케팅 슬러그/UTM 사용)</div>';
      return;
    }
    const rows = ads
      .map(
        (a) =>
          `<tr><td>${escapeHtml(a.label)}</td><td>${escapeHtml(a.campaign || "—")}</td><td style="text-align:right">${fmt(a.total)}</td><td style="text-align:right"><b>${fmt(a.leads)}</b></td></tr>`,
      )
      .join("");
    $("pxAds").innerHTML =
      `<div class="table-wrap"><table class="top-table"><thead><tr><th>광고/소재</th><th>캠페인</th><th style="text-align:right">상호작용</th><th style="text-align:right">Lead</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderRows(items) {
    if (!items.length) {
      $("pxRows").innerHTML =
        '<tr><td colspan="7" class="empty-state">아직 수집된 이벤트가 없습니다.</td></tr>';
      return;
    }
    $("pxRows").innerHTML = items
      .map((it) => {
        const t = window.adminUtil.fmtDate(it.created_at);
        const ch = it.channel || "pixel";
        const chCls = ch === "both" ? "both" : ch === "capi" ? "capi" : "";
        const ad = it.ad || it.ad_id || it.campaign || "—";
        const status = it.capi_status
          ? `<span class="${it.capi_status === "sent" ? "px-up" : ""}">${escapeHtml(it.capi_status)}</span>`
          : "—";
        const evCls = it.event_name === "Lead" ? "px-up" : "";
        return `<tr>
          <td style="white-space:nowrap">${escapeHtml(t)}</td>
          <td class="${evCls}"><b>${escapeHtml(it.event_name)}</b></td>
          <td><span class="px-chip ${chCls}">${escapeHtml(ch)}</span></td>
          <td>${escapeHtml(it.page_path || "")}</td>
          <td>${escapeHtml(it.source || "")}</td>
          <td>${escapeHtml(ad)}</td>
          <td>${status}</td>
        </tr>`;
      })
      .join("");
  }

  $("pxRange").addEventListener("click", (e) => {
    const b = e.target.closest("[data-days]");
    if (!b) return;
    days = parseInt(b.dataset.days, 10) || 30;
    $("pxRange")
      .querySelectorAll(".seg-btn")
      .forEach((x) => x.classList.toggle("active", x === b));
    load();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
