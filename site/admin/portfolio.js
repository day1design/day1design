// ========== 포트폴리오 관리 ==========
let records = [];
let editingId = null;

const body = document.getElementById("pfBody");
const modal = document.getElementById("pfModal");
const form = document.getElementById("pfForm");
const modalTitle = document.getElementById("modalTitle");
const btnSubmit = document.getElementById("btnSubmit");
const filterCat = document.getElementById("filterCategory");
const filterSearch = document.getElementById("filterSearch");

function filtered() {
  const cat = filterCat.value;
  const q = filterSearch.value.trim().toLowerCase();
  return records.filter((r) => {
    if (cat && r.category !== cat) return false;
    if (
      q &&
      !(
        r.name.toLowerCase().includes(q) ||
        (r.folder || "").toLowerCase().includes(q)
      )
    )
      return false;
    return true;
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render() {
  const list = filtered();
  if (!list.length) {
    body.innerHTML =
      '<tr><td colspan="7" class="empty-state">프로젝트가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = list
    .map(
      (r, i) => `
    <tr data-id="${r.id}">
      <td>${i + 1}</td>
      <td>${escapeHtml(r.name)}${r.rightName ? `<br><small>+ ${escapeHtml(r.rightName)}</small>` : ""}</td>
      <td><code>${escapeHtml(r.folder)}</code></td>
      <td>${r.count}</td>
      <td><span class="badge">${r.category}</span></td>
      <td>${r.order ?? 0}</td>
      <td class="td-actions">
        <button class="icon-btn" data-act="edit" title="편집">✎</button>
        <button class="icon-btn danger" data-act="del" title="삭제">✕</button>
      </td>
    </tr>`,
    )
    .join("");
  body.querySelectorAll("tr").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('[data-act="edit"]').addEventListener("click", () =>
      openEdit(id),
    );
    tr.querySelector('[data-act="del"]').addEventListener("click", () =>
      doDelete(id),
    );
  });
}

function openModal(title) {
  modalTitle.textContent = title;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
  editingId = null;
  form.reset();
}

modal
  .querySelectorAll("[data-close]")
  .forEach((el) => el.addEventListener("click", closeModal));

document.getElementById("btnNew").addEventListener("click", () => {
  editingId = null;
  form.reset();
  form.elements.category.value = "HOUSE";
  openModal("새 프로젝트");
});

function openEdit(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  editingId = id;
  form.reset();
  form.elements.name.value = r.name || "";
  form.elements.folder.value = r.folder || "";
  form.elements.count.value = r.count || 0;
  form.elements.category.value = r.category || "HOUSE";
  form.elements.order.value = r.order ?? 0;
  form.elements.rightName.value = r.rightName || "";
  form.elements.rightFolder.value = r.rightFolder || "";
  form.elements.rightCount.value = r.rightCount || 0;
  openModal("프로젝트 편집");
}

async function doDelete(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  if (!confirm(`"${r.name}" 을(를) 삭제할까요?`)) return;
  try {
    await adminUtil.api(`/api/portfolio/${id}`, { method: "DELETE" });
    records = records.filter((x) => x.id !== id);
    render();
    adminUtil.toast("삭제 완료");
  } catch (e) {
    adminUtil.toast("삭제 실패: " + e.message, "error");
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  btnSubmit.disabled = true;
  const payload = {
    name: form.elements.name.value.trim(),
    folder: form.elements.folder.value.trim(),
    count: Number(form.elements.count.value) || 0,
    category: form.elements.category.value,
    order: Number(form.elements.order.value) || 0,
    rightName: form.elements.rightName.value.trim(),
    rightFolder: form.elements.rightFolder.value.trim(),
    rightCount: Number(form.elements.rightCount.value) || 0,
  };
  try {
    if (editingId) {
      const r = await adminUtil.api(`/api/portfolio/${editingId}`, {
        method: "PATCH",
        json: payload,
      });
      Object.assign(
        records.find((x) => x.id === editingId),
        r.record,
      );
    } else {
      const r = await adminUtil.api("/api/portfolio", {
        method: "POST",
        json: payload,
      });
      records.push(r.record);
    }
    records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    render();
    closeModal();
    adminUtil.toast("저장 완료");
  } catch (e2) {
    adminUtil.toast("저장 실패: " + e2.message, "error");
  } finally {
    btnSubmit.disabled = false;
  }
});

filterCat.addEventListener("change", render);
filterSearch.addEventListener("input", render);

(async () => {
  await adminUtil.ensureAuth();
  adminUtil.pingApi();
  try {
    const d = await adminUtil.api("/api/portfolio");
    records = d.records || [];
    records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    render();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">로드 실패: ${escapeHtml(e.message)}</td></tr>`;
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
