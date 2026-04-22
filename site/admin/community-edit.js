// ========== 커뮤니티 블록 에디터 ==========
const params = new URLSearchParams(location.search);
const IS_NEW = params.has("new");
const IDX_PARAM = params.get("idx") || "";

const metaForm = document.getElementById("metaForm");
const blocksList = document.getElementById("blocksList");

// 통합 블록 모델:
//   text  → { id, type: "text",  content }
//   image → { id, type: "image", images: [url...], layout: "grid-2|grid-3|grid-4" }
let blocks = [];
let blockSeq = 0;
let thumbUrl = "";

function newId() {
  return "b" + ++blockSeq;
}

function generateIdx() {
  return (
    String(Date.now()).slice(-9) + Math.floor(Math.random() * 10).toString()
  );
}

function addBlock(type, data = {}) {
  const b = { id: newId(), type };
  if (type === "text") {
    b.content = data.content || "";
  } else if (type === "image") {
    b.images = Array.isArray(data.images) ? data.images.slice() : [];
    b.layout = data.layout || "grid-2";
  }
  blocks.push(b);
  renderBlocks();
}

function moveBlock(id, dir) {
  const i = blocks.findIndex((b) => b.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= blocks.length) return;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  renderBlocks();
}

function removeBlock(id) {
  const i = blocks.findIndex((b) => b.id === id);
  if (i < 0) return;
  if (!confirm(`블록 ${i + 1}을(를) 삭제할까요?`)) return;
  blocks.splice(i, 1);
  renderBlocks();
}

function renderBlocks() {
  if (!blocks.length) {
    blocksList.innerHTML =
      '<div class="empty-state">블록이 없습니다. 아래에서 추가하세요.</div>';
    return;
  }
  blocksList.innerHTML = blocks
    .map((b, i) => {
      if (b.type === "text") {
        return `
        <div class="block-item" data-id="${b.id}">
          <div class="block-head">
            <span class="block-tag">${i + 1}. 텍스트</span>
            <div class="block-actions">
              <button class="icon-btn" data-act="up" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-btn" data-act="down" ${i === blocks.length - 1 ? "disabled" : ""}>↓</button>
              <button class="icon-btn danger" data-act="del">✕</button>
            </div>
          </div>
          <textarea class="block-text" rows="5" placeholder="텍스트를 입력하세요...">${adminUtil.escapeHtml(b.content)}</textarea>
        </div>`;
      } else if (b.type === "image") {
        const count = (b.images || []).length;
        const showLayout = count > 1;
        const label =
          count === 0
            ? "이미지"
            : count === 1
              ? "이미지 1장"
              : `이미지 ${count}장`;
        return `
        <div class="block-item" data-id="${b.id}">
          <div class="block-head">
            <span class="block-tag">${i + 1}. ${label}</span>
            <div class="block-actions">
              <button class="icon-btn" data-act="up" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-btn" data-act="down" ${i === blocks.length - 1 ? "disabled" : ""}>↓</button>
              <button class="icon-btn danger" data-act="del">✕</button>
            </div>
          </div>
          <div class="field block-layout-row" style="margin-bottom:10px; ${showLayout ? "" : "display:none"}">
            <label style="display:inline-block;margin-right:8px">배치</label>
            <select class="block-layout">
              <option value="grid-2" ${b.layout === "grid-2" ? "selected" : ""}>2열 (나란히)</option>
              <option value="grid-3" ${b.layout === "grid-3" ? "selected" : ""}>3열</option>
              <option value="grid-4" ${b.layout === "grid-4" ? "selected" : ""}>4열</option>
            </select>
            <span class="admin-sub" style="margin-left:8px;font-size:11px">2장 이상일 때 적용됩니다.</span>
          </div>
          <div class="gallery-grid block-gallery" data-gallery></div>
          <input type="file" class="block-files" accept="image/*" multiple hidden />
          <button type="button" class="btn btn-ghost block-add-images" style="margin-top:8px">
            ${count ? "+ 이미지 추가" : "📤 이미지 업로드"}
          </button>
        </div>`;
      }
      return "";
    })
    .join("");

  blocksList.querySelectorAll(".block-item").forEach((el) => {
    const id = el.dataset.id;
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    el.querySelector('[data-act="up"]').addEventListener("click", () =>
      moveBlock(id, -1),
    );
    el.querySelector('[data-act="down"]').addEventListener("click", () =>
      moveBlock(id, 1),
    );
    el.querySelector('[data-act="del"]').addEventListener("click", () =>
      removeBlock(id),
    );

    if (b.type === "text") {
      el.querySelector(".block-text").addEventListener("input", (e) => {
        b.content = e.target.value;
      });
      return;
    }

    if (b.type === "image") {
      const layoutSel = el.querySelector(".block-layout");
      const layoutRow = el.querySelector(".block-layout-row");
      const galleryEl = el.querySelector("[data-gallery]");
      const addBtn = el.querySelector(".block-add-images");
      const fileInput = el.querySelector(".block-files");

      layoutSel.addEventListener("change", () => {
        b.layout = layoutSel.value;
      });

      function updateLabel() {
        const tag = el.querySelector(".block-tag");
        if (!tag) return;
        const idx = blocks.findIndex((x) => x.id === b.id) + 1;
        const n = b.images.length;
        const label =
          n === 0 ? "이미지" : n === 1 ? "이미지 1장" : `이미지 ${n}장`;
        tag.textContent = `${idx}. ${label}`;
      }

      function updateLayoutVisibility() {
        layoutRow.style.display = b.images.length > 1 ? "" : "none";
        addBtn.textContent = b.images.length
          ? "+ 이미지 추가"
          : "📤 이미지 업로드";
      }

      function renderGallery() {
        galleryEl.innerHTML = "";
        if (!b.images.length) {
          galleryEl.innerHTML =
            '<div class="gallery-empty">아직 추가된 이미지가 없습니다.</div>';
          return;
        }
        b.images.forEach((url, j) => {
          const item = document.createElement("div");
          item.className = "gallery-item";
          item.draggable = true;
          item.dataset.index = String(j);
          item.style.backgroundImage = `url('${url}')`;
          item.innerHTML = `
            <span class="gallery-item-order">${j + 1}</span>
            <button type="button" class="gallery-item-remove" data-act="del" title="제거">✕</button>
          `;
          item
            .querySelector('[data-act="del"]')
            .addEventListener("click", (e) => {
              e.stopPropagation();
              b.images.splice(j, 1);
              renderGallery();
              updateLabel();
              updateLayoutVisibility();
            });
          galleryEl.appendChild(item);
        });
      }

      addBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const files = Array.from(fileInput.files || []);
        if (!files.length) return;
        adminUtil.toast(`${files.length}개 업로드 중...`);
        let ok = 0,
          fail = 0;
        for (const f of files) {
          try {
            const res = await adminUtil.uploadImage(f, {
              folder: "community/posts",
            });
            b.images.push(res.url);
            renderGallery();
            updateLabel();
            updateLayoutVisibility();
            ok++;
          } catch {
            fail++;
          }
        }
        adminUtil.toast(
          `업로드 완료 (${ok}성공${fail ? " / " + fail + "실패" : ""})`,
        );
        fileInput.value = "";
      });

      adminUtil.initDragSort({
        container: galleryEl,
        itemSelector: ".gallery-item",
        onReorder: (src, dest) => {
          const moved = b.images.splice(src, 1)[0];
          b.images.splice(dest, 0, moved);
          renderGallery();
        },
      });

      renderGallery();
      updateLayoutVisibility();
    }
  });
}

document
  .getElementById("btnAddText")
  .addEventListener("click", () => addBlock("text"));
document
  .getElementById("btnAddImage")
  .addEventListener("click", () => addBlock("image"));

// ========== 썸네일 ==========
function renderThumbPreview(url) {
  const el = document.getElementById("thumbPreview");
  const clr = document.getElementById("btnClearThumb");
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
  metaForm.elements.thumb.value = url || "";
}

document.getElementById("btnPickThumb").addEventListener("click", () => {
  document.getElementById("thumbFile").click();
});
document.getElementById("thumbFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    adminUtil.toast("썸네일 업로드 중...");
    const res = await adminUtil.uploadImage(f, { folder: "community/thumbs" });
    thumbUrl = res.url;
    renderThumbPreview(thumbUrl);
    adminUtil.toast("업로드 완료");
  } catch (err) {
    adminUtil.toast("업로드 실패: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
});
document.getElementById("btnClearThumb").addEventListener("click", () => {
  thumbUrl = "";
  renderThumbPreview("");
});

// ========== 취소 / 저장 ==========
document.getElementById("btnCancel").addEventListener("click", () => {
  if (confirm("변경사항을 버리고 목록으로 돌아갈까요?"))
    location.href = "community";
});

document.getElementById("btnSave").addEventListener("click", async () => {
  const btn = document.getElementById("btnSave");
  btn.disabled = true;
  const f = metaForm.elements;
  const title = f.title.value.trim();
  if (!title) {
    adminUtil.toast("제목은 필수입니다", "error");
    btn.disabled = false;
    return;
  }
  const idx = f.idx.value.trim() || generateIdx();

  const cleaned = blocks
    .map((b) => {
      if (b.type === "text") {
        const c = (b.content || "").trim();
        return c ? { type: "text", content: c } : null;
      }
      if (b.type === "image") {
        const imgs = (b.images || []).filter(Boolean);
        if (!imgs.length) return null;
        const layout = /^grid-(2|3|4)$/.test(b.layout || "")
          ? b.layout
          : "grid-2";
        return { type: "image", images: imgs, layout };
      }
      return null;
    })
    .filter(Boolean);

  const allImages = [];
  cleaned.forEach((b) => {
    if (b.type === "image" && Array.isArray(b.images))
      allImages.push(...b.images);
  });
  const bodyText = cleaned
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("\n\n");
  const excerpt =
    (f.excerpt.value || "").trim() ||
    bodyText.replace(/\s+/g, " ").trim().slice(0, 80);

  const payload = {
    idx,
    title,
    category: f.category.value.trim(),
    date: f.date.value,
    board: f.board.value,
    thumb: thumbUrl,
    views: 0,
    excerpt,
    body_text: bodyText,
    images: allImages,
    content_blocks: cleaned,
  };

  try {
    if (IS_NEW) {
      await adminUtil.api("/api/community", { method: "POST", json: payload });
    } else {
      await adminUtil.api(
        `/api/community/${encodeURIComponent(IDX_PARAM || idx)}`,
        { method: "PATCH", json: payload },
      );
    }
    adminUtil.cacheInvalidate("/api/community");
    adminUtil.toast("저장 완료");
    setTimeout(() => (location.href = "community"), 600);
  } catch (e) {
    adminUtil.toast("저장 실패: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ========== 초기 로드 ==========
function normalizeBlock(b) {
  const obj = { id: newId(), type: b.type };
  if (b.type === "text") {
    obj.type = "text";
    obj.content = b.content || "";
    return obj;
  }
  // 기존 image (단일 src) → images 배열로 승격
  if (b.type === "image") {
    obj.type = "image";
    obj.images = Array.isArray(b.images)
      ? b.images.slice()
      : b.src
        ? [b.src]
        : [];
    obj.layout = /^grid-(2|3|4)$/.test(b.layout || "") ? b.layout : "grid-2";
    return obj;
  }
  // 기존 gallery → image 타입으로 통일
  if (b.type === "gallery") {
    obj.type = "image";
    obj.images = Array.isArray(b.images) ? b.images.slice() : [];
    obj.layout = /^grid-(2|3|4)$/.test(b.layout || "") ? b.layout : "grid-2";
    return obj;
  }
  return null;
}

(async () => {
  if (IS_NEW) {
    metaForm.elements.idx.value = generateIdx();
    metaForm.elements.board.value = "Residential";
    metaForm.elements.date.value = new Date().toISOString().slice(0, 10);
    renderThumbPreview("");
    renderBlocks();
    return;
  }
  if (!IDX_PARAM) {
    adminUtil.toast("idx 파라미터가 필요합니다", "error");
    return;
  }
  try {
    const d = await adminUtil.apiCached(
      `/api/community/${encodeURIComponent(IDX_PARAM)}`,
      { ttl: 15_000 },
    );
    const p = d.post || {};
    metaForm.elements.idx.value = p.idx || IDX_PARAM;
    metaForm.elements.title.value = p.title || "";
    metaForm.elements.category.value = p.category || "";
    metaForm.elements.date.value = (p.date || "").slice(0, 10);
    metaForm.elements.board.value = p.board || "Residential";
    metaForm.elements.excerpt.value = p.excerpt || "";
    thumbUrl = p.thumb || "";
    renderThumbPreview(thumbUrl);
    blocks = (p.content_blocks || []).map(normalizeBlock).filter(Boolean);
    renderBlocks();
  } catch (e) {
    adminUtil.toast("로드 실패: " + e.message, "error");
  }
})();
