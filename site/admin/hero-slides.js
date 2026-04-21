// ========== 히어로 슬라이드 관리 ==========
const MAX_SLIDES = 10;
let slides = []; // 현재 편집 중
let original = []; // 저장된 스냅샷 (revert용)
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
  listEl.innerHTML = "";
  if (!slides.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "등록된 슬라이드가 없습니다. 아래 버튼으로 추가하세요.";
    listEl.appendChild(empty);
  } else {
    slides.forEach((s, i) => {
      const item = document.createElement("div");
      item.className = "slide-item";
      item.innerHTML = `
        <div class="slide-index">${i + 1}</div>
        <div class="slide-thumb" style="background-image:url('${s.image}')"></div>
        <div class="slide-meta">
          <div class="slide-alt">${escapeHtml(s.alt || "(alt 없음)")}</div>
          <div class="slide-url" title="${escapeHtml(s.image)}">${escapeHtml(s.image)}</div>
          <div class="slide-href ${s.href ? "has-link" : ""}">
            ${s.href ? "→ " + escapeHtml(s.href) : "클릭 불가"}
          </div>
        </div>
        <div class="slide-actions">
          <button class="icon-btn" data-act="up" ${i === 0 ? "disabled" : ""} title="위로">↑</button>
          <button class="icon-btn" data-act="down" ${i === slides.length - 1 ? "disabled" : ""} title="아래로">↓</button>
          <button class="icon-btn danger" data-act="del" title="삭제">✕</button>
        </div>
      `;
      item.querySelectorAll("[data-act]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = btn.dataset.act;
          if (act === "up" && i > 0) {
            [slides[i - 1], slides[i]] = [slides[i], slides[i - 1]];
          } else if (act === "down" && i < slides.length - 1) {
            [slides[i + 1], slides[i]] = [slides[i], slides[i + 1]];
          } else if (act === "del") {
            if (!confirm(`슬라이드 ${i + 1}을(를) 삭제할까요?`)) return;
            slides.splice(i, 1);
          } else return;
          setDirty(true);
          render();
        });
      });
      listEl.appendChild(item);
    });
  }
  countEl.textContent = slides.length;
  document.getElementById("btnAdd").disabled = slides.length >= MAX_SLIDES;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

// URL 입력 시 미리보기
urlInput.addEventListener("input", () => {
  const u = urlInput.value.trim();
  if (/^https?:\/\//.test(u)) setPreview(u);
});

// 파일 선택 → 업로드 → URL 획득
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
  await adminUtil.ensureAuth();
  adminUtil.pingApi();
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
