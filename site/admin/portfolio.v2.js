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
// thumbAfter 있으면 그걸 사용. 없으면 D1 Order 기반 옛 R2 fallback.
// "옮기는 순간 ThumbAfter 자동 박기"로 위치 변경 후 사진 보호.
const ADMIN_R2_BASE = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev";
function thumbUrl(r) {
  if (r.thumbAfter) return r.thumbAfter;
  const o = Math.round(Number(r.order ?? -1));
  if (o >= 0 && o <= 34) {
    const num = String(o + 1).padStart(2, "0");
    return `${ADMIN_R2_BASE}/images/portfolio-thumbs/${num}_after.webp`;
  }
  return "";
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

function isFilterActive() {
  return Boolean(filterCat.value || filterSearch.value.trim());
}

function render() {
  const list = filtered();
  countEl.textContent = records.length;
  grid.innerHTML = "";

  // 필터 적용 중에는 DnD 잠금 (전체 records 기준 splice가 보이지 않는
  // 카드들까지 이동시켜 "사라진 것처럼" 보이는 사고 방지)
  const locked = isFilterActive();
  const lockMsg = document.getElementById("filterLockMsg");
  if (lockMsg) lockMsg.hidden = !locked;

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
    card.className = "drag-card" + (locked ? " locked" : "");
    card.draggable = !locked;
    card.dataset.index = String(fullIdx);
    card.dataset.id = r.id;
    const t = thumbUrl(r);
    const thumbAttrs = t
      ? `class="drag-card-thumb" style="background-image:url('${adminUtil.escapeHtml(t)}')"`
      : `class="drag-card-thumb empty"`;
    const emptyHint = t
      ? ""
      : `<div class="drag-card-empty-hint">이미지 없음<br><small>업로드 필요</small></div>`;
    const badgeTitle = locked
      ? "필터/검색이 켜져 있어 위치 변경이 잠겨 있습니다"
      : "클릭해 번호로 위치 지정";
    card.innerHTML = `
      <div ${thumbAttrs}>
        ${emptyHint}
        <button type="button" class="drag-card-badge" data-act="setpos" title="${badgeTitle}"${locked ? " disabled" : ""}>${fullIdx + 1}</button>
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
          ${r.rightId || r.rightFolder ? `<span class="badge ref-badge">↗ ${adminUtil.escapeHtml(r.rightName || "참조")}${r.rightCount ? ` · 사진 ${r.rightCount}장` : ""}</span>` : ""}
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
    const badgeBtn = card.querySelector('[data-act="setpos"]');
    if (badgeBtn && !locked) {
      badgeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveByNumber(r.id);
      });
    }
    grid.appendChild(card);
  });
}

async function moveByNumber(id) {
  const from = records.findIndex((x) => x.id === id);
  if (from < 0) return;
  const max = records.length;
  const cur = from + 1;
  const input = prompt(
    `"${records[from].name}"\n현재 ${cur}번 / 총 ${max}개\n옮길 번호를 입력하세요 (1~${max})`,
    String(cur),
  );
  if (input === null) return;
  const n = parseInt(String(input).trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > max) {
    adminUtil.toast(`1~${max} 사이 숫자를 입력하세요`, "error");
    return;
  }
  if (n - 1 === from) return;
  await moveCardToIndex(from, n - 1);
}

const R2_PUBLIC_BASE = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev";

/**
 * 카드 1장을 dest 위치로 이동.
 *  - 옮긴 카드의 Order만 변경 (다른 record 절대 안 건드림)
 *  - 옮기기 전 ThumbAfter/ThumbBefore가 빈값이면 옛 R2 fallback URL을
 *    자동 박음 ("고유값 진입") → 이후 어디로 옮겨도 사진 안 깨짐
 *  - PATCH 1건만 (Order + protect 필드)
 *  - gap 소진 시 normalizeOrders 한 번 호출 후 재시도
 */
async function moveCardToIndex(src, dest) {
  const moved = records[src];
  if (!moved) return;
  const movedId = moved.id;
  // 시뮬레이션: 옮긴 후 prev/next 결정
  const sim = records.slice();
  sim.splice(src, 1);
  sim.splice(dest, 0, moved);
  const i = sim.findIndex((r) => r.id === movedId);
  const prev = i > 0 ? sim[i - 1] : null;
  const next = i < sim.length - 1 ? sim[i + 1] : null;
  let newOrder;
  if (prev && next) {
    const a = Number(prev.order ?? 0);
    const b = Number(next.order ?? 0);
    newOrder = Math.floor((a + b) / 2);
    if (newOrder === a || newOrder === b) {
      await normalizeOrders();
      await moveCardToIndex(
        records.findIndex((r) => r.id === movedId),
        dest,
      );
      return;
    }
  } else if (prev) {
    newOrder = Number(prev.order ?? 0) + 1000;
  } else if (next) {
    newOrder = Number(next.order ?? 0) - 1000;
  } else {
    newOrder = 1000;
  }

  // ─── 고유값 자동 박기 ───
  // 옮기기 직전 record의 Order(0~34) 기반 R2 fallback URL을 ThumbAfter/
  // ThumbBefore에 박아 record에 사진을 고정. 이 시점부터 그 카드는 위치와
  // 무관한 "고유값"을 보유 → 어디로 옮겨도 사진 그대로.
  const beforeOrder = Math.round(Number(moved.order ?? 0));
  const beforeNum = String(Math.max(1, beforeOrder + 1)).padStart(2, "0");
  const protect = {};
  if (!moved.thumbAfter && beforeOrder >= 0 && beforeOrder <= 34) {
    protect.thumbAfter = `${R2_PUBLIC_BASE}/images/portfolio-thumbs/${beforeNum}_after.webp`;
  }
  if (
    !moved.thumbBefore &&
    !moved.rightFolder &&
    beforeOrder >= 0 &&
    beforeOrder <= 34
  ) {
    protect.thumbBefore = `${R2_PUBLIC_BASE}/images/portfolio-thumbs/${beforeNum}_before.webp`;
  }

  // 클라이언트 즉시 반영
  Object.assign(moved, protect);
  moved.order = newOrder;
  records.splice(src, 1);
  records.splice(dest, 0, moved);
  render();

  // PATCH 1건만 — Order + protect (있으면)
  try {
    await adminUtil.api(`/api/portfolio/${movedId}`, {
      method: "PATCH",
      json: { order: newOrder, ...protect },
    });
    adminUtil.cacheInvalidate("/api/portfolio");
    const o = original.find((x) => x.id === movedId);
    if (o) {
      o.order = newOrder;
      Object.assign(o, protect);
    }
    adminUtil.toast(`${dest + 1}번 위치로 이동 · 자동 저장됨`);
  } catch (e) {
    adminUtil.toast("이동 저장 실패: " + e.message, "error");
    await reloadFromServer();
  }
}

/**
 * 모든 record Order를 1000, 2000, ... 으로 재부여 — gap 소진 시 1회만.
 * Worker batch reorder endpoint 사용 (subrequest 1회).
 */
async function normalizeOrders() {
  const updates = records.map((r, i) => ({ id: r.id, order: (i + 1) * 1000 }));
  await adminUtil.api("/api/portfolio/reorder", {
    method: "POST",
    json: { updates },
  });
  adminUtil.cacheInvalidate("/api/portfolio");
  await reloadFromServer();
  adminUtil.toast("정렬 키를 정리했습니다");
}

// ========== DnD (그리드 순서 + 이미지 drop으로 thumbAfter 교체) ==========
adminUtil.initDragSort({
  container: grid,
  onReorder: async (src, dest) => {
    if (isFilterActive()) {
      adminUtil.toast("필터/검색을 해제한 뒤 순서를 변경하세요", "error");
      render();
      return;
    }
    if (src === dest) return;
    await moveCardToIndex(src, dest);
  },
  onFileDrop: async (idx, file) => {
    let localUrl = "";
    const targetId = records[idx]?.id;
    if (!targetId) return;
    try {
      adminUtil.toast("썸네일 업로드 중...");
      const res = await adminUtil.uploadImage(file, {
        folder: "portfolio-thumbs",
        onLocalPreview: (u) => {
          localUrl = u;
          const cur = records.find((r) => r.id === targetId);
          if (cur) cur.thumbAfter = u;
          render();
        },
      });
      // 즉시 PATCH 1건 — 그 카드의 thumbAfter만 변경
      await adminUtil.api(`/api/portfolio/${targetId}`, {
        method: "PATCH",
        json: { thumbAfter: res.url },
      });
      const cur = records.find((r) => r.id === targetId);
      if (cur) cur.thumbAfter = res.url;
      const o = original.find((r) => r.id === targetId);
      if (o) o.thumbAfter = res.url;
      adminUtil.cacheInvalidate("/api/portfolio");
      render();
      if (localUrl) {
        try {
          URL.revokeObjectURL(localUrl);
        } catch {}
      }
      adminUtil.toast("썸네일 교체 · 자동 저장됨");
    } catch (e) {
      adminUtil.toast("업로드 실패: " + e.message, "error");
      await reloadFromServer();
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
    let localUrl = "";
    try {
      adminUtil.toast("업로드 중...");
      const res = await adminUtil.uploadImage(file, {
        folder,
        onLocalPreview: (u) => {
          localUrl = u;
          renderThumbPreview(previewId, clearBtnId, u);
        },
      });
      onChange(res.url);
      renderThumbPreview(previewId, clearBtnId, res.url);
      if (localUrl) {
        try {
          URL.revokeObjectURL(localUrl);
        } catch {}
      }
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
      let pendingIdx = -1;
      let localUrl = "";
      try {
        const res = await adminUtil.uploadImage(file, {
          folder: "portfolio",
          onLocalPreview: (u) => {
            localUrl = u;
            pendingIdx = modalImages.length;
            modalImages.push(u);
            renderGallery();
          },
        });
        if (pendingIdx >= 0) {
          modalImages[pendingIdx] = res.url;
        } else {
          modalImages.push(res.url);
        }
        renderGallery();
        if (localUrl) {
          try {
            URL.revokeObjectURL(localUrl);
          } catch {}
        }
        ok++;
      } catch {
        if (pendingIdx >= 0) {
          modalImages.splice(pendingIdx, 1);
          renderGallery();
        }
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

// ========== 등록 모드 (신규 / 기존 가져오기) ==========
const modeRow = document.getElementById("modeRow");
const copySourceRow = document.getElementById("copySourceRow");
const copySource = document.getElementById("copySource");
const pairSource = document.getElementById("pairSource");
const segmentedBtns = modeRow ? modeRow.querySelectorAll(".segmented-btn") : [];

// 상세 이미지 참조 원본 드롭다운 채우기 — 자기 자신 제외, 폴더값 기준 매칭.
// (옛 "페어링 = 옆에 같이 보임" 개념 아님. rightFolder 는 상세 모달 갤러리를
//  어느 원본글에서 가져올지만 정의함. 표지·카드 위치는 자기 것 그대로.)
// pairSource 의 option value = 참조 대상 record 의 영구 id.
// (옛 방식은 folder 슬러그를 키로 사용 → 같은 이름 등록 시 슬러그가 충돌
//  하고 라이브에서 자기참조 가드에 막혀 상세이미지가 안 나오는 사고 빈발.
//  id 기반 참조로 전환 후로는 같은 이름 등록도 정상 동작.)
function populatePairSource(excludeId) {
  if (!pairSource) return;
  const cur = pairSource.value;
  // records 는 이미 Order ASC 정렬 — 표시 번호 = 카드 위치
  pairSource.innerHTML =
    '<option value="">— 참조 안 함 (자기 상세 이미지 사용) —</option>' +
    records
      .filter((r) => r.id !== excludeId)
      .map((r) => {
        const pos = records.findIndex((x) => x.id === r.id) + 1;
        const count = (Array.isArray(r.images) && r.images.length) || 0;
        return `<option value="${r.id}">${pos}. ${adminUtil.escapeHtml(r.name || "(이름 없음)")}${count ? ` · 사진 ${count}장` : ""}</option>`;
      })
      .join("");
  if (cur) pairSource.value = cur;
}

if (pairSource) {
  // 참조 설정 변경은 rightId 만 바꿈 — own 갤러리는 사용자 의도대로 보존.
  // (라이브는 own 우선이라 own 이 있으면 참조는 자동 비활성. own 비우려면
  //  갤러리 항목을 사용자가 직접 제거해야 함 = 명시적 의도)
  pairSource.addEventListener("change", () => {});
}

function setMode(mode) {
  segmentedBtns.forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  copySourceRow.hidden = mode !== "copy";
  if (mode === "new") {
    form.elements.name.value = "";
    form.elements.folder.value = "";
    form.elements.category.value = "HOUSE";
    modalThumbAfter = "";
    modalImages = [];
    folderManuallyEdited = false;
    renderThumbPreview("thumbAfterPreview", "btnClearThumbAfter", "");
    renderGallery();
    copySource.value = "";
    if (pairSource) pairSource.value = "";
  }
}

segmentedBtns.forEach((b) => {
  b.addEventListener("click", () => setMode(b.dataset.mode));
});

function populateCopySource() {
  // records 는 이미 Order ASC 로 정렬됨 → 표시 번호 = index + 1
  copySource.innerHTML =
    '<option value="">— 선택 —</option>' +
    records
      .map(
        (r, i) =>
          `<option value="${r.id}">${i + 1}. ${adminUtil.escapeHtml(r.name || "(이름 없음)")}</option>`,
      )
      .join("");
}

copySource.addEventListener("change", () => {
  const src = records.find((x) => x.id === copySource.value);
  if (!src) return;
  // "기존 글 가져오기" = 원본 글의 이름/카테고리/갤러리를 복사해 독립 글 생성.
  // 이건 명시적으로 "참조 아님" — 복사된 글은 이후 원본과 무관하게 편집 가능.
  // (참조하고 싶으면 신규 등록 + 참조 드롭다운 사용 → 원본 변경 자동 반영)
  form.elements.name.value = src.name || "";
  form.elements.folder.value =
    (adminUtil.slugify(src.name) || "project") + "-" + Date.now().toString(36);
  folderManuallyEdited = true;
  form.elements.category.value = src.category || "HOUSE";
  modalThumbAfter = ""; // 표지는 새로 업로드 받기
  modalImages = Array.isArray(src.images) ? src.images.slice() : [];
  renderThumbPreview("thumbAfterPreview", "btnClearThumbAfter", "");
  renderGallery();
  if (pairSource) pairSource.value = ""; // 복사 모드는 참조 미설정
  adminUtil.toast(
    `"${src.name}"의 내용을 복사했습니다. 표지 이미지를 새로 업로드하세요. (이후 편집은 원본과 독립적)`,
  );
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
  // 신규 등록 모드 토글 노출
  if (modeRow) modeRow.hidden = false;
  populateCopySource();
  populatePairSource(null);
  if (pairSource) pairSource.value = "";
  setMode("new");
  openModal("새 프로젝트");
});

function openEdit(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  editingId = id;
  form.reset();
  // 편집 시에는 모드 토글 숨김
  if (modeRow) modeRow.hidden = true;
  form.elements.name.value = r.name || "";
  form.elements.folder.value = r.folder || "";
  form.elements.category.value = r.category || "HOUSE";
  modalThumbAfter = r.thumbAfter || "";
  modalImages = Array.isArray(r.images) ? r.images.slice() : [];
  folderManuallyEdited = true; // 기존 folder 유지
  renderThumbPreview(
    "thumbAfterPreview",
    "btnClearThumbAfter",
    modalThumbAfter,
  );
  renderGallery();
  // 상세 이미지 참조 원본 드롭다운 — 영구 id 로 매칭. (옛 record 중 RightId
  // 백필이 안 된 경우엔 r.rightFolder 로 폴백 매칭)
  populatePairSource(r.id);
  if (pairSource) {
    if (r.rightId) {
      pairSource.value = r.rightId;
    } else if (r.rightFolder) {
      const legacy = records.find(
        (x) => x.id !== r.id && x.folder === r.rightFolder,
      );
      pairSource.value = legacy ? legacy.id : "";
    } else {
      pairSource.value = "";
    }
  }
  openModal(`편집 · ${r.name}`);
}

async function doDelete(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  if (
    !confirm(
      `"${r.name}" 을(를) 삭제할까요?\n썸네일과 갤러리 이미지 ${(r.images || []).length}장도 함께 삭제됩니다.`,
    )
  )
    return;
  try {
    await adminUtil.api(`/api/portfolio/${id}`, { method: "DELETE" });
    adminUtil.cacheInvalidate("/api/portfolio");
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
  let folder =
    form.elements.folder.value.trim() ||
    adminUtil.slugify(name) ||
    "project-" + Date.now();
  // folder 충돌 회피 — 같은 슬러그가 이미 있으면 자동 suffix.
  // (옛 사고: 같은 이름으로 두 개 등록 → 동일 slugify 결과 → 라이브에서
  //  자기참조 가드에 막혀 상세이미지가 안 나오던 사례 차단)
  const collidesWith = (slug) =>
    records.some((r) => r.id !== editingId && (r.folder || "") === slug);
  if (collidesWith(folder)) {
    const base = folder;
    let n = 2;
    while (collidesWith(`${base}-${n}`)) n += 1;
    folder = `${base}-${n}`;
  }
  // 참조 (영구 id). 라이브에서 own 우선이므로 own images 는 그대로 보존 —
  // 사용자가 명시적으로 갤러리를 비워야만 참조가 활성. (own 자동 삭제는 X)
  const rightId = (pairSource && pairSource.value) || "";
  const payload = {
    name,
    folder,
    category: form.elements.category.value,
    thumbAfter: modalThumbAfter,
    images: modalImages,
    rightId,
    // 레거시 컬럼 매 저장마다 초기화 — Worker 가 RightId 기준으로 derive 해서
    // 응답하므로 D1 에는 빈 값 저장. 옛 stale RightFolder 가 남아 라이브 폴백
    // 분기에서 의도치 않게 참조가 살아 있는 사고 차단.
    rightFolder: "",
    rightName: "",
    rightCount: 0,
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
      // 신규 글의 order = (현재 가장 작은 order) - 1.
      // 다른 record는 안 건드림 (PATCH 폭주 X, 옛 카드 위치 영향 0)
      const minOrder = records.length
        ? Math.min(...records.map((r) => Number(r.order ?? 0)))
        : 0;
      payload.order = minOrder - 1;
      await adminUtil.api("/api/portfolio", {
        method: "POST",
        json: payload,
      });
    }
    // 등록·편집 모두 응답 후 무조건 서버에서 다시 받아 records/original 동기
    // → "등록 직후 화면과 D1 불일치"로 인한 데이터 꼬임 사고 차단
    closeModal();
    await reloadFromServer();
    adminUtil.toast(editingId ? "저장 완료" : "최상단에 추가됨");
  } catch (e2) {
    adminUtil.toast("저장 실패: " + e2.message, "error");
  } finally {
    btnSubmit.disabled = false;
  }
});

// ========== 순서 저장 ==========
// 다건 Order 변경은 Worker /api/portfolio/reorder 로 한 번에 batch 전송
// → subrequest 1회. PATCH 폭주·중복·부분 실패로 인한 클라이언트/D1 불일치
// 시나리오가 사라짐. ThumbAfter 등 다른 필드 변경은 개별 PATCH 유지.
function diffedChanges() {
  const origMap = new Map(original.map((r) => [r.id, r]));
  const orderUpdates = [];
  const fieldPatches = [];
  records.forEach((r) => {
    const o = origMap.get(r.id);
    if (!o) return;
    if (Number(r.order ?? 0) !== Number(o.order ?? 0)) {
      orderUpdates.push({ id: r.id, order: Number(r.order ?? 0) });
    }
    const fp = {};
    if ((r.thumbAfter || "") !== (o.thumbAfter || ""))
      fp.thumbAfter = r.thumbAfter || "";
    if (Object.keys(fp).length > 0) fieldPatches.push({ id: r.id, patch: fp });
  });
  return { orderUpdates, fieldPatches };
}

// 저장 후 클라이언트/D1 동기 — 강제 refetch 로 stale 상태 차단
async function reloadFromServer() {
  adminUtil.cacheInvalidate("/api/portfolio");
  const d = await adminUtil.api("/api/portfolio");
  records = d.records || [];
  records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  original = JSON.parse(JSON.stringify(records));
  setDirty(false);
  render();
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
  const { orderUpdates, fieldPatches } = diffedChanges();
  if (!orderUpdates.length && !fieldPatches.length) {
    adminUtil.toast("변경된 내용이 없습니다");
    return;
  }
  const btn = document.getElementById("btnSave");
  btn.disabled = true;
  btn.textContent = "저장 중...";
  let failed = 0;
  // 1) 다건 Order 변경 → 한 번에 batch
  if (orderUpdates.length) {
    try {
      await adminUtil.api("/api/portfolio/reorder", {
        method: "POST",
        json: { updates: orderUpdates },
      });
    } catch (e) {
      failed += orderUpdates.length;
      adminUtil.toast("순서 저장 실패: " + e.message, "error");
    }
  }
  // 2) thumbAfter 등 개별 필드 PATCH (소수일 때만 발생)
  for (const { id, patch } of fieldPatches) {
    try {
      await adminUtil.api(`/api/portfolio/${id}`, {
        method: "PATCH",
        json: patch,
      });
    } catch {
      failed++;
    }
  }
  // 3) 무조건 서버 재조회로 클라이언트/D1 동기 — 부분 실패라도 화면이
  //    실제 D1 상태와 일치하도록 강제. "데이터 꼬임" 사고의 마지막 안전망.
  try {
    await reloadFromServer();
  } catch (e) {
    adminUtil.toast("재로드 실패 (새로고침 해주세요): " + e.message, "error");
  }
  btn.textContent = "순서 저장";
  btn.disabled = false;
  if (failed === 0) {
    adminUtil.toast("저장 완료");
  } else {
    adminUtil.toast(`${failed}건 실패 — 화면을 재로드했습니다`, "error");
  }
});

// ========== 초기 로드 ==========
(async () => {
  try {
    // 캐시 무시. 어드민 진입 시점에는 항상 최신 D1 상태 확인.
    const d = await adminUtil.api("/api/portfolio");
    records = d.records || [];
    records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    original = JSON.parse(JSON.stringify(records));
    render();
  } catch (e) {
    grid.innerHTML = `<div class="card-grid-empty">로드 실패: ${adminUtil.escapeHtml(e.message)}</div>`;
  }
})();
// build: 1779422620
// v2 force
