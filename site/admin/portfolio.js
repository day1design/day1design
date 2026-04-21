// ========== 포트폴리오 (그리드 + DnD + 업로드 전용 모달) ==========
let records = [];
let original = [];
let editingId = null;
let dirty = false;

// 모달 상태
let modalThumbAfter = "";
let modalImages = [];
let folderManuallyEdited = false;

const grid = document.getElementById("pfGrid");
const modal = document.getElementById("pfModal");
const form = document.getElementById("pfForm");
const modalTitle = document.getElementById("modalTitle");
const btnSubmit = document.getElementById("btnSubmit");
const filterCat = document.getElementById("filterCategory");
const filterSearch = document.getElementById("filterSearch");
const countEl = document.getElementById("pfCount");
const dirtyEl = document.getElementById("dirtyLabel");

const galleryGrid = document.getElementById("galleryGrid");

function setDirty(v) {
  dirty = v;
  dirtyEl.classList.toggle("hidden", !v);
}

// ========== 그리드 카드 렌더 ==========
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
          ${Array.isArray(r.images) && r.images.length ? `<span class="badge">사진 ${r.images.length}장</span>` : ""}
          ${r.rightName ? `<span class="badge">+ ${adminUtil.escapeHtml(r.rightName)}</span>` : ""}
        </div>
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

// ========== DnD (그리드 순서 + 이미지 drop으로 thumbAfter 교체) ==========
adminUtil.initDragSort({
  container: grid,
  onReorder: (src, dest) => {
    const moved = records.splice(src, 1)[0];
    records.splice(dest, 0, moved);
    records.forEach((r, i) => (r.order = i));
    setDirty(true);
    render();
  },
  onFileDrop: async (idx, file) => {
    try {
      adminUtil.toast("썸네일 업로드 중...");
      const res = await adminUtil.uploadImage(file, {
        folder: "portfolio-thumbs",
      });
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

// ========== 모달 공통 ==========
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
  modalThumbAfter = "";
  modalThumbBefore = "";
  modalImages = [];
  folderManuallyEdited = false;
}
modal
  .querySelectorAll("[data-close]")
  .forEach((el) => el.addEventListener("click", closeModal));

// ========== 썸네일 프리뷰 ==========
function renderThumbPreview(previewId, clearBtnId, url) {
  const el = document.getElementById(previewId);
  const clr = document.getElementById(clearBtnId);
  if (url) {
    el.style.backgroundImage = `url('${url}')`;
    el.classList.remove("empty");
    el.classList.add("has-image");
    clr.hidden = false;
  } else {
    el.style.backgroundImage = "none";
    el.classList.remove("has-image");
    el.classList.add("empty");
    clr.hidden = true;
  }
}

function bindThumbSlot({
  previewId,
  clearBtnId,
  pickBtnId,
  fileInputId,
  folder,
  onChange,
}) {
  document.getElementById(pickBtnId).addEventListener("click", () => {
    document.getElementById(fileInputId).click();
  });
  document.getElementById(fileInputId).addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      adminUtil.toast("업로드 중...");
      const res = await adminUtil.uploadImage(file, { folder });
      onChange(res.url);
      renderThumbPreview(previewId, clearBtnId, res.url);
      adminUtil.toast("업로드 완료");
    } catch (err) {
      adminUtil.toast("실패: " + err.message, "error");
    } finally {
      e.target.value = "";
    }
  });
  document.getElementById(clearBtnId).addEventListener("click", () => {
    onChange("");
    renderThumbPreview(previewId, clearBtnId, "");
  });
}

bindThumbSlot({
  previewId: "thumbAfterPreview",
  clearBtnId: "btnClearThumbAfter",
  pickBtnId: "btnPickThumbAfter",
  fileInputId: "thumbAfterFile",
  folder: "portfolio-thumbs",
  onChange: (u) => {
    modalThumbAfter = u;
  },
});

// ========== 갤러리 ==========
function renderGallery() {
  galleryGrid.innerHTML = "";
  if (!modalImages.length) {
    galleryGrid.innerHTML =
      '<div class="gallery-empty">아직 추가된 이미지가 없습니다. 아래 버튼으로 업로드하세요.</div>';
    return;
  }
  modalImages.forEach((url, i) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    item.draggable = true;
    item.dataset.index = String(i);
    item.style.backgroundImage = `url('${url}')`;
    item.innerHTML = `
      <span class="gallery-item-order">${i + 1}</span>
      <button type="button" class="gallery-item-remove" data-act="del" title="제거">✕</button>
    `;
    item.querySelector('[data-act="del"]').addEventListener("click", (e) => {
      e.stopPropagation();
      modalImages.splice(i, 1);
      renderGallery();
    });
    galleryGrid.appendChild(item);
  });
}

adminUtil.initDragSort({
  container: galleryGrid,
  itemSelector: ".gallery-item",
  onReorder: (src, dest) => {
    const moved = modalImages.splice(src, 1)[0];
    modalImages.splice(dest, 0, moved);
    renderGallery();
  },
});

document.getElementById("btnAddGallery").addEventListener("click", () => {
  document.getElementById("galleryFiles").click();
});
document
  .getElementById("galleryFiles")
  .addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    adminUtil.toast(`${files.length}개 업로드 중...`);
    let ok = 0,
      fail = 0;
    for (const file of files) {
      try {
        const res = await adminUtil.uploadImage(file, { folder: "portfolio" });
        modalImages.push(res.url);
        renderGallery();
        ok++;
      } catch {
        fail++;
      }
    }
    adminUtil.toast(
      `업로드 완료 (${ok}성공 ${fail ? "/ " + fail + "실패" : ""})`,
    );
    e.target.value = "";
  });

// ========== folder 자동 생성 ==========
form.elements.folder.addEventListener("input", () => {
  folderManuallyEdited = true;
});
form.elements.name.addEventListener("input", () => {
  if (!folderManuallyEdited) {
    form.elements.folder.value = adminUtil.slugify(form.elements.name.value);
  }
});

// ========== 새로 / 편집 ==========
document.getElementById("btnNew").addEventListener("click", () => {
  editingId = null;
  form.reset();
  form.elements.category.value = "HOUSE";
  modalThumbAfter = "";
  modalImages = [];
  folderManuallyEdited = false;
  renderThumbPreview("thumbAfterPreview", "btnClearThumbAfter", "");
  renderGallery();
  openModal("새 프로젝트");
});

function openEdit(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  editingId = id;
  form.reset();
  form.elements.name.value = r.name || "";
  form.elements.folder.value = r.folder || "";
  form.elements.category.value = r.category || "HOUSE";
  form.elements.rightName.value = r.rightName || "";
  form.elements.rightFolder.value = r.rightFolder || "";
  form.elements.rightCount.value = r.rightCount || 0;
  modalThumbAfter = r.thumbAfter || "";
  modalImages = Array.isArray(r.images) ? r.images.slice() : [];
  folderManuallyEdited = true; // 기존 folder 유지
  renderThumbPreview(
    "thumbAfterPreview",
    "btnClearThumbAfter",
    modalThumbAfter,
  );
  renderGallery();
  openModal(`편집 · ${r.name}`);
}

async function doDelete(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  if (
    !confirm(
      `"${r.name}" 을(를) 삭제할까요?\n썸네일 + 갤러리 이미지 ${(r.images || []).length}장이 R2에서 함께 삭제됩니다.`,
    )
  )
    return;
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
  const name = form.elements.name.value.trim();
  if (!name) {
    adminUtil.toast("이름은 필수입니다", "error");
    btnSubmit.disabled = false;
    return;
  }
  const folder =
    form.elements.folder.value.trim() ||
    adminUtil.slugify(name) ||
    "project-" + Date.now();
  const payload = {
    name,
    folder,
    category: form.elements.category.value,
    thumbAfter: modalThumbAfter,
    images: modalImages,
    // Count는 Worker가 images.length로 자동 설정
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
      payload.order = records.length;
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

// ========== 순서 저장 (그리드 DnD 일괄 PATCH) ==========
function diffedOrderPatches() {
  const origMap = new Map(original.map((r) => [r.id, r]));
  const patches = [];
  records.forEach((r) => {
    const o = origMap.get(r.id);
    if (!o) return;
    const d = {};
    if ((r.order ?? 0) !== (o.order ?? 0)) d.order = r.order;
    if ((r.thumbAfter || "") !== (o.thumbAfter || ""))
      d.thumbAfter = r.thumbAfter || "";
    if (Object.keys(d).length > 0) patches.push({ id: r.id, patch: d });
  });
  return patches;
}

document.getElementById("btnRevert").addEventListener("click", () => {
  if (!dirty) return;
  if (!confirm("변경된 순서/썸네일을 저장된 상태로 되돌릴까요?")) return;
  records = JSON.parse(JSON.stringify(original));
  records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  setDirty(false);
  render();
});

document.getElementById("btnSave").addEventListener("click", async () => {
  const patches = diffedOrderPatches();
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
    } catch {
      failed++;
    }
    btn.textContent = `저장 중 (${done + failed}/${patches.length})`;
  }
  btn.textContent = "순서 저장";
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
