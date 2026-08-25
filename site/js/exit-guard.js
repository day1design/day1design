/**
 * 이탈 방지 브리프 팝업 (exit guard)
 *
 * 진입할 때 히스토리 엔트리를 1개 심어 두고, 뒤로가기가 그 엔트리를 소비하면
 * 페이지를 떠나는 대신 팝업을 띄운다. 팝업은 데이원디자인을 네 줄로 요약해
 * 보여주고 이름·연락처만 받는다. 받은 두 값은 서버에 '작성중' 으로 먼저 저장한
 * 뒤 견적문의 폼으로 넘겨, 방문자가 나머지 항목만 이어서 채우게 한다.
 *
 * "다음에 볼게요" 를 누르면 실제로 이전 페이지(광고 등)로 내보내므로 방문자를
 * 가두지 않는다. 팝업이 떠 있는 상태에서 뒤로가기를 한 번 더 누르면 그때도
 * 붙잡지 않는다. 이 탈출구가 없으면 브라우저 뒤로가기로는 영영 못 나간다.
 *
 * 오버레이(포트폴리오 모달·라이트박스)와의 충돌은 history.state 마커로 구분한다.
 * 스택이 [진입(d1Entry), 가드(d1Guard), 오버레이(d1Overlay)] 순으로 쌓이므로
 * popstate 직후 state 가 d1Entry 일 때만 팝업을 띄운다. 그래서 모달을 닫는
 * 뒤로가기는 팝업을 부르지 않고, main.js 의 popstate 리스너와 등록 순서를
 * 다투지도 않는다.
 *
 * 브라우저 정책 주의: 크롬은 방문자가 페이지를 한 번도 건드리지 않으면
 * (클릭·탭·스크롤이 전혀 없으면) 스크립트가 심은 엔트리를 건너뛴다. 뒤로가기
 * 버튼을 인질로 잡는 수법을 막으려는 정책이라 우회할 방법이 없다. 따라서 광고를
 * 잘못 눌러 즉시 나가는 방문자에게는 작동하지 않고, 스크롤이라도 한 번 한
 * 방문자부터 잡힌다.
 */
(function () {
  "use strict";

  // 견적문의·개인정보·이용약관에서는 띄우지 않는다. 견적문의는 이 팝업이 보내는
  // 도착지이고, 나머지 둘은 법적 고지를 읽는 중에 가리면 안 된다.
  var EXCLUDED = /(estimates|privacy|terms)/i;
  if (EXCLUDED.test(location.pathname)) return;

  var CARRY_KEY = "day1_exitguard_carry"; // 폼으로 넘길 값 (session)
  var CARRIED_KEY = "day1_exitguard_carried"; // 이번 방문에 이미 넘어갔는가
  var LEAD_DONE_KEY = "day1_lead_done"; // 이번 방문에 접수를 마쳤는가
  var DISMISS_KEY = "day1_exitguard_dismissed"; // 24시간 억제
  var DISMISS_MS = 24 * 60 * 60 * 1000;
  var ESTIMATE_PATH = "/pages/estimates";

  function ss(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function dismissedRecently() {
    try {
      var at = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
      return at && Date.now() - at < DISMISS_MS;
    } catch (e) {
      return false;
    }
  }

  // 접수를 이미 마쳤거나, 팝업을 거쳐 폼으로 이미 넘어갔거나, 24시간 안에
  // 닫은 적이 있으면 가드를 아예 심지 않는다.
  if (ss(LEAD_DONE_KEY) || ss(CARRIED_KEY) || dismissedRecently()) return;

  var armed = true;
  var popup = null;
  var sending = false;

  history.replaceState({ d1Entry: 1 }, "");
  history.pushState({ d1Guard: 1 }, "");

  var CSS = [
    "#d1ExitGuard{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.55)}",
    "#d1ExitGuard.open{display:flex}",
    "#d1ExitGuard *{box-sizing:border-box}",
    "#d1ExitGuard .eg-box{position:relative;width:100%;max-width:760px;background:#fff;border-radius:4px;display:grid;grid-template-columns:300px 1fr;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.3);animation:d1egIn .3s cubic-bezier(.2,.8,.3,1);font-family:var(--font-primary,'Apple SD Gothic Neo',sans-serif)}",
    "@keyframes d1egIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}",
    "#d1ExitGuard .eg-x{position:absolute;top:10px;right:12px;width:34px;height:34px;border:0;background:none;color:#999;font-size:26px;line-height:1;cursor:pointer;z-index:2}",
    "#d1ExitGuard .eg-x:hover{color:#212121}",
    "#d1ExitGuard .eg-brief{background:#F1EDE4;padding:34px 28px;color:#3C3733}",
    "#d1ExitGuard .eg-wm{font-size:13px;letter-spacing:4px;color:#5A5448;font-weight:700}",
    "#d1ExitGuard .eg-wm-sub{font-size:10px;letter-spacing:2px;color:#8B8578;margin:2px 0 24px}",
    "#d1ExitGuard .eg-brief-title{font-size:14px;font-weight:700;color:#212121;line-height:1.6;margin:0 0 18px}",
    "#d1ExitGuard .eg-facts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:13px}",
    "#d1ExitGuard .eg-facts li{display:flex;gap:10px;align-items:flex-start}",
    "#d1ExitGuard .eg-facts .num{flex:0 0 auto;min-width:44px;font-size:17px;font-weight:700;color:#5A5448;line-height:1.3}",
    "#d1ExitGuard .eg-facts .lbl{font-size:12px;line-height:1.55;color:#6B6558}",
    "#d1ExitGuard .eg-facts .lbl b{display:block;color:#3C3733;font-weight:700;font-size:12.5px}",
    "#d1ExitGuard .eg-form{padding:36px 32px 26px}",
    "#d1ExitGuard .eg-badge{display:inline-block;margin-bottom:12px;padding:5px 12px;border-radius:999px;background:#F1EDE4;color:#5A5448;font-size:11px;font-weight:700}",
    "#d1ExitGuard h2{margin:0 0 8px;color:#212121;font-size:21px;font-weight:700;line-height:1.45;letter-spacing:-.01em}",
    "#d1ExitGuard .eg-lead{margin:0 0 20px;color:#6B6558;font-size:13px;line-height:1.7}",
    "#d1ExitGuard .eg-f{margin-bottom:12px}",
    "#d1ExitGuard .eg-f label{display:block;font-size:12px;font-weight:700;color:#3C3733;margin-bottom:6px}",
    "#d1ExitGuard .eg-f .req{color:#C0392B}",
    "#d1ExitGuard .eg-f input{width:100%;padding:12px 13px;border:1px solid #E0DCD4;border-radius:3px;font-size:16px;color:#3C3733;background:#fff;outline:none;font-family:inherit}",
    "#d1ExitGuard .eg-f input:focus{border-color:#5A5448}",
    "#d1ExitGuard .eg-f.invalid input{border-color:#C0392B;background:#FDF5F4}",
    "#d1ExitGuard .eg-err{display:none;margin-top:5px;font-size:11.5px;color:#C0392B}",
    "#d1ExitGuard .eg-f.invalid .eg-err{display:block}",
    "#d1ExitGuard .eg-agree{display:flex;gap:8px;align-items:flex-start;margin:14px 0 16px;font-size:11.5px;color:#6B6558;line-height:1.6;cursor:pointer}",
    "#d1ExitGuard .eg-agree input{margin-top:2px;accent-color:#5A5448;width:15px;height:15px;flex:0 0 auto}",
    "#d1ExitGuard .eg-agree a{color:#5A5448;text-decoration:underline}",
    "#d1ExitGuard .eg-cta{display:block;width:100%;padding:15px;border:0;border-radius:3px;background:#5A5448;color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;transition:background .2s;font-family:inherit}",
    "#d1ExitGuard .eg-cta:hover{background:#46413A}",
    "#d1ExitGuard .eg-cta[disabled]{opacity:.6;cursor:default}",
    "#d1ExitGuard .eg-note{margin:8px 0 0;text-align:center;font-size:11.5px;color:#9A9488}",
    "#d1ExitGuard .eg-leave{display:block;width:100%;margin-top:6px;padding:11px;border:0;background:none;color:#999;font-size:12.5px;cursor:pointer;font-family:inherit}",
    "#d1ExitGuard .eg-leave:hover{color:#3C3733}",
    "#d1ExitGuard .eg-hours{margin:14px 0 0;padding-top:13px;border-top:1px solid #E0DCD4;font-size:11px;color:#9A9488;line-height:1.7}",
    "@media (max-width:760px){",
    "#d1ExitGuard{padding:0;align-items:flex-end}",
    "#d1ExitGuard .eg-box{display:block;max-width:100%;border-radius:16px 16px 0 0;max-height:90vh;overflow-y:auto}",
    "#d1ExitGuard .eg-brief{padding:24px 20px 18px}",
    "#d1ExitGuard .eg-wm-sub{margin-bottom:14px}",
    "#d1ExitGuard .eg-brief-title{margin-bottom:14px}",
    "#d1ExitGuard .eg-facts{flex-direction:row;gap:8px}",
    "#d1ExitGuard .eg-facts li{flex:1;flex-direction:column;gap:2px}",
    "#d1ExitGuard .eg-facts .num{font-size:15px;min-width:0}",
    "#d1ExitGuard .eg-facts .lbl{font-size:10.5px}",
    "#d1ExitGuard .eg-facts .lbl b{font-size:11px}",
    "#d1ExitGuard .eg-form{padding:22px 20px 18px}",
    "#d1ExitGuard h2{font-size:18px}",
    "}",
  ].join("");

  var HTML =
    '<div class="eg-box" role="dialog" aria-modal="true" aria-labelledby="d1egTitle">' +
    '<button class="eg-x" type="button" aria-label="닫기">&times;</button>' +
    '<aside class="eg-brief">' +
    '<div class="eg-wm">DAYONE</div>' +
    '<div class="eg-wm-sub">DESIGN</div>' +
    '<p class="eg-brief-title">시간의 흐름에도 변하지 않는<br>공간의 가치를 짓습니다.</p>' +
    '<ul class="eg-facts">' +
    '<li><span class="num">90건</span><span class="lbl"><b>누적 시공 사례</b>홈페이지에 공개된 완공 현장</span></li>' +
    '<li><span class="num">2곳</span><span class="lbl"><b>직영 상담 지점</b>강남 본점 · 판교점</span></li>' +
    '<li><span class="num">8단계</span><span class="lbl"><b>표준 진행 절차</b>내방미팅부터 A/S까지</span></li>' +
    '<li><span class="num">3D</span><span class="lbl"><b>시뮬레이션 제공</b>실측 도면 기반 사전 확인</span></li>' +
    "</ul></aside>" +
    '<div class="eg-form">' +
    '<span class="eg-badge">무료 견적 상담</span>' +
    '<h2 id="d1egTitle">견적만 받아보고 가셔도 됩니다.</h2>' +
    '<p class="eg-lead">이름과 연락처를 먼저 남겨두시면, 이어지는 화면에서 나머지 항목만 채우시면 됩니다. 상담을 신청하셔도 계약 의무는 없습니다.</p>' +
    '<div class="eg-f" data-f="name"><label for="d1egName">이름 <span class="req">*</span></label>' +
    '<input type="text" id="d1egName" autocomplete="name" placeholder="이름을 입력해주세요">' +
    '<div class="eg-err">이름을 입력해주세요.</div></div>' +
    '<div class="eg-f" data-f="phone"><label for="d1egPhone">연락처 <span class="req">*</span></label>' +
    '<input type="tel" id="d1egPhone" inputmode="numeric" autocomplete="tel" placeholder="연락 가능한 번호를 입력해주세요">' +
    '<div class="eg-err">연락처 형식을 확인해주세요.</div></div>' +
    '<label class="eg-agree" data-f="privacy"><input type="checkbox" id="d1egAgree">' +
    '<span>상담 진행을 위한 <a href="/pages/privacy" target="_blank" rel="noopener">개인정보 수집·이용</a>에 동의합니다. (필수)</span></label>' +
    '<button class="eg-cta" type="button">이어서 견적 신청하기</button>' +
    '<p class="eg-note">남은 항목 5개 · 1분이면 끝납니다</p>' +
    '<button class="eg-leave" type="button">다음에 볼게요</button>' +
    '<p class="eg-hours">상담 가능 시간 · 평일 09:00~18:00 / 토요일 10:00~15:00<br>입력하신 정보는 상담 목적으로만 사용합니다.</p>' +
    "</div>";

  function build() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var el = document.createElement("div");
    el.id = "d1ExitGuard";
    el.innerHTML = HTML;
    el.addEventListener("click", function (e) {
      if (e.target === el) hide();
    });
    el.querySelector(".eg-x").addEventListener("click", hide);
    el.querySelector(".eg-cta").addEventListener("click", submit);
    el.querySelector(".eg-leave").addEventListener("click", leave);
    el.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("input", function () {
        var group = input.closest("[data-f]");
        if (group) group.classList.remove("invalid");
      });
    });
    document.body.appendChild(el);
    return el;
  }

  function isOpen() {
    return !!(popup && popup.classList.contains("open"));
  }

  function show() {
    if (!popup) popup = build();
    popup.classList.add("open");
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    // 모바일은 자동 포커스를 주지 않는다 — 키보드가 올라오며 팝업이 접힌다.
    if (window.matchMedia("(min-width: 761px)").matches) {
      var name = document.getElementById("d1egName");
      if (name) name.focus({ preventScroll: true });
    }
    if (typeof window.day1Track === "function") {
      window.day1Track("exit_guard_shown", { page_path: location.pathname });
    }
  }

  function hide() {
    if (popup) popup.classList.remove("open");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") hide();
  }

  // 실제 이탈: 팝업을 띄우면서 가드 엔트리를 다시 쌓았으므로 2칸을 물러난다.
  function leave() {
    armed = false;
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (e) {}
    hide();
    history.go(-2);
  }

  function markInvalid(name, bad) {
    var el = popup && popup.querySelector('[data-f="' + name + '"]');
    if (el) el.classList.toggle("invalid", !!bad);
  }

  function submit() {
    if (sending) return;
    var nameEl = document.getElementById("d1egName");
    var phoneEl = document.getElementById("d1egPhone");
    var agreeEl = document.getElementById("d1egAgree");
    var name = (nameEl.value || "").trim();
    var phoneRaw = (phoneEl.value || "").replace(/[^0-9]/g, "");
    var okName = name.length >= 2 && name.length <= 50;
    var okPhone = /^01[016789][0-9]{7,8}$/.test(phoneRaw);
    markInvalid("name", !okName);
    markInvalid("phone", !okPhone);
    if (!okName || !okPhone) {
      (okName ? phoneEl : nameEl).focus({ preventScroll: true });
      return;
    }
    if (!agreeEl.checked) {
      agreeEl.focus({ preventScroll: true });
      markInvalid("privacy", true);
      return;
    }

    var btn = popup.querySelector(".eg-cta");
    sending = true;
    btn.disabled = true;
    btn.textContent = "저장하는 중…";

    var phone = phoneRaw.replace(
      /^(01[016789])([0-9]{3,4})([0-9]{4})$/,
      "$1-$2-$3",
    );
    var payload = { name: name, phone: phone, ts: Date.now() };

    saveLead(name, phone)
      .then(function (leadKey) {
        payload.leadKey = leadKey || "";
        goToForm(payload);
      })
      .catch(function () {
        // 서버 저장이 실패해도 방문자를 막지 않는다. 값만 들고 폼으로 보내고,
        // 접수는 폼 제출 한 번으로 확정된다(가짜 성공을 만들지 않는다).
        goToForm(payload);
      });
  }

  // 팝업 단계 저장 — Status='작성중' 으로 먼저 남긴다. 폼에서 다시 이탈해도
  // 이름·연락처는 남는다. 응답으로 받은 leadKey 를 폼이 실어 보내면 서버가
  // 새 카드를 만들지 않고 이 레코드를 채워 '접수대기' 로 승격한다.
  function saveLead(name, phone) {
    var base = window.DAY1_API_BASE || "";
    if (!base) return Promise.reject(new Error("no api base"));
    var fd = new FormData();
    fd.append("name", name);
    fd.append("phone", phone);
    fd.append("privacy_agreed", "true");
    fd.append("form_type", "exit_guard");
    fd.append("_hp_field", "");
    fd.append("_ts", String(Date.now() - 60000)); // 팝업은 체류 후 뜨므로 봇 타이밍 아님
    try {
      var raw = localStorage.getItem("_d1_hm_sid");
      if (raw) fd.append("session_id", String(JSON.parse(raw).id || ""));
    } catch (e) {}
    if (window.DAY1_INFLOW_APP) fd.append("inflow_app", window.DAY1_INFLOW_APP);

    return fetch(base + "/api/estimates", { method: "POST", body: fd })
      .then(function (r) {
        return r.ok ? r.json() : Promise.reject(new Error("http " + r.status));
      })
      .then(function (data) {
        return data && data.leadKey ? data.leadKey : "";
      });
  }

  function goToForm(payload) {
    // 값은 sessionStorage 로만 옮긴다. URL 쿼리에 실으면 이름·연락처가 브라우저
    // 히스토리·리퍼러·서버 로그·GA4 보고서에 그대로 남는다.
    try {
      sessionStorage.setItem(CARRY_KEY, JSON.stringify(payload));
      sessionStorage.setItem(CARRIED_KEY, "1");
    } catch (e) {}
    if (typeof window.day1Track === "function") {
      window.day1Track("exit_guard_submit", { page_path: location.pathname });
    }
    armed = false;
    hide();
    location.href = ESTIMATE_PATH + "?from=exit";
  }

  window.addEventListener("popstate", function () {
    var st = history.state;
    if (!st || st.d1Entry !== 1) return; // 오버레이를 닫는 뒤로가기는 통과시킨다

    // 나가기를 눌렀거나 이미 접수를 마친 방문자는 붙잡지 않는다. 가드 엔트리
    // 때문에 뒤로가기 1회가 헛돌지 않도록 남은 엔트리를 대신 소비한다.
    if (!armed || ss(LEAD_DONE_KEY)) {
      armed = false;
      history.back();
      return;
    }

    // 팝업이 떠 있는데 또 뒤로가기를 눌렀다면 정말 나가려는 뜻이므로 보낸다.
    // 이 탈출구가 없으면 브라우저 뒤로가기로는 영영 못 나가는 구조가 된다.
    if (isOpen()) {
      armed = false;
      hide();
      history.back();
      return;
    }

    // 어드민이 등록한 팝업이 이미 떠 있으면 두 겹으로 겹치지 않게 건너뛴다.
    var other = document.querySelector("#popupRoot .popup-overlay");
    if (other) {
      history.pushState({ d1Guard: 1 }, "");
      return;
    }

    history.pushState({ d1Guard: 1 }, ""); // 다음 이탈 시도도 잡도록 다시 쌓는다
    show();
  });
})();
