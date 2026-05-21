// Day1Design 자체 히트맵 트래커
// 명세: HEATMAP_SPEC.md v1.0
// - 클릭(좌표 페이지% 기준) + 스크롤 깊이 max 추적
// - sendBeacon 배치 5s + unload 보장
// - admin/* 경로 미실행, DNT 존중
(function () {
  "use strict";

  // ─── 가드 ─────────────────────────────────────────────
  if (window.__day1HeatmapInit) return;
  window.__day1HeatmapInit = true;

  // DNT 존중
  try {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  } catch (_) {}

  // admin 경로 미실행
  if (/^\/admin(\/|$)/.test(location.pathname)) return;

  // API base
  var API_BASE =
    window.DAY1_API_BASE || "https://day1design-api.day1design-co.workers.dev";

  // ─── 세션 ID (localStorage UUID, 30일 TTL) ─────────────
  // 30일 윈도우 내 같은 SessionId 재등장 = 재방문(returning) 판정
  var SESSION_KEY = "_d1_hm_sid";
  var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        var r = (Math.random() * 16) | 0;
        var v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }
  function getSessionId() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.id && Date.now() - parsed.ts < SESSION_TTL_MS) {
          parsed.ts = Date.now();
          localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
          return parsed.id;
        }
      }
      var id = uuid();
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ id: id, ts: Date.now() }),
      );
      return id;
    } catch (_) {
      return uuid();
    }
  }
  var SESSION_ID = getSessionId();

  // ─── 환경 ─────────────────────────────────────────────
  function getDevice() {
    return window.innerWidth < 768 ? "mobile" : "pc";
  }
  // 단축 URL → 본래 페이지로 정규화 (사용자가 본 페이지 기준 통합 집계)
  // vercel.json rewrites와 동일한 매핑. 사용자가 /HOUSE 로 들어와도
  // 실제로 본 화면은 /pages/portfolio 이므로 본래 페이지에 합산.
  var PAGE_ALIAS = {
    "/HOUSE": "/pages/portfolio",
    "/OFFICE": "/pages/portfolio",
    "/PORTFOLIO": "/pages/portfolio",
    "/COMMUNITY": "/pages/community",
    "/Residential": "/pages/community",
    "/Commercial": "/pages/community",
    "/ESTIMATES": "/pages/estimates",
    "/ABOUT": "/pages/about",
    "/56": "/pages/project-flow",
    "/57": "/pages/about",
  };
  function getPagePath() {
    var p = location.pathname.replace(/\/+$/, "") || "/";
    return PAGE_ALIAS[p] || p;
  }
  function getReferrerHost() {
    try {
      if (!document.referrer) return "";
      var u = new URL(document.referrer);
      if (u.hostname === location.hostname) return "";
      return u.hostname;
    } catch (_) {
      return "";
    }
  }
  function getUtm() {
    var p = new URLSearchParams(location.search);
    return {
      source: p.get("utm_source") || "",
      medium: p.get("utm_medium") || "",
      campaign: p.get("utm_campaign") || "",
    };
  }

  var UTM = getUtm();
  var REFERRER = getReferrerHost();

  // ─── 큐 + 전송 ────────────────────────────────────────
  var queue = [];
  var FLUSH_INTERVAL_MS = 5000;
  var FLUSH_QUEUE_THRESHOLD = 10;
  var MAX_BATCH = 50;

  function envelope(ev) {
    var device = getDevice();
    var pageW =
      document.documentElement.scrollWidth || document.body.scrollWidth || 0;
    var pageH =
      document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    return {
      type: ev.type,
      page: getPagePath(),
      device: device,
      x_pct: ev.x_pct,
      y_pct: ev.y_pct,
      scroll_depth_pct: ev.scroll_depth_pct,
      page_w: pageW,
      page_h: pageH,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      session_id: SESSION_ID,
      referrer: REFERRER,
      utm: UTM,
      ts: Date.now(),
    };
  }

  function flush(syncBeacon) {
    if (!queue.length) return;
    var batch = queue.splice(0, MAX_BATCH);
    var payload = JSON.stringify({ events: batch });
    var url = API_BASE + "/api/heatmap/track";
    try {
      if (syncBeacon && navigator.sendBeacon) {
        var blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
        return;
      }
      // 일반 전송: fetch keepalive (실패 시 silent)
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
        credentials: "omit",
      }).catch(function () {});
    } catch (_) {}
  }

  function push(ev) {
    queue.push(envelope(ev));
    if (queue.length >= FLUSH_QUEUE_THRESHOLD) flush(false);
  }

  setInterval(function () {
    flush(false);
  }, FLUSH_INTERVAL_MS);

  window.addEventListener("pagehide", function () {
    flush(true);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
  });

  // ─── 클릭 핸들러 ──────────────────────────────────────
  document.addEventListener(
    "click",
    function (e) {
      try {
        var pageW =
          document.documentElement.scrollWidth ||
          document.body.scrollWidth ||
          1;
        var pageH =
          document.documentElement.scrollHeight ||
          document.body.scrollHeight ||
          1;
        var x = (e.pageX || e.clientX + window.scrollX || 0) / pageW;
        var y = (e.pageY || e.clientY + window.scrollY || 0) / pageH;
        if (!isFinite(x) || !isFinite(y)) return;
        push({
          type: "click",
          x_pct: Math.max(0, Math.min(1, x)),
          y_pct: Math.max(0, Math.min(1, y)),
        });
      } catch (_) {}
    },
    true,
  );

  // ─── 스크롤 깊이 (max 도달 추적, 변경 시만 전송) ───────
  var lastMaxPct = 0;
  var SCROLL_REPORT_STEP = 0.05; // 5% 단위로만 보고
  function onScroll() {
    try {
      var pageH =
        document.documentElement.scrollHeight ||
        document.body.scrollHeight ||
        1;
      var viewBottom = window.scrollY + window.innerHeight;
      var pct = Math.max(0, Math.min(1, viewBottom / pageH));
      if (pct > lastMaxPct + SCROLL_REPORT_STEP) {
        lastMaxPct = pct;
        push({ type: "scroll", scroll_depth_pct: pct });
      }
    } catch (_) {}
  }
  var scrollTimer = null;
  window.addEventListener(
    "scroll",
    function () {
      if (scrollTimer) return;
      scrollTimer = setTimeout(function () {
        scrollTimer = null;
        onScroll();
      }, 500);
    },
    { passive: true },
  );

  // 페이지 로드 직후 1회 스크롤 측정 (초기 위치 기록)
  setTimeout(onScroll, 1500);

  // 진입 즉시 page_view 이벤트 발사 (단순 방문 카운트)
  // - 1초 미만 이탈 시에도 sendBeacon으로 보장
  push({ type: "page_view", x_pct: 0, y_pct: 0, scroll_depth_pct: 0 });
  // 빠른 이탈 대비 즉시 flush
  flush(true);
})();
