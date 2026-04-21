// ========== 포트폴리오 (그리드 + DnD + Dirty-tracking 저장) ==========
let records = [];
let original = [];
let editingId = null;
let dirty = false;

const grid = document.getElementById("pfGrid");
const modal = document.getElementById("pfModal");
const form = document.getElementById("pfForm");
const modalTitle = document.getElementById("modalTitle");
const btnSubmit = document.getElementById("btnSubmit");
const filterCat = document.getElementById("filterCategory");
const filterSearch = document.getElementById("filterSearch");
const countEl = document.getElementById("pfCount");
const dirtyEl = document.getElementById("dirtyLabel");

function setDirty(v) {
  dirty = v;
  dirtyEl.classList.toggle("hidden", !v);
}

// 파일명 규칙 기반 fallback 썸네일 (마이그레이션된 01~35_after.webp)
const R2_BASE = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev";
function fallbackThumb(order) {
  const n = String(Math.max(1, (order ?? 0) + 1)).padStart(2, "0");
  return `${R2_BASE}/images/portfolio-thumbs/${n}_after.webp`;
}
function thumbUrl(r) {
  return r.thumbAfter || fallbackThumb(r.order);
}

function filtered() {
  const cat = filterCat.value;
  const q = filterSearch.value.trim().toLowerCase();
  return records.filter((r) => {
    if (cat && r.category !== cat) return false;
    if (q) {
      const hay = `${r.name} ${r.folder || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function render() {
  const list = filtered();
  countEl.textContent = records.length;
  grid.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "card-grid-empty";
    empty.textContent = "조건에 맞는 프로젝트가 없습니다.";
    grid.appendChild(empty);
    return;
  }
  list.forEach((r) => {
    // filtered된 목록에서 전체 records 기준 index를 dataset에 저장 → DnD용
    const fullIdx = records.findIndex((x) => x.id === r.id);
    const card = document.createElement("div");
    card.className = "drag-card";
    card.draggable = true;
    card.dataset.index = String(fullIdx);
    card.dataset.id = r.id;
    card.innerHTML = `
      <div class="drag-card-thumb" style="background-image:url('${adminUtil.escapeHtml(thumbUrl(r))}')">
        <span class="drag-card-badge">${(r.order ?? 0) + 1}</span>
        <div class="drag-card-actions">
          <button type="button" class="drag-card-action" data-act="edit" title="편집">✎</button>
          <button type="button" class="drag-card-action danger" data-act="del" title="삭제">✕</button>
        </div>
      </div>
      <div class="drag-card-meta">
        <p class="drag-card-title">${adminUtil.escapeHtml(r.name || "(이름 없음)")}</p>
        <div class="drag-card-tags">
          <span class="badge">${adminUtil.escapeHtml(r.category || "HOUSE")}</span>
          ${r.rightName ? `<span class="badge">+ ${adminUtil.escapeHtml(r.rightName)}</span>` : ""}
        </div>
        <p class="drag-card-sub" title="${adminUtil.escapeHtml(r.folder || "")}" style="margin-top:6px">
          <code style="font-size:10px">${adminUtil.escapeHtml(r.folder || "")}</code>
        </p>
      </div>
    `;
    card.querySelector('[data-act="edit"]').addEventListener("click", (e) => {
      e.stopPropagation();
      openEdit(r.id);
    });
    card.querySelector('[data-act="del"]').addEventListener("click", (e) => {
      e.stopPropagation();
      doDelete(r.id);
    });
    grid.appendChild(card);
  });
}

// DnD: 순서 교체 + 이미지 drop으로 thumbAfter 교체
adminUtil.initDragSort({
  container: grid,
  onReorder: (src, dest) => {
    const moved = records.splice(src, 1)[0];
    records.splice(dest, 0, moved);
    // order 필드를 인덱스와 동기화
    records.forEach((r, i) => {
      r.order = i;
    });
    setDirty(true);
    render();
  },
  onFileDrop: async (idx, file) => {
    try {
      adminUtil.toast("썸네일 업로드 중...");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "portfolio-thumbs");
      const res = await adminUtil.apiUpload("/api/upload/image", fd);
      records[idx].thumbAfter = res.url;
      setDirty(true);
      render();
      adminUtil.toast("썸네일 교체 완료");
    } catch (e) {
      adminUtil.toast("업로드 실패: " + e.message, "error");
    }
  },
});

filterCat.addEventListener("change", render);
filterSearch.addEventListener("input", render);

// ========== 편집 모달 ==========
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
  form.elements.order.value = records.length;
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
    original = original.filter((x) => x.id !== id);
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
      const idx = records.findIndex((x) => x.id === editingId);
      if (idx >= 0) Object.assign(records[idx], r.record);
      const oidx = original.findIndex((x) => x.id === editingId);
      if (oidx >= 0) Object.assign(original[oidx], r.record);
    } else {
      const r = await adminUtil.api("/api/portfolio", {
        method: "POST",
        json: payload,
      });
      records.push(r.record);
      original.push(JSON.parse(JSON.stringify(r.record)));
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

// ========== Dirty Save / Revert ==========
function diffedPatches() {
  const origMap = new Map(original.map((r) => [r.id, r]));
  const patches = [];
  records.forEach((r) => {
    const o = origMap.get(r.id);
    if (!o) return;
    const d = {};
    if ((r.order ?? 0) !== (o.order ?? 0)) d.order = r.order;
    if ((r.thumbAfter || "") !== (o.thumbAfter || ""))
      d.thumbAfter = r.thumbAfter || "";
    if ((r.thumbBefore || "") !== (o.thumbBefore || ""))
      d.thumbBefore = r.thumbBefore || "";
    if (Object.keys(d).length > 0) patches.push({ id: r.id, patch: d });
  });
  return patches;
}

document.getElementById("btnRevert").addEventListener("click", () => {
  if (!dirty) return;
  if (!confirm("변경사항을 버리고 저장된 상태로 되돌릴까요?")) return;
  records = JSON.parse(JSON.stringify(original));
  records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  setDirty(false);
  render();
});

document.getElementById("btnSave").addEventListener("click", async () => {
  const patches = diffedPatches();
  if (!patches.length) {
    adminUtil.toast("변경된 내용이 없습니다");
    return;
  }
  const btn = document.getElementById("btnSave");
  btn.disabled = true;
  btn.textContent = `저장 중 (0/${patches.length})`;
  let done = 0;
  let failed = 0;
  for (const { id, patch } of patches) {
    try {
      await adminUtil.api(`/api/portfolio/${id}`, {
        method: "PATCH",
        json: patch,
      });
      const o = original.find((x) => x.id === id);
      if (o) Object.assign(o, patch);
      done++;
    } catch (e) {
      failed++;
    }
    btn.textContent = `저장 중 (${done + failed}/${patches.length})`;
  }
  btn.textContent = "저장";
  btn.disabled = false;
  if (failed === 0) {
    setDirty(false);
    adminUtil.toast(`저장 완료 (${done}건)`);
  } else {
    adminUtil.toast(`${done}건 성공 / ${failed}건 실패`, "error");
  }
});

// ========== 초기 로드 ==========
(async () => {
  try {
    const d = await adminUtil.api("/api/portfolio");
    records = d.records || [];
    records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    original = JSON.parse(JSON.stringify(records));
    render();
  } catch (e) {
    grid.innerHTML = `<div class="card-grid-empty">로드 실패: ${adminUtil.escapeHtml(e.message)}</div>`;
  }
})();
