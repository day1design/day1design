// ========== 공통 어드민 유틸 ==========
const API_BASE = window.ADMIN_API_BASE || "";
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
    if (!location.pathname.endsWith("login.html")) {
      location.href =
        "login.html?next=" +
        encodeURIComponent(location.pathname + location.search);
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
      location.href = "login.html";
      throw new Error("Unauthorized");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
  });
}

// ========== Toast ==========
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

// ========== 인증 가드 (로그인 페이지 외) ==========
async function ensureAuth() {
  if (location.pathname.endsWith("login.html")) return;
  try {
    const me = await api("/api/auth/me");
    if (!me || !me.loggedIn) throw new Error("not logged in");
  } catch {
    clearToken();
    location.href =
      "login.html?next=" +
      encodeURIComponent(location.pathname + location.search);
  }
}

// ========== 날짜 포맷 ==========
function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(+d)) return s;
  return d.toLocaleString("ko-KR", { hour12: false });
}

// ========== 헤더 네비 활성 클래스 ==========
function activateNav(name) {
  document.querySelectorAll(".admin-nav a[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === name);
  });
}

// ========== API 상태 표시 (선택) ==========
async function pingApi() {
  const st = document.getElementById("apiStatus");
  if (!st) return;
  try {
    const res = await fetch(API_BASE + "/api", { credentials: "include" });
    st.dataset.state = res.ok ? "online" : "offline";
    st.querySelector(".txt").textContent = res.ok
      ? "API 연결됨"
      : "API 오프라인";
  } catch {
    st.dataset.state = "offline";
    st.querySelector(".txt").textContent = "API 오프라인";
  }
}

window.adminUtil = {
  api,
  apiUpload,
  getToken,
  setToken,
  clearToken,
  toast,
  ensureAuth,
  fmtDate,
  activateNav,
  pingApi,
  API_BASE,
};
