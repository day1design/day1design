/* 업무관리 — 캘린더 히트맵 + 날짜별 업무카드 + 코멘트
   작성 시 번호 입력 모달로 작성자(폴라애드/데이원디자인) 확인. 번호 비노출, IP·시각 기록. */
(function () {
  const { api, escapeHtml, fmtDate, toast } = window.adminUtil;
  const $ = (id) => document.getElementById(id);

  const state = {
    clients: [],
    client: null,
    month: "2026-06",
    works: [],
    selected: null,
    auth: null, // {role,label} or null
    phone: "",
  };

  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const lvl = (n) => (n === 0 ? 0 : n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 3 : 4);
  const pad = (n) => String(n).padStart(2, "0");

  /* ---------- 작성자 인증 ---------- */
  let pendingAction = null; // 번호 확인 후 실행할 작업

  function setAuthChip() {
    const chip = $("authChip");
    if (state.auth) {
      chip.className = "auth-chip auth-ok";
      chip.style.cursor = "pointer";
      chip.style.border = "0";
      chip.textContent =
        state.auth.label +
        (state.auth.role === "admin" ? " (관리자)" : "") +
        " · 변경";
    } else {
      chip.className = "auth-chip auth-no";
      chip.textContent = "미인증 · 뒤 4자리 입력";
    }
  }

  async function verify(phone) {
    try {
      const r = await api("/api/whoami", { method: "POST", json: { phone } });
      if (r && r.ok) {
        state.auth = { role: r.role, label: r.label };
        state.phone = phone;
        try {
          sessionStorage.setItem("day1_works_phone", phone);
        } catch {}
        setAuthChip();
        return true;
      }
    } catch {}
    return false;
  }

  function openAuth(pending) {
    pendingAction = pending || null;
    $("authPhone").value = state.phone || "";
    $("authMsg").textContent = "";
    $("authModal").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("authPhone").focus(), 30);
  }
  function closeAuth() {
    $("authModal").hidden = true;
    document.body.style.overflow = "";
  }
  async function confirmAuth() {
    const phone = $("authPhone").value.trim();
    if (!phone) {
      $("authMsg").textContent = "전화번호 뒤 4자리를 입력하세요.";
      $("authMsg").style.color = "var(--c-danger)";
      return;
    }
    const ok = await verify(phone);
    if (!ok) {
      state.auth = null;
      setAuthChip();
      $("authMsg").textContent =
        "일치하는 번호가 없습니다. 폴라애드 또는 등록된 광고주 전화번호 뒤 4자리를 입력하세요.";
      $("authMsg").style.color = "var(--c-danger)";
      return;
    }
    closeAuth();
    const fn = pendingAction;
    pendingAction = null;
    if (typeof fn === "function") fn();
  }

  // 인증 보장 후 작업 실행. requireAdmin=true 면 폴라애드만.
  function requireAuth(fn, requireAdmin) {
    if (state.auth && (!requireAdmin || state.auth.role === "admin")) {
      fn();
      return;
    }
    if (state.auth && requireAdmin && state.auth.role !== "admin") {
      toast("업무 기록은 폴라애드(관리자)만 작성할 수 있습니다.", "error");
      return;
    }
    openAuth(() => {
      if (requireAdmin && state.auth.role !== "admin") {
        toast("업무 기록은 폴라애드(관리자)만 작성할 수 있습니다.", "error");
        return;
      }
      fn();
    });
  }

  /* ---------- 초기화 ---------- */
  async function init() {
    // 세션에 저장된 번호가 있으면 조용히 사전 인증
    let saved = "";
    try {
      saved = sessionStorage.getItem("day1_works_phone") || "";
    } catch {}
    if (saved) await verify(saved);
    setAuthChip();

    const r = await api("/api/clients");
    state.clients = r.items || [];
    $("clientSel").innerHTML = state.clients
      .map((c) => `<option value="${c.id}">${escapeHtml(c.brand)}</option>`)
      .join("");
    state.client = state.clients[0] ? state.clients[0].id : null;

    $("clientSel").addEventListener("change", (e) => {
      state.client = e.target.value;
      loadMonth();
    });
    $("monthSel").addEventListener("change", (e) => {
      state.month = e.target.value;
      loadMonth();
    });
    $("authChip").addEventListener("click", () => openAuth(null));
    $("authConfirm").addEventListener("click", confirmAuth);
    $("authPhone").addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmAuth();
    });
    $("authModal").addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close")) closeAuth();
    });
    bindWorkModal();
    await loadMonth();
  }

  async function loadMonth() {
    if (!state.client) return;
    const r = await api(
      `/api/works?client=${encodeURIComponent(state.client)}&month=${state.month}`,
    );
    state.works = r.items || [];
    renderCalendar();
    const withWork = [...new Set(state.works.map((w) => w.date))].sort();
    state.selected = withWork.length
      ? withWork[withWork.length - 1]
      : state.month + "-01";
    renderDay();
  }

  function worksByDay(day) {
    return state.works.filter((w) => w.date === `${state.month}-${pad(day)}`);
  }

  function renderCalendar() {
    const [y, m] = state.month.split("-").map(Number);
    $("calLabel").textContent = `${y}. ${pad(m)}`;
    const first = new Date(y, m - 1, 1).getDay();
    const days = new Date(y, m, 0).getDate();
    let html = "";
    for (let i = 0; i < first; i++) html += `<div></div>`;
    for (let d = 1; d <= days; d++) {
      const items = worksByDay(d);
      const n = items.length;
      const issue = items.some((x) => x.type === "특이사항");
      const ds = `${state.month}-${pad(d)}`;
      html += `<button class="cal-cell lv${lvl(n)} ${
        ds === state.selected ? "sel" : ""
      }" data-d="${d}">
        <span class="d">${d}</span>
        ${n ? `<span class="n">${n}</span>` : ""}
        ${issue ? `<span class="issue"></span>` : ""}
      </button>`;
    }
    $("cal").innerHTML = html;
    $("cal")
      .querySelectorAll(".cal-cell")
      .forEach((c) =>
        c.addEventListener("click", () => {
          state.selected = `${state.month}-${pad(+c.dataset.d)}`;
          $("cal")
            .querySelectorAll(".cal-cell")
            .forEach((x) => x.classList.remove("sel"));
          c.classList.add("sel");
          renderDay();
        }),
      );
    const total = state.works.length;
    const prog = state.works.filter((w) => w.type === "진행").length;
    const done = state.works.filter((w) => w.type === "완료").length;
    const issues = state.works.filter((w) => w.type === "특이사항").length;
    $("calSummary").innerHTML =
      `<span>이번 달 업무 <b style="color:var(--c-text)">${total}</b></span>` +
      `<span>진행 <b style="color:#2563eb">${prog}</b></span>` +
      `<span>완료 <b style="color:#16a34a">${done}</b></span>` +
      `<span>특이사항 <b style="color:#d97706">${issues}</b></span>`;
  }

  async function renderDay() {
    const [y, m, d] = state.selected.split("-").map(Number);
    const dow = DOW[new Date(y, m - 1, d).getDay()];
    $("selDate").textContent = `${pad(m)}월 ${pad(d)}일 (${dow})`;
    const items = state.works.filter((w) => w.date === state.selected);
    $("selCount").textContent = items.length
      ? `업무 ${items.length}건`
      : "기록 없음";
    if (!items.length) {
      $("dayCards").innerHTML =
        '<div class="empty-state" style="border:1px dashed var(--c-border);border-radius:10px">이 날의 업무 기록이 없습니다.</div>';
      return;
    }
    const blocks = await Promise.all(items.map(renderCard));
    $("dayCards").innerHTML = blocks.join("");
    bindCardEvents();
  }

  async function renderCard(w) {
    let comments = [];
    try {
      const r = await api(`/api/works/${w.id}/comments`);
      comments = r.items || [];
    } catch {}
    const thread = comments
      .map(
        (c) => `<div class="msg ${c.role}">
          <div>
            <div class="bubble">${escapeHtml(c.body)}</div>
            <div class="meta"><b>${escapeHtml(c.label)}</b> · ${fmtDate(
              c.created_at,
            )} · IP ${escapeHtml(c.ip || "-")}</div>
          </div>
        </div>`,
      )
      .join("");
    const doneLine =
      w.type === "완료" && w.completed_at
        ? `<div style="font-size:11px;color:#16a34a;font-weight:600;margin-bottom:8px">✅ 완료 처리됨 · ${fmtDate(
            w.completed_at,
          )}</div>`
        : "";
    const statusBtn =
      w.type === "완료"
        ? `<button class="btn btn-ghost btn-sm w-status" data-wid="${w.id}" data-to="진행">↩︎ 진행으로 되돌리기</button>`
        : `<button class="btn btn-primary btn-sm w-status" data-wid="${w.id}" data-to="완료">✅ 완료 처리</button>`;
    const actionBar =
      statusBtn +
      `<button class="btn btn-ghost btn-sm w-edit" data-wid="${w.id}">✏️ 수정</button>`;
    return `<div class="wcard ${w.type === "특이사항" ? "issue" : ""}">
      <div style="padding:14px 16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="wtype t-${w.type}">${w.type}</span>
          <b style="font-size:14px">${escapeHtml(w.title)}</b>
          <span style="margin-left:auto;font-size:11px;color:var(--c-text-muted)">${escapeHtml(
            w.author_label,
          )} · IP ${escapeHtml(w.ip || "-")}</span>
        </div>
        ${doneLine}
        ${
          w.body
            ? `<p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 10px">${escapeHtml(
                w.body,
              )}</p>`
            : `<div style="margin-bottom:10px"></div>`
        }
        <div style="display:flex;gap:6px">${actionBar}</div>
      </div>
      <div class="thread">
        ${thread || '<div style="font-size:12px;color:var(--c-text-muted);margin-bottom:8px">아직 코멘트가 없습니다.</div>'}
        <div style="display:flex;gap:6px">
          <input class="wc-input" data-wid="${w.id}" placeholder="코멘트 / 피드백 남기기" style="flex:1;font-size:13px;border:1px solid var(--c-border);border-radius:8px;padding:8px 11px" />
          <button class="btn btn-primary btn-sm wc-send" data-wid="${w.id}">등록</button>
        </div>
      </div>
    </div>`;
  }

  function bindCardEvents() {
    $("dayCards")
      .querySelectorAll(".wc-send")
      .forEach((btn) =>
        btn.addEventListener("click", () => onCommentSubmit(btn.dataset.wid)),
      );
    $("dayCards")
      .querySelectorAll(".wc-input")
      .forEach((inp) =>
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") onCommentSubmit(inp.dataset.wid);
        }),
      );
    $("dayCards")
      .querySelectorAll(".w-status")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          requireAuth(() => patchWork(btn.dataset.wid, btn.dataset.to), true),
        ),
      );
    $("dayCards")
      .querySelectorAll(".w-edit")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          requireAuth(() => openEditModal(btn.dataset.wid), true),
        ),
      );
  }

  async function patchWork(wid, type) {
    try {
      await api(`/api/works/${wid}`, {
        method: "PATCH",
        json: { phone: state.phone, type },
      });
      toast(
        type === "완료" ? "완료 처리되었습니다." : "진행으로 변경되었습니다.",
        "success",
      );
      await loadMonth();
    } catch (e) {
      toast(e.message || "변경 실패", "error");
    }
  }

  function onCommentSubmit(wid) {
    const inp = $("dayCards").querySelector(`.wc-input[data-wid="${wid}"]`);
    const body = inp.value.trim();
    if (!body) return;
    requireAuth(() => postComment(wid, body));
  }

  async function postComment(wid, body) {
    try {
      await api(`/api/works/${wid}/comments`, {
        method: "POST",
        json: { phone: state.phone, body },
      });
      toast("등록되었습니다.", "success");
      renderDay();
    } catch (e) {
      toast(e.message || "등록 실패", "error");
    }
  }

  /* ---------- 업무 기록 추가 / 수정 (폴라애드만) ---------- */
  let editingId = null; // null=추가, 값=해당 업무 수정
  function bindWorkModal() {
    const modal = $("workModal");
    $("btnAddWork").addEventListener("click", () =>
      requireAuth(openWorkModal, true),
    );
    modal.addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close")) closeWork();
    });
    $("wSave").addEventListener("click", saveWork);
    function closeWork() {
      modal.hidden = true;
      document.body.style.overflow = "";
    }
    bindWorkModal._close = closeWork;
  }
  function openWorkModal() {
    editingId = null;
    $("workModalTitle").textContent = "업무 기록 추가";
    $("wSave").textContent = "기록 추가";
    $("wType").value = "완료";
    $("wDate").value = state.selected || state.month + "-01";
    $("wTitle").value = "";
    $("wBody").value = "";
    $("wAuthor").value = state.auth.label;
    $("workModal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function openEditModal(wid) {
    const w = state.works.find((x) => String(x.id) === String(wid));
    if (!w) return;
    editingId = w.id;
    $("workModalTitle").textContent = "업무 수정";
    $("wSave").textContent = "수정 저장";
    $("wType").value = w.type;
    $("wDate").value = w.date;
    $("wTitle").value = w.title;
    $("wBody").value = w.body || "";
    $("wAuthor").value = state.auth.label;
    $("workModal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  async function saveWork() {
    const title = $("wTitle").value.trim();
    if (!title) {
      toast("제목을 입력하세요.", "error");
      return;
    }
    const date = $("wDate").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast("날짜를 확인하세요.", "error");
      return;
    }
    const payload = {
      phone: state.phone,
      date,
      type: $("wType").value,
      title,
      body: $("wBody").value.trim(),
    };
    try {
      if (editingId) {
        await api(`/api/works/${editingId}`, {
          method: "PATCH",
          json: payload,
        });
        toast("업무가 수정되었습니다.", "success");
      } else {
        await api("/api/works", {
          method: "POST",
          json: { ...payload, client_id: state.client },
        });
        toast("업무가 기록되었습니다.", "success");
      }
      bindWorkModal._close();
      state.selected = date;
      // 월이 바뀌었으면 해당 월로 이동
      const ym = date.slice(0, 7);
      if (ym !== state.month) {
        state.month = ym;
        $("monthSel").value = ym;
      }
      await loadMonth();
    } catch (e) {
      toast(e.message || "저장 실패", "error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
