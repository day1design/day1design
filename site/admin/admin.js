// ========== 공통 어드민 유틸 ==========
const API_BASE = (window.ADMIN_API_BASE || "").replace(/\/$/, "");
const TOKEN_KEY = "day1_admin_token";
const ADMIN_LOGO_SRC = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/logo/logo-dayone.webp";
const apiInflight = new Map();
const apiControllers = new Set();
const apiMetrics = { requests: 0, deduped: 0, completed: 0, failed: 0, totalMs: 0 };
let loadingPending = 0;
let loadingShowTimer = null;
let authEpoch = 0;

function ensureLoadingStyles() {
  if (document.querySelector('link[data-admin-loading-style]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "admin-loading.css?v=20260910";
  link.dataset.adminLoadingStyle = "true";
  document.head.appendChild(link);
}

function ensureLoadingOverlay() {
  if (document.getElementById("adminLoadingOverlay")) return;
  ensureLoadingStyles();
  const overlay = document.createElement("div");
  overlay.id = "adminLoadingOverlay";
  overlay.className = "admin-loading-overlay";
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-busy", "false");
  overlay.innerHTML = `<div class="admin-loading-card" role="status">
    <img class="admin-loading-logo" src="${ADMIN_LOGO_SRC}" alt="데이원디자인" width="64" height="64" decoding="async">
    <div class="admin-loading-title">DAYONE ADMIN</div>
    <div class="admin-loading-status">불러오는 중</div>
  </div>`;
  document.body.appendChild(overlay);
}

function setLoadingPending(delta) {
  loadingPending = Math.max(0, loadingPending + delta);
  const overlay = document.getElementById("adminLoadingOverlay");
  if (!overlay) return;
  if (loadingPending > 0) {
    if (!overlay.classList.contains("is-visible") && !loadingShowTimer) {
      loadingShowTimer = window.setTimeout(() => {
        loadingShowTimer = null;
        if (loadingPending > 0) {
          overlay.classList.add("is-visible");
          overlay.setAttribute("aria-busy", "true");
        }
      }, 120);
    }
    return;
  }
  if (loadingShowTimer) {
    window.clearTimeout(loadingShowTimer);
    loadingShowTimer = null;
  }
  overlay.classList.remove("is-visible");
  overlay.setAttribute("aria-busy", "false");
}

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}
function setToken(t) {
  try {
    const previous = localStorage.getItem(TOKEN_KEY) || "";
    localStorage.setItem(TOKEN_KEY, t);
    if (previous !== t) resetSessionState();
  } catch {}
}
function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    resetSessionState();
  } catch {}
}

function resetSessionState() {
  authEpoch += 1;
  apiControllers.forEach((controller) => controller.abort());
  apiInflight.clear();
  try {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith("admin_cache:")) sessionStorage.removeItem(key);
    });
  } catch {}
}

async function api(path, opts = {}) {
  const method = String(opts.method || "GET").toUpperCase();
  const isGet = method === "GET" && opts.dedupe !== false && !opts.signal;
  const headers = new Headers(opts.headers || {});
  const headerKey = [...headers.entries()]
    .map(([name, value]) => `${name.toLowerCase()}:${value}`)
    .sort()
    .join("|");
  const requestKey = isGet ? `${authEpoch}:${method}:${API_BASE + path}:${headerKey}` : "";
  if (isGet && apiInflight.has(requestKey)) {
    apiMetrics.deduped += 1;
    return apiInflight.get(requestKey);
  }

  let body = opts.body;
  if (opts.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.json);
  }

  // 이중 보강: cookie 외에 localStorage 토큰을 Authorization 헤더로 자동 전송
  const tok = getToken();
  if (tok && !headers.has("authorization")) {
    headers.set("authorization", "Bearer " + tok);
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? (method === "GET" ? 15000 : 0);
  const timeoutId = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  apiControllers.add(controller);
  const startedAt = performance.now();
  const request = (async () => {
    apiMetrics.requests += 1;
    setLoadingPending(1);
    let externalAbort;
    try {
      if (opts.signal) {
        externalAbort = () => controller.abort();
        if (opts.signal.aborted) controller.abort();
        else opts.signal.addEventListener("abort", externalAbort, { once: true });
      }
      const res = await fetch(API_BASE + path, {
        method,
        headers,
        body,
        credentials: "include",
        signal: controller.signal,
      });

      if (res.status === 401) {
        clearToken();
        if (!isLoginPage()) {
          location.href =
            "login?next=" + encodeURIComponent(location.pathname + location.search);
        }
        throw new Error("Unauthorized");
      }
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {}
      if (!res.ok) {
        const err = (data && data.error) || `HTTP ${res.status}`;
        throw new Error(err);
      }
      apiMetrics.completed += 1;
      if (method !== "GET") cacheInvalidate();
      return data;
    } catch (error) {
      apiMetrics.failed += 1;
      throw error;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      apiControllers.delete(controller);
      if (opts.signal && externalAbort) opts.signal.removeEventListener("abort", externalAbort);
      apiMetrics.totalMs += performance.now() - startedAt;
      setLoadingPending(-1);
      if (isGet) apiInflight.delete(requestKey);
    }
  })();
  if (isGet) apiInflight.set(requestKey, request);
  return request;
}

// ========== SESSION CACHE ==========
// 페이지 전환 시 Worker API 재조회 지연을 줄이기 위한 얇은 세션 캐시.
// 저장/수정 직후에는 cacheInvalidate 로 해당 경로를 비워야 함.
const CACHE_PREFIX = "admin_cache:";

async function apiCached(path, opts = {}) {
  const ttl = opts.ttl ?? 30_000; // 기본 30초
  const key = `${CACHE_PREFIX}${authEpoch}:${path}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const { t, data } = JSON.parse(raw);
      if (Date.now() - t < ttl) return data;
    }
  } catch {}
  const data = await api(path, opts);
  try {
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {}
  return data;
}

function cacheInvalidate(pathPrefix) {
  try {
    if (!pathPrefix) {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k);
      });
      return;
    }
    const full = CACHE_PREFIX + authEpoch + ":" + pathPrefix;
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith(full)) sessionStorage.removeItem(k);
    });
  } catch {}
}

function apiUpload(path, formData) {
  const headers = new Headers();
  return fetch(API_BASE + path, {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  }).then(async (res) => {
    if (res.status === 401) {
      clearToken();
      location.href = "login";
      throw new Error("Unauthorized");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    cacheInvalidate();
    return data;
  });
}

function isLoginPage() {
  const p = location.pathname;
  return p.endsWith("/login") || p.endsWith("/login.html");
}

function toast(msg, type = "") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2400);
}

async function ensureAuth() {
  if (isLoginPage()) {
    document.body.classList.add("auth-ready");
    return true;
  }
  try {
    const me = await api("/api/auth/me");
    if (!me || !me.loggedIn) throw new Error("not logged in");
    document.body.classList.add("auth-ready");
    return true;
  } catch {
    clearToken();
    location.href =
      "login?next=" + encodeURIComponent(location.pathname + location.search);
    return false;
  }
}

function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(+d)) return s;
  return d.toLocaleString("ko-KR", { hour12: false });
}

async function pingApi() {
  const st = document.getElementById("apiStatus");
  if (!st) return;
  try {
    const res = await fetch(API_BASE + "/api", { credentials: "include" });
    st.dataset.state = res.ok ? "online" : "offline";
    const txt = st.querySelector(".txt");
    if (txt) txt.textContent = res.ok ? "API 연결됨" : "API 오프라인";
  } catch {
    st.dataset.state = "offline";
    const txt = st.querySelector(".txt");
    if (txt) txt.textContent = "API 오프라인";
  }
}

// ========== SHELL (사이드바 + 상단바) ==========
const MENU = [
  {
    nav: "home",
    href: "dashboard",
    label: "대시보드",
    shortLabel: "홈",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>',
  },
  {
    nav: "hero",
    href: "hero-slides",
    label: "히어로 슬라이드",
    shortLabel: "히어로",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>',
  },
  {
    nav: "portfolio",
    href: "portfolio",
    label: "포트폴리오",
    shortLabel: "시공",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  },
  {
    nav: "popups",
    href: "popups",
    label: "팝업",
    shortLabel: "팝업",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="14" height="11" rx="2"/><rect x="8" y="9" width="13" height="11" rx="2" fill="white"/></svg>',
  },
  {
    nav: "community",
    href: "community",
    label: "커뮤니티",
    shortLabel: "커뮤니티",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H7l-3 3V5z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="13" x2="13" y2="13"/></svg>',
  },
  {
    nav: "estimates",
    href: "estimates",
    label: "상담신청",
    shortLabel: "상담",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
  },
  {
    nav: "calendar",
    href: "calendar",
    label: "미팅 시간표",
    shortLabel: "캘린더",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>',
  },
  {
    nav: "sms",
    href: "sms",
    label: "문자발송",
    shortLabel: "문자",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12a8 8 0 1 1-3.06-6.3"/><path d="M21 4v5h-5"/><circle cx="8" cy="11" r=".7" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r=".7" fill="currentColor" stroke="none"/><circle cx="16" cy="11" r=".7" fill="currentColor" stroke="none"/></svg>',
  },
  {
    nav: "meeting-settings",
    href: "meeting-settings",
    label: "미팅 설정",
    shortLabel: "미팅 설정",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.7l2-1.2-1.8-3.1-2.1 1a7 7 0 0 0-2.9-1.7V3h-3.6v2.3a7 7 0 0 0-2.9 1.7l-2.1-1-1.8 3.1 2 1.2A7 7 0 0 0 5.4 12c0 .6.1 1.2.2 1.7l-2 1.2 1.8 3.1 2.1-1a7 7 0 0 0 2.9 1.7V21H14v-2.3a7 7 0 0 0 2.9-1.7l2.1 1 1.8-3.1-2-1.2c.1-.5.2-1.1.2-1.7z"/></svg>',
  },
  {
    nav: "analytics",
    href: "analytics",
    label: "유입통계",
    shortLabel: "통계",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>',
  },
  {
    nav: "heatmap",
    href: "heatmap",
    label: "히트맵",
    shortLabel: "히트맵",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
  },
  {
    nav: "meta-ads",
    href: "meta-ads",
    label: "Meta 광고",
    shortLabel: "광고",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 10v11"/><path d="M19 10v11"/><path d="M9 21V14h6v7"/><path d="M5 10l7-7 7 7"/></svg>',
  },
  {
    nav: "kpi",
    href: "kpi",
    label: "KPI",
    shortLabel: "KPI",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5"/><path d="M4 19h17"/><path d="M7 15l3-4 3 2 5-7"/><circle cx="18" cy="6" r="1" fill="currentColor" stroke="none"/></svg>',
  },
  {
    nav: "search-trends",
    href: "search-trends",
    label: "검색 트렌드",
    shortLabel: "검색",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><path d="M8 11l2 2 3-4"/></svg>',
  },
  {
    nav: "pixel-events",
    href: "pixel-events",
    label: "픽셀 이벤트",
    shortLabel: "픽셀",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  },
  {
    nav: "marketing-links",
    href: "marketing-links",
    label: "마케팅 슬러그",
    shortLabel: "슬러그",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07L11 5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07L13 19"/></svg>',
  },
  {
    nav: "audit",
    href: "audit-logs",
    label: "관리자 로그",
    shortLabel: "로그",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16v4H4z"/><path d="M4 12h16v4H4z"/><path d="M4 20h10"/></svg>',
  },
  {
    nav: "works",
    href: "works",
    label: "업무관리",
    shortLabel: "업무",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="M8.5 12l2 2 4-4"/></svg>',
  },
  {
    nav: "health",
    href: "health",
    label: "시스템 상태",
    shortLabel: "상태",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l2-5 4 11 2-6h6"/></svg>',
  },
];
const ANALYTICS_MENU_ORDER = ["analytics", "meta-ads", "kpi", "estimates"];
MENU.sort((a, b) => {
  const ai = ANALYTICS_MENU_ORDER.indexOf(a.nav);
  const bi = ANALYTICS_MENU_ORDER.indexOf(b.nav);
  if (ai === -1 && bi === -1) return 0;
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
});

function renderSidebar(currentNav) {
  const sidebar = document.getElementById("adminSidebar");
  if (!sidebar) return;
  sidebar.innerHTML = `<div class="sidebar-brand">
       <div class="sidebar-brand-logo">
         <img src="https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/favicon/favicon-192.png"
              alt="데이원디자인" width="30" height="30" decoding="async" />
       </div>
       <div class="sidebar-brand-text">DAYONE<small>ADMIN</small></div>
     </div>
     <nav class="sidebar-nav" aria-label="주 메뉴">
       ${MENU.map(
         (m) => `
         <a href="${m.href}" data-nav="${m.nav}" class="sidebar-link${
           m.nav === currentNav ? " active" : ""
         }">
           ${m.icon}
           <span class="nav-label-full">${m.label}</span>
           <span class="nav-label-short">${m.shortLabel || m.label}</span>
         </a>`,
       ).join("")}
     </nav>
     <div class="sidebar-footer">
       <div class="sidebar-user">
         <div class="sidebar-user-name">관리자</div>
         <div class="sidebar-user-email">day1design</div>
       </div>
       <button class="sidebar-logout" id="btnLogout" type="button">로그아웃</button>
     </div>`;
}

function renderTopbar(title) {
  const topbar = document.getElementById("adminTopbar");
  if (!topbar) return;
  topbar.innerHTML = `<div class="admin-topbar-left">
       <button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="메뉴 열기">
         <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <line x1="3" y1="6" x2="21" y2="6"/>
           <line x1="3" y1="12" x2="21" y2="12"/>
           <line x1="3" y1="18" x2="21" y2="18"/>
         </svg>
       </button>
       <h1>${title || "관리자"}</h1>
     </div>
     <div class="admin-topbar-right">
       <div class="admin-status" id="apiStatus" data-state="unknown">
         <span class="dot"></span><span class="txt">API 확인 중</span>
       </div>
       <button class="topbar-logout" id="btnLogoutTop" type="button" aria-label="로그아웃">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
           <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
           <polyline points="16 17 21 12 16 7"/>
           <line x1="21" y1="12" x2="9" y2="12"/>
         </svg>
       </button>
     </div>`;
}

function bindShellEvents() {
  const sidebar = document.getElementById("adminSidebar");
  const backdrop = document.getElementById("adminBackdrop");
  const toggle = document.getElementById("sidebarToggle");

  const close = () => {
    sidebar?.classList.remove("open");
    backdrop?.classList.remove("show");
    document.body.classList.remove("drawer-open");
  };
  const open = () => {
    sidebar?.classList.add("open");
    backdrop?.classList.add("show");
    document.body.classList.add("drawer-open");
  };

  toggle?.addEventListener("click", () => {
    if (sidebar?.classList.contains("open")) close();
    else open();
  });
  backdrop?.addEventListener("click", close);
  sidebar?.querySelectorAll(".sidebar-link").forEach((a) => {
    a.addEventListener("click", close);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  const doLogout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    clearToken();
    location.href = "login";
  };
  document.getElementById("btnLogout")?.addEventListener("click", doLogout);
  document.getElementById("btnLogoutTop")?.addEventListener("click", doLogout);
}

// 모바일 하단 GNB(핵심 5탭) — 자주 쓰는 4개 + '전체'. 640px 이하에서만 노출(CSS 제어).
const MOBILE_CORE = ["home", "estimates", "sms", "health"];

function renderMobileNav(currentNav) {
  if (document.getElementById("adminBotnav")) return; // 1회만 생성
  const core = MOBILE_CORE.map((n) => MENU.find((m) => m.nav === n)).filter(
    Boolean,
  );

  const botnav = document.createElement("nav");
  botnav.className = "admin-botnav";
  botnav.id = "adminBotnav";
  botnav.setAttribute("aria-label", "하단 메뉴");
  botnav.innerHTML =
    core
      .map(
        (m) =>
          `<a href="${m.href}" data-nav="${m.nav}" class="botnav-tab${m.nav === currentNav ? " active" : ""}">${m.icon}<span>${m.shortLabel || m.label}</span></a>`,
      )
      .join("") +
    `<button type="button" class="botnav-tab botnav-more" id="botnavMore" aria-label="전체 메뉴">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
       <span>전체</span>
     </button>`;

  const mask = document.createElement("div");
  mask.className = "admin-sheet-mask";
  mask.id = "adminSheetMask";

  const sheet = document.createElement("div");
  sheet.className = "admin-sheet";
  sheet.id = "adminSheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "전체 메뉴");
  sheet.innerHTML =
    `<div class="sheet-handle"></div><h3>전체 메뉴</h3><div class="sheet-grid">` +
    MENU.map(
      (m) =>
        `<a href="${m.href}" data-nav="${m.nav}" class="sheet-cell${m.nav === currentNav ? " active" : ""}">${m.icon}<span>${m.shortLabel || m.label}</span></a>`,
    ).join("") +
    `</div>`;

  document.body.appendChild(botnav);
  document.body.appendChild(mask);
  document.body.appendChild(sheet);

  const close = () => {
    sheet.classList.remove("show");
    mask.classList.remove("show");
    document.body.classList.remove("sheet-open");
  };
  document.getElementById("botnavMore").addEventListener("click", () => {
    sheet.classList.add("show");
    mask.classList.add("show");
    document.body.classList.add("sheet-open");
  });
  mask.addEventListener("click", close);
  sheet
    .querySelectorAll(".sheet-cell")
    .forEach((a) => a.addEventListener("click", close));
}

function initShell() {
  if (isLoginPage()) return;
  const page = window.ADMIN_PAGE || {};
  renderSidebar(page.nav || "");
  renderTopbar(page.title || "관리자");
  renderMobileNav(page.nav || "");
  bindShellEvents();
}

// 로그인 체크 + shell 주입 (DOM 준비되면 즉시)
function bootstrap() {
  // 페이지 진입마다 sessionStorage 의 admin_cache 통째 무효화 — 캐시된 옛
  // 응답이 새 데이터/필터를 가리던 사고 차단. apiCached 는 페이지 내 빠른
  // 재호출만 절감하고, 새 페이지 진입 = 신선한 데이터 보장.
  cacheInvalidate();
  if (!isLoginPage()) ensureLoadingOverlay();
  initShell();
  if (!isLoginPage()) {
    // 토큰이 있으면 인증 왕복(/api/auth/me, 크로스오리진 ~200ms+)을 기다리지 않고
    // 즉시 표시 — 그 동안 레이아웃이 visibility:hidden 으로 '빈 화면'처럼 보이던
    // 체감 지연 제거. 검증은 백그라운드로 계속하고, 무효 토큰이면 api() 401 →
    // 로그인 리다이렉트로 처리되므로 데이터 노출 위험 없음.
    if (getToken()) document.body.classList.add("auth-ready");
    ensureAuth().then((ok) => {
      if (ok) pingApi();
    });
  } else {
    document.body.classList.add("auth-ready");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}

// ========== DRAG & DROP SORT (공통) ==========
/**
 * 카드 그리드의 드래그 순서 교체 + 외부 파일 drop 처리를 일괄 바인딩.
 * 각 카드에는 draggable="true" + dataset.index 필요.
 * @param {object} opts
 *  - container: HTMLElement (카드들의 부모)
 *  - itemSelector: string (기본 ".drag-card")
 *  - onReorder: (srcIdx, destIdx) => void   — 내부 순서 교체 시
 *  - onFileDrop: (targetIdx, file) => void  — 외부 이미지 파일 drop 시
 */
function initDragSort(opts) {
  const { container, onReorder, onFileDrop } = opts;
  const itemSelector = opts.itemSelector || ".drag-card";
  let srcIdx = null;

  container.addEventListener("dragstart", (e) => {
    const card = e.target.closest(itemSelector);
    if (!card) return;
    srcIdx = parseInt(card.dataset.index, 10);
    card.classList.add("dragging");
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(srcIdx));
    } catch {}
  });

  container.addEventListener("dragend", (e) => {
    const card = e.target.closest(itemSelector);
    if (card) card.classList.remove("dragging");
    container.querySelectorAll(".drag-over, .file-over").forEach((el) => {
      el.classList.remove("drag-over", "file-over");
    });
    srcIdx = null;
  });

  container.addEventListener("dragover", (e) => {
    const card = e.target.closest(itemSelector);
    if (!card) return;
    e.preventDefault();
    const types = e.dataTransfer.types || [];
    const hasFiles = types.includes && types.includes("Files");
    if (hasFiles) {
      e.dataTransfer.dropEffect = "copy";
      card.classList.add("file-over");
    } else {
      e.dataTransfer.dropEffect = "move";
      const idx = parseInt(card.dataset.index, 10);
      if (srcIdx !== null && idx !== srcIdx) card.classList.add("drag-over");
    }
  });

  container.addEventListener("dragleave", (e) => {
    const card = e.target.closest(itemSelector);
    if (!card) return;
    // 카드 경계를 벗어났을 때만 해제
    const related = e.relatedTarget;
    if (related && card.contains(related)) return;
    card.classList.remove("drag-over", "file-over");
  });

  container.addEventListener("drop", (e) => {
    const card = e.target.closest(itemSelector);
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    const targetIdx = parseInt(card.dataset.index, 10);
    card.classList.remove("drag-over", "file-over");

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/") && typeof onFileDrop === "function") {
        onFileDrop(targetIdx, file);
      }
      srcIdx = null;
      return;
    }

    if (
      srcIdx !== null &&
      srcIdx !== targetIdx &&
      typeof onReorder === "function"
    ) {
      onReorder(srcIdx, targetIdx);
    }
    srcIdx = null;
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ========== WEBP 압축 + 업로드 ==========
/**
 * File → Canvas → WebP Blob 변환. 이미지가 아니면 원본 그대로 통과.
 * @param {File} file
 * @param {number} maxWidth  기본 1920
 * @param {number} quality   0.0~1.0, 기본 0.82
 * @returns {Promise<{blob, name, size, type}>}
 */
function compressToWebP(file, maxWidth = 1920, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      resolve({
        blob: file,
        name: file.name,
        size: file.size,
        type: file.type,
      });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지 디코딩 실패"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((maxWidth / w) * h);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("WebP 변환 실패"));
            const base = file.name.replace(/\.[^.]+$/, "") || "image";
            resolve({
              blob,
              name: `${base}.webp`,
              size: blob.size,
              type: "image/webp",
            });
          },
          "image/webp",
          quality,
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 저용량 LQIP(흐림 미리보기) 생성 — 원본 File 을 작은 폭(기본 32px)으로 줄여
 * data:image/jpeg base64 로 반환. 히어로 첫 화면 즉시 표시 + '점점 선명(현상)' 용.
 * 로컬 File 에서 캔버스로 그리므로 CORS taint 없음. 실패 시 "" 반환(파이프라인 비차단).
 * @param {File} file
 * @param {number} w  목표 가로 픽셀(기본 32)
 * @returns {Promise<string>} data URL 또는 ""
 */
function makeLqipDataUrl(file, w = 32) {
  return new Promise((resolve) => {
    try {
      if (!file || !file.type || !file.type.startsWith("image/"))
        return resolve("");
      const reader = new FileReader();
      reader.onerror = () => resolve("");
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => resolve("");
        img.onload = () => {
          try {
            const ratio = img.height / img.width || 0.6;
            const cw = Math.max(8, Math.min(48, w));
            const ch = Math.max(6, Math.round(cw * ratio));
            const canvas = document.createElement("canvas");
            canvas.width = cw;
            canvas.height = ch;
            canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
            resolve(canvas.toDataURL("image/jpeg", 0.5));
          } catch {
            resolve("");
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } catch {
      resolve("");
    }
  });
}

/**
 * 이미지 파일을 WebP로 자동 변환 후 R2 업로드.
 * skipCompressUnder(bytes) 가 지정되고 파일이 그 이하면 원본 그대로 업로드.
 * @param {File} file
 * @param {object} opts - { folder, maxWidth, quality, skipCompressUnder, onLocalPreview }
 *   onLocalPreview(localUrl): 압축 직후 objectURL 콜백 — 업로드 완료 전 즉시 미리보기용
 * @returns {Promise<{url, key}>}
 */
async function uploadImage(file, opts = {}) {
  const folder = opts.folder || "uploads";
  const maxWidth = opts.maxWidth || 1920;
  const quality = opts.quality || 0.82;
  const skipCompressUnder = Number(opts.skipCompressUnder) || 0;
  const onLocalPreview =
    typeof opts.onLocalPreview === "function" ? opts.onLocalPreview : null;

  let c;
  if (
    skipCompressUnder > 0 &&
    file &&
    file.size <= skipCompressUnder &&
    String(file.type || "").startsWith("image/")
  ) {
    // 원본 통과: 압축/리사이즈/포맷변환 없음
    c = { blob: file, name: file.name, size: file.size, type: file.type };
  } else {
    c = await compressToWebP(file, maxWidth, quality);
  }

  // 즉시 미리보기 (objectURL) — 호출처가 받아 화면에 바로 표시
  if (onLocalPreview && c.blob) {
    try {
      onLocalPreview(URL.createObjectURL(c.blob));
    } catch {}
  }

  const fd = new FormData();
  fd.append("file", c.blob, c.name);
  fd.append("folder", folder);
  fd.append("name", c.name);
  return apiUpload("/api/upload/image", fd);
}

function slugify(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/\\_]+/g, "-")
    .toLowerCase()
    .replace(/[^\w가-힣\-.]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatBytes(n) {
  if (!n || n < 0) return "0B";
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + "KB";
  return (n / 1024 / 1024).toFixed(1) + "MB";
}

window.adminUtil = {
  api,
  apiCached,
  cacheInvalidate,
  apiUpload,
  uploadImage,
  compressToWebP,
  makeLqipDataUrl,
  slugify,
  formatBytes,
  getToken,
  setToken,
  clearToken,
  toast,
  ensureAuth,
  fmtDate,
  pingApi,
  initDragSort,
  escapeHtml,
  API_BASE,
  getApiMetrics: () => ({ ...apiMetrics, inflight: apiInflight.size, loadingPending }),
};
