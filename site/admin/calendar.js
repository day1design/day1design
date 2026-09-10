/* 미팅 캘린더 — 예약 일시가 잡힌 접수를 KST 주간 시간표로 본다.
   데이터 원본은 Estimates 하나뿐이다(별도 일정 테이블 없음) — 동기화 코드가
   없다. 취소는 삭제가 아니라 표시다: ConsultCancelledAt 만 적고 일정과 접수는
   그대로 남는다. 변경 이력은 감사 로그(D1 메타 + R2 원문)에 영속된다. */
(function () {
  const { api, escapeHtml, toast } = window.adminUtil;
  const $ = (id) => document.getElementById(id);

  const KST = 9 * 3600 * 1000;
  const DOW = ["월", "화", "수", "목", "금", "토", "일"];
  const pad = (n) => String(n).padStart(2, "0");

  // 지점 → 색 클래스. 화상 상담은 쓰지 않는다(2026-09-03 제외).
  // 목록에 없는 값이 들어와도 회색으로 그려 빠뜨리지 않는다.
  const BRANCH_CLASS = {
    강남점: "b-gangnam",
    판교점: "b-pangyo",
  };
  const BRANCH_COLOR = {
    강남점: "var(--br-gangnam)",
    판교점: "var(--br-pangyo)",
  };
  const BRANCHES = ["강남점", "판교점"];
  // 상담이 성사되지 않은 상태는 흐리게 둔다(지우지는 않는다 — 기록은 남는다)
  const DIM_STATUS = ["진행불가 (예산/범위/지역/일정등)", "전화상담 후 미진행"];

  const state = {
    weekStart: "",
    selected: "", // 선택한 날짜 (KST 기준 YYYY-MM-DD)
    records: [], // 격자에 그릴 그 달 예약
    // '다가오는 상담'은 보고 있는 달과 따로 둔다. 달을 넘겨 보는 중에도
    // 앞으로의 일정이 계속 보여야 한다("한눈에 확인"이 이 화면의 목적).
    upcoming: [],
    hidden: new Set(), // 필터에서 끈 지점
    loading: false,
    truncated: false,
    selectedRecordId: "",
    loadVersion: 0,
  };
  const UPCOMING_DAYS = 90;
  const mobileCalendarQuery = window.matchMedia('(max-width: 640px)');
  const isMobileCalendar = () => mobileCalendarQuery.matches;
  const visibleDays = () => (isMobileCalendar() ? 3 : 7);

  /* ---------- KST 시각 계산 ----------
     ConsultAt 은 ISO(UTC)로 저장된다. 화면은 전부 KST 로 읽어야 하므로
     +9h 한 뒤 getUTC* 로 꺼낸다(로컬 타임존에 기대지 않는다). */
  function kstOf(iso) {
    const t = Date.parse(iso);
    if (!iso || Number.isNaN(t)) return null;
    return new Date(t + KST);
  }
  function kstDateStr(iso) {
    const d = kstOf(iso);
    if (!d) return "";
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function kstTimeStr(iso) {
    const d = kstOf(iso);
    if (!d) return "";
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  function todayKst() {
    const d = new Date(Date.now() + KST);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function dayIndex(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }
  function mondayOffset(date) {
    return (date.getUTCDay() + 6) % 7;
  }
  function weekdayIndex(date) {
    return mondayOffset(date);
  }
  function ddayOf(ymd) {
    const diff = dayIndex(ymd) - dayIndex(todayKst());
    if (diff === 0) return { label: "오늘", cls: "today", diff };
    if (diff > 0)
      return { label: `${diff}일 뒤`, cls: diff <= 2 ? "soon" : "", diff };
    return { label: `${-diff}일 전`, cls: "", diff };
  }

  function weekRange(start, span = 7) {
    const [y, m, d] = start.split("-").map(Number);
    return {
      from: new Date(Date.UTC(y, m - 1, d) - KST).toISOString(),
      to: new Date(Date.UTC(y, m - 1, d + span) - KST).toISOString(),
    };
  }

  function branchOf(r) {
    // 표시 지점은 ConsultBranch 다. Branch(접수 때 고른 희망 지점)와 다를 수 있다.
    return r.consultBranch || "";
  }
  function classOf(r) {
    return BRANCH_CLASS[branchOf(r)] || "b-etc";
  }
  function colorOf(r) {
    return BRANCH_COLOR[branchOf(r)] || "var(--br-etc)";
  }
  function visible(r) {
    const b = branchOf(r);
    return !state.hidden.has(b || "(미지정)");
  }
  // 취소해도 일정은 지우지 않는다. 카드는 남고 '취소'로 표시된다(마이그 0043).
  function isCancelled(r) {
    return !!r.consultCancelledAt;
  }

  /* ---------- 로드 ---------- */
  // 서버가 쪽 단위로 끊어 주므로 nextCursor 가 빌 때까지 이어 받는다.
  // fresh=1 은 방금 내가 저장·취소한 값을 캐시 없이 바로 보기 위한 것이다.
  async function fetchRange(from, to, fresh) {
    const out = [];
    const seen = new Set();
    let cursor = "";
    let truncated = false;
    for (let guard = 0; guard < 5; guard++) {
      const qs =
        `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
        `&limit=200` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "") +
        (fresh ? "&fresh=1" : "");
      const res = await api(`/api/estimates/calendar?${qs}`);
      for (const r of (res && res.records) || []) {
        // 커서가 마지막 건을 다시 포함하므로 id 로 중복을 걸러낸다
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
      }
      if (!res || !res.nextCursor || res.nextCursor === cursor) break;
      cursor = res.nextCursor;
      if (guard === 4) truncated = true;
    }
    return { records: out, truncated };
  }

  async function load(fresh) {
    const requestVersion = ++state.loadVersion;
    const requestedStart = state.weekStart;
    state.loading = true;
    const { from, to } = weekRange(requestedStart, visibleDays());
    try {
      const result = await fetchRange(from, to, fresh);
      if (requestVersion !== state.loadVersion || requestedStart !== state.weekStart) return;
      state.records = result.records;
      state.truncated = result.truncated;
    } catch {
      if (requestVersion !== state.loadVersion || requestedStart !== state.weekStart) return;
      state.records = [];
      toast("상담 일정을 불러오지 못했습니다");
    } finally {
      if (requestVersion === state.loadVersion) state.loading = false;
    }
    render();
  }

  // 이번 주 월요일 00:00(KST)부터 90일. 달을 넘겨 봐도 이 목록은 그대로 남는다.
  // 시작을 오늘이 아니라 주 첫날로 잡아야 '이번 주' 집계에 주 초반이 들어간다
  // (목록 자체는 아래에서 오늘 이후만 추린다).
  async function loadUpcoming(fresh) {
    const t = todayKst();
    const [y, m, d] = t.split("-").map(Number);
    const dow = mondayOffset(new Date(Date.UTC(y, m - 1, d)));
    const from = new Date(Date.UTC(y, m - 1, d - dow) - KST).toISOString();
    const to = new Date(
      Date.UTC(y, m - 1, d + UPCOMING_DAYS) - KST,
    ).toISOString();
    try {
      state.upcoming = (await fetchRange(from, to, fresh)).records;
    } catch {
      state.upcoming = [];
    }
    renderSummary();
    renderUpcoming();
  }

  /* ---------- 렌더 ---------- */
  function render() {
    renderFilter();
    renderSummary();
    renderGrid();
    renderSelected();
    renderUpcoming();
  }

  function renderFilter() {
    const list = [...BRANCHES];
    // 목록에 없는 지점(빈 값 포함)이 실제로 있으면 필터에도 내보낸다
    for (const r of state.records) {
      const b = branchOf(r) || "(미지정)";
      if (!list.includes(b)) list.push(b);
    }
    $("ccFilter").innerHTML = list
      .map((b) => {
        const on = !state.hidden.has(b);
        const color = BRANCH_COLOR[b] || "var(--br-etc)";
        return `<button type="button" class="cc-chip${on ? " on" : ""}" data-branch="${escapeHtml(b)}">
          <span class="dot" style="background:${color}"></span>${escapeHtml(b)}
        </button>`;
      })
      .join("");
    $("ccFilter")
      .querySelectorAll("[data-branch]")
      .forEach((el) =>
        el.addEventListener("click", () => {
          const b = el.dataset.branch;
          if (state.hidden.has(b)) state.hidden.delete(b);
          else state.hidden.add(b);
          render();
        }),
      );
  }

  function renderSummary() {
    const ti = dayIndex(todayKst());
    // 이번 주는 월요일 시작으로 센다(주간 시간표와 같은 기준)
    const weekStart = ti - mondayOffset(new Date(Date.now() + KST));
    const weekEnd = weekStart + 6;

    // 오늘·이번 주는 보고 있는 달과 무관하다 → upcoming 으로 센다.
    // 취소된 예약은 실제로 나가지 않으므로 건수에서 뺀다(카드는 남아 있다).
    let todayN = 0;
    let weekN = 0;
    for (const r of state.upcoming.filter(
      (r) => visible(r) && !isCancelled(r),
    )) {
      const ymd = kstDateStr(r.consultAt);
      if (!ymd) continue;
      const idx = dayIndex(ymd);
      if (idx === ti) todayN++;
      if (idx >= weekStart && idx <= weekEnd) weekN++;
    }

    // 아래 둘은 지금 보고 있는 달의 값이다. 다른 달을 넘겨 봤을 때
    // '이번 달'이라고 적혀 있으면 오해하므로 라벨에 달을 박는다.
    const shown = state.records.filter((r) => visible(r) && !isCancelled(r));
    const contractN = shown.filter((r) => r.status === "계약완료").length;

    $("ccToday").innerHTML = `${todayN}<small>건</small>`;
    $("ccWeek").innerHTML = `${weekN}<small>건</small>`;
    $("ccMonthLabel").textContent = "이번 주 미팅";
    $("ccContractLabel").textContent = "이번 주 계약 전환";
    $("ccMonth").innerHTML = `${shown.length}<small>건</small>`;
    $("ccContract").innerHTML = `${contractN}<small>건</small>`;
  }

  function byDay() {
    const map = new Map();
    for (const r of state.records) {
      if (!visible(r)) continue;
      const ymd = kstDateStr(r.consultAt);
      if (!ymd) continue;
      if (!map.has(ymd)) map.set(ymd, []);
      map.get(ymd).push(r);
    }
    for (const list of map.values())
      list.sort((a, b) => String(a.consultAt).localeCompare(b.consultAt));
    return map;
  }

  function renderGrid() {
    const [y, m, d] = state.weekStart.split("-").map(Number);
    const days = visibleDays();
    const dates = Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
    $("ccLabel").textContent = `${dates[0].replaceAll("-", ".")} – ${dates[days - 1].slice(5).replace("-", ".")}`;
    const grid = $("ccGrid");
    grid.replaceChildren();
    const limitNotice = $("ccLimitNotice");
    limitNotice.hidden = !state.truncated;
    limitNotice.textContent = state.truncated ? "예약이 많아 일부 일정만 표시됩니다. 조회 범위를 줄인 뒤 예약을 진행해 주세요." : "";
    const corner = document.createElement("div");
    corner.className = "cc-week-day";
    corner.textContent = "KST";
    grid.append(corner);
    dates.forEach((date) => {
      const head = document.createElement("div");
      head.className = `cc-week-day${date === todayKst() ? " today" : ""}`;
      const [, mm, dd] = date.split("-");
      head.textContent = `${mm}/${dd} ${DOW[weekdayIndex(new Date(`${date}T00:00:00Z`))]}`;
      grid.append(head);
    });
    for (let hour = 10; hour < 23; hour += 1) {
      const label = document.createElement("div");
      label.className = "cc-week-hour";
      label.style.gridRow = String(hour - 8);
      label.textContent = `${hour}:00`;
      grid.append(label);
      dates.forEach((date, index) => {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = `cc-week-slot${hour > 19 ? " late" : ""}`;
        slot.style.gridColumn = String(index + 2);
        slot.style.gridRow = String(hour - 8);
        slot.disabled = hour > 19 || state.truncated;
        slot.setAttribute("aria-label", `${date} ${hour}:00${hour > 19 ? " 시작 불가" : " 예약 선택"}`);
        slot.onclick = () => { state.selected = date; state.selectedRecordId = ""; renderSelected(); };
        grid.append(slot);
      });
    }
    state.records.forEach((r) => {
      const date = kstDateStr(r.consultAt);
      const index = dates.indexOf(date);
      if (index < 0 || !visible(r)) return;
      const hour = Number(kstTimeStr(r.consultAt).slice(0, 2));
      if (hour < 10 || hour > 22) return;
      const legacy = !r.consultTypeId || r.consultTypeId === "legacy";
      const type = legacy ? "기존 미팅 · 유형 확인 필요" : String(r.consultTypeName || r.consultType || r.meetingType || "이니셜미팅");
      const duration = Number(r.consultDurationMinutes || r.durationMinutes || (type.includes("디자인") ? 180 : 120)) / 60;
      const event = document.createElement("button");
      event.type = "button";
      const oneHour = Math.ceil(duration) === 1;
      event.className = `cc-week-event${oneHour ? " one-hour" : ""}${type.includes("디자인") ? " design" : ""}${legacy ? " legacy" : ""}${isCancelled(r) ? " cancelled" : ""}`;
      const meetingColor = ({blue:"#1d4ed8",green:"#167044",purple:"#6d28d9",orange:"#b45309",pink:"#be185d",teal:"#0f766e"}[r.consultColorKey] || "#1d4ed8");
      event.style.borderLeftColor = meetingColor;
      event.style.setProperty("--meeting-color", meetingColor);
      event.style.gridColumn = String(index + 2);
      event.style.gridRow = `${hour - 8} / span ${Math.max(1, Math.ceil(duration))}`;
      const endHour = hour + Math.ceil(duration);
      const customerLabel = `${r.name || "이름 없음"}${r.assignee ? `(${r.assignee})` : ""}`;
      event.innerHTML = `<strong>${escapeHtml(type)}</strong><span class="cc-week-time">${pad(hour)}:00–${pad(endHour)}:00</span><span class="cc-week-customer">${escapeHtml(customerLabel)}</span>`;
      event.onclick = (e) => { e.stopPropagation(); state.selected = date; state.selectedRecordId = r.id; renderSelected(); };
      grid.append(event);
      if (isCancelled(r)) return;
      const buffer = document.createElement("button");
      buffer.type = "button";
      buffer.className = "cc-week-event buffer";
      buffer.style.gridColumn = String(index + 2);
      buffer.style.gridRow = `${hour - 8 + Math.ceil(duration)} / span 1`;
      const bufferMinutes = Number(r.consultBufferMinutes ?? r.ConsultBufferMinutes ?? 60);
      if (bufferMinutes <= 0) return;
      buffer.textContent = "여유 1시간";
      buffer.setAttribute("aria-label", `${r.name || "예약"} 여유시간 삭제`);
      buffer.onclick = (e) => { e.stopPropagation(); openBufferDialog(r); };
      grid.append(buffer);
    });
  }

  function renderSelected() {
    const ymd = state.selected;
    const allItems = (byDay().get(ymd) || []).slice();
    const items = state.selectedRecordId
      ? allItems.filter((r) => r.id === state.selectedRecordId)
      : allItems;
    if (!ymd) {
      $("ccSelDate").textContent = "날짜를 선택하세요";
      $("ccSelCount").textContent = "";
      $("ccSelList").innerHTML =
        '<div class="cc-empty">캘린더에서 날짜를 누르면<br>그날 상담이 여기 나옵니다.</div>';
      return;
    }
    const [y, m, d] = ymd.split("-").map(Number);
    const dow = DOW[weekdayIndex(new Date(Date.UTC(y, m - 1, d)))];
    const dd = ddayOf(ymd);
    $("ccSelDate").textContent = `${m}월 ${d}일 (${dow})`;
    $("ccSelCount").textContent = items.length
      ? `상담 ${items.length}건 · ${dd.label}`
      : `예약 없음 · ${dd.label}`;

    if (!items.length) {
      $("ccSelList").innerHTML =
        '<div class="cc-empty">이 날짜에 잡힌 상담이 없습니다.</div>';
      return;
    }
    $("ccSelList").innerHTML = items
      .map((r) => {
        const meta = [
          escapeHtml(r.phone || ""),
          escapeHtml(
            [r.spaceType, r.spaceSize, r.address].filter(Boolean).join(" · "),
          ),
          r.assignee ? `담당 ${escapeHtml(r.assignee)}` : "",
        ]
          .filter(Boolean)
          .join("<br>");
        const cancelled = isCancelled(r);
        return `<div class="cc-bk ${cancelled ? "cancelled" : classOf(r)}">
          <div class="cc-bk-top">
            <span class="cc-bk-time">${kstTimeStr(r.consultAt)}</span>
            <span class="cc-bk-branch">${escapeHtml(branchOf(r) || "지점 미정")}</span>
            ${cancelled ? '<span class="cc-cancel-tag">취소</span>' : ""}
          </div>
          <div class="cc-bk-name">${escapeHtml(r.name || "이름 없음")}</div>
          <div class="cc-bk-meta">${meta}</div>
          ${
            cancelled
              ? `<span class="cc-bk-status off">${kstDateStr(r.consultCancelledAt)} 취소함</span>`
              : r.status
                ? `<span class="cc-bk-status">${escapeHtml(r.status)}</span>`
                : ""
          }
          <div class="cc-bk-actions">
            <a class="btn btn-ghost" href="estimates?id=${encodeURIComponent(r.id)}">접수 상세</a>
            ${r.phone ? `<a class="btn btn-ghost" href="tel:${encodeURIComponent(r.phone)}">전화 걸기</a>` : ""}
            <button class="btn btn-ghost" type="button" data-cancel="${escapeHtml(r.id)}">${cancelled ? "취소 해제" : "예약 취소"}</button>
            ${Number(r.consultBufferMinutes ?? r.ConsultBufferMinutes ?? 60) <= 0 ? `<button class="btn btn-ghost" type="button" data-buffer-restore="${escapeHtml(r.id)}">여유 1시간 복원</button>` : ""}
          </div>
        </div>`;
      })
      .join("");

    $("ccSelList")
      .querySelectorAll("[data-cancel]")
      .forEach((el) =>
        el.addEventListener("click", () => toggleCancel(el.dataset.cancel)),
      );
    $("ccSelList")
      .querySelectorAll("[data-buffer-restore]")
      .forEach((el) =>
        el.addEventListener("click", () => setBuffer(el.dataset.bufferRestore, 60)),
      );
  }

  function renderUpcoming() {
    const today = dayIndex(todayKst());
    const rows = state.upcoming
      .filter(visible)
      .filter((r) => {
        const ymd = kstDateStr(r.consultAt);
        return ymd && dayIndex(ymd) >= today;
      })
      .sort((a, b) => String(a.consultAt).localeCompare(b.consultAt))
      .slice(0, 20);

    if (!rows.length) {
      $("ccUpBody").innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--c-text-muted);padding:28px 16px">예정된 상담이 없습니다.</td></tr>';
      return;
    }
    $("ccUpBody").innerHTML = rows
      .map((r) => {
        const ymd = kstDateStr(r.consultAt);
        const [yy, m, d] = ymd.split("-").map(Number);
        const dow = DOW[weekdayIndex(new Date(Date.UTC(yy, m - 1, d)))];
        const dd = ddayOf(ymd);
        // 취소된 예약도 목록에 남긴다. 지우면 "취소된 줄 모르고" 나가게 된다.
        const cancelled = isCancelled(r);
        return `<tr${cancelled ? ' class="off"' : ""}>
          <td><span class="cc-dday ${cancelled ? "cancel" : dd.cls}">${cancelled ? "취소" : dd.label}</span></td>
          <td>${pad(m)}-${pad(d)}(${dow}) ${kstTimeStr(r.consultAt)}</td>
          <td><span class="cc-bdot" style="background:${cancelled ? "var(--br-etc)" : colorOf(r)}"></span>${escapeHtml(r.name || "이름 없음")}${
            branchOf(r) ? ` · ${escapeHtml(branchOf(r))}` : ""
          }</td>
          <td>${escapeHtml(r.phone || "")}${r.assignee ? ` · ${escapeHtml(r.assignee)}` : ""}</td>
          <td>${cancelled ? "예약 취소됨" : escapeHtml(r.status || "")}</td>
        </tr>`;
      })
      .join("");
  }

  /* ---------- 예약 취소·해제 ----------
     취소해도 일정과 접수는 그대로 둔다. ConsultCancelledAt 에 취소 시각만
     적어 캘린더에 '취소'로 남긴다 — 사라지는 일정이나 접수는 없는 구조다. */
  async function toggleCancel(id) {
    const r =
      state.records.find((x) => x.id === id) ||
      state.upcoming.find((x) => x.id === id);
    if (!r) return;
    const cancelled = isCancelled(r);
    const when = `${kstDateStr(r.consultAt)} ${kstTimeStr(r.consultAt)}`;
    const branch = branchOf(r) ? ` · ${branchOf(r)}` : "";
    const ok = window.confirm(
      cancelled
        ? `${r.name || "이 고객"}님의 상담 예약을 다시 살립니다.\n${when}${branch}\n\n` +
            `취소 표시를 지우고 예정된 상담으로 되돌립니다.`
        : `${r.name || "이 고객"}님의 상담 예약을 취소합니다.\n${when}${branch}\n\n` +
            `일정과 접수는 그대로 남고 캘린더에 '취소'로 표시됩니다.\n` +
            `취소 사실은 상담일정관리 채널로 알립니다.`,
    );
    if (!ok) return;
    try {
      await api(`/api/estimates/${encodeURIComponent(id)}`, {
        method: "PATCH",
        json: { ConsultCancelledAt: cancelled ? "" : new Date().toISOString() },
      });
      toast(cancelled ? "예약을 되살렸습니다" : "예약을 취소로 표시했습니다");
      await Promise.all([load(true), loadUpcoming(true)]);
    } catch (error) {
      toast(error?.message === "HTTP 409" ? "다른 예약과 겹쳐 복원할 수 없습니다" : cancelled ? "되살리지 못했습니다" : "취소하지 못했습니다");
    }
  }

  function openBufferDialog(r) {
    document.querySelector(".cc-buffer-dialog")?.remove();
    const dialog = document.createElement("div");
    dialog.className = "cc-buffer-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `<div class="cc-buffer-dialog-card">
      <h3>여유시간 관리</h3>
      <p>${escapeHtml(r.name || "이 고객")} · 미팅 후 1시간을 비워 두고 있습니다.</p>
      <div class="cc-buffer-dialog-actions">
        <button type="button" class="btn btn-ghost" data-buffer-close>닫기</button>
        <button type="button" class="btn btn-primary" data-buffer-delete>여유시간 삭제</button>
      </div>
    </div>`;
    document.body.append(dialog);
    dialog.querySelector("[data-buffer-close]").onclick = () => dialog.remove();
    dialog.querySelector("[data-buffer-delete]").onclick = () => {
      dialog.remove();
      setBuffer(r.id, 0);
    };
  }

  async function setBuffer(id, minutes) {
    try {
      await api(`/api/estimates/${encodeURIComponent(id)}`, {
        method: "PATCH",
        json: { ConsultBufferMinutes: minutes },
      });
      toast(minutes ? "여유시간을 복원했습니다" : "여유시간을 삭제했습니다");
      await Promise.all([load(true), loadUpcoming(true)]);
    } catch (error) {
      const detail = String(error?.message || "").toLowerCase();
      toast(detail.includes("409") || detail.includes("conflict") || detail.includes("overlap") || detail.includes("겹") ? "다른 예약과 겹쳐 여유시간을 복원할 수 없습니다" : minutes ? "여유시간을 복원하지 못했습니다" : "여유시간을 삭제하지 못했습니다");
    }
  }

  function shiftMonth(delta) {
    const [y, m, d] = state.weekStart.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + delta * (isMobileCalendar() ? 3 : 7)));
    state.weekStart = next.toISOString().slice(0, 10);
    state.selected = state.weekStart;
    state.selectedRecordId = "";
    load();
  }
  function goToday() {
    const t = todayKst();
    const [y, m, d] = t.split("-").map(Number);
    const monday = new Date(Date.UTC(y, m - 1, d - mondayOffset(new Date(Date.UTC(y, m - 1, d)))));
    const startOffset = isMobileCalendar() ? Math.floor(mondayOffset(new Date(Date.UTC(y, m - 1, d))) / 3) * 3 : 0;
    state.weekStart = new Date(Date.UTC(y, m - 1, d - mondayOffset(new Date(Date.UTC(y, m - 1, d))) + startOffset)).toISOString().slice(0, 10);
    state.selected = t;
    state.selectedRecordId = "";
    load();
  }

  function bindMobileSwipe() {
    const cal = $("ccGrid")?.parentElement;
    if (!cal) return;
    let start = null;
    let suppressClickUntil = 0;
    cal.addEventListener("pointerdown", (event) => {
      if (!isMobileCalendar()) return;
      start = { x: event.clientX, y: event.clientY };
    });
    cal.addEventListener("pointerup", (event) => {
      if (!start || !isMobileCalendar()) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy)) return;
      suppressClickUntil = Date.now() + 400;
      shiftMonth(dx < 0 ? 1 : -1);
    });
    cal.addEventListener("pointercancel", () => { start = null; });
    cal.addEventListener("click", (event) => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  /* ---------- 시작 ---------- */
  function init() {
    const t = todayKst();
    // 접수 카드의 '일정 확인' 링크가 calendar?date=YYYY-MM-DD 로 넘어온다.
    // 그 날짜의 달을 열고 해당 날짜를 펼쳐 준다.
    const want = new URLSearchParams(location.search).get("date") || "";
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(want) ? want : "";
    const base = valid || t;
    const [y, m, d] = base.split("-").map(Number);
    const offset = mondayOffset(new Date(Date.UTC(y, m - 1, d)));
    const pageOffset = isMobileCalendar() ? Math.floor(offset / 3) * 3 : 0;
    state.weekStart = new Date(Date.UTC(y, m - 1, d - offset + pageOffset)).toISOString().slice(0, 10);
    state.selected = valid || t;
    state.selectedRecordId = "";
    $("ccPrev").addEventListener("click", () => shiftMonth(-1));
    $("ccNext").addEventListener("click", () => shiftMonth(1));
    $("ccToday2").addEventListener("click", goToday);
    bindMobileSwipe();
    mobileCalendarQuery.addEventListener("change", () => {
      const focus = state.selected || state.weekStart;
      const [year, month, day] = focus.split("-").map(Number);
      const offset = mondayOffset(new Date(Date.UTC(year, month - 1, day)));
      const pageOffset = isMobileCalendar() ? Math.floor(offset / 3) * 3 : 0;
      state.weekStart = new Date(Date.UTC(year, month - 1, day - offset + pageOffset)).toISOString().slice(0, 10);
      renderGrid();
      load();
    });
    load();
    loadUpcoming();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
