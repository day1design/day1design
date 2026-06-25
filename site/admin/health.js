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
          <h3>${escapeHtml(r.label)}</h3>
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

  async function loadHealth() {
    try {
      const r = await api("/api/admin/health");
      renderLatest(r.latest, r.history);
    } catch {
      $("hcCards").innerHTML =
        `<div class="empty" style="grid-column:1/-1">점검 데이터를 불러오지 못했습니다.</div>`;
    }
  }

  /* ---------- 이벤트 바인딩 ---------- */
  // 점검은 매일 04:00 자동 실행(cron). 사용자 수동 실행 버튼 없음.
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
})();
