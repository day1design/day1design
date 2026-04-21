// ========== 커뮤니티 블록 에디터 ==========
const params = new URLSearchParams(location.search);
const IS_NEW = params.has("new");
const IDX_PARAM = params.get("idx") || "";

const metaForm = document.getElementById("metaForm");
const blocksList = document.getElementById("blocksList");
const pageTitle = document.getElementById("pageTitle");

let blocks = []; // [{id, type, content?, src?}]
let blockSeq = 0;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
          <textarea class="block-text" rows="5" placeholder="텍스트를 입력하세요...">${escapeHtml(b.content)}</textarea>
        </div>`;
      } else if (b.type === "image") {
        const preview = b.src ? `<img src="${escapeHtml(b.src)}" alt="">` : "";
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
              <input type="url" class="block-src" placeholder="이미지 URL" value="${escapeHtml(b.src)}" />
              <input type="file" class="block-file" accept="image/*" />
              <p class="hint">파일 선택 시 R2로 업로드 → URL 자동 입력</p>
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
      const srcInput = el.querySelector(".block-src");
      const fileInput = el.querySelector(".block-file");
      const preview = el.querySelector("[data-preview]");
      srcInput.addEventListener("input", () => {
        b.src = srcInput.value.trim();
        preview.innerHTML = b.src
          ? `<img src="${escapeHtml(b.src)}" alt="">`
          : "";
      });
      fileInput.addEventListener("change", async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        try {
          adminUtil.toast("업로드 중...");
          const fd = new FormData();
          fd.append("file", f);
          fd.append("folder", "community/posts");
          const res = await adminUtil.apiUpload("/api/upload/image", fd);
          b.src = res.url;
          srcInput.value = res.url;
          preview.innerHTML = `<img src="${escapeHtml(res.url)}" alt="">`;
          adminUtil.toast("업로드 완료");
        } catch (e) {
          adminUtil.toast("업로드 실패: " + e.message, "error");
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

// 썸네일 파일 업로드
document.getElementById("thumbFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    adminUtil.toast("썸네일 업로드 중...");
    const fd = new FormData();
    fd.append("file", f);
    fd.append("folder", "community/thumbs");
    const res = await adminUtil.apiUpload("/api/upload/image", fd);
    metaForm.elements.thumb.value = res.url;
    adminUtil.toast("업로드 완료");
  } catch (err) {
    adminUtil.toast("업로드 실패: " + err.message, "error");
  }
});

document.getElementById("btnCancel").addEventListener("click", () => {
  if (confirm("변경사항을 버리고 목록으로 돌아갈까요?"))
    location.href = "community.html";
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
    thumb: f.thumb.value.trim(),
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
        {
          method: "PATCH",
          json: payload,
        },
      );
    }
    adminUtil.toast("저장 완료");
    setTimeout(() => (location.href = "community.html"), 600);
  } catch (e) {
    adminUtil.toast("저장 실패: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// 초기 로드
(async () => {
  await adminUtil.ensureAuth();
  adminUtil.pingApi();
  document.getElementById("btnLogout").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await adminUtil.api("/api/auth/logout", { method: "POST" });
    } catch {}
    adminUtil.clearToken();
    location.href = "login.html";
  });

  if (IS_NEW) {
    pageTitle.textContent = "새 게시글";
    metaForm.elements.board.value = "Residential";
    metaForm.elements.idx.value = String(Date.now()).slice(-9);
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
    pageTitle.textContent = `게시글 편집 · ${p.title || IDX_PARAM}`;
    metaForm.elements.idx.value = p.idx || "";
    metaForm.elements.title.value = p.title || "";
    metaForm.elements.category.value = p.category || "";
    metaForm.elements.date.value = (p.date || "").slice(0, 10);
    metaForm.elements.board.value = p.board || "Residential";
    metaForm.elements.thumb.value = p.thumb || "";
    metaForm.elements.views.value = p.views || 0;
    metaForm.elements.excerpt.value = p.excerpt || "";
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
