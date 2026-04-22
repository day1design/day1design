// ========== 커뮤니티 목록 관리 ==========
let posts = [];
const body = document.getElementById("cmBody");
const filterBoard = document.getElementById("filterBoard");
const filterSearch = document.getElementById("filterSearch");

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function filtered() {
  const b = filterBoard.value;
  const q = filterSearch.value.trim().toLowerCase();
  return posts.filter((p) => {
    if (b && p.board !== b) return false;
    if (q) {
      const hay = `${p.title} ${p.category} ${p.idx}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function render() {
  const list = filtered();
  if (!list.length) {
    body.innerHTML =
      '<tr><td colspan="8" class="empty-state">게시글이 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = list
    .map(
      (p, i) => `
    <tr data-idx="${escapeHtml(p.idx)}">
      <td>${i + 1}</td>
      <td>${p.thumb ? `<div class="cell-thumb" style="background-image:url('${escapeHtml(p.thumb)}')"></div>` : "—"}</td>
      <td>
        <div class="cell-title">${escapeHtml(p.title)}</div>
        <small class="cell-sub">#${escapeHtml(p.idx)}</small>
      </td>
      <td><span class="badge">${escapeHtml(p.category || "")}</span></td>
      <td>${escapeHtml(p.date || "")}</td>
      <td>${escapeHtml(p.board || "")}</td>
      <td>${p.views || 0}</td>
      <td class="td-actions">
        <a class="icon-btn" href="community-edit.html?idx=${encodeURIComponent(p.idx)}" title="편집">✎</a>
        <button class="icon-btn danger" data-act="del" title="삭제">✕</button>
      </td>
    </tr>`,
    )
    .join("");
  body.querySelectorAll("tr").forEach((tr) => {
    tr.querySelector('[data-act="del"]').addEventListener("click", () =>
      doDelete(tr.dataset.idx),
    );
  });
}

async function doDelete(idx) {
  const p = posts.find((x) => x.idx === idx);
  if (!p) return;
  if (!confirm(`"${p.title}" 을(를) 삭제할까요?\n(idx=${idx})`)) return;
  try {
    await adminUtil.api(`/api/community/${encodeURIComponent(idx)}`, {
      method: "DELETE",
    });
    adminUtil.cacheInvalidate("/api/community");
    posts = posts.filter((x) => x.idx !== idx);
    render();
    adminUtil.toast("삭제 완료");
  } catch (e) {
    adminUtil.toast("삭제 실패: " + e.message, "error");
  }
}

filterBoard.addEventListener("change", render);
filterSearch.addEventListener("input", render);

(async () => {
  await adminUtil.ensureAuth();
  adminUtil.pingApi();
  try {
    const d = await adminUtil.apiCached("/api/community", { ttl: 30_000 });
    posts = d.posts || [];
    render();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">로드 실패: ${escapeHtml(e.message)}</td></tr>`;
  }
  document.getElementById("btnLogout").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await adminUtil.api("/api/auth/logout", { method: "POST" });
    } catch {}
    adminUtil.clearToken();
    location.href = "login.html";
  });
})();
