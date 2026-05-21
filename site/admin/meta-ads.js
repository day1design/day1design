// 어드민 Meta 광고 페이지 (안 A v3)
// D1 캐시 데이터만 읽음. Meta API 직접 호출 X.
// cron 매일 KST 04:00 자동 동기화 — 사용자 새로고침 버튼 없음.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmtInt = (n) => Number(n || 0).toLocaleString("ko-KR");
  const fmtUsd = (n) => {
    const v = Number(n || 0);
    if (v === 0) return "$0";
    if (v >= 10000) return "$" + Math.round(v).toLocaleString("ko-KR");
    if (v >= 100) return "$" + v.toFixed(0);
    if (v >= 1) return "$" + v.toFixed(2);
    return "$" + v.toFixed(3);
  };
  const fmtCompact = (n) => {
    const v = Number(n || 0);
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
    return String(Math.round(v));
  };
  const fmtPct = (n) => (Number(n || 0) * 100).toFixed(2) + "%";
  const fmtPctRaw = (n) => Number(n || 0).toFixed(2) + "%";

  // ─── 기간 필터 ──────────────────────────────────────
  let currentRangeKey = "today";
  let customStart = "";
  let customEnd = "";

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

  // ─── 차트 인스턴스 ──────────────────────────────────
  let effChart = null;
  let effMetric = "cpm";
  let dowMetric = "spend";
  let hhMetric = "spend";
  let adsSort = "spend";
  let adsOrder = "top";

  // ─── KPI 7카드 + 동기화 시각 ───────────────────────
  function renderSummary(data) {
    const s = data?.summary || {};
    $("madsSpend").textContent = fmtUsd(s.spend);
    $("madsImpressions").textContent = fmtCompact(s.impressions);
    $("madsClicks").textContent = fmtInt(s.clicks);
    $("madsCpc").textContent = fmtUsd(s.cpc);
    $("madsLeads").textContent = fmtInt(s.leads);
    $("madsCpl").textContent = s.leads > 0 ? fmtUsd(s.cpl) : "—";
    $("madsThruPlay").textContent =
      s.thruPlay > 0 ? fmtCompact(s.thruPlay) : "—";
    $("madsVideoSub").textContent =
      s.avgWatchSec > 0 ? `ThruPlay · avg ${Math.round(s.avgWatchSec)}초` : "";

    $("madsSpendSub").textContent =
      s.spend > 0
        ? "일평균 " + fmtUsd(s.spend / Math.max(1, daysFromRange(data?.range)))
        : "";
    $("madsReachSub").textContent = s.reach
      ? "도달 " + fmtCompact(s.reach)
      : "";
    $("madsCtrSub").textContent = "CTR " + fmtPct(s.ctr);
    $("madsLeadsSub").textContent =
      s.leads > 0
        ? "일평균 " + (s.leads / daysFromRange(data?.range)).toFixed(1) + "건"
        : "리드 없음";

    const last = $("madsLastSync");
    if (last) {
      if (data?.lastSyncedAt) {
        const d = new Date(data.lastSyncedAt);
        const diff = Math.floor((Date.now() - d.getTime()) / 60000);
        last.textContent =
          "마지막 동기화: " +
          (diff < 60
            ? diff + "분 전"
            : diff < 1440
              ? Math.floor(diff / 60) + "시간 전"
              : Math.floor(diff / 1440) + "일 전");
        last.title = data.lastSyncedAt;
      } else {
        last.textContent = "동기화 정보 없음";
      }
    }
  }
  function daysFromRange(r) {
    if (!r?.startDate || !r?.endDate) return 1;
    const d = (new Date(r.endDate) - new Date(r.startDate)) / 86400000 + 1;
    return Math.max(1, d);
  }

  // ─── 캠페인 카드 ────────────────────────────────────
  function objectiveLabel(obj) {
    const map = {
      OUTCOME_TRAFFIC: { ko: "트래픽", cls: "traffic" },
      OUTCOME_LEADS: { ko: "잠재고객", cls: "leads" },
      OUTCOME_AWARENESS: { ko: "인지도", cls: "awareness" },
      OUTCOME_ENGAGEMENT: { ko: "참여", cls: "engagement" },
      OUTCOME_SALES: { ko: "매출", cls: "sales" },
    };
    return map[obj] || { ko: obj || "기타", cls: "other" };
  }
  function statusLabel(st) {
    const s = String(st || "").toUpperCase();
    if (s === "ACTIVE") return { ko: "ACTIVE", cls: "active" };
    if (s === "PAUSED") return { ko: "PAUSED", cls: "paused" };
    if (s === "DELETED" || s === "ARCHIVED") return { ko: s, cls: "muted" };
    return { ko: s || "—", cls: "muted" };
  }

  function renderCampaigns(rows) {
    const grid = $("madsCampaignGrid");
    if (!grid) return;
    if (!rows || !rows.length) {
      grid.innerHTML = '<div class="mads-empty">캠페인 데이터 없음</div>';
      return;
    }
    $("madsCampaignSub").textContent = `${rows.length}건 · 목적별 자동 KPI`;
    grid.innerHTML = rows
      .map((c) => {
        const obj = objectiveLabel(c.objective);
        const st = statusLabel(c.status);
        const isLeads = c.objective === "OUTCOME_LEADS";
        // 목적별 핵심 KPI 자동 결정
        const primary = isLeads
          ? { label: "리드", value: fmtInt(c.leads || 0), cls: "primary-leads" }
          : {
              label: "링크 클릭",
              value: fmtInt(c.linkClicks || c.clicks || 0),
              cls: "",
            };
        const cost = isLeads
          ? { label: "CPL", value: c.leads > 0 ? fmtUsd(c.cpl) : "—" }
          : { label: "CPC", value: fmtUsd(c.cpc) };
        const conv = isLeads
          ? {
              label: "클릭→리드",
              value:
                c.clicks > 0
                  ? ((c.leads / c.clicks) * 100).toFixed(2) + "%"
                  : "—",
            }
          : { label: "CTR", value: fmtPct(c.ctr) };
        const dimmed = st.cls === "paused" || st.cls === "muted";
        return `
        <article class="mads-camp-card${dimmed ? " is-paused" : ""}${isLeads && !dimmed ? " is-leads-active" : ""}">
          <header class="mads-camp-head">
            <span class="mads-camp-badge obj-${obj.cls}">${adminUtil.escapeHtml(obj.ko)}</span>
            <span class="mads-camp-badge st-${st.cls}">${adminUtil.escapeHtml(st.ko)}</span>
            <span class="mads-camp-id">ID ${adminUtil.escapeHtml(String(c.id || "").slice(-4))}</span>
          </header>
          <div class="mads-camp-name">${adminUtil.escapeHtml(c.name || "이름 없음")}</div>
          <div class="mads-camp-kpis">
            <div><div class="lab">핵심: ${primary.label}</div><div class="val ${primary.cls}">${primary.value}</div></div>
            <div><div class="lab">${cost.label}</div><div class="val">${cost.value}</div></div>
            <div><div class="lab">${conv.label}</div><div class="val">${conv.value}</div></div>
          </div>
          <div class="mads-camp-foot">
            노출 ${fmtCompact(c.impressions)} · 지출 ${fmtUsd(c.spend)}${c.reach ? " · 도달 " + fmtCompact(c.reach) : ""}
          </div>
        </article>`;
      })
      .join("");
  }

  // ─── 광고별 효율 (Ad Level) ─────────────────────────
  function efficiencyGrade(ad, allAds, objectiveType) {
    // 같은 목적 광고들의 CPL·CTR 중앙값 대비
    const peers = allAds.filter((a) => {
      // 간단 휴리스틱: 캠페인명에 같은 카테고리 또는 같은 캠페인
      return a.campaignId === ad.campaignId;
    });
    if (peers.length < 2) return { grade: "—", cls: "muted" };
    const ctrs = peers
      .map((p) => p.ctr)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const cpls = peers
      .map((p) => p.cpl)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0);
    const ctrMed = median(ctrs);
    const cplMed = median(cpls);
    const ctrRatio = ctrMed > 0 ? ad.ctr / ctrMed : 1;
    const cplRatio = cplMed > 0 && ad.cpl > 0 ? cplMed / ad.cpl : 1; // 낮을수록 좋음 → 역수
    const score = (ctrRatio + cplRatio) / 2;
    if (score >= 1.2) return { grade: "✓ 우수", cls: "good" };
    if (score >= 1.05) return { grade: "✓ 양호", cls: "ok" };
    if (score >= 0.9) return { grade: "⚠ 보통", cls: "warn" };
    return { grade: "✗ 부진", cls: "bad" };
  }

  function thumbCell(ad) {
    const t = ad.creativeType || "image";
    const isVideo = t === "VIDEO" || /video/i.test(t);
    const icon = isVideo ? "▶" : "▣";
    if (ad.thumbnailUrl) {
      return `<img src="${adminUtil.escapeHtml(ad.thumbnailUrl)}" alt="" class="mads-thumb" />`;
    }
    const seed = (ad.adId || "").charCodeAt(0) || 0;
    const colors = [
      ["#a78bfa", "#f9a8d4"],
      ["#fb923c", "#fda4af"],
      ["#60a5fa", "#67e8f9"],
      ["#34d399", "#5eead4"],
      ["#f87171", "#fbcfe8"],
      ["#facc15", "#fde68a"],
    ];
    const [c1, c2] = colors[seed % colors.length];
    return `<div class="mads-thumb mads-thumb-icon" style="background:linear-gradient(135deg,${c1},${c2})">${icon}</div>`;
  }

  function renderAds(rows) {
    const tbody = $("madsAdsBody");
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="12" class="empty-state">광고 데이터 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((ad, i) => {
        const st = statusLabel(ad.status);
        const grade = efficiencyGrade(ad, rows);
        const isVideo = /video/i.test(ad.creativeType || "");
        return `
        <tr>
          <td class="num">${i + 1}</td>
          <td>
            <div class="mads-ad-cell">
              ${thumbCell(ad)}
              <div>
                <div class="mads-ad-name">${adminUtil.escapeHtml(ad.adName || "이름 없음")}</div>
                <div class="mads-ad-type">${isVideo ? "동영상" : "이미지"} · ${adminUtil.escapeHtml(ad.adsetName || "")}</div>
              </div>
            </div>
          </td>
          <td class="mads-ad-camp">${adminUtil.escapeHtml(ad.campaignName || "").slice(0, 14)}</td>
          <td class="text-center"><span class="mads-st mads-st-${st.cls}">${st.ko.slice(0, 1)}</span></td>
          <td class="num" style="text-align:right">${fmtUsd(ad.spend)}</td>
          <td class="num" style="text-align:right">${fmtCompact(ad.impressions)}</td>
          <td class="num" style="text-align:right">${fmtInt(ad.clicks)}</td>
          <td class="num" style="text-align:right">${fmtPct(ad.ctr)}</td>
          <td class="num" style="text-align:right">${fmtUsd(ad.cpc)}</td>
          <td class="num" style="text-align:right">${fmtInt(ad.leads)}</td>
          <td class="num" style="text-align:right">${ad.leads > 0 ? fmtUsd(ad.cpl) : "—"}</td>
          <td class="text-center"><span class="mads-grade mads-grade-${grade.cls}">${grade.grade}</span></td>
        </tr>`;
      })
      .join("");
  }

  // ─── 효율 변화 추이 (CPM/CPC/CPL + 시계열 + 진단) ──
  function renderEfficiency(data) {
    if (!data) return;
    const c = data.current || {};
    const p = data.prevTotals || {};
    $("effCpm").textContent = fmtUsd(c.cpm);
    $("effCpc").textContent = fmtUsd(c.cpc);
    $("effCpl").textContent = c.leads > 0 ? fmtUsd(c.cpl) : "—";

    const setDelta = (id, curr, prev) => {
      const el = $(id);
      if (!el) return;
      if (!prev || prev === 0) {
        el.textContent = "";
        el.className = "mads-eff-delta";
        return;
      }
      const pct = ((curr - prev) / prev) * 100;
      const sign = pct > 0 ? "▲" : pct < 0 ? "▼" : "—";
      // CPM/CPC/CPL는 낮을수록 좋음 → 상승은 빨강
      const cls = pct > 1 ? "up" : pct < -1 ? "down" : "flat";
      el.textContent = `${sign} ${Math.abs(pct).toFixed(1)}%`;
      el.className = "mads-eff-delta mads-eff-delta-" + cls;
    };
    setDelta("effCpmDelta", c.cpm, p.cpm);
    setDelta("effCpcDelta", c.cpc, p.cpc);
    setDelta("effCplDelta", c.cpl, p.cpl);

    $("effCpmPrev").textContent = "전기 " + (p.cpm > 0 ? fmtUsd(p.cpm) : "—");
    $("effCpcPrev").textContent = "전기 " + (p.cpc > 0 ? fmtUsd(p.cpc) : "—");
    $("effCplPrev").textContent = "전기 " + (p.cpl > 0 ? fmtUsd(p.cpl) : "—");

    $("effPerDollarImp").textContent =
      c.cpm > 0 ? (1000 / c.cpm).toFixed(0) + "회" : "—";
    $("effPerDollarClick").textContent =
      c.cpc > 0 ? (1 / c.cpc).toFixed(2) + "회" : "—";
    $("effPerDollarLead").textContent =
      c.cpl > 0 ? (1 / c.cpl).toFixed(3) + "건" : "—";

    // 진단 신호등
    const cpmUp = p.cpm > 0 && c.cpm > p.cpm * 1.05;
    const ctrDown = p.ctr > 0 && c.ctr < p.ctr * 0.95;
    let dotColor = "#6b7280";
    let diagText = "데이터 충분";
    let diagDetail = "";
    if (cpmUp && ctrDown) {
      dotColor = "#dc2626";
      diagText = "시급 개입 (단가↑+효율↓)";
      diagDetail =
        "시장 단가 + 우리 효율 둘 다 악화. 광고 리프레시 + 예산 조정 필요.";
    } else if (cpmUp) {
      dotColor = "#f59e0b";
      diagText = "시장 단가 ↑ 주도";
      diagDetail = `CPM ${p.cpm > 0 ? "+" + (((c.cpm - p.cpm) / p.cpm) * 100).toFixed(0) + "%" : ""}. 우리 CTR 안정 = 시장 입찰가 상승.`;
    } else if (ctrDown) {
      dotColor = "#f59e0b";
      diagText = "광고 노후화 의심";
      diagDetail = "시장 단가는 일정한데 CTR 하락. 크리에이티브 리프레시 검토.";
    } else if (p.cpm > 0 && c.cpm < p.cpm * 0.95) {
      dotColor = "#16a34a";
      diagText = "호재 (효율 개선)";
      diagDetail = "단가 안정 + CTR 양호. 예산 증액 타이밍.";
    } else {
      dotColor = "#16a34a";
      diagText = "정상 운영";
      diagDetail = "단가·효율 변동 미미.";
    }
    $("effDot").style.background = dotColor;
    $("effDiagText").textContent = diagText;
    $("effDiagDetail").textContent = diagDetail;

    // 시계열 차트
    renderEffChart(data.daily || []);
  }

  function renderEffChart(daily) {
    const canvas = $("effChart");
    if (!canvas || !window.Chart) return;
    if (effChart) {
      effChart.destroy();
      effChart = null;
    }
    if (!daily.length) return;
    const labels = daily.map((r) => {
      const d = new Date(r.date + "T00:00:00");
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const values = daily.map((r) => r[effMetric] || 0);
    // 평균 + 1σ 계산
    const nonZero = values.filter((v) => v > 0);
    const mean = nonZero.length
      ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length
      : 0;
    const variance = nonZero.length
      ? nonZero.reduce((s, v) => s + (v - mean) ** 2, 0) / nonZero.length
      : 0;
    const sigma = Math.sqrt(variance);
    const colors = values.map((v) => {
      if (v >= mean + 2 * sigma) return "#dc2626";
      if (v >= mean + sigma) return "#f59e0b";
      return "#1877f2";
    });
    effChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: effMetric.toUpperCase(),
            data: values,
            backgroundColor: colors,
            borderRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmtUsd(c.parsed.y) } },
        },
        scales: {
          y: { ticks: { callback: (v) => "$" + v } },
        },
      },
    });
  }

  // ─── 분해 분석 6종 ─────────────────────────────────
  function renderBarRows(el, rows, opts = {}) {
    if (!rows || !rows.length) {
      el.innerHTML = '<div class="empty-state">데이터 없음</div>';
      return;
    }
    const valFn = opts.valFn || ((r) => r.spend);
    const labelFn = opts.labelFn || ((r) => r.value);
    const displayFn = opts.displayFn || ((r) => fmtUsd(r.spend));
    const max = Math.max(...rows.map(valFn), 1);
    el.innerHTML = rows
      .map((r) => {
        const w = (valFn(r) / max) * 100;
        return `
        <div class="mads-row-bar">
          <span class="mads-row-label">${adminUtil.escapeHtml(labelFn(r))}</span>
          <span class="mads-row-track"><span class="mads-row-fill" style="width:${w.toFixed(1)}%"></span></span>
          <span class="mads-row-val">${displayFn(r)}</span>
        </div>`;
      })
      .join("");
  }

  function platformLabel(v) {
    const m = {
      instagram: "Instagram",
      facebook: "Facebook",
      audience_network: "AN",
      threads: "Threads",
      messenger: "Messenger",
    };
    return m[v] || v;
  }
  function deviceLabel(v) {
    const m = {
      iphone: "iPhone",
      android_smartphone: "Android",
      ipad: "iPad",
      android_tablet: "Android Tab",
      desktop: "데스크탑",
    };
    return m[v] || v;
  }
  function positionLabel(v) {
    return v
      .replace(/_/g, " ")
      .replace(
        /^(facebook|instagram|an) /i,
        (m) => m.toUpperCase().trim() + " ",
      );
  }
  function ageGenderLabel(v) {
    const [age, gender] = v.split("_");
    const g = gender === "female" ? "여" : gender === "male" ? "남" : "?";
    return `${age || "?"} ${g}`;
  }

  function renderBreakdowns(byDim) {
    renderBarRows($("brkPlatform"), (byDim.platform || []).slice(0, 6), {
      valFn: (r) => r.spend,
      labelFn: (r) => platformLabel(r.value),
      displayFn: (r) => fmtUsd(r.spend),
    });
    const pos = (byDim.position || [])
      .slice()
      .sort((a, b) => b.ctr - a.ctr)
      .slice(0, 5);
    renderBarRows($("brkPosition"), pos, {
      valFn: (r) => r.ctr,
      labelFn: (r) => positionLabel(r.value),
      displayFn: (r) => fmtPct(r.ctr),
    });
    renderBarRows($("brkDevice"), (byDim.device || []).slice(0, 5), {
      valFn: (r) => r.spend,
      labelFn: (r) => deviceLabel(r.value),
      displayFn: (r) => fmtUsd(r.spend),
    });
    const ag = (byDim.age_gender || []).slice(0, 5);
    renderBarRows($("brkAgeGender"), ag, {
      valFn: (r) => r.spend,
      labelFn: (r) => ageGenderLabel(r.value),
      displayFn: (r) =>
        r.leads > 0 ? `${r.leads} / ${fmtUsd(r.cpl)}` : fmtUsd(r.spend),
    });
    renderBarRows($("brkRegion"), (byDim.region || []).slice(0, 5), {
      valFn: (r) => r.spend,
      labelFn: (r) => r.value,
      displayFn: (r) => fmtUsd(r.spend),
    });
  }

  function renderVideoFunnel(data) {
    const el = $("videoFunnel");
    const sub = $("videoFunnelSub");
    if (!el) return;
    const s = data?.summary || {};
    const p25 = Number(s.videoP25 || 0);
    const p50 = Number(s.videoP50 || 0);
    const p75 = Number(s.videoP75 || 0);
    const p100 = Number(s.videoP100 || 0);
    const thru = Number(s.thruPlay || 0);
    const avg = Number(s.avgWatchSec || 0);
    if (p25 + p50 + p75 + p100 + thru === 0) {
      el.innerHTML =
        '<div class="empty-state">영상 메트릭 없음 (영상 광고 미집행 기간)</div>';
      if (sub) sub.textContent = "—";
      return;
    }
    // 기준값: p25 (가장 큰 값, 25% 도달자 = 영상 시청 시작자)
    const base = Math.max(p25, p50, p75, p100, thru, 1);
    const steps = [
      { num: p25, label: "25% 시청 시작", pct: 100 },
      { num: p50, label: "50% 시청", pct: base > 0 ? (p50 / base) * 100 : 0 },
      {
        num: thru,
        label: "ThruPlay (15s+ / 끝까지)",
        pct: base > 0 ? (thru / base) * 100 : 0,
      },
      { num: p75, label: "75% 시청", pct: base > 0 ? (p75 / base) * 100 : 0 },
      {
        num: p100,
        label: "100% 완주",
        pct: base > 0 ? (p100 / base) * 100 : 0,
      },
    ];
    el.innerHTML = steps
      .map(
        (st) => `
        <div class="funnel-step">
          <span class="num">${fmtCompact(st.num)}</span>
          <span class="label">${st.label}</span>
          <span class="pct">${st.pct.toFixed(0)}%</span>
        </div>`,
      )
      .join("");
    if (sub) sub.textContent = avg > 0 ? `평균 ${Math.round(avg)}초` : "—";
  }

  // ─── 요일 패턴 ──────────────────────────────────────
  const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];

  function renderDow(rows) {
    const bars = $("madsDowBars");
    const tbody = $("madsDowBody");
    if (!rows || !rows.length) {
      if (bars) bars.innerHTML = '<div class="empty-state">데이터 없음</div>';
      if (tbody)
        tbody.innerHTML =
          '<tr><td colspan="9" class="empty-state">데이터 없음</td></tr>';
      return;
    }
    // 0=일, 1=월, ... 우리는 월~일 순으로 정렬
    const order = [1, 2, 3, 4, 5, 6, 0];
    const map = {};
    for (const r of rows) map[r.dow] = r;
    const ordered = order.map(
      (d) =>
        map[d] || {
          dow: d,
          spend: 0,
          impressions: 0,
          clicks: 0,
          leads: 0,
          ctr: 0,
          cpc: 0,
          cpl: 0,
        },
    );

    // metric 추출
    const metricFn = (r) => Number(r[dowMetric] || 0);
    const totalAll = ordered.reduce((s, r) => s + Number(r.spend || 0), 0);
    const vals = ordered.map(metricFn);
    const max = Math.max(...vals, 1);
    // 최고·최저
    const best = ordered.reduce((a, b) => (metricFn(a) > metricFn(b) ? a : b));
    const worst = ordered.reduce(
      (a, b) => (metricFn(a) < metricFn(b) && metricFn(b) > 0 ? a : b),
      ordered[0],
    );

    bars.innerHTML = ordered
      .map((r) => {
        const h = (metricFn(r) / max) * 100;
        const isBest = r.dow === best.dow && metricFn(r) > 0;
        const isLow = r.dow === worst.dow && metricFn(r) > 0;
        const cls = isBest ? "is-best" : isLow ? "is-low" : "";
        return `
        <div class="mads-dow-col ${cls}">
          <div class="mads-dow-label">${DOW_KO[r.dow]}</div>
          <div class="mads-dow-track">
            ${isBest ? '<div class="mads-dow-tag">BEST</div>' : ""}
            ${isLow ? '<div class="mads-dow-tag mads-dow-tag-low">LOW</div>' : ""}
            <div class="mads-dow-fill" style="height:${Math.max(2, h).toFixed(1)}%"></div>
          </div>
          <div class="mads-dow-val">${formatMetric(dowMetric, metricFn(r))}</div>
          <div class="mads-dow-sub">${r.leads || 0} 리드</div>
        </div>`;
      })
      .join("");

    tbody.innerHTML = ordered
      .map((r) => {
        const pct = totalAll > 0 ? (Number(r.spend || 0) / totalAll) * 100 : 0;
        const isBest = r.dow === best.dow && r.spend > 0;
        const isLow = r.dow === worst.dow && r.spend > 0;
        return `<tr class="${isBest ? "mads-row-best" : isLow ? "mads-row-low" : ""}">
          <td><strong>${DOW_KO[r.dow]}</strong></td>
          <td class="num" style="text-align:right">${fmtUsd(r.spend)}</td>
          <td class="num" style="text-align:right">${fmtCompact(r.impressions)}</td>
          <td class="num" style="text-align:right">${fmtInt(r.clicks)}</td>
          <td class="num" style="text-align:right">${fmtPct(r.ctr)}</td>
          <td class="num" style="text-align:right">${fmtUsd(r.cpc)}</td>
          <td class="num" style="text-align:right">${fmtInt(r.leads)}</td>
          <td class="num" style="text-align:right">${r.leads > 0 ? fmtUsd(r.cpl) : "—"}</td>
          <td class="num" style="text-align:right">${pct.toFixed(1)}%</td>
        </tr>`;
      })
      .join("");
  }
  function formatMetric(m, v) {
    if (m === "spend") return fmtUsd(v);
    if (m === "cpl") return v > 0 ? fmtUsd(v) : "—";
    if (m === "impressions") return fmtCompact(v);
    return fmtInt(v);
  }

  // ─── 시간대 × 요일 히트맵 ──────────────────────────
  function renderHeatmap(cells) {
    const el = $("madsHeatmap");
    const note = $("madsHeatmapNote");
    if (!el) return;
    if (!cells || !cells.length) {
      el.innerHTML =
        '<div class="empty-state">시간대 데이터 없음 (백필 후 표시)</div>';
      if (note) note.textContent = "";
      return;
    }
    // grid: 7 row × 24 col
    const grid = {};
    for (const c of cells) {
      if (!grid[c.dow]) grid[c.dow] = {};
      grid[c.dow][c.hour] = c;
    }
    const metricFn = (c) => Number(c?.[hhMetric] || 0);
    const allVals = cells.map(metricFn).filter((v) => v > 0);
    const max = allVals.length ? Math.max(...allVals) : 1;
    // 최고 셀
    const bestCell = cells.reduce((a, b) =>
      metricFn(a) > metricFn(b) ? a : b,
    );

    // table 구성
    const order = [1, 2, 3, 4, 5, 6, 0];
    let html =
      '<table class="mads-heatmap-table"><thead><tr><th class="mads-heat-corner"></th>';
    for (let h = 0; h < 24; h++) {
      html += `<th class="mads-heat-hour">${String(h).padStart(2, "0")}</th>`;
    }
    html += "</tr></thead><tbody>";
    for (const d of order) {
      const rowCls = d === 0 || d === 6 ? "mads-heat-weekend" : "";
      html += `<tr class="${rowCls}"><th class="mads-heat-dow">${DOW_KO[d]}</th>`;
      for (let h = 0; h < 24; h++) {
        const c = grid[d]?.[h];
        const v = metricFn(c);
        const intensity = v > 0 ? v / max : 0;
        const { bg, fg } = heatStyle(intensity);
        const isBest =
          c && c.dow === bestCell.dow && c.hour === bestCell.hour && v > 0;
        html += `<td class="mads-heat-cell ${isBest ? "is-best" : ""}" style="background:${bg};color:${fg}" title="${DOW_KO[d]} ${h}시: ${formatMetric(hhMetric, v)}">${v > 0 ? formatMetric(hhMetric, v).replace("$", "") : ""}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    el.innerHTML = html;
    if (note && metricFn(bestCell) > 0) {
      note.textContent = `BEST: ${DOW_KO[bestCell.dow]}요일 ${String(bestCell.hour).padStart(2, "0")}시 (${formatMetric(hhMetric, metricFn(bestCell))})`;
    }
  }

  // 배경 강도에 따라 텍스트 색도 같이 반환 — 옅은 배경에는 어두운 글씨,
  // 진한 배경에는 흰 글씨. (리드 같이 max 값이 작은 메트릭도 셀 값 보이게)
  function heatStyle(t) {
    if (t <= 0) return { bg: "#f9fafb", fg: "#9ca3af" };
    if (t < 0.15) return { bg: "#eff6ff", fg: "#1e3a8a" };
    if (t < 0.3) return { bg: "#bfdbfe", fg: "#1e3a8a" };
    if (t < 0.5) return { bg: "#60a5fa", fg: "#fff" };
    if (t < 0.75) return { bg: "#1d4ed8", fg: "#fff" };
    if (t < 0.95) return { bg: "#1e3a8a", fg: "#fff" };
    return { bg: "#172554", fg: "#fff" };
  }

  // ─── 동기화 이력 ────────────────────────────────────
  function renderSyncLog(rows) {
    const tbody = $("madsSyncLogBody");
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
        const cls =
          r.Status === "success"
            ? "good"
            : r.Status === "rate_limited"
              ? "warn"
              : r.Status === "failed"
                ? "bad"
                : "muted";
        return `<tr>
          <td>${adminUtil.escapeHtml(t)}</td>
          <td>${adminUtil.escapeHtml(r.SyncType || "")}</td>
          <td><span class="mads-st mads-st-${cls}">${adminUtil.escapeHtml(r.Status || "")}</span></td>
          <td>${adminUtil.escapeHtml((r.DateRangeStart || "") + " ~ " + (r.DateRangeEnd || ""))}</td>
          <td class="num" style="text-align:right">${fmtInt(r.ApiCallsUsed)}</td>
          <td class="num" style="text-align:right">${fmtInt(r.RecordsUpdated)}</td>
          <td>${adminUtil.escapeHtml((r.ErrorMessage || "").slice(0, 80))}</td>
        </tr>`;
      })
      .join("");
  }

  // ─── 로드 전체 ─────────────────────────────────────
  async function loadAll(key) {
    currentRangeKey = key;
    setRangeLabel(key);
    if (key === "custom" && (!customStart || !customEnd)) return;

    try {
      await adminUtil.ensureAuth();
      const qs = buildQuery(key);
      const [
        summary,
        campaigns,
        ads,
        eff,
        plat,
        pos,
        dev,
        ag,
        reg,
        dow,
        hh,
        log,
      ] = await Promise.all([
        adminUtil.api(`/api/meta-ads/summary?${qs}`),
        adminUtil.api(`/api/meta-ads/campaigns?${qs}`),
        adminUtil.api(
          `/api/meta-ads/ads?${qs}&sort=${adsSort}&order=${adsOrder}&limit=20`,
        ),
        adminUtil.api(`/api/meta-ads/efficiency?${qs}`),
        adminUtil.api(`/api/meta-ads/breakdown?${qs}&dim=platform`),
        adminUtil.api(`/api/meta-ads/breakdown?${qs}&dim=position`),
        adminUtil.api(`/api/meta-ads/breakdown?${qs}&dim=device`),
        adminUtil.api(`/api/meta-ads/breakdown?${qs}&dim=age_gender`),
        adminUtil.api(`/api/meta-ads/breakdown?${qs}&dim=region`),
        adminUtil.api(`/api/meta-ads/dow?${qs}`),
        adminUtil.api(`/api/meta-ads/hour-heatmap?${qs}`),
        adminUtil.api(`/api/meta-ads/sync-log`),
      ]);

      renderSummary(summary);
      renderCampaigns(campaigns?.campaigns);
      renderAds(ads?.ads);
      renderEfficiency(eff);
      renderBreakdowns({
        platform: plat?.rows,
        position: pos?.rows,
        device: dev?.rows,
        age_gender: ag?.rows,
        region: reg?.rows,
      });
      renderVideoFunnel(summary);
      renderDow(dow?.rows);
      renderHeatmap(hh?.cells);
      renderSyncLog(log?.logs);
    } catch (e) {
      console.error("meta-ads load failed:", e);
      adminUtil.toast?.("Meta 광고 데이터 로드 실패", "error");
    }
  }

  // ─── 이벤트 핸들러 ─────────────────────────────────
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
  $("madsApplyRange")?.addEventListener("click", () => {
    const s = $("madsRangeStart")?.value;
    const e = $("madsRangeEnd")?.value;
    if (!s || !e) return adminUtil.toast?.("시작·종료 날짜 선택", "error");
    if (s > e)
      return adminUtil.toast?.("시작이 종료보다 늦을 수 없음", "error");
    customStart = s;
    customEnd = e;
    loadAll("custom");
  });

  document.querySelectorAll("[data-ads-order]").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-ads-order]")
        .forEach((x) => x.classList.toggle("active", x === b));
      adsOrder = b.dataset.adsOrder;
      loadAll(currentRangeKey);
    });
  });
  document.querySelectorAll("[data-ads-sort]").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-ads-sort]")
        .forEach((x) => x.classList.toggle("active", x === b));
      adsSort = b.dataset.adsSort;
      loadAll(currentRangeKey);
    });
  });
  document.querySelectorAll("[data-eff-metric]").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-eff-metric]")
        .forEach((x) => x.classList.toggle("active", x === b));
      effMetric = b.dataset.effMetric;
      loadAll(currentRangeKey);
    });
  });
  document.querySelectorAll("[data-dow-metric]").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-dow-metric]")
        .forEach((x) => x.classList.toggle("active", x === b));
      dowMetric = b.dataset.dowMetric;
      loadAll(currentRangeKey);
    });
  });
  document.querySelectorAll("[data-hh-metric]").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-hh-metric]")
        .forEach((x) => x.classList.toggle("active", x === b));
      hhMetric = b.dataset.hhMetric;
      loadAll(currentRangeKey);
    });
  });

  // ─── 첫 로드 ───────────────────────────────────────
  loadAll("today");
})();
