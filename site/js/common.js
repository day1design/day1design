// ========== HEADER SCROLL ==========
(function initDayoneAnalytics() {
  const tagId = String(window.DAY1_GA4_ID || "").trim();
  const enabled = /^G-[A-Z0-9]+$/i.test(tagId);
  const ATTRIBUTION_KEY = "day1_attribution";

  function cleanParams(params = {}) {
    return Object.fromEntries(
      Object.entries(params).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    );
  }

  function classifySource(raw) {
    const text = String(raw || "").toLowerCase();
    if (/(facebook|instagram|meta|fbclid|fb\.|ig\.|threads)/.test(text)) {
      return { source: "meta", platform: "Meta" };
    }
    if (/(youtube|youtu\.be)/.test(text)) {
      return { source: "youtube", platform: "YouTube" };
    }
    if (/(naver|nclid)/.test(text)) {
      return { source: "naver", platform: "Naver" };
    }
    if (/(google|gclid|doubleclick|adwords)/.test(text)) {
      return { source: "google", platform: "Google" };
    }
    if (/(kakao|daum|tistory)/.test(text)) {
      return { source: "kakao", platform: "Kakao" };
    }
    if (text) return { source: "referral", platform: "Referral" };
    return { source: "homepage", platform: "Homepage" };
  }

  function readStoredAttribution() {
    try {
      return JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function writeStoredAttribution(attribution) {
    try {
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
    } catch {}
  }

  function resolveAttribution() {
    const params = new URLSearchParams(location.search);
    const utmSource = params.get("utm_source") || "";
    const utmMedium = params.get("utm_medium") || "";
    const campaign = params.get("utm_campaign") || "";
    const clickSource =
      (params.has("fbclid") && "fbclid") ||
      (params.has("gclid") && "gclid") ||
      (params.has("nclid") && "nclid") ||
      "";
    let referrerHost = "";
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer && referrer.hostname !== location.hostname) {
        referrerHost = referrer.hostname;
      }
    } catch {}

    const raw = [utmSource, clickSource, referrerHost, utmMedium]
      .filter(Boolean)
      .join(" ");
    if (!raw && !campaign) {
      return (
        readStoredAttribution() || {
          source: "homepage",
          platform: "Homepage",
          campaign: "",
          medium: "",
          referrerHost: "",
        }
      );
    }

    const classified = classifySource(raw);
    const attribution = {
      ...classified,
      campaign,
      medium: utmMedium,
      referrerHost,
    };
    writeStoredAttribution(attribution);
    return attribution;
  }

  const attribution = resolveAttribution();
  window.day1Attribution = function day1Attribution() {
    return { ...attribution };
  };

  window.day1Track = function day1Track(eventName, params = {}) {
    const name = String(eventName || "").trim();
    if (!name || !enabled || typeof window.gtag !== "function") return;
    window.gtag(
      "event",
      name,
      cleanParams({
        traffic_source_platform: attribution.source,
        traffic_source_campaign: attribution.campaign,
        ...params,
      }),
    );
  };

  if (!enabled) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", tagId, {
    page_title: document.title,
    page_location: location.href,
    page_path: location.pathname + location.search,
    traffic_source_platform: attribution.source,
    traffic_source_campaign: attribution.campaign,
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    const text = (link.textContent || link.getAttribute("aria-label") || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);

    let url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }

    if (href.startsWith("tel:")) {
      window.day1Track("phone_click", {
        link_text: text,
        page_path: location.pathname,
      });
      return;
    }

    if (href.startsWith("mailto:")) {
      window.day1Track("email_click", {
        link_text: text,
        page_path: location.pathname,
      });
      return;
    }

    if (url.hostname !== location.hostname && !href.startsWith("#")) {
      window.day1Track("outbound_click", {
        link_domain: url.hostname,
        link_text: text,
        page_path: location.pathname,
      });
      return;
    }

    if (url.pathname.endsWith("/pages/estimates.html")) {
      window.day1Track("estimate_cta_click", {
        link_text: text,
        page_path: location.pathname,
      });
    }
  });
})();

(function initVisitorIpCheck() {
  const apiBase = String(window.DAY1_API_BASE || "").replace(/\/$/, "");
  if (!apiBase || !/^https?:$/.test(location.protocol)) return;
  if (location.pathname.toLowerCase().startsWith("/admin")) return;

  const payload = {
    path: location.pathname + location.search,
    referrer: document.referrer || "",
    title: document.title || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
  };

  const send = () => {
    fetch(`${apiBase}/api/analytics/visit`, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  if (document.readyState === "complete") send();
  else window.addEventListener("load", send, { once: true });
})();

// 헤더는 항상 흰색 배경 고정 (스크롤에 따른 색상 변환 없음)

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

// HTML은 기본 hidden 상태로 시작 (검정 오버레이 플래시 방지).
// dismiss 이력 없거나 24시간 경과했으면 hidden 제거 → 팝업 표시.
if (popupOverlay) {
  const dismissed = localStorage.getItem("day1_popup_dismissed");
  let shouldShow = true;
  if (dismissed) {
    const elapsed = Date.now() - parseInt(dismissed);
    if (elapsed < 24 * 60 * 60 * 1000) shouldShow = false;
  }
  if (shouldShow) popupOverlay.classList.remove("hidden");
}

if (popupClose) popupClose.addEventListener("click", closePopup);
if (popupCloseBtn) popupCloseBtn.addEventListener("click", closePopup);
if (popupDismiss) popupDismiss.addEventListener("click", dismissPopup);

// ========== 하단 탭바 Popover LNB (모바일) ==========
(function initBottomNavPopover() {
  const tabbar = document.querySelector(".bottom-nav");
  if (!tabbar) return;

  const SUBMENUS = {
    about: [
      { label: "DAYONE IS", href: "about.html" },
      { label: "PROJECT FLOW", href: "project-flow.html" },
    ],
    portfolio: [
      { label: "HOUSE 전체", href: "portfolio.html" },
      { label: "20~30평", href: "portfolio.html?size=20-30" },
      { label: "30~40평", href: "portfolio.html?size=30-40" },
      { label: "40~50평", href: "portfolio.html?size=40-50" },
      { label: "50평 이상", href: "portfolio.html?size=50%2B" },
      { separator: true },
      { label: "OFFICE", href: "portfolio.html?cat=office" },
    ],
  };

  const isRoot = !location.pathname.includes("/pages/");
  const prefix = isRoot ? "pages/" : "";
  const currentPath = location.pathname.split("/").pop() || "index.html";
  const currentQuery = location.search;

  // Popover DOM 1개 생성해 재사용
  const pop = document.createElement("div");
  pop.className = "bn-popover";
  pop.setAttribute("role", "menu");
  document.body.appendChild(pop);

  let activeTrigger = null;

  function renderSubmenu(key) {
    const items = SUBMENUS[key];
    if (!items) return;
    pop.innerHTML = items
      .map((item) => {
        if (item.separator) return '<div class="bn-pop-divider"></div>';
        const itemPath = item.href.split("?")[0];
        const itemQuery = item.href.includes("?")
          ? "?" + item.href.split("?")[1]
          : "";
        const isActive = itemPath === currentPath && itemQuery === currentQuery;
        return `<a href="${prefix + item.href}"${isActive ? ' class="active"' : ""}>${item.label}</a>`;
      })
      .join("");
  }

  function positionPopover(trigger) {
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const pw = pop.offsetWidth;
    const margin = 12; // 뷰포트 끝 여유
    const triggerCx = r.left + r.width / 2;
    // popover 중심 좌표를 뷰포트 안쪽으로 clamp
    const minCx = margin + pw / 2;
    const maxCx = vw - margin - pw / 2;
    const cx = Math.max(minCx, Math.min(maxCx, triggerCx));
    pop.style.left = cx + "px";
    // 화살표는 여전히 트리거 탭 중앙을 가리키도록 offset 계산
    pop.style.setProperty("--bn-arrow-x", triggerCx - cx + "px");
  }

  function openPopover(trigger, key) {
    renderSubmenu(key);
    pop.classList.add("open");
    positionPopover(trigger);
    trigger.classList.add("submenu-open");
    activeTrigger = trigger;
  }

  function closePopover() {
    pop.classList.remove("open");
    if (activeTrigger) activeTrigger.classList.remove("submenu-open");
    activeTrigger = null;
  }

  tabbar.querySelectorAll("[data-submenu]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = link.dataset.submenu;
      if (activeTrigger === link) {
        closePopover();
      } else {
        if (activeTrigger) closePopover();
        openPopover(link, key);
      }
    });
  });

  // 외부 클릭 닫기 (popover 내부 클릭은 링크 이동이라 자동 닫힘)
  document.addEventListener("click", (e) => {
    if (!activeTrigger) return;
    if (pop.contains(e.target) || activeTrigger.contains(e.target)) return;
    closePopover();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopover();
  });
  window.addEventListener("resize", closePopover);
})();
