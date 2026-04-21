// ========== 커뮤니티 블록 에디터 (업로드만) ==========
const params = new URLSearchParams(location.search);
const IS_NEW = params.has("new");
const IDX_PARAM = params.get("idx") || "";

const metaForm = document.getElementById("metaForm");
const blocksList = document.getElementById("blocksList");

let blocks = []; // [{id, type, content?, src?}]
let blockSeq = 0;
let thumbUrl = "";

function newId() {
  return "b" + ++blockSeq;
}

function addBlock(type, data = {}) {
  const b = { id: newId(), type };
  if (type === "text") b.content = data.content || "";
  else if (type === "image") b.src = data.src || "";
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
            <span class="block-tag">${i + 1}. TEXT</span>
            <div class="block-actions">
              <button class="icon-btn" data-act="up" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-btn" data-act="down" ${i === blocks.length - 1 ? "disabled" : ""}>↓</button>
              <button class="icon-btn danger" data-act="del">✕</button>
            </div>
          </div>
          <textarea class="block-text" rows="5" placeholder="텍스트를 입력하세요...">${adminUtil.escapeHtml(b.content)}</textarea>
        </div>`;
      } else if (b.type === "image") {
        const hasImg = !!b.src;
        const preview = hasImg
          ? `<img src="${adminUtil.escapeHtml(b.src)}" alt="">`
          : '<span style="color:var(--c-text-muted);font-size:11px">미업로드</span>';
        return `
        <div class="block-item" data-id="${b.id}">
          <div class="block-head">
            <span class="block-tag">${i + 1}. IMAGE</span>
            <div class="block-actions">
              <button class="icon-btn" data-act="up" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-btn" data-act="down" ${i === blocks.length - 1 ? "disabled" : ""}>↓</button>
              <button class="icon-btn danger" data-act="del">✕</button>
            </div>
          </div>
          <div class="block-image-body">
            <div class="block-image-preview" data-preview>${preview}</div>
            <div class="block-image-fields">
              <input type="file" class="block-file" accept="image/*" hidden />
              <button type="button" class="btn btn-ghost block-upload-btn">
                ${hasImg ? "🔄 이미지 교체" : "📤 이미지 업로드"}
              </button>
              <p class="hint">WebP 자동 변환 후 업로드됩니다.</p>
            </div>
          </div>
        </div>`;
      }
      return "";
    })
    .join("");

  blocksList.querySelectorAll(".block-item").forEach((el) => {
    const id = el.dataset.id;
    const b = blocks.find((x) => x.id === id);
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
    } else if (b.type === "image") {
      const uploadBtn = el.querySelector(".block-upload-btn");
      const fileInput = el.querySelector(".block-file");
      const preview = el.querySelector("[data-preview]");
      uploadBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        try {
          adminUtil.toast("업로드 중...");
          const res = await adminUtil.uploadImage(f, {
            folder: "community/posts",
          });
          b.src = res.url;
          preview.innerHTML = `<img src="${adminUtil.escapeHtml(res.url)}" alt="">`;
          uploadBtn.textContent = "🔄 이미지 교체";
          adminUtil.toast("업로드 완료");
        } catch (e) {
          adminUtil.toast("업로드 실패: " + e.message, "error");
        } finally {
          fileInput.value = "";
        }
      });
    }
  });
}

document
  .getElementById("btnAddText")
  .addEventListener("click", () => addBlock("text"));
document
  .getElementById("btnAddImage")
  .addEventListener("click", () => addBlock("image"));

// ========== 썸네일 업로드 ==========
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
  const idx = f.idx.value.trim();
  const title = f.title.value.trim();
  if (!idx || !title) {
    adminUtil.toast("Idx와 제목은 필수입니다", "error");
    btn.disabled = false;
    return;
  }
  const cleaned = blocks
    .map((b) => {
      if (b.type === "text") {
        const c = (b.content || "").trim();
        return c ? { type: "text", content: c } : null;
      }
      if (b.type === "image") {
        const s = (b.src || "").trim();
        return s ? { type: "image", src: s } : null;
      }
      return null;
    })
    .filter(Boolean);

  const images = cleaned.filter((b) => b.type === "image").map((b) => b.src);
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
    views: Number(f.views.value) || 0,
    excerpt,
    body_text: bodyText,
    images,
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
    adminUtil.toast("저장 완료");
    setTimeout(() => (location.href = "community"), 600);
  } catch (e) {
    adminUtil.toast("저장 실패: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ========== 초기 로드 ==========
(async () => {
  if (IS_NEW) {
    metaForm.elements.board.value = "Residential";
    metaForm.elements.idx.value = String(Date.now()).slice(-9);
    renderThumbPreview("");
    renderBlocks();
    return;
  }
  if (!IDX_PARAM) {
    adminUtil.toast("idx 파라미터가 필요합니다", "error");
    return;
  }
  try {
    const d = await adminUtil.api(
      `/api/community/${encodeURIComponent(IDX_PARAM)}`,
    );
    const p = d.post || {};
    metaForm.elements.idx.value = p.idx || "";
    metaForm.elements.title.value = p.title || "";
    metaForm.elements.category.value = p.category || "";
    metaForm.elements.date.value = (p.date || "").slice(0, 10);
    metaForm.elements.board.value = p.board || "Residential";
    metaForm.elements.views.value = p.views || 0;
    metaForm.elements.excerpt.value = p.excerpt || "";
    thumbUrl = p.thumb || "";
    renderThumbPreview(thumbUrl);
    blocks = (p.content_blocks || []).map((b) => ({
      id: newId(),
      type: b.type,
      content: b.content || "",
      src: b.src || "",
    }));
    renderBlocks();
  } catch (e) {
    adminUtil.toast("로드 실패: " + e.message, "error");
  }
})();
