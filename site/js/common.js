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
