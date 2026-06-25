// ========== 시스템 상태 (헬스 점검 + 실시간 작동로그) ==========
(function () {
  const { api, escapeHtml } = window.adminUtil;
  const $ = (id) => document.getElementById(id);

  const ST = {
    ok: { label: "정상", cls: "st-ok", icon: "🟢" },
    warn: { label: "주의", cls: "st-warn", icon: "🟡" },
    fail: { label: "오류", cls: "st-fail", icon: "🔴" },
  };

  // 각 점검 항목의 기준 설명 (API metric/log 외 보조 안내)
  const CRITERIA = {
    intake: "D1 쓰기 가능 · 접수 흐름 · '오류' 상태 스파이크 없음",
    ga4: "OAuth refresh token 유효 · 토큰 발급 정상",
    metadata: "Graph 토큰 유효 · 광고계정(act_) 접근",
    sens: "발신번호 등록 + 자격증명 완비",
    metalead: "최근 리드 유입 + 동반 SMS 발송(불일치=누락)",
  };

  // 항목별 단색 SVG 아이콘 (무엇을 점검하는지 직관 표시)
  const ICON = {
    intake:
      '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.5z"/>',
    ga4: '<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/>',
    metadata:
      '<path d="M3 11l18-5v12L3 14z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    sens: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    metalead:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  };
  const svgIcon = (k) =>
    ICON[k]
      ? `<svg class="hc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`
      : "";

  const CH = {
    homepage: { label: "홈페이지", cls: "ch-home" },
    instagram: { label: "메타·인스타", cls: "ch-insta" },
    facebook: { label: "메타·페북", cls: "ch-fb" },
  };

  const STEP_LABEL = {
    d1: "D1",
    lms: "LMS",
    telegram: "알림",
    email: "메일",
    emailCustomer: "고객메일",
    capi: "CAPI",
    r2: "R2",
  };
  const STEP_ORDER = [
    "d1",
    "lms",
    "telegram",
    "email",
    "emailCustomer",
    "capi",
    "r2",
  ];

  function fmtKst(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(+d)) return iso;
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function fmtKstFull(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(+d)) return iso;
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  let evFilter = "all";

  /* ---------- 최신 점검 + 카드 + 이력 ---------- */
  function renderLatest(latest, history) {
    const bar = $("hcOverall");
    if (!latest) {
      bar.className = "hc-pill st-warn";
      bar.innerHTML = `<span class="hc-dot"></span> 점검 기록 없음 — 매일 04:00 자동 점검 예정`;
      $("hcMeta").textContent = "";
      $("hcCards").innerHTML =
        `<div class="empty" style="grid-column:1/-1">아직 점검 데이터가 없습니다.</div>`;
      return;
    }
    const ov = ST[latest.overall] || ST.ok;
    const counts = { ok: 0, warn: 0, fail: 0 };
    latest.results.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    bar.className = `hc-pill ${ov.cls}`;
    const head =
      latest.overall === "ok"
        ? "전체 정상"
        : latest.overall === "warn"
          ? "주의 — 확인 권장"
          : "오류 — 조치 필요";
    bar.innerHTML = `<span class="hc-dot"></span> ${head}`;
    $("hcMeta").innerHTML =
      `마지막 점검 <b>${fmtKstFull(latest.checkedAt)}</b> · ${latest.triggeredBy === "manual" ? "수동" : "자동"}`;
    $("cntOk").textContent = counts.ok;
    $("cntFail").textContent = counts.fail;
    $("cntWarn").textContent = counts.warn;

    $("hcCards").innerHTML = latest.results
      .map((r, i) => {
        const st = ST[r.status] || ST.ok;
        return `<div class="hc-card ${r.status === "fail" ? "is-fail" : ""}">
        <div class="hc-card-top">
          <h3>${svgIcon(r.key)}${escapeHtml(r.label)}</h3>
          <span class="hc-pill ${st.cls}" style="font-size:11px;padding:3px 9px"><span class="hc-dot"></span>${st.label}</span>
        </div>
        <div class="hc-metric">${escapeHtml(r.metric || "")}</div>
        <div class="hc-crit">점검: ${escapeHtml(CRITERIA[r.key] || "")}</div>
        <button class="hc-logtoggle" data-card="${i}">작동 로그 ▾</button>
        <div class="hc-log">${escapeHtml(r.log || "")}</div>
      </div>`;
      })
      .join("");
    document.querySelectorAll(".hc-logtoggle").forEach((b) => {
      b.addEventListener("click", () =>
        b.closest(".hc-card").classList.toggle("show-log"),
      );
    });

    renderHistory(history || []);
  }

  function renderHistory(history) {
    const body = $("histBody");
    if (!history.length) {
      body.innerHTML = `<tr><td colspan="8" class="empty">점검 이력이 없습니다.</td></tr>`;
      return;
    }
    const order = ["intake", "ga4", "metadata", "sens", "metalead"];
    body.innerHTML = history
      .map((h) => {
        const ov = ST[h.overall] || ST.ok;
        const byKey = {};
        (h.results || []).forEach((r) => (byKey[r.key] = r.status));
        const cells = order
          .map(
            (k) => `<td class="c">${(ST[byKey[k]] || { icon: "·" }).icon}</td>`,
          )
          .join("");
        return `<tr>
        <td>${fmtKstFull(h.checkedAt)}</td>
        <td><span style="font-size:11px;padding:1px 7px;border-radius:5px;background:${h.triggeredBy === "manual" ? "#f4efe4;color:#5a5448" : "#eef0f3;color:#6b7280"}">${h.triggeredBy === "manual" ? "수동" : "자동"}</span></td>
        <td><span class="hc-pill ${ov.cls}" style="font-size:11px;padding:2px 8px"><span class="hc-dot"></span>${ov.label}</span></td>
        ${cells}
      </tr>`;
      })
      .join("");
  }

  /* ---------- 실시간 작동로그 ---------- */
  function stepTag(key, val) {
    if (!val) return "";
    const m = {
      ok: ["s-ok", "✓"],
      skip: ["s-skip", "⏭"],
      fail: ["s-fail", "✗"],
    }[val];
    if (!m) return "";
    return `<span class="step ${m[0]}">${STEP_LABEL[key] || key}${m[1]}</span>`;
  }

  function renderEvents(items) {
    const list = $("evList");
    if (!items.length) {
      list.innerHTML = `<div class="empty">표시할 접수 이벤트가 없습니다.</div>`;
      return;
    }
    list.innerHTML = items
      .map((e, i) => {
        const st = ST[e.overall] || ST.ok;
        const ch = CH[e.channel] || { label: e.channel || "—", cls: "ch-home" };
        const steps = STEP_ORDER.filter((k) => e.steps && e.steps[k])
          .map((k) => stepTag(k, e.steps[k]))
          .join("");
        const extra = Object.keys(e.steps || {})
          .filter((k) => !STEP_ORDER.includes(k))
          .map((k) => stepTag(k, e.steps[k]))
          .join("");
        return `<div>
        <div class="ev row-${e.overall}" data-ev="${i}">
          <div style="font-family:ui-monospace,monospace;color:var(--c-text-sub)">${escapeHtml(fmtKst(e.at))}</div>
          <div><span class="chtag ${ch.cls}">${escapeHtml(ch.label)}</span></div>
          <div style="font-weight:600">${escapeHtml(e.branch || "—")}</div>
          <div class="cust">${escapeHtml((e.name || "") + " " + (e.phone || ""))}</div>
          <div style="color:var(--c-text-sub)">${escapeHtml(e.geo || "—")}</div>
          <div class="steps">${steps}${extra}</div>
          <div style="text-align:right"><span class="hc-pill ${st.cls}" style="font-size:11px;padding:2px 8px"><span class="hc-dot"></span>${st.label}</span></div>
        </div>
        <div class="ev-detail" id="evd${i}"><div>${escapeHtml(JSON.stringify(e.steps || {}))} · ${escapeHtml(e.estimateId || "")}</div></div>
      </div>`;
      })
      .join("");
    document.querySelectorAll(".ev[data-ev]").forEach((row) => {
      row.addEventListener("click", () =>
        $("evd" + row.dataset.ev).classList.toggle("open"),
      );
    });
  }

  async function loadEvents() {
    try {
      const q = evFilter === "all" ? "" : `?status=${evFilter}`;
      const r = await api(`/api/admin/health/events${q}`);
      renderEvents((r && r.items) || []);
    } catch {
      $("evList").innerHTML =
        `<div class="empty">작동로그를 불러오지 못했습니다.</div>`;
    }
  }

  /* ---------- 전원/가동 인디케이터 ---------- */
  // 최신 점검의 신선도(하트비트)로 ON/OFF 판정.
  // 매시간 자동 점검이므로 2시간 넘게 끊기면 = 시스템/크론 다운 의심(꺼짐).
  function setPower(mode, state, sub, meta) {
    const led = $("powerLed");
    led.className = "power-led " + mode;
    $("powerState").textContent = state;
    $("powerSub").textContent = sub;
    $("powerMeta").innerHTML = meta;
  }
  function renderPower(latest) {
    if (!latest || !latest.checkedAt) {
      setPower(
        "off",
        "점검 대기",
        "아직 점검 기록 없음 · 매시간 자동 점검",
        "—",
      );
      return;
    }
    const mins = Math.max(
      0,
      Math.floor((Date.now() - new Date(latest.checkedAt).getTime()) / 60000),
    );
    const stale = mins > 130; // 약 2회 하트비트 누락 = 점검 끊김
    let mode, state, sub;
    if (stale) {
      mode = "off";
      state = "점검 지연 · 확인 필요";
      sub = "매시간 점검이 끊겼습니다 (워커/크론 상태 점검)";
    } else if (latest.overall === "fail") {
      mode = "fail";
      state = "이상 발생";
      sub = "일부 기능 오류 — 아래 카드 확인";
    } else if (latest.overall === "warn") {
      mode = "warn";
      state = "주의";
      sub = "확인 권장 항목 있음";
    } else {
      mode = "on";
      state = "정상 가동 중";
      sub = "모든 핵심 기능 정상";
    }
    const ago =
      mins < 1
        ? "방금"
        : mins < 60
          ? `${mins}분 전`
          : `${Math.floor(mins / 60)}시간 전`;
    setPower(
      mode,
      state,
      sub,
      `마지막 점검 <b>${ago}</b><br>${fmtKstFull(latest.checkedAt)}`,
    );
  }

  async function loadHealth() {
    try {
      const r = await api("/api/admin/health");
      renderPower(r.latest);
      renderLatest(r.latest, r.history);
    } catch {
      setPower("off", "확인 실패", "점검 데이터를 불러오지 못했습니다", "—");
      $("hcCards").innerHTML =
        `<div class="empty" style="grid-column:1/-1">점검 데이터를 불러오지 못했습니다.</div>`;
    }
  }

  /* ---------- 이벤트 바인딩 ---------- */
  // 점검은 매시간 자동 실행(cron). 사용자 수동 실행 버튼 없음.
  document.querySelectorAll("#evFilter button").forEach((b) => {
    b.addEventListener("click", () => {
      evFilter = b.dataset.f;
      document
        .querySelectorAll("#evFilter button")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      loadEvents();
    });
  });

  loadHealth();
  loadEvents();
  // 전원 상태 라이브 유지: 60초마다 최신 점검 재조회(하트비트 신선도 갱신)
  setInterval(loadHealth, 60000);
})();
