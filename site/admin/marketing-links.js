// ========== 마케팅 슬러그 CRUD + 보관함 + 일별 통계 ==========
const BASE_URL = "https://day1design.co.kr/r/";

const slugInput = document.getElementById("slugInput");
const labelInput = document.getElementById("labelInput");
const targetInput = document.getElementById("targetInput");
const urlPreview = document.getElementById("urlPreview");
const form = document.getElementById("createForm");
const btnCreate = document.getElementById("btnCreate");
const btnReload = document.getElementById("btnReload");
const rowsEl = document.getElementById("rows");
const countEl = document.getElementById("countLabel");
const toastEl = document.getElementById("copyToast");
const tabs = document.querySelectorAll(".mkt-tab");
const countActiveEl = document.getElementById("countActive");
const countArchivedEl = document.getElementById("countArchived");

const dailyModal = document.getElementById("dailyModal");
const dailyTitle = document.getElementById("dailyTitle");
const dailyBody = document.getElementById("dailyBody");
const dailyClose = document.getElementById("dailyClose");

let activeItems = [];
let archivedItems = [];
let view = "active"; // 'active' | 'archived'

function escapeHtml(s) {
  return (
    window.adminUtil?.escapeHtml(s) ??
    String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  );
}

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function updateUrlPreview() {
  const v = normalizeSlug(slugInput.value);
  urlPreview.textContent = v ? `${BASE_URL}${v}` : `${BASE_URL}<슬러그>`;
}

slugInput.addEventListener("input", updateUrlPreview);

function currentItems() {
  return view === "archived" ? archivedItems : activeItems;
}

async function fetchList() {
  rowsEl.innerHTML = `<tr class="empty-row"><td colspan="6">불러오는 중…</td></tr>`;
  try {
    const [act, arc] = await Promise.all([
      window.adminUtil.api("/api/marketing-links"),
      window.adminUtil.api("/api/marketing-links?archived=1"),
    ]);
    activeItems = Array.isArray(act?.items) ? act.items : [];
    archivedItems = Array.isArray(arc?.items) ? arc.items : [];
    if (countActiveEl) countActiveEl.textContent = ` ${activeItems.length}`;
    if (countArchivedEl)
      countArchivedEl.textContent = ` ${archivedItems.length}`;
    renderRows();
  } catch (e) {
    rowsEl.innerHTML = `<tr class="empty-row"><td colspan="6">불러오기 실패: ${escapeHtml(e.message || "error")}</td></tr>`;
  }
}

function renderRows() {
  const items = currentItems();
  countEl.textContent =
    view === "archived"
      ? `보관함: ${items.length}개`
      : `등록된 슬러그: ${items.length}개`;
  if (!items.length) {
    rowsEl.innerHTML =
      view === "archived"
        ? `<tr class="empty-row"><td colspan="6">보관함이 비어있습니다.</td></tr>`
        : `<tr class="empty-row"><td colspan="6">아직 등록된 슬러그가 없어요. 위 폼에서 첫 슬러그를 만들어보세요.</td></tr>`;
    return;
  }
  rowsEl.innerHTML = items
    .map((it) => {
      const fullUrl = `${BASE_URL}${it.slug}`;
      const archived = view === "archived";
      const actions = archived
        ? `
          <button type="button" data-act="daily">일별 통계</button>
          <button type="button" data-act="restore">복원</button>`
        : `
          <button type="button" data-act="copy">URL 복사</button>
          <button type="button" data-act="daily">일별 통계</button>
          <button type="button" data-act="toggle">${it.active ? "중지" : "활성"}</button>
          <button type="button" data-act="edit">수정</button>
          <button type="button" class="danger" data-act="delete">삭제</button>`;
      const statusBadge = archived
        ? `<span class="badge off" title="삭제됨 ${escapeHtml(it.deletedAt || "")}">보관</span>`
        : `<span class="badge ${it.active ? "on" : "off"}">${it.active ? "활성" : "중지"}</span>`;
      return `
      <tr class="${archived ? "archived-row" : ""}" data-slug="${escapeHtml(it.slug)}">
        <td class="slug-cell">
          ${archived ? `<code>/r/${escapeHtml(it.slug)}</code>` : `<code class="copyable" data-copy="${escapeHtml(fullUrl)}" title="클릭하여 URL 복사">/r/${escapeHtml(it.slug)}</code>`}
          <span class="label">${escapeHtml(it.sourceLabel)}</span>
        </td>
        <td class="target-cell" title="${escapeHtml(it.targetUrl)}">
          ${escapeHtml(it.targetUrl)}
        </td>
        <td class="num">${it.clicks || 0}</td>
        <td class="num">${it.conversions || 0}</td>
        <td>${statusBadge}</td>
        <td class="mkt-actions">${actions}</td>
      </tr>`;
    })
    .join("");
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    view = tab.dataset.view === "archived" ? "archived" : "active";
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    renderRows();
  });
});

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("URL 복사됨");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("URL 복사됨");
  }
}

// ─── 일별 통계 모달 ────────────────────────────────────────
function openDailyModal(slug, sourceLabel) {
  dailyTitle.textContent = `일별 클릭 — ${sourceLabel || slug}`;
  dailyBody.innerHTML = `<div class="daily-empty">불러오는 중…</div>`;
  dailyModal.classList.add("show");
  dailyModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  loadDaily(slug);
}
function closeDailyModal() {
  dailyModal.classList.remove("show");
  dailyModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
dailyClose?.addEventListener("click", closeDailyModal);
dailyModal?.addEventListener("click", (e) => {
  if (e.target === dailyModal) closeDailyModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && dailyModal.classList.contains("show")) {
    closeDailyModal();
  }
});

async function loadDaily(slug) {
  try {
    const data = await window.adminUtil.api(
      `/api/marketing-links/${encodeURIComponent(slug)}/daily?days=60`,
    );
    const list = Array.isArray(data?.items) ? data.items : [];
    if (!list.length) {
      dailyBody.innerHTML = `<div class="daily-empty">아직 클릭 기록이 없습니다.</div>`;
      return;
    }
    const total = list.reduce((sum, r) => sum + (r.clicks || 0), 0);
    dailyBody.innerHTML = `
      <table class="daily-table">
        <thead>
          <tr><th>날짜</th><th class="num">클릭</th><th>마지막 클릭</th></tr>
        </thead>
        <tbody>
          ${list
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.date)}</td>
              <td class="num">${r.clicks || 0}</td>
              <td style="color:#888;font-size:12px;">${escapeHtml((r.lastClickAt || "").slice(0, 19).replace("T", " "))}</td>
            </tr>`,
            )
            .join("")}
          <tr style="background:#faf8f3;font-weight:600;">
            <td>합계</td>
            <td class="num">${total}</td>
            <td></td>
          </tr>
        </tbody>
      </table>`;
  } catch (e) {
    dailyBody.innerHTML = `<div class="daily-empty">불러오기 실패: ${escapeHtml(e.message || "error")}</div>`;
  }
}

// ─── 행 클릭 핸들러 ───────────────────────────────────────
rowsEl.addEventListener("click", async (e) => {
  const copyEl = e.target.closest("[data-copy]");
  if (copyEl) {
    e.preventDefault();
    copyText(copyEl.dataset.copy);
    return;
  }
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const tr = btn.closest("tr");
  const slug = tr?.dataset.slug;
  if (!slug) return;
  const it = currentItems().find((x) => x.slug === slug);
  if (!it) return;
  const act = btn.dataset.act;

  if (act === "copy") {
    copyText(`${BASE_URL}${slug}`);
    return;
  }

  if (act === "daily") {
    openDailyModal(slug, it.sourceLabel);
    return;
  }

  if (act === "toggle") {
    btn.disabled = true;
    try {
      await window.adminUtil.api(
        `/api/marketing-links/${encodeURIComponent(slug)}`,
        { method: "PATCH", json: { active: !it.active } },
      );
      showToast(it.active ? "중지됨" : "활성화됨");
      await fetchList();
    } catch (err) {
      alert("변경 실패: " + (err.message || "error"));
    } finally {
      btn.disabled = false;
    }
    return;
  }

  if (act === "edit") {
    const newLabel = prompt("출처명을 수정하세요.", it.sourceLabel);
    if (newLabel == null) return;
    const newTarget = prompt("대상 URL을 수정하세요.", it.targetUrl);
    if (newTarget == null) return;
    try {
      await window.adminUtil.api(
        `/api/marketing-links/${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          json: { sourceLabel: newLabel.trim(), targetUrl: newTarget.trim() },
        },
      );
      showToast("저장됨");
      await fetchList();
    } catch (err) {
      alert("수정 실패: " + (err.message || "error"));
    }
    return;
  }

  if (act === "delete") {
    if (
      !confirm(
        `슬러그 "/r/${slug}" 를 보관함으로 옮길까요?\n\n` +
          `누적 통계와 일별 클릭 데이터는 그대로 보존됩니다.\n` +
          `이 링크로 들어오는 새 방문은 더 이상 기록되지 않습니다.`,
      )
    )
      return;
    try {
      await window.adminUtil.api(
        `/api/marketing-links/${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      showToast("보관함으로 이동");
      await fetchList();
    } catch (err) {
      alert("삭제 실패: " + (err.message || "error"));
    }
    return;
  }

  if (act === "restore") {
    if (
      !confirm(
        `보관된 슬러그 "/r/${slug}" 를 복원할까요?\n복원 후 활성 상태로 다시 사용됩니다.`,
      )
    )
      return;
    try {
      await window.adminUtil.api(
        `/api/marketing-links/${encodeURIComponent(slug)}`,
        { method: "PATCH", json: { restore: true } },
      );
      showToast("복원됨");
      view = "active";
      tabs.forEach((t) =>
        t.classList.toggle("active", t.dataset.view === "active"),
      );
      await fetchList();
    } catch (err) {
      alert("복원 실패: " + (err.message || "error"));
    }
    return;
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const slug = normalizeSlug(slugInput.value);
  const sourceLabel = labelInput.value.trim();
  const targetUrl = targetInput.value.trim();
  if (!slug) return alert("슬러그를 입력하세요. (영문 소문자/숫자/-)");
  if (!sourceLabel) return alert("출처명을 입력하세요.");
  if (!/^https?:\/\//.test(targetUrl))
    return alert("대상 URL은 http(s)로 시작해야 합니다.");

  btnCreate.disabled = true;
  btnCreate.textContent = "생성 중…";
  try {
    await window.adminUtil.api("/api/marketing-links", {
      method: "POST",
      json: { slug, sourceLabel, targetUrl },
    });
    slugInput.value = "";
    labelInput.value = "";
    updateUrlPreview();
    showToast("슬러그 생성됨");
    await fetchList();
  } catch (err) {
    alert("생성 실패: " + (err.message || "error"));
  } finally {
    btnCreate.disabled = false;
    btnCreate.textContent = "+ 슬러그 만들기";
  }
});

btnReload.addEventListener("click", fetchList);

document.addEventListener("DOMContentLoaded", fetchList);
