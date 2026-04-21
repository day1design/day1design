// ========== WIZARD FORM ==========
const TOTAL_STEPS = 5;
let currentStep = 1;
const selections = {};

const steps = document.querySelectorAll(".wizard-step");
const dots = document.querySelectorAll(".step-dot");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const form = document.getElementById("wizardForm");
const complete = document.getElementById("wizardComplete");

function goToStep(n) {
  currentStep = n;
  steps.forEach((s) =>
    s.classList.toggle("active", parseInt(s.dataset.step) === n),
  );
  dots.forEach((d) => {
    const step = parseInt(d.dataset.step);
    d.classList.toggle("active", step === n);
    d.classList.toggle("done", step < n);
  });
  btnPrev.classList.toggle("hidden", n === 1);
  if (n === TOTAL_STEPS) {
    btnNext.textContent = "견적문의";
    btnNext.className = "btn-submit";
  } else {
    btnNext.textContent = "다음";
    btnNext.className = "btn-next";
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Option cards click
document.querySelectorAll(".option-cards").forEach((group) => {
  const name = group.dataset.name;
  group.querySelectorAll(".option-card").forEach((card) => {
    card.addEventListener("click", () => {
      group
        .querySelectorAll(".option-card")
        .forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      selections[name] = card.dataset.value;
      updateSummary();
    });
  });
});

// File inputs - WebP compression + multi-file preview
const compressedFiles = { concept_files: [], floor_plans: [] };

function compressToWebP(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve) => {
    // 이미지가 아닌 파일(PDF, 압축, 도면 등)은 변환 없이 통과
    if (!file.type.startsWith("image/")) {
      resolve({ blob: file, name: file.name, size: file.size });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width,
          h = img.height;
        if (w > maxWidth) {
          h = (maxWidth / w) * h;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
            resolve({
              blob,
              name,
              size: blob.size,
              url: URL.createObjectURL(blob),
            });
          },
          "image/webp",
          quality,
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + "KB";
  return (bytes / 1048576).toFixed(1) + "MB";
}

function renderPreview(previewId, fieldName) {
  const container = document.getElementById(previewId);
  container.innerHTML = "";
  compressedFiles[fieldName].forEach((f, i) => {
    const item = document.createElement("div");
    item.className = "file-preview-item";
    if (f.url) {
      item.innerHTML = `<img src="${f.url}" alt="${f.name}">`;
    }
    item.innerHTML += `<button type="button" class="file-remove" data-idx="${i}">✕</button>`;
    item.innerHTML += `<span class="file-size">${formatSize(f.size)}</span>`;
    item.querySelector(".file-remove").addEventListener("click", (e) => {
      e.preventDefault();
      compressedFiles[fieldName].splice(i, 1);
      renderPreview(previewId, fieldName);
      updateSummary();
    });
    container.appendChild(item);
  });
}

// 차단 확장자 (실행파일/바이러스 위험)
const BLOCKED_EXTS = [
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "pif",
  "vbs",
  "js",
  "wsf",
  "ps1",
  "sh",
  "app",
  "dll",
  "sys",
  "reg",
];
// 영상 확장자
const VIDEO_EXTS = ["mp4", "avi", "mov", "wmv", "mkv", "flv", "webm", "m4v"];

function getFileExt(name) {
  return (name.split(".").pop() || "").toLowerCase();
}

function validateFile(file, fieldName) {
  const ext = getFileExt(file.name);

  // 실행파일 차단
  if (BLOCKED_EXTS.includes(ext)) {
    alert(
      `"${file.name}"\n\n보안상 실행 파일(.${ext})은 업로드할 수 없습니다.`,
    );
    return false;
  }

  // 영상파일 차단
  if (VIDEO_EXTS.includes(ext) || file.type.startsWith("video/")) {
    alert(
      `"${file.name}"\n\n영상 파일은 업로드할 수 없습니다.\n이미지 파일을 선택해주세요.`,
    );
    return false;
  }

  // 10MB 초과 차단
  if (file.size > 10 * 1024 * 1024) {
    alert(
      `"${file.name}"\n\n10MB를 초과하는 파일은 업로드할 수 없습니다.\n대용량 파일은 day1design.co@gmail.com 으로 보내주세요.`,
    );
    return false;
  }

  // 컨셉 첨부: 이미지만 허용
  if (fieldName === "concept_files" && !file.type.startsWith("image/")) {
    alert(
      `"${file.name}"\n\n인테리어 컨셉에는 이미지 파일만 첨부할 수 있습니다.`,
    );
    return false;
  }

  return true;
}

document.querySelectorAll('.file-drop input[type="file"]').forEach((input) => {
  input.addEventListener("change", async () => {
    const fieldName = input.name;
    const previewId = input
      .closest(".form-group")
      .querySelector(".file-preview").id;
    for (const file of input.files) {
      if (!validateFile(file, fieldName)) continue;
      const compressed = await compressToWebP(file);
      compressedFiles[fieldName].push(compressed);
    }
    renderPreview(previewId, fieldName);
    input.value = "";
    updateSummary();
  });
});

// Navigation
btnNext.addEventListener("click", () => {
  if (currentStep < TOTAL_STEPS) {
    goToStep(currentStep + 1);
  } else {
    // Submit
    const privacyCheck = form.querySelector('input[name="privacy"]');
    if (!privacyCheck.checked) {
      privacyCheck.focus();
      return;
    }
    // Hide form, show completion
    document.querySelector(".wizard-progress").style.display = "none";
    document.querySelector(".wizard-nav").style.display = "none";
    steps.forEach((s) => s.classList.remove("active"));
    complete.style.display = "block";
    const summary = document.getElementById("wizardSummary");
    if (summary) summary.style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

btnPrev.addEventListener("click", () => {
  if (currentStep > 1) goToStep(currentStep - 1);
});

// ========== REAL-TIME SUMMARY ==========
function updateSummary() {
  const f = form;
  const val = (name) => {
    const el = f.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : "";
  };
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (text) {
      el.textContent = text;
      el.classList.remove("empty");
    } else {
      el.textContent = "-";
      el.classList.add("empty");
    }
  };

  // 기본정보
  set("sumName", val("name"));
  const p1 = val("phone1"),
    p2 = val("phone2"),
    p3 = val("phone3");
  set("sumPhone", p1 || p2 || p3 ? `${p1}-${p2}-${p3}` : "");
  const emailId = val("email_id");
  const emailDomain = val("email_domain");
  set("sumEmail", emailId && emailDomain ? `${emailId}@${emailDomain}` : "");

  // 공간정보
  set("sumSpaceType", selections.space_type || "");
  set("sumSpaceSize", selections.space_size || "");
  const addr = val("address");
  const addrDetail = val("address_detail");
  set("sumAddress", addr ? (addrDetail ? `${addr} ${addrDetail}` : addr) : "");

  // 일정/컨셉
  set("sumSchedule", val("schedule"));
  const cfCount = compressedFiles.concept_files.length;
  set("sumConceptFile", cfCount > 0 ? `${cfCount}장 (WebP)` : "");
  const fpCount = compressedFiles.floor_plans.length;
  set("sumFloorPlan", fpCount > 0 ? `${fpCount}장 (WebP)` : "");

  // 추가정보
  set("sumReferral", selections.referral || "");
  set("sumBranch", selections.branch || "");
  const detail = val("detail");
  set("sumDetail", detail.length > 30 ? detail.substring(0, 30) + "…" : detail);
}

// Daum Postcode (주소 검색)
const btnAddress = document.getElementById("btnAddress");
if (btnAddress) {
  btnAddress.addEventListener("click", () => {
    new daum.Postcode({
      oncomplete: (data) => {
        document.getElementById("postcode").value = data.zonecode;
        document.getElementById("addressInput").value =
          data.roadAddress || data.jibunAddress;
        document.getElementById("addressDetail").focus();
        updateSummary();
      },
    }).open();
  });
}

// Email domain select
const emailSelect = document.getElementById("emailSelect");
const emailDomainInput = document.getElementById("emailDomainInput");
if (emailSelect && emailDomainInput) {
  emailSelect.addEventListener("change", () => {
    if (emailSelect.value) {
      emailDomainInput.value = emailSelect.value;
      emailDomainInput.readOnly = true;
    } else {
      emailDomainInput.value = "";
      emailDomainInput.readOnly = false;
      emailDomainInput.focus();
    }
    updateSummary();
  });
}

// Listen to all text inputs for real-time updates
document
  .querySelectorAll(
    '#wizardForm input[type="text"], #wizardForm input[type="tel"], #wizardForm textarea, #wizardForm select',
  )
  .forEach((input) => {
    input.addEventListener("input", updateSummary);
    input.addEventListener("change", updateSummary);
  });
