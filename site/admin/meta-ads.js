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
    // 평균 시청은 2~3초 대라 정수로 반올림하면 2.6 과 3.4 가 같은 값이 된다.
    $("madsVideoSub").textContent =
      s.avgWatchSec > 0
        ? `ThruPlay · 평균 ${s.avgWatchSec.toFixed(1)}초 시청`
        : "";

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

  // 폴백 아이콘 — 썸네일이 없거나 로드에 실패했을 때 자리를 채운다
  function thumbIcon(ad) {
    const t = ad.creativeType || "image";
    const isVideo = t === "VIDEO" || /video/i.test(t);
    const icon = isVideo ? "▶" : "▣";
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

  // 썸네일 자리 — 처음엔 폴백 아이콘을 그리고, loadThumbs 가 R2 공개 URL 을
  // 받아오면 이미지로 교체한다.
  // D1 의 fbcdn URL(ad.thumbnailUrl)은 서명 URL 이라 ~7일이면 만료돼 전부 깨진다.
  // 그렇다고 인증이 필요한 워커 URL 을 src 로 쓸 수도 없다 — <img> 는 Authorization
  // 헤더를 못 보내서 이미지 요청만 401 이 된다. 그래서 URL 은 인증되는 fetch 로 받고
  // 이미지는 R2 공개 버킷에서 읽는다.
  function thumbCell(ad) {
    const cid = ad.creativeId || "";
    return `<span class="mads-thumb-slot" data-creative="${adminUtil.escapeHtml(cid)}">${thumbIcon(ad)}</span>`;
  }

  async function loadThumbs(rows) {
    const ids = [
      ...new Set((rows || []).map((r) => r.creativeId).filter(Boolean)),
    ];
    if (!ids.length) return;
    try {
      const d = await adminUtil.api(
        `/api/meta-ads/thumbs?ids=${encodeURIComponent(ids.join(","))}`,
      );
      const urls = (d && d.urls) || {};
      document
        .querySelectorAll(".mads-thumb-slot[data-creative]")
        .forEach((slot) => {
          const url = urls[slot.dataset.creative];
          if (!url) return;
          slot.innerHTML = `<img src="${adminUtil.escapeHtml(url)}" alt="" class="mads-thumb" loading="lazy" />`;
        });
    } catch {
      // 실패해도 폴백 아이콘이 이미 자리를 지키고 있다
    }
  }

  // ─── 영상 유지율 ────────────────────────────────
  //
  // 영상 광고는 노출·클릭만으로 판단할 수 없다. 재생은 되는데 첫 구간에서 떠나면
  // 그 뒤 지표는 의미가 없다. 그래서 "재생한 사람 중 25% 지점까지 본 비율"을
  // 후킹으로 보고, 그 값이 낮으면 예산이 아니라 앞 3초를 고칠 자리로 읽는다.
  //
  // 기준선은 업계에서 통상 쓰는 25%·40% 를 그대로 쓴다. 우리 계정 실측은
  // 14~18% 라 지금은 전부 빨강이다 — 그 사실 자체가 보고할 내용이다.
  const HOOK_WARN = 0.25;
  const HOOK_GOOD = 0.4;

  function hookBadge(ad) {
    const v = ad && ad.video;
    const rate = v && typeof v.p25OfPlays === "number" ? v.p25OfPlays : null;
    if (rate === null) return '<span class="mads-hook mads-hook-na">—</span>';
    const cls = rate >= HOOK_GOOD ? "good" : rate >= HOOK_WARN ? "warn" : "bad";
    return `<span class="mads-hook mads-hook-${cls}">${Math.round(rate * 100)}%</span>`;
  }

  // 후킹(25% 도달률)만으로는 "그래서 몇 초를 보고 떠났나"를 알 수 없다.
  // 길이가 다른 소재를 같은 표에 놓고 비교하려면 초와 길이를 함께 적어야 한다.
  function watchCell(ad) {
    const v = ad && ad.video;
    const sec = v && typeof v.avgWatchSec === "number" ? v.avgWatchSec : 0;
    if (!sec) return '<span class="mads-hook mads-hook-na">—</span>';
    const len =
      v && typeof v.lengthSec === "number" && v.lengthSec > 0
        ? v.lengthSec
        : null;
    const pct =
      v && typeof v.avgWatchRatio === "number"
        ? Math.round(v.avgWatchRatio * 100)
        : null;
    return `<span class="mads-watch"><b>${sec.toFixed(1)}초</b>${
      len ? `<em>/${len.toFixed(0)}초</em>` : ""
    }${pct !== null ? `<i>${pct}%</i>` : ""}</span>`;
  }

  function pctText(v) {
    return typeof v === "number" ? (v * 100).toFixed(1) + "%" : "—";
  }

  // 막대는 재생을 기준으로 그린다. 노출을 기준으로 하면 모든 막대가 짧아져
  // 구간 사이의 낙차가 눈에 안 들어온다
  function retentionBar(label, value, ratioOfPlays, tone, atSec) {
    const w = Math.max(0, Math.min(1, ratioOfPlays || 0)) * 100;
    // 25% 는 시간이 아니라 영상 길이 대비 지점이다. 길이를 알면 초를 함께 적어야
    // 길이가 다른 소재를 같은 칸에 놓고 비교하는 착시가 사라진다
    const secText =
      typeof atSec === "number" && atSec > 0
        ? `<em class="mads-vid-sec">${atSec.toFixed(1)}초</em>`
        : "";
    return `
      <div class="mads-vid-row">
        <span class="mads-vid-label">${label}${secText}</span>
        <div class="mads-vid-track">
          <div class="mads-vid-fill mads-vid-${tone}" style="width:${w.toFixed(1)}%"></div>
        </div>
        <span class="mads-vid-val">${fmtCompact(value)}<em>${pctText(ratioOfPlays)}</em></span>
      </div>`;
  }

  function renderVideoRetention(rows) {
    const section = $("madsVideoSection");
    const list = $("madsVideoList");
    const verdictEl = $("madsVideoVerdict");
    if (!section || !list) return;

    const vids = (rows || []).filter(
      (r) => r.video && (r.video.plays > 0 || r.video.p25 > 0),
    );
    if (!vids.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    // 여러 편이 모두 같은 구간에서 꺾이면 소재 하나가 아니라 만드는 방식의 문제다.
    // 그 구분을 사람이 표를 훑어 알아내게 두지 않는다
    const hooks = vids
      .map((v) => v.video.p25OfPlays)
      .filter((x) => typeof x === "number");
    if (verdictEl) {
      if (hooks.length >= 2 && hooks.every((h) => h < HOOK_WARN)) {
        const avg = hooks.reduce((a, b) => a + b, 0) / hooks.length;
        verdictEl.innerHTML = `영상 ${vids.length}편 모두 재생자의 <b>${Math.round((1 - avg) * 100)}%</b>가 25% 지점 전에 떠납니다. 한 편의 문제가 아니라 첫 구간을 만드는 방식을 봐야 합니다.`;
        verdictEl.hidden = false;
      } else {
        verdictEl.hidden = true;
      }
    }

    list.innerHTML = vids
      .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))
      .map((ad) => {
        const v = ad.video;
        const hook = typeof v.p25OfPlays === "number" ? v.p25OfPlays : null;
        const weakButConverting =
          hook !== null && hook < HOOK_WARN && ad.leads > 0;
        return `
        <div class="mads-vid-card">
          <div class="mads-vid-head">
            <div class="mads-vid-name">${adminUtil.escapeHtml(ad.adName || "이름 없음")}</div>
            <div class="mads-vid-meta">${v.lengthSec ? `영상 ${v.lengthSec.toFixed(1)}초 · ` : ""}지출 ${fmtUsd(ad.spend)} · 노출 ${fmtCompact(ad.impressions)} · 리드 ${fmtInt(ad.leads)}건</div>
          </div>
          <div class="mads-vid-bars">
            ${retentionBar("재생", v.plays, v.playRate, "play")}
            ${retentionBar("25%", v.p25, v.p25OfPlays, "p25", v.p25Sec)}
            ${retentionBar("50%", v.p50, v.p50OfPlays, "p50", v.p50Sec)}
            ${retentionBar("75%", v.p75, v.p75OfPlays, "p75", v.p75Sec)}
            ${retentionBar("완주", v.p100, v.completionRate, "p100", v.lengthSec)}
          </div>
          <div class="mads-vid-foot">
            <span>후킹 <b class="${hook !== null && hook < HOOK_WARN ? "is-bad" : ""}">${pctText(hook)}</b></span>
            <span>완주율 <b>${pctText(v.completionRate)}</b></span>
            <span>평균 시청 <b>${Number(v.avgWatchSec || 0).toFixed(1)}초</b>${
              typeof v.avgWatchRatio === "number"
                ? ` <em class="mads-vid-sub">(영상의 ${Math.round(v.avgWatchRatio * 100)}%)</em>`
                : ""
            }</span>
            <span>ThruPlay <b>${fmtCompact(v.thruPlay)}</b></span>
          </div>
          ${
            weakButConverting
              ? `<div class="mads-vid-note">첫 구간에서 대부분 떠나는데도 리드가 ${fmtInt(ad.leads)}건 나왔습니다. 남은 사람이 전환을 만들고 있으므로, 끄는 대신 앞 3초를 바꿔 남는 비율을 늘리는 편이 낫습니다.</div>`
              : ""
          }
        </div>`;
      })
      .join("");
  }

  function renderAds(rows) {
    const tbody = $("madsAdsBody");
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="14" class="empty-state">광고 데이터 없음</td></tr>';
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
          <td class="text-center">${hookBadge(ad)}</td>
          <td class="text-center">${watchCell(ad)}</td>
          <td class="text-center"><span class="mads-grade mads-grade-${grade.cls}">${grade.grade}</span></td>
        </tr>`;
      })
      .join("");
    // 표를 먼저 그리고 썸네일은 뒤따라 채운다 (표 렌더를 붙잡지 않는다)
    loadThumbs(rows);
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
  function genderLabel(v) {
    return v === "male" ? "남성" : v === "female" ? "여성" : "미상";
  }
  // age_gender 분해 rows 를 성별로 합산 (남/여/미상). 별도 API 호출 없이 재사용.
  function aggregateGender(agRows) {
    const acc = {};
    for (const r of agRows || []) {
      const gender = String(r.value || "").split("_")[1] || "unknown";
      if (!acc[gender]) {
        acc[gender] = { value: gender, spend: 0, impressions: 0, leads: 0 };
      }
      acc[gender].spend += Number(r.spend || 0);
      acc[gender].impressions += Number(r.impressions || 0);
      acc[gender].leads += Number(r.leads || 0);
    }
    return Object.values(acc).sort((a, b) => b.spend - a.spend);
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
    // 성별 (남/여) — 소진율% + 지출총액 (통계필터 기간 연동)
    const genderRows = aggregateGender(byDim.age_gender);
    const genderTotal = genderRows.reduce(
      (s, r) => s + Number(r.spend || 0),
      0,
    );
    renderBarRows($("brkGender"), genderRows, {
      valFn: (r) => r.spend,
      labelFn: (r) => genderLabel(r.value),
      displayFn: (r) =>
        `${fmtPct(genderTotal > 0 ? r.spend / genderTotal : 0)} · ${fmtUsd(r.spend)}`,
    });
    // 연령·성별 — 비율% + 지출총액
    const agAll = byDim.age_gender || [];
    const agTotal = agAll.reduce((s, r) => s + Number(r.spend || 0), 0);
    renderBarRows($("brkAgeGender"), agAll.slice(0, 8), {
      valFn: (r) => r.spend,
      labelFn: (r) => ageGenderLabel(r.value),
      displayFn: (r) =>
        `${fmtPct(agTotal > 0 ? r.spend / agTotal : 0)} · ${fmtUsd(r.spend)}`,
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
      // 12개 분리 호출 → 1회 통합 엔드포인트(서버측 병합 + 30분 엣지 캐시).
      // 이중 홉(Vercel→Worker) 왕복을 12→1 로 줄여 로드 지연 대폭 단축.
      const ov = await adminUtil.api(
        `/api/meta-ads/overview?${qs}&sort=${adsSort}&order=${adsOrder}&limit=20`,
      );
      const summary = ov?.summary;
      const bd = ov?.breakdown || {};

      renderSummary(summary);
      renderCampaigns(ov?.campaigns?.campaigns);
      renderAds(ov?.ads?.ads);
      renderVideoRetention(ov?.ads?.ads);
      renderEfficiency(ov?.efficiency);
      renderBreakdowns({
        platform: bd.platform?.rows,
        position: bd.position?.rows,
        device: bd.device?.rows,
        age_gender: bd.age_gender?.rows,
        region: bd.region?.rows,
      });
      renderVideoFunnel(summary);
      renderDow(ov?.dow?.rows);
      renderHeatmap(ov?.hourHeatmap?.cells);
      renderSyncLog(ov?.syncLog?.logs);
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

  // Meta 에서 광고 지표를 처음부터 다시 받아 저장된 수치를 덮어쓴다.
  // 리드를 두 번 세던 시절의 값처럼 집계 규칙이 바뀌었을 때 과거 기간까지
  // 되돌리는 통로다. 같은 (날짜, 광고) 는 덮어쓰기라 행이 늘지 않는다.
  $("madsResync")?.addEventListener("click", async () => {
    const btn = $("madsResync");
    if (btn.disabled) return;
    if (
      !confirm(
        "Meta 에서 광고 지표를 다시 받아옵니다.\n한 번에 약 한 달 구간씩 받으며, 남은 구간은 자동으로 이어받습니다.\n계속할까요?",
      )
    )
      return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "다시 받는 중...";
    try {
      const r = await adminUtil.api("/api/meta-ads/backfill", {
        method: "POST",
        json: {},
      });
      // 구간 단위로 도므로 어디까지 받았는지 같이 알려 준다. 남은 구간이 있으면
      // 다시 눌러 이어받을 수 있고, 안 눌러도 cron 이 매시 이어받는다.
      if (r?.skipped === "all_done") {
        adminUtil.toast?.("이미 전 기간을 받아 두었습니다", "success");
      } else if (r?.chunk) {
        const left = Number(r.remaining || 0);
        adminUtil.toast?.(
          `${r.chunk.start} ~ ${r.chunk.end} 구간을 받았습니다` +
            (left > 0
              ? ` · 남은 구간 ${left}개는 이어서 받습니다`
              : " · 전 구간 완료"),
          "success",
        );
      } else {
        adminUtil.toast?.(
          `광고 지표 ${Number(r?.recordsUpdated || 0).toLocaleString()}건을 다시 받았습니다`,
          "success",
        );
      }
      adminUtil.cacheInvalidate?.("/api/meta-ads");
      loadAll(currentRangeKey);
    } catch (e) {
      adminUtil.toast?.(
        `다시 받지 못했습니다 — ${e?.message || "알 수 없는 오류"}`,
        "error",
      );
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
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
