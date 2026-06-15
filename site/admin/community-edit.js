// ========== 커뮤니티 위지윅(WYSIWYG) 에디터 ==========
const params = new URLSearchParams(location.search);
const IS_NEW = params.has("new");
const IDX_PARAM = params.get("idx") || "";

const metaForm = document.getElementById("metaForm");
let thumbUrl = "";

function generateIdx() {
  return (
    String(Date.now()).slice(-9) + Math.floor(Math.random() * 10).toString()
  );
}

// ---------- Quill 초기화 ----------
// 크기는 inline style 로 출력(공개페이지에서 CSS 없이도 적용),
// 폰트는 class 로 출력(공개페이지 .ql-font-* 정의와 매칭).
const SizeStyle = Quill.import("attributors/style/size");
SizeStyle.whitelist = ["13px", "15px", "18px", "24px", "32px"];
Quill.register(SizeStyle, true);
const FontClass = Quill.import("attributors/class/font");
FontClass.whitelist = ["malgun", "notosans", "nanum"];
Quill.register(FontClass, true);

const quill = new Quill("#editor", {
  theme: "snow",
  placeholder: "내용을 입력하세요…",
  modules: { toolbar: "#toolbar" },
});

// 이미지 버튼 → R2 업로드(webp 자동 압축) 후 본문에 삽입
quill.getModule("toolbar").addHandler("image", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const range = quill.getSelection(true);
    try {
      adminUtil.toast("이미지 업로드 중...");
      const res = await adminUtil.uploadImage(file, {
        folder: "community/posts",
      });
      quill.insertEmbed(range.index, "image", res.url, "user");
      quill.setSelection(range.index + 1, 0, "user");
      adminUtil.toast("업로드 완료");
    } catch (err) {
      adminUtil.toast("업로드 실패: " + (err.message || err), "error");
    }
  };
  input.click();
});

// 동영상 버튼 → 유튜브/비메오 watch URL 을 embed URL 로 변환
function toEmbedUrl(raw) {
  const url = (raw || "").trim();
  if (!url) return "";
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = url.match(/youtube\.com\/embed\/([\w-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return url; // 이미 embed 형식이거나 기타 — 그대로
}
quill.getModule("toolbar").addHandler("video", () => {
  const raw = prompt("유튜브 또는 비메오 영상 주소를 입력하세요");
  if (!raw) return;
  const embed = toEmbedUrl(raw);
  const range = quill.getSelection(true);
  quill.insertEmbed(range.index, "video", embed, "user");
  quill.setSelection(range.index + 1, 0, "user");
});

// ---------- 썸네일 ----------
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

// ---------- 카테고리 (드롭다운 + 직접입력) ----------
const categorySelect = document.getElementById("categorySelect");
const categoryCustom = document.getElementById("categoryCustom");
const PRESET_CATEGORIES = ["디자인제안", "포트폴리오", "상업공간"];

function setCategoryUI(value) {
  const v = (value || "").trim();
  if (v && !PRESET_CATEGORIES.includes(v)) {
    categorySelect.value = "__custom";
    categoryCustom.classList.remove("hidden");
    categoryCustom.value = v;
  } else {
    categorySelect.value = v || "디자인제안";
    categoryCustom.classList.add("hidden");
    categoryCustom.value = v || "디자인제안";
  }
}
// metaForm.elements.category 는 categoryCustom(name=category) 가 단일 소스.
categorySelect.addEventListener("change", () => {
  if (categorySelect.value === "__custom") {
    categoryCustom.classList.remove("hidden");
    categoryCustom.value = "";
    categoryCustom.focus();
  } else {
    categoryCustom.classList.add("hidden");
    categoryCustom.value = categorySelect.value;
  }
});

// ---------- 본문 → 파생 데이터 ----------
function getBodyHtml() {
  const html = quill.root.innerHTML.trim();
  // Quill 빈 상태는 "<p><br></p>" → 빈 문자열 처리
  if (!html || html === "<p><br></p>" || quill.getText().trim() === "")
    return "";
  return html;
}

function extractImagesFromHtml(html) {
  if (!html) return [];
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return Array.from(tmp.querySelectorAll("img"))
    .map((img) => img.getAttribute("src"))
    .filter(Boolean);
}

// ---------- 취소 / 저장 ----------
document.getElementById("btnCancel").addEventListener("click", () => {
  if (confirm("변경사항을 버리고 목록으로 돌아갈까요?"))
    location.href = "community";
});

document.getElementById("btnSave").addEventListener("click", async () => {
  const btn = document.getElementById("btnSave");
  const f = metaForm.elements;
  const title = f.title.value.trim();
  if (!title) {
    adminUtil.toast("제목은 필수입니다", "error");
    return;
  }
  btn.disabled = true;

  const idx = f.idx.value.trim() || generateIdx();
  const bodyHtml = getBodyHtml();
  const bodyText = quill
    .getText()
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const images = extractImagesFromHtml(bodyHtml);

  // 썸네일 미지정 시 본문 첫 이미지 자동 사용
  const finalThumb = thumbUrl || images[0] || "";
  const excerpt =
    (f.excerpt.value || "").trim() ||
    bodyText.replace(/\s+/g, " ").trim().slice(0, 80);

  const payload = {
    idx,
    title,
    category: (f.category.value || "").trim(),
    date: f.date.value,
    board: f.board.value,
    thumb: finalThumb,
    views: 0,
    excerpt,
    body_text: bodyText,
    body_html: bodyHtml,
    images,
    content_blocks: [], // 위지윅 글은 HTML 단일 소스 (공개페이지 HTML 경로 사용)
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

// ---------- 기존 블록(content_blocks) → HTML 변환 (편집 시 마이그) ----------
function blocksToHtml(blocks) {
  let html = "";
  (blocks || []).forEach((b) => {
    if (!b) return;
    if (b.type === "text") {
      const content = (b.content || "").trim();
      if (!content) return;
      content.split(/\n{2,}/).forEach((para) => {
        const safe = adminUtil.escapeHtml(para.trim()).replace(/\n/g, "<br>");
        if (safe) html += `<p>${safe}</p>`;
      });
    } else if (b.type === "image" || b.type === "gallery") {
      const imgs =
        Array.isArray(b.images) && b.images.length
          ? b.images
          : b.src
            ? [b.src]
            : [];
      imgs.forEach((url) => {
        if (url) html += `<p><img src="${url}"></p>`;
      });
    }
  });
  return html;
}

function textToHtml(text) {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((p) => adminUtil.escapeHtml(p.trim()).replace(/\n/g, "<br>"))
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function loadBodyIntoEditor(post) {
  let html = "";
  if (post.body_html && post.body_html.trim()) {
    html = post.body_html;
  } else if (Array.isArray(post.content_blocks) && post.content_blocks.length) {
    html = blocksToHtml(post.content_blocks);
  } else if (post.body_text) {
    html = textToHtml(post.body_text);
  }
  if (html) {
    quill.clipboard.dangerouslyPasteHTML(html);
  }
}

// ---------- 초기 로드 ----------
(async () => {
  if (IS_NEW) {
    metaForm.elements.idx.value = generateIdx();
    metaForm.elements.board.value = "Residential";
    metaForm.elements.date.value = new Date().toISOString().slice(0, 10);
    setCategoryUI("디자인제안");
    renderThumbPreview("");
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
    metaForm.elements.date.value = (p.date || "").slice(0, 10);
    metaForm.elements.board.value = p.board || "Residential";
    metaForm.elements.excerpt.value = p.excerpt || "";
    setCategoryUI(p.category || "");
    thumbUrl = p.thumb || "";
    renderThumbPreview(thumbUrl);
    loadBodyIntoEditor(p);
  } catch (e) {
    adminUtil.toast("로드 실패: " + e.message, "error");
  }
})();
