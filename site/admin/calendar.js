/* 상담 캘린더 — 예약 일시가 잡힌 접수를 월 단위로 본다.
   데이터 원본은 Estimates 하나뿐이다(별도 일정 테이블 없음). 그래서 접수를
   지우거나 예약을 비우면 캘린더에서도 그대로 사라진다 — 동기화 코드가 없다. */
(function () {
  const { api, escapeHtml, toast } = window.adminUtil;
  const $ = (id) => document.getElementById(id);

  const KST = 9 * 3600 * 1000;
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const pad = (n) => String(n).padStart(2, "0");

  // 지점 → 색 클래스. 마이그 0041 기준 4종이고, 그 밖의 값은 회색으로 둔다.
  const BRANCH_CLASS = {
    강남점: "b-gangnam",
    판교점: "b-pangyo",
    "고객 현장": "b-onsite",
    "화상 상담": "b-online",
  };
  const BRANCH_COLOR = {
    강남점: "var(--br-gangnam)",
    판교점: "var(--br-pangyo)",
    "고객 현장": "var(--br-onsite)",
    "화상 상담": "var(--br-online)",
  };
  const BRANCHES = ["강남점", "판교점", "고객 현장", "화상 상담"];
  // 상담이 성사되지 않은 상태는 흐리게 둔다(지우지는 않는다 — 기록은 남는다)
  const DIM_STATUS = ["진행불가 (예산/범위/지역/일정등)", "전화상담 후 미진행"];

  const state = {
    ym: "", // 보고 있는 달 (KST 기준 YYYY-MM)
    selected: "", // 선택한 날짜 (KST 기준 YYYY-MM-DD)
    records: [], // 격자에 그릴 그 달 예약
    // '다가오는 상담'은 보고 있는 달과 따로 둔다. 달을 넘겨 보는 중에도
    // 앞으로의 일정이 계속 보여야 한다("한눈에 확인"이 이 화면의 목적).
    upcoming: [],
    hidden: new Set(), // 필터에서 끈 지점
    loading: false,
  };
  const UPCOMING_DAYS = 90;

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
  function ddayOf(ymd) {
    const diff = dayIndex(ymd) - dayIndex(todayKst());
    if (diff === 0) return { label: "오늘", cls: "today", diff };
    if (diff > 0)
      return { label: `${diff}일 뒤`, cls: diff <= 2 ? "soon" : "", diff };
    return { label: `${-diff}일 전`, cls: "", diff };
  }

  // KST 기준 그 달의 시작·끝을 ISO(UTC)로 바꾼다. 서버는 문자열 비교만 한다.
  function monthRange(ym) {
    const [y, m] = ym.split("-").map(Number);
    return {
      from: new Date(Date.UTC(y, m - 1, 1) - KST).toISOString(),
      to: new Date(Date.UTC(y, m, 1) - KST).toISOString(),
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
  async function fetchRange(from, to) {
    const res = await api(
      `/api/estimates/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    return (res && res.records) || [];
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    const { from, to } = monthRange(state.ym);
    try {
      state.records = await fetchRange(from, to);
    } catch {
      state.records = [];
      toast("상담 일정을 불러오지 못했습니다");
    } finally {
      state.loading = false;
    }
    render();
  }

  // 이번 주 일요일 00:00(KST)부터 90일. 달을 넘겨 봐도 이 목록은 그대로 남는다.
  // 시작을 오늘이 아니라 주 첫날로 잡아야 '이번 주' 집계에 주 초반이 들어간다
  // (목록 자체는 아래에서 오늘 이후만 추린다).
  async function loadUpcoming() {
    const t = todayKst();
    const [y, m, d] = t.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const from = new Date(Date.UTC(y, m - 1, d - dow) - KST).toISOString();
    const to = new Date(
      Date.UTC(y, m - 1, d + UPCOMING_DAYS) - KST,
    ).toISOString();
    try {
      state.upcoming = await fetchRange(from, to);
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
    // 이번 주는 일요일 시작으로 센다(캘린더 격자와 같은 기준)
    const weekStart = ti - new Date(Date.now() + KST).getUTCDay();
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
    const monthNo = Number(state.ym.split("-")[1]);
    const contractN = shown.filter((r) => r.status === "계약완료").length;

    $("ccToday").innerHTML = `${todayN}<small>건</small>`;
    $("ccWeek").innerHTML = `${weekN}<small>건</small>`;
    $("ccMonthLabel").textContent = `${monthNo}월 상담`;
    $("ccContractLabel").textContent = `${monthNo}월 계약 전환`;
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
    const [y, m] = state.ym.split("-").map(Number);
    $("ccLabel").textContent = `${y}. ${pad(m)}`;
    const map = byDay();
    const today = todayKst();
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    // 모바일에서는 칩이 두 줄이라 3건까지 넣으면 셀이 지나치게 길어진다
    const maxChips = window.matchMedia("(max-width: 640px)").matches ? 2 : 3;

    let html = "";
    for (let i = first - 1; i >= 0; i--) {
      html += `<div class="cc-cell other"><span class="d">${prevDays - i}</span></div>`;
    }
    for (let d = 1; d <= days; d++) {
      const ymd = `${y}-${pad(m)}-${pad(d)}`;
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const items = map.get(ymd) || [];
      const cls = [
        "cc-cell",
        dow === 0 ? "sun" : "",
        dow === 6 ? "sat" : "",
        ymd === today ? "today" : "",
        ymd === state.selected ? "sel" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const chips = items
        .slice(0, maxChips)
        .map((r) => {
          // 취소는 회색 취소선으로 남긴다 — 지우지 않는다
          const cls = isCancelled(r)
            ? "cancelled"
            : classOf(r) + (DIM_STATUS.includes(r.status) ? " dim" : "");
          return (
            `<span class="cc-ev ${cls}">` +
            `<span class="t">${kstTimeStr(r.consultAt)}</span>${escapeHtml(r.name || "이름 없음")}</span>`
          );
        })
        .join("");
      const more =
        items.length > maxChips
          ? `<span class="cc-more">＋${items.length - maxChips}건</span>`
          : "";
      html += `<button type="button" class="${cls}" data-ymd="${ymd}"><span class="d">${d}</span>${chips}${more}</button>`;
    }
    // 마지막 주를 7칸으로 채운다
    const filled = first + days;
    const tail = (7 - (filled % 7)) % 7;
    for (let i = 1; i <= tail; i++) {
      html += `<div class="cc-cell other"><span class="d">${i}</span></div>`;
    }
    $("ccGrid").innerHTML = html;
    $("ccGrid")
      .querySelectorAll("[data-ymd]")
      .forEach((el) =>
        el.addEventListener("click", () => {
          state.selected = el.dataset.ymd;
          render();
        }),
      );
  }

  function renderSelected() {
    const ymd = state.selected;
    const items = (byDay().get(ymd) || []).slice();
    if (!ymd) {
      $("ccSelDate").textContent = "날짜를 선택하세요";
      $("ccSelCount").textContent = "";
      $("ccSelList").innerHTML =
        '<div class="cc-empty">캘린더에서 날짜를 누르면<br>그날 상담이 여기 나옵니다.</div>';
      return;
    }
    const [y, m, d] = ymd.split("-").map(Number);
    const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
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
          </div>
        </div>`;
      })
      .join("");

    $("ccSelList")
      .querySelectorAll("[data-cancel]")
      .forEach((el) =>
        el.addEventListener("click", () => toggleCancel(el.dataset.cancel)),
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
        const dow = DOW[new Date(Date.UTC(yy, m - 1, d)).getUTCDay()];
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
      await Promise.all([load(), loadUpcoming()]);
    } catch {
      toast(cancelled ? "되살리지 못했습니다" : "취소하지 못했습니다");
    }
  }

  /* ---------- 월 이동 ---------- */
  function shiftMonth(delta) {
    const [y, m] = state.ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    state.ym = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    // 다른 달로 넘어가면 선택은 지운다(그 달에 없는 날짜가 선택된 채 남지 않게)
    state.selected = "";
    load();
  }
  function goToday() {
    const t = todayKst();
    state.ym = t.slice(0, 7);
    state.selected = t;
    load();
  }

  /* ---------- 시작 ---------- */
  function init() {
    const t = todayKst();
    // 접수 카드의 '일정 확인' 링크가 calendar?date=YYYY-MM-DD 로 넘어온다.
    // 그 날짜의 달을 열고 해당 날짜를 펼쳐 준다.
    const want = new URLSearchParams(location.search).get("date") || "";
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(want) ? want : "";
    state.ym = (valid || t).slice(0, 7);
    state.selected = valid || t;
    $("ccPrev").addEventListener("click", () => shiftMonth(-1));
    $("ccNext").addEventListener("click", () => shiftMonth(1));
    $("ccToday2").addEventListener("click", goToday);
    load();
    loadUpcoming();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
