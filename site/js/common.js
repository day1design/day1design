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

// ========== POPUP (어드민에서 등록된 활성 팝업을 동적 노출) ==========
// 좌표: 데스크탑 절대 좌표 (top/left px, 1920×1080 기준). 모바일에서는 화면 중앙 자동.
// 모드: sequential = 한 번에 1개씩 (닫으면 다음), parallel = 활성 팝업 모두 동시.
// dismiss: "1일 보지 않음" 클릭 시 localStorage 에 popup id 별로 24시간 기록.
(function initDynamicPopups() {
  let root = document.getElementById("popupRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "popupRoot";
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
  }
  const POPUP_API =
    (window.DAY1_API_BASE
      ? String(window.DAY1_API_BASE).replace(/\/$/, "")
      : "") + "/api/popups";
  const DISMISS_KEY_PREFIX = "day1_popup_dismissed_";
  const DISMISS_MS = 24 * 60 * 60 * 1000;
  const MOBILE_MAX = 768;

  function isDismissed(id) {
    const v = localStorage.getItem(DISMISS_KEY_PREFIX + id);
    if (!v) return false;
    const t = parseInt(v, 10);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < DISMISS_MS;
  }
  function setDismissed(id) {
    localStorage.setItem(DISMISS_KEY_PREFIX + id, String(Date.now()));
  }

  function isMobile() {
    return window.innerWidth <= MOBILE_MAX;
  }

  // mode: 'modal' = 화면 dim + 중앙 정렬 (sequential / 모바일)
  //       'floating' = dim 없이 좌상단 좌표대로 떠 있음 (parallel 데스크탑)
  function buildPopupNode(p, mode, onClose) {
    const isFloating = mode === "floating";
    const wrap = document.createElement("div");
    wrap.className = isFloating
      ? "popup-overlay popup-overlay--floating"
      : "popup-overlay";
    wrap.dataset.id = p.id;

    const box = document.createElement("div");
    box.className = "popup";
    if (isFloating) {
      box.style.position = "fixed";
      box.style.top = (p.topPx || 0) + "px";
      box.style.left = (p.leftPx || 0) + "px";
    } else {
      box.style.position = "relative";
    }
    if (p.widthPx) box.style.width = p.widthPx + "px";
    box.style.maxWidth = "90vw";

    const close = document.createElement("span");
    close.className = "popup-close";
    close.setAttribute("aria-label", "닫기");
    close.innerHTML = "&times;";

    const imgWrap = p.linkUrl
      ? document.createElement("a")
      : document.createElement("div");
    if (p.linkUrl) {
      imgWrap.href = p.linkUrl;
      imgWrap.target = "_blank";
      imgWrap.rel = "noopener";
    }
    const img = document.createElement("img");
    img.src = p.imageUrl;
    img.alt = p.alt || "";
    img.style.width = "100%";
    img.style.display = "block";
    imgWrap.appendChild(img);

    const footer = document.createElement("div");
    footer.className = "popup-footer";
    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.textContent = "1일 동안 보지 않음";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "닫기";
    footer.appendChild(dismissBtn);
    footer.appendChild(closeBtn);

    box.appendChild(close);
    box.appendChild(imgWrap);
    box.appendChild(footer);
    wrap.appendChild(box);

    function remove() {
      wrap.remove();
      if (typeof onClose === "function") onClose();
    }
    close.addEventListener("click", remove);
    closeBtn.addEventListener("click", remove);
    dismissBtn.addEventListener("click", () => {
      setDismissed(p.id);
      remove();
    });

    return wrap;
  }

  function showSequential(queue) {
    if (!queue.length) return;
    const p = queue.shift();
    if (isDismissed(p.id)) {
      showSequential(queue);
      return;
    }
    root.appendChild(buildPopupNode(p, "modal", () => showSequential(queue)));
  }

  function showParallel(list) {
    list.forEach((p) => {
      if (isDismissed(p.id)) return;
      root.appendChild(buildPopupNode(p, "floating"));
    });
  }

  fetch(POPUP_API, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      const list = Array.isArray(data.popups) ? data.popups : [];
      if (!list.length) return;
      const mode = data.displayMode === "parallel" ? "parallel" : "sequential";
      if (mode === "sequential" || isMobile()) {
        showSequential(list.slice());
      } else {
        showParallel(list);
      }
    })
    .catch(() => {});
})();

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
    // 탭바가 헤더 아래 상단에 위치 → popover는 트리거 탭 하단에서 아래로 떨어진다.
    pop.style.top = r.bottom + 14 + "px";
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
