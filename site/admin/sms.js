// ========== 문자발송 (템플릿 + 발송 이력) ==========
// 글로벌 스코프 격리: admin.js 가 같은 글로벌에 api/toast/escapeHtml 등을 선언하므로
// IIFE 로 감싸 SyntaxError 충돌 방지.
(function () {
  const util = window.adminUtil;
  const api = util.api;
  const toast = util.toast;
  const escapeHtml = util.escapeHtml;
  const fmtDate = util.fmtDate;
  const cacheInvalidate = util.cacheInvalidate;

  const TPL_LIST_PATH = "/api/sms/templates";
  const LOGS_PATH = "/api/sms/logs";

  let templates = [];
  let logs = [];
  let editingId = null;

  const grid = document.getElementById("tplGrid");
  const logsWrap = document.getElementById("logsWrap");
  const banner = document.getElementById("smsBanner");
  const tabs = document.querySelectorAll(".sms-tab");
  const panels = document.querySelectorAll(".sms-panel");

  const tplModal = document.getElementById("tplModal");
  const tplForm = document.getElementById("tplForm");
  const tplModalTitle = document.getElementById("tplModalTitle");
  const fName = document.getElementById("tplName");
  const fSubject = document.getElementById("tplSubject");
  const fContent = document.getElementById("tplContent");
  const elSubjectLen = document.getElementById("tplSubjectLen");
  const elContentLen = document.getElementById("tplContentLen");
  const elContentBytes = document.getElementById("tplContentBytes");

  function utf8ByteLength(s) {
    return new TextEncoder().encode(String(s || "")).length;
  }

  function openModal(el) {
    if (!el) return;
    el.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal(el) {
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = "";
  }

  tplModal
    ?.querySelectorAll("[data-tpl-close]")
    .forEach((el) => el.addEventListener("click", () => closeModal(tplModal)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tplModal && !tplModal.hidden)
      closeModal(tplModal);
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      panels.forEach((p) =>
        p.classList.toggle("active", p.dataset.panel === key),
      );
      if (key === "logs") loadLogs();
    });
  });

  document.getElementById("btnNewTemplate").addEventListener("click", () => {
    openTemplate(null);
  });
  document.getElementById("btnRefreshLogs").addEventListener("click", loadLogs);

  fSubject?.addEventListener("input", () => {
    elSubjectLen.textContent = String(fSubject.value.length);
  });
  fContent?.addEventListener("input", () => {
    elContentLen.textContent = String(fContent.value.length);
    elContentBytes.textContent = String(utf8ByteLength(fContent.value));
  });

  tplForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      Name: fName.value.trim(),
      Subject: fSubject.value.trim(),
      Content: fContent.value.replace(/\r\n/g, "\n").trim(),
    };
    if (!body.Name || !body.Subject || !body.Content) {
      toast("이름·제목·본문을 모두 입력하세요.", "warn");
      return;
    }
    try {
      if (editingId) {
        await api(`/api/sms/templates/${editingId}`, {
          method: "PATCH",
          json: body,
        });
        toast("템플릿을 수정했습니다.");
      } else {
        await api("/api/sms/templates", { method: "POST", json: body });
        toast("템플릿을 추가했습니다.");
      }
      cacheInvalidate(TPL_LIST_PATH);
      closeModal(tplModal);
      await loadTemplates();
    } catch (e) {
      toast(e.message || "저장 실패", "error");
    }
  });

  function openTemplate(record) {
    editingId = record?.id || null;
    tplModalTitle.textContent = editingId ? "템플릿 수정" : "새 템플릿";
    fName.value = record?.Name || "";
    fSubject.value = record?.Subject || "";
    fContent.value = record?.Content || "";
    elSubjectLen.textContent = String(fSubject.value.length);
    elContentLen.textContent = String(fContent.value.length);
    elContentBytes.textContent = String(utf8ByteLength(fContent.value));
    openModal(tplModal);
    setTimeout(() => fName.focus(), 30);
  }

  async function loadTemplates() {
    try {
      const data = await api(TPL_LIST_PATH);
      templates = data.records || [];
      renderTemplates();
    } catch (e) {
      grid.innerHTML = `<div class="empty-state">불러오기 실패: ${escapeHtml(e.message || "")}</div>`;
    }
  }

  function renderTemplates() {
    if (!templates.length) {
      grid.innerHTML =
        '<div class="empty-state">등록된 템플릿이 없습니다. 우측 상단 "새 템플릿"으로 추가하세요.</div>';
      return;
    }
    grid.innerHTML = templates
      .map(
        (t) => `
      <article class="sms-card" data-id="${escapeHtml(t.id)}">
        <div class="sms-card-name">${escapeHtml(t.Name || "이름 없음")}</div>
        <div class="sms-card-subject">${escapeHtml(t.Subject || "")}</div>
        <div class="sms-card-body">${escapeHtml(t.Content || "")}</div>
        <div class="sms-meta">수정: ${escapeHtml(fmtDate(t.UpdatedAt))}</div>
        <div class="sms-card-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-act="edit">수정</button>
          <button type="button" class="btn btn-danger btn-sm" data-act="del">삭제</button>
        </div>
      </article>`,
      )
      .join("");
    grid.querySelectorAll(".sms-card").forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('[data-act="edit"]').addEventListener("click", () => {
        const rec = templates.find((x) => x.id === id);
        if (rec) openTemplate(rec);
      });
      card
        .querySelector('[data-act="del"]')
        .addEventListener("click", async () => {
          const rec = templates.find((x) => x.id === id);
          if (!rec) return;
          if (!confirm(`'${rec.Name}' 템플릿을 삭제할까요?`)) return;
          try {
            await api(`/api/sms/templates/${id}`, { method: "DELETE" });
            cacheInvalidate(TPL_LIST_PATH);
            toast("템플릿을 삭제했습니다.");
            await loadTemplates();
          } catch (e) {
            toast(e.message || "삭제 실패", "error");
          }
        });
    });
  }

  async function loadLogs() {
    logsWrap.innerHTML = '<div class="empty-state">불러오는 중...</div>';
    try {
      const data = await api(LOGS_PATH);
      logs = data.records || [];
      renderLogs();
    } catch (e) {
      logsWrap.innerHTML = `<div class="empty-state">불러오기 실패: ${escapeHtml(e.message || "")}</div>`;
    }
  }

  function statusLabel(s) {
    if (s === "sent") return "발송";
    if (s === "skipped") return "검수전";
    if (s === "failed") return "실패";
    return s || "—";
  }

  function renderLogs() {
    if (!logs.length) {
      logsWrap.innerHTML =
        '<div class="empty-state">발송 이력이 없습니다. 검수 통과 + 발신번호 등록 후 실제 전송됩니다.</div>';
      return;
    }
    logsWrap.innerHTML = `
    <table class="sms-table">
      <thead>
        <tr>
          <th style="width:160px;">일시</th>
          <th style="width:130px;">수신자</th>
          <th>제목</th>
          <th style="width:90px;">상태</th>
          <th>상세</th>
        </tr>
      </thead>
      <tbody>
        ${logs
          .map(
            (l) => `
          <tr>
            <td>${escapeHtml(fmtDate(l.SentAt))}</td>
            <td>${escapeHtml(l.ToPhone || "")}</td>
            <td>${escapeHtml(l.Subject || "")}</td>
            <td><span class="sms-status ${escapeHtml(l.Status || "")}">${escapeHtml(statusLabel(l.Status))}</span></td>
            <td style="color:var(--c-text-sub);font-size:12px;">${escapeHtml(l.Detail || "")}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
  }

  // 검수 상태 안내 배너 (sendNcpSens 가 skipped 면 그 사유가 logs에 남으므로,
  // 가장 최근 로그가 skipped 이면 안내. 로그가 없으면 표시 안 함.)
  function maybeShowBanner() {
    const last = logs[0];
    if (last && last.Status === "skipped") {
      banner.hidden = false;
      banner.textContent =
        "현재 SENS 발신번호 검수 대기 중입니다. 발송 버튼은 작동하지만 실제 문자는 검수 통과 후부터 전송됩니다.";
    } else {
      banner.hidden = true;
    }
  }

  (async function init() {
    await util.ensureAuth?.();
    await loadTemplates();
    await loadLogs();
    maybeShowBanner();
  })();
})();
