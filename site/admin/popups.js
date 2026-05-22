(function () {
  "use strict";
  const api = adminUtil.api;
  const toast = adminUtil.toast;
  const escapeHtml = adminUtil.escapeHtml;

  const listEl = document.getElementById("popupsList");
  const countEl = document.getElementById("popupCount");
  const modal = document.getElementById("popupModal");
  const modalTitle = document.getElementById("popupModalTitle");
  const form = document.getElementById("popupForm");
  const imagePreview = document.getElementById("popupImagePreview");
  const imageFileInput = document.getElementById("popupImageFile");
  const btnPickImage = document.getElementById("btnPickPopupImage");
  const positionGhost = document.getElementById("positionGhost");
  const positionLabel = document.getElementById("positionLabel");
  const displayModeSel = document.getElementById("displayMode");
  const btnSaveMode = document.getElementById("btnSaveMode");
  const btnNew = document.getElementById("btnNew");

  let editingId = null;
  let popups = [];

  // ========== 목록 ==========
  function renderList() {
    if (!popups.length) {
      listEl.innerHTML =
        '<p style="text-align:center;color:#999;padding:24px 0">등록된 팝업이 없습니다. 우측 상단 "+ 팝업 추가"로 만들어보세요.</p>';
      countEl.textContent = "0";
      return;
    }
    countEl.textContent = String(popups.length);
    listEl.innerHTML = popups
      .map((p) => {
        const dim = p.widthPx ? `${p.widthPx}px` : "원본";
        const badge = p.active
          ? '<span class="badge-on">활성</span>'
          : '<span class="badge-off">비활성</span>';
        const link = p.linkUrl ? `<br>🔗 ${escapeHtml(p.linkUrl)}` : "";
        return `
        <div class="popup-card" data-id="${p.id}">
          <div class="thumb" style="background-image:url('${escapeHtml(p.imageUrl)}')"></div>
          <div class="meta">
            <p class="name">${escapeHtml(p.title || "(이름 없음)")}${badge}</p>
            <div class="sub">
              📍 top:${p.topPx} left:${p.leftPx} · 📐 ${dim} · 순서 ${p.order}${link}
            </div>
          </div>
          <div class="actions">
            <label class="toggle-switch" title="활성 토글">
              <input type="checkbox" data-toggle ${p.active ? "checked" : ""}>
              <span class="slider"></span>
            </label>
            <button type="button" class="btn btn-ghost" data-edit>편집</button>
            <button type="button" class="btn btn-ghost" data-delete>삭제</button>
          </div>
        </div>`;
      })
      .join("");
  }

  listEl.addEventListener("click", async (e) => {
    const card = e.target.closest(".popup-card");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest("[data-edit]")) {
      openEdit(id);
    } else if (e.target.closest("[data-delete]")) {
      const p = popups.find((x) => x.id === id);
      if (!p) return;
      if (
        !confirm(
          `팝업 "${p.title || "(이름 없음)"}" 을(를) 삭제할까요? 이미지도 R2에서 함께 제거됩니다.`,
        )
      )
        return;
      try {
        await api(`/api/popups/${id}`, { method: "DELETE" });
        toast("팝업 삭제 완료");
        await loadList();
      } catch (err) {
        toast("삭제 실패: " + err.message);
      }
    }
  });

  listEl.addEventListener("change", async (e) => {
    const card = e.target.closest(".popup-card");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.matches("input[data-toggle]")) {
      const next = e.target.checked;
      try {
        await api(`/api/popups/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ Active: next }),
        });
        const p = popups.find((x) => x.id === id);
        if (p) p.active = next;
        renderList();
        toast(next ? "활성화" : "비활성화");
      } catch (err) {
        e.target.checked = !next;
        toast("변경 실패: " + err.message);
      }
    }
  });

  // ========== 모달 ==========
  function openModal(title) {
    modalTitle.textContent = title;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });

  function setImagePreview(url) {
    if (url) {
      imagePreview.classList.remove("empty");
      imagePreview.style.backgroundImage = `url('${url}')`;
    } else {
      imagePreview.classList.add("empty");
      imagePreview.style.backgroundImage = "";
    }
  }

  function updatePositionGhost() {
    const top = Number(form.elements.TopPx.value) || 0;
    const left = Number(form.elements.LeftPx.value) || 0;
    const w = Number(form.elements.WidthPx.value) || 200;
    const previewW = positionGhost.parentElement.clientWidth || 480;
    const scale = previewW / 1920;
    positionGhost.style.top = top * scale + "px";
    positionGhost.style.left = left * scale + "px";
    positionGhost.style.width = w * scale + "px";
    positionGhost.style.height = w * scale * 0.6 + "px"; // 가짜 비율
    positionLabel.textContent = `top:${top} left:${left} width:${w}`;
  }

  ["TopPx", "LeftPx", "WidthPx"].forEach((name) => {
    form.elements[name].addEventListener("input", updatePositionGhost);
  });

  btnPickImage.addEventListener("click", () => imageFileInput.click());
  imageFileInput.addEventListener("change", async () => {
    const file = imageFileInput.files?.[0];
    if (!file) return;
    btnPickImage.disabled = true;
    btnPickImage.textContent = "업로드 중…";
    try {
      const res = await adminUtil.uploadImage(file, {
        folder: "popups",
        maxWidth: 1600,
        quality: 0.85,
        onLocalPreview: (localUrl) => setImagePreview(localUrl),
      });
      form.elements.ImageUrl.value = res.url;
      setImagePreview(res.url);
      toast("이미지 업로드 완료");
    } catch (err) {
      toast("업로드 실패: " + err.message);
    } finally {
      btnPickImage.disabled = false;
      btnPickImage.textContent = "📤 이미지 업로드";
      imageFileInput.value = "";
    }
  });

  btnNew.addEventListener("click", () => {
    editingId = null;
    form.reset();
    form.elements.Order.value = popups.length;
    form.elements.TopPx.value = 100;
    form.elements.LeftPx.value = 100;
    form.elements.ImageUrl.value = "";
    setImagePreview("");
    updatePositionGhost();
    openModal("새 팝업");
  });

  function openEdit(id) {
    const p = popups.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    form.reset();
    form.elements.Title.value = p.title || "";
    form.elements.ImageUrl.value = p.imageUrl || "";
    form.elements.Alt.value = p.alt || "";
    form.elements.LinkUrl.value = p.linkUrl || "";
    form.elements.WidthPx.value = p.widthPx ?? "";
    form.elements.TopPx.value = p.topPx ?? 0;
    form.elements.LeftPx.value = p.leftPx ?? 0;
    form.elements.Order.value = p.order ?? 0;
    form.elements.Active.checked = !!p.active;
    setImagePreview(p.imageUrl);
    updatePositionGhost();
    openModal(`편집 · ${p.title || "(이름 없음)"}`);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.elements.ImageUrl.value) {
      toast("이미지를 업로드해주세요");
      return;
    }
    const payload = {
      Title: form.elements.Title.value || "",
      ImageUrl: form.elements.ImageUrl.value,
      Alt: form.elements.Alt.value || "",
      LinkUrl: form.elements.LinkUrl.value || "",
      WidthPx: form.elements.WidthPx.value
        ? Number(form.elements.WidthPx.value)
        : null,
      TopPx: Number(form.elements.TopPx.value) || 0,
      LeftPx: Number(form.elements.LeftPx.value) || 0,
      Order: Number(form.elements.Order.value) || 0,
      Active: form.elements.Active.checked,
    };
    try {
      if (editingId) {
        await api(`/api/popups/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast("팝업 수정 완료");
      } else {
        await api(`/api/popups`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast("팝업 등록 완료");
      }
      closeModal();
      await loadList();
    } catch (err) {
      toast("저장 실패: " + err.message);
    }
  });

  // ========== 표시 방식 (글로벌) ==========
  btnSaveMode.addEventListener("click", async () => {
    const mode = displayModeSel.value;
    btnSaveMode.disabled = true;
    try {
      await api(`/api/popups/config`, {
        method: "PUT",
        body: JSON.stringify({ displayMode: mode }),
      });
      toast("표시 방식 저장됨");
    } catch (err) {
      toast("저장 실패: " + err.message);
    } finally {
      btnSaveMode.disabled = false;
    }
  });

  // ========== 로딩 ==========
  async function loadList() {
    try {
      const r = await api(`/api/popups/all`);
      popups = Array.isArray(r.popups) ? r.popups : [];
      displayModeSel.value = r.displayMode || "sequential";
      renderList();
    } catch (err) {
      listEl.innerHTML = `<p style="color:#c00;text-align:center">로딩 실패: ${escapeHtml(err.message)}</p>`;
    }
  }

  adminUtil.ensureAuth().then(loadList);
})();
