// ============================================================
// 견적문의 — 간소화 단일 페이지 폼 (2026-05-29 신규버전)
//  · 위저드 폐지 → 한 페이지
//  · 평형대 / 방문상담지점: PC 드롭다운, 모바일 바텀시트
//  · 필수: 이름·연락처·현장주소·평형대·가용예산·희망일정·지점 + 개인정보 동의
//  · 제출은 fire-and-forget (Worker + R2 + D1 + 텔레그램/메일/SMS)
// ============================================================
(function () {
  const form = document.getElementById("estForm");
  if (!form) return;

  // 봇 트랩 타임스탬프 (3초 미만 제출 차단용)
  window._estLoadTs = Date.now();

  const SELECT_OPTIONS = {
    space_size: ["20~30평", "30~40평", "40~50평", "50평 이상"],
    branch: ["강남점", "판교점", "지점 무관"],
  };
  const selections = {};

  // ---------- Daum Postcode (주소 검색) ----------
  const btnAddr = document.getElementById("btnAddr");
  if (btnAddr) {
    btnAddr.addEventListener("click", () => {
      if (typeof daum === "undefined" || !daum.Postcode) return;
      new daum.Postcode({
        oncomplete: (data) => {
          document.getElementById("postcode").value = data.zonecode;
          document.getElementById("address").value =
            data.roadAddress || data.jibunAddress;
          document.getElementById("addressDetail").focus();
          clearInvalid("address");
        },
      }).open();
    });
  }

  // ---------- Custom Select (PC dropdown / mobile bottom sheet) ----------
  function isMobile() {
    return window.matchMedia("(max-width: 600px)").matches;
  }
  function setSelectValue(name, value) {
    selections[name] = value;
    document
      .querySelectorAll(`.select-btn[data-select="${name}"]`)
      .forEach((b) => {
        b.textContent = value;
        b.classList.add("has-value");
      });
    clearInvalid(name);
  }

  // PC dropdown
  let openPanel = null;
  function closePanel() {
    if (openPanel) {
      openPanel.remove();
      openPanel = null;
    }
  }
  document.addEventListener("click", (e) => {
    if (
      openPanel &&
      !openPanel.contains(e.target) &&
      !e.target.classList.contains("select-btn")
    )
      closePanel();
  });
  window.addEventListener("scroll", closePanel, { passive: true });

  function openDropdown(btn, name) {
    closePanel();
    const panel = document.createElement("div");
    panel.className = "select-panel";
    SELECT_OPTIONS[name].forEach((v) => {
      const o = document.createElement("div");
      o.className = "opt" + (selections[name] === v ? " sel" : "");
      o.textContent = v;
      o.addEventListener("click", () => {
        setSelectValue(name, v);
        closePanel();
      });
      panel.appendChild(o);
    });
    const r = btn.getBoundingClientRect();
    panel.style.top = window.scrollY + r.bottom + 6 + "px";
    panel.style.left = window.scrollX + r.left + "px";
    panel.style.width = r.width + "px";
    document.body.appendChild(panel);
    openPanel = panel;
  }

  // Mobile bottom sheet
  const sheet = document.getElementById("sheet");
  const backdrop = document.getElementById("sheetBackdrop");
  const sheetTitle = document.getElementById("sheetTitle");
  const sheetOpts = document.getElementById("sheetOpts");
  function openSheet(name, title) {
    sheetTitle.textContent = title;
    sheetOpts.innerHTML = "";
    SELECT_OPTIONS[name].forEach((v) => {
      const o = document.createElement("div");
      o.className = "opt" + (selections[name] === v ? " sel" : "");
      o.textContent = v;
      o.addEventListener("click", () => {
        setSelectValue(name, v);
        closeSheet();
      });
      sheetOpts.appendChild(o);
    });
    backdrop.classList.add("open");
    requestAnimationFrame(() => sheet.classList.add("open"));
  }
  function closeSheet() {
    sheet.classList.remove("open");
    backdrop.classList.remove("open");
  }
  if (backdrop) backdrop.addEventListener("click", closeSheet);

  document.querySelectorAll(".select-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = btn.dataset.select;
      if (isMobile()) openSheet(name, btn.dataset.title);
      else openDropdown(btn, name);
    });
  });

  // ---------- Validation ----------
  const REQUIRED = [
    { f: "name", get: () => val("name"), label: "이름" },
    { f: "phone", get: () => val("phone"), label: "연락처" },
    { f: "address", get: () => val("address"), label: "상세주소" },
    { f: "space_size", get: () => selections.space_size, label: "평형대" },
    { f: "budget", get: () => val("budget"), label: "가용 예산" },
    { f: "schedule", get: () => val("schedule"), label: "희망 일정" },
    { f: "branch", get: () => selections.branch, label: "방문 상담 지점" },
    {
      f: "privacy",
      get: () => document.getElementById("privacy").checked,
      label: "개인정보 동의",
    },
  ];
  function val(name) {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : "";
  }
  function clearInvalid(field) {
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) el.classList.remove("invalid");
    const err = document.getElementById("estErrMsg");
    if (err) err.style.display = "none";
  }
  form.addEventListener("input", (e) => {
    const grp = e.target.closest("[data-field]");
    if (grp) clearInvalid(grp.dataset.field);
  });
  const privacyEl = document.getElementById("privacy");
  if (privacyEl)
    privacyEl.addEventListener("change", () => clearInvalid("privacy"));

  // ---------- Submit ----------
  const btnSubmit = document.getElementById("btnEstSubmit");
  btnSubmit.addEventListener("click", () => {
    const missing = REQUIRED.filter((r) => !r.get());
    document
      .querySelectorAll("[data-field]")
      .forEach((el) => el.classList.remove("invalid"));
    if (missing.length) {
      missing.forEach((r) => {
        const el = document.querySelector(`[data-field="${r.f}"]`);
        if (el) el.classList.add("invalid");
      });
      const errMsg = document.getElementById("estErrMsg");
      errMsg.textContent =
        "필수 항목을 입력해주세요: " + missing.map((r) => r.label).join(", ");
      errMsg.style.display = "block";
      const first = document.querySelector(`[data-field="${missing[0].f}"]`);
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // 1) DOM 값 캡처 → 2) 즉시 완료 화면 → 3) 백그라운드 전송
    const payload = buildSubmitPayload();
    form.style.display = "none";
    const proc = document.querySelector(".est-process");
    if (proc) proc.style.display = "none";
    document.getElementById("estComplete").style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
    // 전환 추적: GA4 generate_lead + Meta Pixel Lead (eventID 로 서버 CAPI 와 중복제거)
    if (typeof window.day1Track === "function") {
      window.day1Track(
        "generate_lead",
        { method: "estimate_form" },
        { eventID: payload.fields._fb_event_id },
      );
    }
    submitInBackground(payload);
  });

  // ---------- Marketing Attribution (슬러그/utm 보존) ----------
  function readMarketingAttribution() {
    const result = {
      label: "",
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
    };
    try {
      const raw = document.cookie
        .split(/;\s*/)
        .find((p) => p.startsWith("d1d_src="));
      if (raw) {
        const obj = JSON.parse(
          decodeURIComponent(raw.slice("d1d_src=".length)),
        );
        result.label = String(obj.label || "");
        result.utm_source = String(obj.utm?.source || "");
        result.utm_medium = String(obj.utm?.medium || "");
        result.utm_campaign = String(obj.utm?.campaign || "");
      }
    } catch {}
    try {
      const qs = new URLSearchParams(location.search);
      if (qs.get("utm_source")) result.utm_source = qs.get("utm_source");
      if (qs.get("utm_medium")) result.utm_medium = qs.get("utm_medium");
      if (qs.get("utm_campaign")) result.utm_campaign = qs.get("utm_campaign");
      if (qs.get("src")) result.label = qs.get("src");
    } catch {}
    return result;
  }

  function buildSubmitPayload() {
    let sessionId = "";
    try {
      const raw = localStorage.getItem("_d1_hm_sid");
      if (raw) sessionId = String(JSON.parse(raw)?.id || "");
    } catch {}

    const attribution = readMarketingAttribution();

    // Meta CAPI 중복제거용: event_id(브라우저 픽셀+서버 공유) + fbp/fbc 쿠키
    const fbCookie = (name) => {
      try {
        const m = document.cookie
          .split(/;\s*/)
          .find((p) => p.startsWith(name + "="));
        return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
      } catch {
        return "";
      }
    };
    const eventId =
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // 광고별 귀속(common.js 어트리뷰션): 캠페인/소재/광고/ad_id/fbclid
    const att =
      (typeof window.day1Attribution === "function" &&
        window.day1Attribution()) ||
      {};

    const fields = {
      submittedAt: new Date().toISOString(),
      name: val("name"),
      phone: val("phone"),
      email: "", // 간소화 폼은 이메일 미수집 (Worker에서 선택값 처리)
      space_size: selections.space_size || "",
      postcode: val("postcode"),
      address: val("address"),
      address_detail: val("address_detail"),
      schedule: val("schedule"),
      branch: selections.branch || "",
      budget: val("budget"),
      detail: val("detail"),
      referral: attribution.label || "",
      privacy_agreed: document.getElementById("privacy").checked
        ? "true"
        : "false",
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      campaign: attribution.label,
      session_id: sessionId,
      // Meta CAPI 중복제거 (서버가 동일 event_id 로 Lead 재전송)
      _fb_event_id: eventId,
      _fbp: fbCookie("_fbp"),
      _fbc: fbCookie("_fbc"),
      // 광고별 귀속 (pixel_events Lead 기록용)
      _fb_source: att.source || "",
      _fb_campaign: att.campaign || "",
      _fb_adset: att.adset || "",
      _fb_ad: att.ad || "",
      _fb_adid: att.adId || "",
      _fbclid: att.fbclid || "",
      // 봇 트랩 — 중립 필드명(_hp_field)에서 읽어 _hp 로 전송. (자동완성 자석 'website' 제거)
      _hp: val("_hp_field"),
      _ts: String(window._estLoadTs || ""),
    };

    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
    return { fields, formData: fd };
  }

  // ---------- fire-and-forget 전송 ----------
  const ESTIMATES_ENDPOINT =
    typeof window !== "undefined" && window.DAY1_API_BASE
      ? `${window.DAY1_API_BASE.replace(/\/$/, "")}/api/estimates`
      : null;
  const PENDING_KEY = "day1_pending_estimates";

  async function submitInBackground(payload) {
    if (!ESTIMATES_ENDPOINT) {
      queuePending(payload.fields);
      return;
    }
    try {
      const res = await fetch(ESTIMATES_ENDPOINT, {
        method: "POST",
        body: payload.formData,
        keepalive: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      queuePending(payload.fields);
    }
  }

  function queuePending(fields) {
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
      pending.push(fields);
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (e) {}
  }

  async function retryPending() {
    if (!ESTIMATES_ENDPOINT) return;
    let pending = [];
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    } catch (e) {
      return;
    }
    if (!pending.length) return;
    // 신규(간소화) 필수 스키마 충족분만 재시도 — 누락분은 폐기(무한 400 방지)
    const before = pending.length;
    pending = pending.filter(
      (f) =>
        f &&
        f.name &&
        f.phone &&
        f.budget &&
        f.space_size &&
        f.address &&
        f.schedule &&
        f.branch &&
        f.privacy_agreed === "true",
    );
    if (pending.length !== before) {
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      } catch (e) {}
    }
    if (!pending.length) return;
    const remaining = [];
    for (const fields of pending) {
      try {
        const fd = new FormData();
        Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
        const res = await fetch(ESTIMATES_ENDPOINT, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) remaining.push(fields);
      } catch (e) {
        remaining.push(fields);
      }
    }
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
    } catch (e) {}
  }
  retryPending();
})();
