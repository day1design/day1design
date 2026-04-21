// ========== 히어로 슬라이드 (그리드 + DnD) ==========
const MAX_SLIDES = 10;
let slides = [];
let original = [];
let dirty = false;

const listEl = document.getElementById("slidesList");
const addFormEl = document.getElementById("addForm");
const previewWrap = document.getElementById("previewWrap");
const previewEl = document.getElementById("preview");
const uploadInput = document.getElementById("uploadInput");
const urlInput = document.getElementById("imageUrlInput");
const hrefInput = document.getElementById("hrefInput");
const altInput = document.getElementById("altInput");
const countEl = document.getElementById("slideCount");
const dirtyEl = document.getElementById("dirtyLabel");

function setDirty(v) {
  dirty = v;
  dirtyEl.classList.toggle("hidden", !v);
}

function render() {
  // 바둑판 그리드로 리스트 변환
  listEl.className = "card-grid";
  listEl.innerHTML = "";

  if (!slides.length) {
    const empty = document.createElement("div");
    empty.className = "card-grid-empty";
    empty.textContent =
      "등록된 슬라이드가 없습니다. 아래 '+ 슬라이드 추가'로 등록하거나, 이미지를 이 영역에 드래그해 넣으세요.";
    listEl.appendChild(empty);
  } else {
    slides.forEach((s, i) => {
      const card = document.createElement("div");
      card.className = "drag-card";
      card.draggable = true;
      card.dataset.index = String(i);
      card.innerHTML = `
        <div class="drag-card-thumb" style="background-image:url('${adminUtil.escapeHtml(s.image)}')">
          <span class="drag-card-badge">${i + 1}</span>
          <div class="drag-card-actions">
            <button type="button" class="drag-card-action" data-act="replace" title="이미지 교체">⟳</button>
            <button type="button" class="drag-card-action danger" data-act="del" title="삭제">✕</button>
          </div>
        </div>
        <div class="drag-card-meta">
          <p class="drag-card-title">${adminUtil.escapeHtml(s.alt || "(alt 없음)")}</p>
          <p class="drag-card-sub ${s.href ? "accent" : ""}">${
            s.href ? "→ " + adminUtil.escapeHtml(s.href) : "클릭 불가"
          }</p>
        </div>
      `;
      card.querySelector('[data-act="del"]').addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`슬라이드 ${i + 1}을(를) 삭제할까요?`)) return;
        slides.splice(i, 1);
        setDirty(true);
        render();
      });
      card
        .querySelector('[data-act="replace"]')
        .addEventListener("click", (e) => {
          e.stopPropagation();
          triggerFilePick(i);
        });
      listEl.appendChild(card);
    });
  }

  countEl.textContent = slides.length;
  document.getElementById("btnAdd").disabled = slides.length >= MAX_SLIDES;
}

// 이미지 교체 파일 선택
function triggerFilePick(index) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.onchange = async () => {
    if (!inp.files?.[0]) return;
    await handleImageReplace(index, inp.files[0]);
  };
  inp.click();
}

async function handleImageReplace(index, file) {
  try {
    adminUtil.toast("이미지 업로드 중...");
    const fd = new FormData();
    fd.append("file", file);
    const res = await adminUtil.apiUpload("/api/hero/upload", fd);
    slides[index].image = res.url;
    setDirty(true);
    render();
    adminUtil.toast("이미지 교체 완료");
  } catch (e) {
    adminUtil.toast("업로드 실패: " + e.message, "error");
  }
}

// DnD 바인딩 (카드 순서 교체 + 파일 drop으로 이미지 교체)
adminUtil.initDragSort({
  container: listEl,
  onReorder: (src, dest) => {
    const moved = slides.splice(src, 1)[0];
    slides.splice(dest, 0, moved);
    setDirty(true);
    render();
  },
  onFileDrop: (idx, file) => handleImageReplace(idx, file),
});

// ========== 추가 폼 ==========
function showAddForm(show) {
  addFormEl.classList.toggle("hidden", !show);
  if (!show) resetAddForm();
}
function resetAddForm() {
  urlInput.value = "";
  hrefInput.value = "";
  altInput.value = "";
  if (uploadInput) uploadInput.value = "";
  previewWrap.classList.add("hidden");
  previewEl.style.backgroundImage = "none";
  previewEl.dataset.pendingUrl = "";
}
function setPreview(url) {
  if (!url) {
    previewWrap.classList.add("hidden");
    return;
  }
  previewEl.style.backgroundImage = `url('${url}')`;
  previewEl.dataset.pendingUrl = url;
  previewWrap.classList.remove("hidden");
}

urlInput.addEventListener("input", () => {
  const u = urlInput.value.trim();
  if (/^https?:\/\//.test(u)) setPreview(u);
});

uploadInput?.addEventListener("change", async () => {
  const file = uploadInput.files?.[0];
  if (!file) return;
  try {
    adminUtil.toast("업로드 중...");
    const fd = new FormData();
    fd.append("file", file);
    const res = await adminUtil.apiUpload("/api/hero/upload", fd);
    urlInput.value = res.url;
    setPreview(res.url);
    adminUtil.toast("업로드 완료");
  } catch (e) {
    adminUtil.toast("업로드 실패: " + e.message, "error");
  }
});

document.getElementById("btnAdd").addEventListener("click", () => {
  if (slides.length >= MAX_SLIDES) return;
  showAddForm(true);
});
document
  .getElementById("btnCancelAdd")
  .addEventListener("click", () => showAddForm(false));

document.getElementById("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const image = (previewEl.dataset.pendingUrl || urlInput.value).trim();
  if (!image) {
    adminUtil.toast("이미지를 지정해주세요", "error");
    return;
  }
  slides.push({
    image,
    href: hrefInput.value.trim(),
    alt: altInput.value.trim(),
  });
  setDirty(true);
  showAddForm(false);
  render();
});

document.getElementById("btnRevert").addEventListener("click", () => {
  if (!dirty) return;
  if (!confirm("변경사항을 버리고 저장된 상태로 되돌릴까요?")) return;
  slides = JSON.parse(JSON.stringify(original));
  setDirty(false);
  render();
});

document.getElementById("btnSave").addEventListener("click", async () => {
  const btn = document.getElementById("btnSave");
  btn.disabled = true;
  try {
    await adminUtil.api("/api/hero/slides", {
      method: "PUT",
      json: { slides, config: { maxSlides: 10, autoPlayMs: 6000 } },
    });
    original = JSON.parse(JSON.stringify(slides));
    setDirty(false);
    adminUtil.toast("저장 완료");
  } catch (e) {
    adminUtil.toast("저장 실패: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// 초기 로드
(async () => {
  try {
    const d = await adminUtil.api("/api/hero/slides");
    slides = (d.slides || []).map((s) => ({
      image: s.image,
      href: s.href || "",
      alt: s.alt || "",
    }));
    original = JSON.parse(JSON.stringify(slides));
    render();
  } catch (e) {
    adminUtil.toast("슬라이드 로드 실패: " + e.message, "error");
    render();
  }
})();
