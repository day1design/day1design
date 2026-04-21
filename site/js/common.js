// ========== PASSWORD GATE ==========
(function () {
  const PASS = "0030";
  const KEY = "day1_auth";
  if (sessionStorage.getItem(KEY) === "1") return;

  document.body.style.overflow = "hidden";
  const gate = document.createElement("div");
  gate.id = "passGate";
  gate.innerHTML = `
    <div style="position:fixed;inset:0;background:#fff;z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:'Century Gothic',sans-serif">
      <h1 style="font-size:20px;letter-spacing:6px;color:#5a5448;margin-bottom:40px">DAYONE DESIGN</h1>
      <p style="color:#999;font-size:13px;margin-bottom:16px">비밀번호를 입력해주세요</p>
      <input id="passInput" type="password" maxlength="10" placeholder="****"
        style="width:200px;padding:12px 16px;border:1px solid #ddd;border-radius:4px;text-align:center;font-size:16px;letter-spacing:4px;outline:none" />
      <button id="passBtn" style="margin-top:12px;padding:10px 40px;background:#5a5448;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer;letter-spacing:1px">확인</button>
      <p id="passErr" style="color:#e74c3c;font-size:12px;margin-top:10px;visibility:hidden">비밀번호가 올바르지 않습니다</p>
    </div>
  `;
  document.body.appendChild(gate);

  const input = document.getElementById("passInput");
  const btn = document.getElementById("passBtn");
  const err = document.getElementById("passErr");

  function tryPass() {
    if (input.value === PASS) {
      sessionStorage.setItem(KEY, "1");
      gate.remove();
      document.body.style.overflow = "";
    } else {
      err.style.visibility = "visible";
      input.value = "";
      input.focus();
    }
  }

  btn.addEventListener("click", tryPass);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryPass();
    else err.style.visibility = "hidden";
  });
  input.focus();
})();

// ========== HEADER SCROLL ==========
const header = document.getElementById("header");
window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 50);
});

// ========== MOBILE MENU ==========
const hamburger = document.getElementById("hamburger");
const mobileNav = document.getElementById("mobileNav");
if (hamburger) {
  hamburger.addEventListener("click", () => {
    mobileNav.classList.toggle("open");
    hamburger.classList.toggle("active");
  });
}

// ========== HEADER DROPDOWN LNB (hover) ==========
(function injectNavDropdowns() {
  const DROPDOWNS = {
    "ABOUT US": [
      { label: "DAYONE IS", href: "about.html" },
      { label: "PROJECT FLOW", href: "project-flow.html" },
    ],
    PORTFOLIO: [
      { label: "HOUSE 전체", href: "portfolio.html" },
      { label: "20~30평", href: "portfolio.html?size=20-30" },
      { label: "30~40평", href: "portfolio.html?size=30-40" },
      { label: "40~50평", href: "portfolio.html?size=40-50" },
      { label: "50평 이상", href: "portfolio.html?size=50%2B" },
      { label: "OFFICE", href: "portfolio.html?cat=office" },
    ],
  };

  // 루트(index.html) 기준에서는 "pages/" prefix, pages/ 내부에서는 그대로
  const isRoot = !location.pathname.includes("/pages/");
  const prefix = isRoot ? "pages/" : "";

  document.querySelectorAll(".nav-list .menu-item").forEach((a) => {
    const en = a.querySelector(".en")?.textContent.trim();
    if (!en || !DROPDOWNS[en]) return;

    const li = a.closest("li");
    if (!li || li.querySelector(".nav-dropdown")) return;
    li.classList.add("nav-item", "has-dropdown");

    const dd = document.createElement("div");
    dd.className = "nav-dropdown";
    const inner = document.createElement("div");
    inner.className = "nav-dropdown-inner";

    // 현재 URL과 매칭되는 항목 active 표시
    const currentPath = location.pathname.split("/").pop() || "index.html";
    const currentQuery = location.search;

    DROPDOWNS[en].forEach((item) => {
      const link = document.createElement("a");
      link.href = prefix + item.href;
      link.textContent = item.label;
      // active 체크: href 끝부분이 현재 URL과 일치하면
      const itemPath = item.href.split("?")[0];
      const itemQuery = item.href.includes("?")
        ? "?" + item.href.split("?")[1]
        : "";
      if (itemPath === currentPath && itemQuery === currentQuery) {
        link.classList.add("active");
      }
      inner.appendChild(link);
    });
    dd.appendChild(inner);
    li.appendChild(dd);
  });

  // nav-list li 전체에 .nav-item 기본 class 부여 (position:relative 적용용)
  document.querySelectorAll(".nav-list li").forEach((li) => {
    li.classList.add("nav-item");
  });
})();

// ========== POPUP ==========
const popupOverlay = document.getElementById("popupOverlay");
const popupClose = document.getElementById("popupClose");
const popupDismiss = document.getElementById("popupDismiss");
const popupCloseBtn = document.getElementById("popupCloseBtn");

function closePopup() {
  if (popupOverlay) popupOverlay.classList.add("hidden");
}

function dismissPopup() {
  const now = new Date().getTime();
  localStorage.setItem("day1_popup_dismissed", now.toString());
  closePopup();
}

if (popupOverlay) {
  const dismissed = localStorage.getItem("day1_popup_dismissed");
  if (dismissed) {
    const elapsed = new Date().getTime() - parseInt(dismissed);
    if (elapsed < 24 * 60 * 60 * 1000) {
      popupOverlay.classList.add("hidden");
    }
  }
}

if (popupClose) popupClose.addEventListener("click", closePopup);
if (popupCloseBtn) popupCloseBtn.addEventListener("click", closePopup);
if (popupDismiss) popupDismiss.addEventListener("click", dismissPopup);
