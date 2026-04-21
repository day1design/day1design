// ========== 공통 어드민 유틸 ==========
const API_BASE = (window.ADMIN_API_BASE || "").replace(/\/$/, "");
const TOKEN_KEY = "day1_admin_token";

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}
function setToken(t) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {}
}
function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const token = getToken();
  if (token) headers.set("x-admin-token", token);

  let body = opts.body;
  if (opts.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.json);
  }

  const res = await fetch(API_BASE + path, {
    method: opts.method || "GET",
    headers,
    body,
    credentials: "include",
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
  return data;
}

function apiUpload(path, formData) {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("x-admin-token", token);
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
  if (isLoginPage()) return true;
  try {
    const me = await api("/api/auth/me");
    if (!me || !me.loggedIn) throw new Error("not logged in");
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
    href: "index",
    label: "대시보드",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>',
  },
  {
    nav: "hero",
    href: "hero-slides",
    label: "히어로 슬라이드",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>',
  },
  {
    nav: "portfolio",
    href: "portfolio",
    label: "포트폴리오",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  },
  {
    nav: "community",
    href: "community",
    label: "커뮤니티",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H7l-3 3V5z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="13" x2="13" y2="13"/></svg>',
  },
  {
    nav: "estimates",
    href: "estimates",
    label: "상담신청",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
  },
];

function renderSidebar(currentNav) {
  const sidebar = document.getElementById("adminSidebar");
  if (!sidebar) return;
  sidebar.innerHTML = `<div class="sidebar-brand">
       <div class="sidebar-brand-logo">D1</div>
       <div class="sidebar-brand-text">DAYONE<small>ADMIN</small></div>
     </div>
     <nav class="sidebar-nav" aria-label="주 메뉴">
       ${MENU.map(
         (m) => `
         <a href="${m.href}" data-nav="${m.nav}" class="sidebar-link${
           m.nav === currentNav ? " active" : ""
         }">
           ${m.icon}
           <span>${m.label}</span>
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

  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    clearToken();
    location.href = "login";
  });
}

function initShell() {
  if (isLoginPage()) return;
  const page = window.ADMIN_PAGE || {};
  renderSidebar(page.nav || "");
  renderTopbar(page.title || "관리자");
  bindShellEvents();
}

// 로그인 체크 + shell 주입 (DOM 준비되면 즉시)
function bootstrap() {
  initShell();
  if (!isLoginPage()) {
    ensureAuth().then((ok) => {
      if (ok) pingApi();
    });
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
 * 이미지 파일을 WebP로 자동 변환 후 R2 업로드.
 * @param {File} file
 * @param {object} opts - { folder, maxWidth, quality }
 * @returns {Promise<{url, key}>}
 */
async function uploadImage(file, opts = {}) {
  const folder = opts.folder || "uploads";
  const maxWidth = opts.maxWidth || 1920;
  const quality = opts.quality || 0.82;
  const c = await compressToWebP(file, maxWidth, quality);
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
  apiUpload,
  uploadImage,
  compressToWebP,
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
};
