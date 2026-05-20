// 어드민 히트맵 화면 로직
// 명세: HEATMAP_SPEC.md Step 3
(function () {
  "use strict";

  const API_BASE =
    window.DAY1_API_BASE || "https://day1design-api.day1design-co.workers.dev";

  // ─── 상태 ─────────────────────────────────────────────
  const state = {
    pages: [], // [{Page, PcEvents, MobileEvents, Clicks, Scrolls, LastEventAt}]
    screenshots: {}, // { 'Page|device': {Url, PageW, PageH, CapturedAt} }
    selectedPage: null, // current page string
    rangeDays: 7, // 1 | 7 | 30 | 'all'
    eventType: "click", // 'click' | 'scroll' | 'both'
    eventsCache: {}, // key = page+device+type+range → events[]
  };

  // ─── DOM ─────────────────────────────────────────────
  const $pagesList = document.getElementById("heatmapPagesList");
  const $pagesCount = document.getElementById("heatmapPagesCount");
  const $canvases = document.getElementById("heatmapCanvases");
  const $eventCount = document.getElementById("heatmapEventCount");
  const $refreshBtn = document.getElementById("heatmapRefreshBtn");

  // ─── Util ────────────────────────────────────────────
  function fmtInt(n) {
    return Number(n || 0).toLocaleString("ko-KR");
  }
  function pageLabel(p) {
    if (p === "/") return "홈 (index)";
    return p.replace(/^\/pages\//, "").replace(/\.html$/, "");
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function rangeToISO() {
    if (state.rangeDays === "all") return { from: "", to: "" };
    const to = new Date();
    const from = new Date(Date.now() - state.rangeDays * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  // ─── API ─────────────────────────────────────────────
  async function fetchPages() {
    const res = await fetch(API_BASE + "/api/heatmap/pages", {
      credentials: "include",
    });
    if (!res.ok) throw new Error("pages " + res.status);
    return res.json();
  }
  async function fetchEvents(page, device, type, from, to) {
    const params = new URLSearchParams({ page, device });
    if (type && type !== "both") params.set("type", type);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", "5000");
    const res = await fetch(API_BASE + "/api/heatmap/events?" + params, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("events " + res.status);
    return res.json();
  }

  // ─── 페이지 리스트 렌더링 ────────────────────────────
  function renderPagesList() {
    // 스크린샷 등록된 페이지를 우선 노출 (+ 이벤트는 없어도 표시)
    const registered = new Set();
    Object.keys(state.screenshots).forEach((k) =>
      registered.add(k.split("|")[0]),
    );
    state.pages.forEach((p) => registered.add(p.Page));

    const eventMap = new Map();
    state.pages.forEach((p) => eventMap.set(p.Page, p));

    const items = Array.from(registered).sort((a, b) => {
      const ea = eventMap.get(a) || { Clicks: 0, Scrolls: 0 };
      const eb = eventMap.get(b) || { Clicks: 0, Scrolls: 0 };
      return (
        (eb.Clicks || 0) +
        (eb.Scrolls || 0) -
        (ea.Clicks || 0) -
        (ea.Scrolls || 0)
      );
    });

    if (!items.length) {
      $pagesList.innerHTML =
        '<div class="heatmap-empty">등록된 페이지 없음</div>';
      $pagesCount.textContent = "0";
      return;
    }
    $pagesCount.textContent = String(items.length);
    $pagesList.innerHTML = items
      .map((p) => {
        const e = eventMap.get(p) || {};
        const total = (e.Clicks || 0) + (e.Scrolls || 0);
        const isActive = state.selectedPage === p;
        return `<button class="heatmap-page-item${isActive ? " active" : ""}" data-page="${escapeHtml(p)}">
          <div class="hpi-name">${escapeHtml(pageLabel(p))}</div>
          <div class="hpi-meta">
            <span>클릭 ${fmtInt(e.Clicks)}</span>
            <span>스크롤 ${fmtInt(e.Scrolls)}</span>
          </div>
          <div class="hpi-total">${fmtInt(total)} 이벤트</div>
        </button>`;
      })
      .join("");
    $pagesList.querySelectorAll(".heatmap-page-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.getAttribute("data-page");
        selectPage(p);
      });
    });
  }

  // ─── 디바이스 캔버스 렌더 ────────────────────────────
  function renderCanvases() {
    if (!state.selectedPage) {
      $canvases.innerHTML =
        '<div class="heatmap-empty">페이지를 선택해주세요</div>';
      return;
    }
    const devices = ["pc", "mobile"];
    $canvases.innerHTML = devices
      .map((d) => {
        const shot = state.screenshots[state.selectedPage + "|" + d];
        if (!shot) {
          return `<div class="heatmap-device-col">
            <div class="heatmap-device-head"><strong>${d === "pc" ? "PC" : "Mobile"}</strong><span>스크린샷 없음</span></div>
            <div class="heatmap-empty">스크린샷이 등록되지 않았습니다</div>
          </div>`;
        }
        return `<div class="heatmap-device-col" data-device="${d}">
          <div class="heatmap-device-head">
            <strong>${d === "pc" ? "PC" : "Mobile"}</strong>
            <span>${shot.PageW}×${shot.PageH}</span>
            <span class="hdh-events" data-events-count="0">이벤트 0</span>
          </div>
          <div class="heatmap-stage" data-stage="${d}">
            <img class="heatmap-shot" src="${escapeHtml(shot.Url)}" alt="${escapeHtml(state.selectedPage)} ${d}" />
            <canvas class="heatmap-overlay" data-overlay="${d}"></canvas>
            <div class="heatmap-scroll-bar" data-scroll="${d}" aria-hidden="true"></div>
          </div>
        </div>`;
      })
      .join("");
  }

  // ─── 히트맵 그리기 (Canvas 가우시안 블러) ─────────────
  function drawClickHeatmap(canvas, img, events) {
    if (!canvas || !img) return;
    // 이미지 자연 크기를 캔버스 해상도에 맞춤
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) {
      img.addEventListener(
        "load",
        () => drawClickHeatmap(canvas, img, events),
        { once: true },
      );
      return;
    }
    // 캔버스를 이미지 자연크기 기준으로 (CSS 크기는 자동 fit)
    canvas.width = naturalW;
    canvas.height = naturalH;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1단계: 알파 누적 (반지름 작고 초기 알파 낮음 → 누적될수록 진해지는 밀집 계층화)
    const radius = Math.max(10, Math.floor(naturalW * 0.012));
    ctx.globalCompositeOperation = "lighter";
    for (const e of events) {
      if (e.EventType !== "click" || e.XPct == null || e.YPct == null) continue;
      const x = e.XPct * naturalW;
      const y = e.YPct * naturalH;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      // 단일 클릭은 옅게(0.22) → 같은 위치 누적 시 lighter 합성으로 자연스럽게 진해짐
      g.addColorStop(0, "rgba(255,255,255,0.22)");
      g.addColorStop(0.4, "rgba(255,255,255,0.12)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // 2단계: 그레이스케일을 컬러 그라데이션으로 치환 + 밀집 강조
    if (!events.length) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const palette = colorPalette();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i]; // R=G=B=A 이므로 R만 봐도 됨
      if (a === 0) continue;
      // 감마 보정: 저밀도(단일 클릭)는 더 옅게, 고밀도는 더 빠르게 진해짐
      const norm = a / 255;
      const boosted = Math.pow(norm, 0.75); // <1 → 고밀도 가속
      const idx = Math.min(255, Math.floor(boosted * 255));
      const c = palette[idx];
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      // 알파: 저밀도일수록 반투명, 고밀도일수록 불투명에 가깝게
      data[i + 3] = Math.min(230, Math.floor(40 + idx * 0.78));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // 256 step gradient: 옅은 시안 → 파랑 → 초록 → 노랑 → 빨강
  // 저밀도 구간(0~80)을 옅은 시안 톤으로 길게 늘려 단일 클릭이 자극적이지 않게
  let _paletteCache = null;
  function colorPalette() {
    if (_paletteCache) return _paletteCache;
    const stops = [
      { p: 0, c: [120, 180, 230] }, // 옅은 시안 — 단일·저밀도
      { p: 60, c: [60, 130, 220] }, // 파랑
      { p: 120, c: [40, 200, 130] }, // 초록
      { p: 180, c: [255, 220, 60] }, // 노랑
      { p: 230, c: [255, 130, 30] }, // 주황
      { p: 255, c: [220, 30, 30] }, // 빨강 — 고밀도
    ];
    const arr = new Array(256);
    for (let i = 0; i < 256; i++) {
      let lo = stops[0],
        hi = stops[stops.length - 1];
      for (let j = 0; j < stops.length - 1; j++) {
        if (i >= stops[j].p && i <= stops[j + 1].p) {
          lo = stops[j];
          hi = stops[j + 1];
          break;
        }
      }
      const t = (i - lo.p) / Math.max(1, hi.p - lo.p);
      arr[i] = [
        Math.round(lo.c[0] + (hi.c[0] - lo.c[0]) * t),
        Math.round(lo.c[1] + (hi.c[1] - lo.c[1]) * t),
        Math.round(lo.c[2] + (hi.c[2] - lo.c[2]) * t),
      ];
    }
    _paletteCache = arr;
    return arr;
  }

  // ─── 스크롤 바: 우측 세로 그라데이션 ─────────────────
  function drawScrollBar(stage, events) {
    const bar = stage.querySelector(".heatmap-scroll-bar");
    if (!bar) return;
    // max-depth 도달률을 5% 버킷으로 분포 — 깊은 도달이 많을수록 진한 색
    const buckets = new Array(20).fill(0);
    let total = 0;
    for (const e of events) {
      if (e.EventType !== "scroll" || e.ScrollDepthPct == null) continue;
      const idx = Math.min(19, Math.floor(e.ScrollDepthPct * 20));
      // i 이하 모든 깊이는 도달한 것으로 카운트
      for (let i = 0; i <= idx; i++) buckets[i]++;
      total++;
    }
    if (!total) {
      bar.style.background = "transparent";
      return;
    }
    // 버킷별 (0~1) 비율 → 그라데이션 색
    const stops = buckets.map((c, i) => {
      const pct = c / total;
      const lum = Math.min(1, pct);
      // 빨강(짙음) → 옅음
      const alpha = (0.15 + 0.65 * lum).toFixed(2);
      const start = (i * 5).toFixed(0) + "%";
      const end = ((i + 1) * 5).toFixed(0) + "%";
      return `rgba(220, 38, 38, ${alpha}) ${start}, rgba(220, 38, 38, ${alpha}) ${end}`;
    });
    bar.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
    bar.title = `스크롤 데이터 ${total}건 — 도달 분포`;
  }

  // ─── 페이지 선택 → 데이터 로드 ───────────────────────
  async function selectPage(page) {
    state.selectedPage = page;
    renderPagesList();
    renderCanvases();
    await loadAndRenderEvents();
  }

  async function loadAndRenderEvents() {
    if (!state.selectedPage) return;
    const { from, to } = rangeToISO();
    const wantType = state.eventType; // 'click' | 'scroll' | 'both'
    let totalEvents = 0;

    for (const d of ["pc", "mobile"]) {
      const stage = $canvases.querySelector(
        `.heatmap-stage[data-stage="${d}"]`,
      );
      const canvas = $canvases.querySelector(`canvas[data-overlay="${d}"]`);
      const img = stage?.querySelector(".heatmap-shot");
      if (!stage || !canvas || !img) continue;

      try {
        const key = `${state.selectedPage}|${d}|${wantType}|${state.rangeDays}`;
        let events = state.eventsCache[key];
        if (!events) {
          // 'both'는 한 번에 가져옴 (type 미지정)
          const res = await fetchEvents(
            state.selectedPage,
            d,
            wantType,
            from,
            to,
          );
          events = res.events || [];
          state.eventsCache[key] = events;
        }

        // 클릭/스크롤 분리 렌더
        const clickEvents = events.filter((e) => e.EventType === "click");
        const scrollEvents = events.filter((e) => e.EventType === "scroll");

        if (wantType === "click" || wantType === "both") {
          drawClickHeatmap(canvas, img, clickEvents);
        } else {
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        if (wantType === "scroll" || wantType === "both") {
          drawScrollBar(stage, scrollEvents);
        } else {
          const bar = stage.querySelector(".heatmap-scroll-bar");
          if (bar) bar.style.background = "transparent";
        }

        totalEvents += events.length;
        const head = $canvases.querySelector(
          `.heatmap-device-col[data-device="${d}"] .hdh-events`,
        );
        if (head) head.textContent = `이벤트 ${fmtInt(events.length)}`;
      } catch (e) {
        console.error("loadAndRenderEvents", d, e);
      }
    }
    $eventCount.textContent = `이벤트 ${fmtInt(totalEvents)}`;
  }

  // ─── 툴바 ────────────────────────────────────────────
  function wireToolbar() {
    document
      .querySelectorAll(".heatmap-toolbar .seg-btn[data-range]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          document
            .querySelectorAll(".heatmap-toolbar .seg-btn[data-range]")
            .forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          const v = b.getAttribute("data-range");
          state.rangeDays = v === "all" ? "all" : parseInt(v, 10);
          state.eventsCache = {};
          loadAndRenderEvents();
        }),
      );
    document
      .querySelectorAll(".heatmap-toolbar .seg-btn[data-type]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          document
            .querySelectorAll(".heatmap-toolbar .seg-btn[data-type]")
            .forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          state.eventType = b.getAttribute("data-type");
          state.eventsCache = {};
          loadAndRenderEvents();
        }),
      );
    if ($refreshBtn) {
      $refreshBtn.addEventListener("click", () => {
        state.eventsCache = {};
        bootstrap();
      });
    }
  }

  // ─── 초기 로드 ───────────────────────────────────────
  async function bootstrap() {
    try {
      const data = await fetchPages();
      state.pages = data.pages || [];
      state.screenshots = {};
      (data.screenshots || []).forEach((s) => {
        state.screenshots[s.Page + "|" + s.Device] = s;
      });
      renderPagesList();
      // 첫 페이지 자동 선택 — 등록된 페이지 중 첫 항목
      const firstPage = $pagesList
        .querySelector(".heatmap-page-item")
        ?.getAttribute("data-page");
      if (firstPage) await selectPage(firstPage);
    } catch (e) {
      console.error(e);
      $pagesList.innerHTML =
        '<div class="heatmap-empty">데이터를 불러올 수 없습니다</div>';
    }
  }

  // ─── 시작 ────────────────────────────────────────────
  function init() {
    wireToolbar();
    bootstrap();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
