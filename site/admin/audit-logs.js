// ========== 관리자 감사 로그 (AdminAuditLogs) ==========
const PAGE_SIZE = 50;

const el = (id) => document.getElementById(id);
const auditBody = el("auditBody");
const typeSel = el("auditType");
const sevSel = el("auditSeverity");
const fromEl = el("auditFrom");
const toEl = el("auditTo");
const searchEl = el("auditSearch");
const btnReload = el("btnAuditReload");
const btnPrev = el("btnAuditPrev");
const btnNext = el("btnAuditNext");
const pageInfoEl = el("auditPageInfo");

let offset = 0;
let total = 0;
let lastRecords = [];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtKst(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const TYPE_LABEL = {
  login_ok: "로그인 성공",
  login_fail: "로그인 실패",
  rate_limit: "Rate-limit 초과",
  error_5xx: "서버 5xx 에러",
};

function render(records) {
  if (!records.length) {
    auditBody.innerHTML = `<div class="audit-empty">조건에 맞는 로그가 없습니다.</div>`;
    return;
  }
  const rows = records.map(
    (r) => `
    <tr>
      <td>${escapeHtml(fmtKst(r.CreatedAt))}</td>
      <td>${escapeHtml(TYPE_LABEL[r.Type] || r.Type || "—")}</td>
      <td class="sev-${escapeHtml(r.Severity || "info")}">${escapeHtml(r.Severity || "info")}</td>
      <td>${r.Status || "—"}</td>
      <td>${escapeHtml(r.IP || "—")}</td>
      <td>${escapeHtml(r.Username || "—")}</td>
      <td>${escapeHtml(r.Path || "—")} <small style="color:#999">${escapeHtml(r.Method || "")}</small></td>
      <td>${escapeHtml(r.Message || "")}</td>
    </tr>
  `,
  );
  auditBody.innerHTML = `
    <table class="audit-table">
      <thead>
        <tr>
          <th style="width:160px">시각 (KST)</th>
          <th style="width:120px">유형</th>
          <th style="width:60px">심각도</th>
          <th style="width:60px">상태</th>
          <th style="width:120px">IP</th>
          <th style="width:100px">사용자</th>
          <th style="width:200px">경로</th>
          <th>메시지</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>`;
}

function updatePager() {
  const end = Math.min(total, offset + PAGE_SIZE);
  pageInfoEl.textContent = total
    ? `${offset + 1}~${end} / 전체 ${total.toLocaleString("ko-KR")}`
    : "0건";
  btnPrev.disabled = offset === 0;
  btnNext.disabled = end >= total;
}

async function load() {
  auditBody.innerHTML = `<div class="audit-empty">불러오는 중...</div>`;
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (typeSel.value) params.set("type", typeSel.value);
  if (sevSel.value) params.set("severity", sevSel.value);
  if (fromEl.value) params.set("from", fromEl.value + "T00:00:00.000Z");
  if (toEl.value) params.set("to", toEl.value + "T23:59:59.999Z");
  if (searchEl.value.trim()) params.set("q", searchEl.value.trim());
  try {
    const d = await adminUtil.api(`/api/audit/logs?${params}`);
    lastRecords = d.records || [];
    total = Number(d.total) || 0;
    render(lastRecords);
    updatePager();
  } catch (e) {
    auditBody.innerHTML = `<div class="audit-empty">불러오기 실패: ${escapeHtml(e.message)}</div>`;
  }
}

[typeSel, sevSel, fromEl, toEl].forEach((x) =>
  x?.addEventListener("change", () => {
    offset = 0;
    load();
  }),
);
let searchTimer;
searchEl?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    offset = 0;
    load();
  }, 250);
});
btnReload?.addEventListener("click", () => {
  offset = 0;
  load();
});
btnPrev?.addEventListener("click", () => {
  offset = Math.max(0, offset - PAGE_SIZE);
  load();
});
btnNext?.addEventListener("click", () => {
  offset += PAGE_SIZE;
  load();
});

(async () => {
  if (!(await adminUtil.ensureAuth())) return;
  load();
})();
