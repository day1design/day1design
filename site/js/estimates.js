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

  // 이탈 팝업에서 넘어온 접수를 잇는 키. 팝업이 없었으면 빈 문자열로 남는다.
  let carriedLeadKey = "";

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
    { f: "email", get: () => val("email"), label: "이메일" },
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
    // 이메일 형식은 여기서 막는다. 완료 화면을 먼저 띄우는 구조라서, 형식이
    // 어긋난 값을 그대로 보내면 워커가 400 으로 거부해도 고객은 접수된 줄 안다
    // (2026-08-18 전화번호 유령 완료 사고와 같은 경로).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("email"))) {
      const grp = document.querySelector('[data-field="email"]');
      if (grp) grp.classList.add("invalid");
      const errMsg = document.getElementById("estErrMsg");
      errMsg.textContent = "이메일 주소를 정확히 입력해주세요";
      errMsg.style.display = "block";
      if (grp) grp.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // 1) DOM 값 캡처 → 2) 즉시 완료 화면 → 3) 백그라운드 전송
    const payload = buildSubmitPayload();
    form.style.display = "none";
    const proc = document.querySelector(".est-process");
    if (proc) proc.style.display = "none";
    document.getElementById("estComplete").style.display = "block";
    // 접수를 마쳤음을 남긴다 — 이탈 팝업이 다시 붙잡지 않게 한다.
    // 세션 키는 이번 방문용, localStorage 시각은 방문을 넘어 30일간 유효하다.
    // 이미 상담을 신청한 고객에게 "견적 받아보세요" 를 다시 띄우면 안 된다.
    try {
      sessionStorage.setItem("day1_lead_done", "1");
      localStorage.setItem("day1_lead_done_at", String(Date.now()));
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: "smooth" });
    // 전환은 여기서 찍지 않는다 — submitInBackground 가 서버 확정 후에 찍는다.
    submitInBackground(payload);
  });

  // ---------- Marketing Attribution (슬러그/utm 보존) ----------
  // 꼬리표는 "이번 방문"에만 유효하다. d1d_src 쿠키는 30일짜리라 그대로 읽으면
  // 며칠 전에 누른 슬러그가 오늘 접수의 유입경로로 찍힌다(데이터 오염).
  // 우선순위 ① 이번 진입 URL ② 이번 방문 중 잡아둔 값(common.js) ③ 방금 누른 쿠키.
  const MARKETING_ATTR_KEY = "day1_marketing_attr";
  const SLUG_COOKIE_FRESH_MS = 30 * 60 * 1000;

  function emptyAttribution() {
    return { label: "", utm_source: "", utm_medium: "", utm_campaign: "" };
  }

  // 쿠키에는 슬러그를 누른 시각(ts)이 이미 들어있다. 그 시각이 오래됐으면
  // 이번 방문의 출처가 아니므로 버린다.
  function readFreshSlugCookie() {
    try {
      const raw = document.cookie
        .split(/;\s*/)
        .find((p) => p.startsWith("d1d_src="));
      if (!raw) return null;
      const obj = JSON.parse(decodeURIComponent(raw.slice("d1d_src=".length)));
      const clickedAt = Date.parse(obj.ts || "");
      if (!Number.isFinite(clickedAt)) return null;
      if (Date.now() - clickedAt > SLUG_COOKIE_FRESH_MS) return null;
      return {
        label: String(obj.label || ""),
        utm_source: String(obj.utm?.source || ""),
        utm_medium: String(obj.utm?.medium || ""),
        utm_campaign: String(obj.utm?.campaign || ""),
      };
    } catch {
      return null;
    }
  }

  function readMarketingAttribution() {
    try {
      const qs = new URLSearchParams(location.search);
      const label = qs.get("src") || "";
      const utmSource = qs.get("utm_source") || "";
      if (label || utmSource) {
        return {
          label,
          utm_source: utmSource,
          utm_medium: qs.get("utm_medium") || "",
          utm_campaign: qs.get("utm_campaign") || "",
        };
      }
    } catch {}

    try {
      const saved = JSON.parse(
        sessionStorage.getItem(MARKETING_ATTR_KEY) || "null",
      );
      if (saved && (saved.label || saved.utm_source)) {
        return { ...emptyAttribution(), ...saved };
      }
    } catch {}

    return readFreshSlugCookie() || emptyAttribution();
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
      email: val("email"),
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
      // 리퍼러를 지우고 오는 인앱 브라우저·옛 게시판 링크 단서(config.js 판정).
      // 워커는 방문 이력에서 first-touch 를 먼저 찾고, 없을 때 이 값을 폴백으로 쓴다
      // — 첫 페이지에서 바로 접수하면 방문 이벤트가 아직 안 쌓여 있다.
      inflow_app: window.DAY1_INFLOW_APP || "",
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
      // 이탈 팝업에서 넘어온 접수면 그때 발급받은 키를 함께 보낸다. 워커가 이 키로
      // '작성중' 레코드를 찾아 채워 넣기 때문에, 팝업과 폼이 카드 두 장으로
      // 갈라지지 않는다. 팝업을 거치지 않은 접수는 빈 값이다.
      lead_key: carriedLeadKey,
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

  // 전환 추적: GA4 generate_lead + Meta Pixel Lead (eventID 로 서버 CAPI 와 중복제거).
  // 완료화면은 체감속도 때문에 낙관적으로 먼저 띄우지만, 전환은 서버가 접수를
  // 확정한 뒤에만 찍는다. 400·403·500 으로 거부된 제출까지 전환으로 세면 GA4
  // 전환수가 실제 접수보다 부푼다 — 불변규칙 2(가짜 성공 금지)와 같은 취지다.
  // 첫 전송이 실패해 큐로 넘어간 건은 재전송이 성공하는 시점에 한 번만 찍힌다.
  function trackLeadConversion(eventId) {
    if (typeof window.day1Track !== "function") return;
    window.day1Track(
      "generate_lead",
      { method: "estimate_form" },
      { eventID: eventId || "" },
    );
  }

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
      trackLeadConversion(payload.fields._fb_event_id);
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
        else trackLeadConversion(fields._fb_event_id);
      } catch (e) {
        remaining.push(fields);
      }
    }
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
    } catch (e) {}
  }
  retryPending();

  // ============================================================
  // 이탈 팝업에서 넘어온 값 이어받기 (prefill + 도착 위치 고정)
  //
  // 값은 sessionStorage 로만 온다 — URL 쿼리에 실으면 이름·연락처가 브라우저
  // 히스토리·리퍼러·서버 로그·GA4 착지 페이지 보고서에 그대로 남는다.
  //
  // 화면 위치가 중요하다. 값만 채우고 페이지 최상단에 서 있으면 방문자는
  // "왜 처음으로 돌아왔지" 로 받아들이고, 폼 한가운데에 서면 "뭘 놓쳤나" 가
  // 된다. 그래서 안내 배너 윗선 — 배너·이미 채워진 두 칸·다음에 쓸 칸이 한
  // 화면에 들어오는 위치 — 로 정확히 맞춘다.
  // ============================================================
  const CARRY_KEY = "day1_exitguard_carry";
  const CARRY_MAX_AGE_MS = 30 * 60 * 1000;

  function readCarry() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(CARRY_KEY);
      // 1회용 — 남겨두면 뒤로 갔다 다시 들어올 때 지운 값이 되살아나 덮어쓴다.
      sessionStorage.removeItem(CARRY_KEY);
    } catch (e) {}
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || !data.name || !data.phone) return null;
      // 오래된 값이 다른 방문에 섞이지 않게 만료 처리한다.
      if (data.ts && Date.now() - data.ts > CARRY_MAX_AGE_MS) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function buildCarryBanner(name) {
    const box = document.createElement("div");
    box.className = "est-carry";
    box.innerHTML =
      '<div class="est-carry-head"><span class="est-carry-chk">✓</span>' +
      `<span>${name}님, 입력하신 정보를 옮겨왔습니다.</span></div>` +
      "<p>이름과 연락처는 이미 채워져 있습니다. 남은 항목만 작성해주시면 접수가 완료됩니다.</p>";
    return box;
  }

  // 화면 위를 덮는 고정 요소의 실제 높이.
  // 모바일은 헤더(70px) 아래에 탭바(58px)가 하나 더 붙어 있어서 #header 만
  // 재면 58px 이 가려진다. --header-height 가 그 합(128px)을 들고 있으므로
  // 이 값을 먼저 쓰고, 없을 때만 요소를 실측한다.
  function stickyOffset() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      "--header-height",
    );
    const fromVar = parseFloat(raw);
    if (Number.isFinite(fromVar) && fromVar > 0) return fromVar;
    const header = document.getElementById("header");
    return header ? header.getBoundingClientRect().height : 0;
  }

  // 도착 지점 = 안내 배너 윗선 − 고정 요소 높이 − 여백.
  function scrollToCarry(banner, instant) {
    const headerH = stickyOffset();
    const top = banner.getBoundingClientRect().top + window.scrollY;
    const target = Math.round(top - headerH - 16);
    // 계산이 문서 범위를 벗어나면 움직이지 않는다. 엉뚱한 곳으로 튀는 것보다
    // 최상단에 그대로 서 있는 편이 낫다.
    if (!Number.isFinite(target) || target < 0) return;
    if (target > document.documentElement.scrollHeight) return;
    window.scrollTo({ top: target, behavior: instant ? "auto" : "auto" });
  }

  function applyCarry() {
    const data = readCarry();
    if (!data) return;

    const nameEl = document.getElementById("name");
    const phoneEl = document.getElementById("phone");
    const privacyEl = document.getElementById("privacy");
    if (!nameEl || !phoneEl || !form) return;

    // 방문자가 이미 입력한 값은 덮어쓰지 않는다. 작성 중이던 내용을 지우는 것이
    // 가장 나쁜 오작동이다.
    if (!nameEl.value.trim()) nameEl.value = data.name;
    if (!phoneEl.value.trim()) phoneEl.value = data.phone;
    if (privacyEl && data.privacy !== false) privacyEl.checked = true;
    carriedLeadKey = String(data.leadKey || "");

    document
      .querySelectorAll('[data-field="name"], [data-field="phone"]')
      .forEach((el) => el.classList.add("carried"));

    const banner = buildCarryBanner(data.name);
    form.parentNode.insertBefore(banner, form);

    // 레이아웃이 확정된 뒤에 좌표를 잡는다. 폼 위쪽 영역이 늦게 그려지면
    // 미리 계산한 좌표가 밀린다.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        scrollToCarry(banner, true);
        // PC 만 다음 빈칸으로 커서를 옮긴다. 모바일에서 포커스를 주면 키보드가
        // 올라오며 화면이 접혀 위치가 다시 어긋나고, 방문자는 원치 않은 키보드를
        // 닫는 동작부터 하게 된다.
        if (window.matchMedia("(min-width: 601px)").matches) {
          const next = document.getElementById("postcode");
          if (next) next.focus({ preventScroll: true });
        }
      }),
    );

    // 이미지 로딩으로 위쪽 높이가 바뀌면 도착선이 밀린다. 한 번 더 확인하고
    // 20px 넘게 어긋났을 때만 조용히 보정한다.
    window.addEventListener(
      "load",
      () => {
        const drift = banner.getBoundingClientRect().top - stickyOffset() - 16;
        if (Math.abs(drift) > 20) scrollToCarry(banner, true);
      },
      { once: true },
    );

    if (typeof window.day1Track === "function") {
      window.day1Track("exit_guard_form_view", { page_path: "/estimates" });
    }
    // 어드민 유입통계가 읽을 영속 기록. 팝업이 실제로 폼까지 데려왔는지는
    // 이 이벤트로만 확인된다(팝업 쪽 submit 은 이동 직전에 찍히므로, 중간에
    // 이탈하면 도착 사실이 남지 않는다).
    recordExitGuardFormView();
  }

  function recordExitGuardFormView() {
    const base = window.DAY1_API_BASE || "";
    if (!base) return;
    let sid = "";
    try {
      const raw = localStorage.getItem("_d1_hm_sid");
      if (raw) sid = String(JSON.parse(raw)?.id || "");
    } catch (e) {}
    const body = JSON.stringify({
      events: [
        {
          type: "form_view",
          page: "/pages/estimates",
          device: window.innerWidth < 768 ? "mobile" : "pc",
          session_id: sid,
          inflow_app: window.DAY1_INFLOW_APP || "",
        },
      ],
    });
    try {
      fetch(base + "/api/exit-guard/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  }

  // 뒤로가기로 이 페이지에 다시 들어왔을 때 브라우저가 옛 스크롤 위치를
  // 복원하며 우리가 잡은 위치를 덮어쓰는 것을 막는다.
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (e) {}

  applyCarry();
})();
