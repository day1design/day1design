// ========== WIZARD FORM ==========
const TOTAL_STEPS = 4;
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
  const err = document.getElementById("wizardStepError");
  if (err) err.style.display = "none";
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

// ========== STEP VALIDATION ==========
// 단계별 필수 입력 가드 — 빈 채로 다음/제출 못 하게 막고
// 어떤 항목이 비었는지 화면에서 안내(is-invalid + 스크롤 + 메시지).
const STEP_RULES = {
  1: [
    { kind: "input", name: "name", label: "이름" },
    { kind: "phone", label: "연락처" },
    { kind: "email", label: "이메일" },
    { kind: "checkbox", name: "privacy", label: "개인정보 수집 동의" },
  ],
  2: [
    { kind: "card", name: "space_type", label: "공간유형" },
    { kind: "card", name: "space_size", label: "공간면적" },
    { kind: "input", name: "address", label: "현장주소" },
  ],
  3: [{ kind: "input", name: "schedule", label: "공사희망일정" }],
  4: [
    { kind: "card", name: "referral", label: "문의경로" },
    { kind: "card", name: "branch", label: "방문 상담 지점" },
    { kind: "input", name: "budget", label: "가용 예산" },
  ],
};

function getFormGroupForRule(rule) {
  if (rule.kind === "card") {
    const cards = form.querySelector(`.option-cards[data-name="${rule.name}"]`);
    return {
      group: cards ? cards.closest(".form-group") : null,
      target: cards,
      focusEl: cards ? cards.querySelector(".option-card") : null,
    };
  }
  if (rule.kind === "phone") {
    const el = form.querySelector('[name="phone1"]');
    return {
      group: el ? el.closest(".form-group") : null,
      target: el,
      focusEl: el,
    };
  }
  if (rule.kind === "email") {
    const el = form.querySelector('[name="email_id"]');
    return {
      group: el ? el.closest(".form-group") : null,
      target: el,
      focusEl: el,
    };
  }
  const el = form.querySelector(`[name="${rule.name}"]`);
  return {
    group: el ? el.closest(".form-group") : null,
    target: el,
    focusEl: el,
  };
}

function isRuleSatisfied(rule) {
  if (rule.kind === "card") return !!selections[rule.name];
  if (rule.kind === "phone") {
    const p1 = (form.querySelector('[name="phone1"]')?.value || "").trim();
    const p2 = (form.querySelector('[name="phone2"]')?.value || "").trim();
    const p3 = (form.querySelector('[name="phone3"]')?.value || "").trim();
    return !!(p1 && p2 && p3);
  }
  if (rule.kind === "email") {
    const id = (form.querySelector('[name="email_id"]')?.value || "").trim();
    const domain = (
      form.querySelector('[name="email_domain"]')?.value || ""
    ).trim();
    return !!(id && domain);
  }
  if (rule.kind === "checkbox") {
    const el = form.querySelector(`[name="${rule.name}"]`);
    return !!(el && el.checked);
  }
  const el = form.querySelector(`[name="${rule.name}"]`);
  return !!(el && el.value.trim());
}

function clearInvalidMarks(stepNum) {
  const stepEl = form.querySelector(`.wizard-step[data-step="${stepNum}"]`);
  if (!stepEl) return;
  stepEl
    .querySelectorAll(".form-group.is-invalid")
    .forEach((el) => el.classList.remove("is-invalid"));
  stepEl
    .querySelectorAll(".option-cards.is-invalid")
    .forEach((el) => el.classList.remove("is-invalid"));
}

function showStepError(stepNum, missing) {
  let msgEl = document.getElementById("wizardStepError");
  if (!msgEl) {
    msgEl = document.createElement("div");
    msgEl.id = "wizardStepError";
    msgEl.style.cssText =
      "color:#c5371a;font-size:13px;margin:10px 0 0;text-align:center;line-height:1.5;";
    const nav = document.querySelector(".wizard-nav");
    if (nav && nav.parentNode) nav.parentNode.insertBefore(msgEl, nav);
  }
  const labels = missing.map((r) => r.label).join(", ");
  msgEl.textContent = `필수 항목을 입력해주세요: ${labels}`;
  msgEl.style.display = "block";
}

function hideStepError() {
  const msgEl = document.getElementById("wizardStepError");
  if (msgEl) msgEl.style.display = "none";
}

function validateAndMarkStep(stepNum) {
  clearInvalidMarks(stepNum);
  const rules = STEP_RULES[stepNum] || [];
  const missing = rules.filter((r) => !isRuleSatisfied(r));
  if (!missing.length) {
    hideStepError();
    return true;
  }
  let firstTarget = null;
  let firstFocus = null;
  missing.forEach((rule) => {
    const { group, target, focusEl } = getFormGroupForRule(rule);
    if (group) group.classList.add("is-invalid");
    if (target && target.classList.contains("option-cards")) {
      target.classList.add("is-invalid");
    }
    if (!firstTarget && (group || target)) {
      firstTarget = group || target;
      firstFocus = focusEl;
    }
  });
  showStepError(stepNum, missing);
  if (firstTarget) {
    requestAnimationFrame(() => {
      firstTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      if (firstFocus && typeof firstFocus.focus === "function") {
        try {
          firstFocus.focus({ preventScroll: true });
        } catch {
          firstFocus.focus();
        }
      }
    });
  }
  return false;
}

// 사용자가 빠진 필드를 채우면 is-invalid 자동 해제
form.addEventListener("input", (e) => {
  const grp = e.target.closest(".form-group");
  if (grp) grp.classList.remove("is-invalid");
  hideStepError();
});
form.addEventListener("change", (e) => {
  const grp = e.target.closest(".form-group");
  if (grp) grp.classList.remove("is-invalid");
  hideStepError();
});
// option-card 클릭은 selections 갱신 직후 호출되도록 capture phase로
document.querySelectorAll(".option-cards").forEach((group) => {
  group.addEventListener("click", () => {
    group.classList.remove("is-invalid");
    const grp = group.closest(".form-group");
    if (grp) grp.classList.remove("is-invalid");
    hideStepError();
  });
});

// Navigation
btnNext.addEventListener("click", () => {
  if (!validateAndMarkStep(currentStep)) return;
  if (currentStep < TOTAL_STEPS) {
    goToStep(currentStep + 1);
  } else {
    // 1) DOM 값 캡처 (UI 전환 전에)
    const payload = buildSubmitPayload();
    // 2) 즉시 완료 화면 전환 (사용자는 대기 없음)
    document.querySelector(".wizard-progress").style.display = "none";
    document.querySelector(".wizard-nav").style.display = "none";
    steps.forEach((s) => s.classList.remove("active"));
    complete.style.display = "block";
    const summary = document.getElementById("wizardSummary");
    if (summary) summary.style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
    // 3) 백그라운드 전송 (이탈해도 keepalive로 완주)
    submitInBackground(payload);
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

// ========== SUBMIT: fire-and-forget (Worker + R2 + Airtable) ==========
// window.DAY1_API_BASE(site/js/config.js)가 있으면 자동으로 Worker URL 사용
const ESTIMATES_ENDPOINT =
  typeof window !== "undefined" && window.DAY1_API_BASE
    ? `${window.DAY1_API_BASE.replace(/\/$/, "")}/api/estimates`
    : null;
const PENDING_KEY = "day1_pending_estimates";

// 마케팅 슬러그 추적: /r/<slug> 경유 시 Worker가 d1d_src 쿠키(30일)에
// {label, slug, utm:{source,medium,campaign}, ts}를 저장한다. 폼 송신 시
// 이 정보를 utm_*/campaign/referral 필드로 첨부해 attribution을 보존.
function readMarketingAttribution() {
  const result = {
    label: "",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
  };
  try {
    const raw = document.cookie
      .split(/;\s*/)
      .find((p) => p.startsWith("d1d_src="));
    if (raw) {
      const decoded = decodeURIComponent(raw.slice("d1d_src=".length));
      const obj = JSON.parse(decoded);
      result.label = String(obj.label || "");
      result.utm_source = String(obj.utm?.source || "");
      result.utm_medium = String(obj.utm?.medium || "");
      result.utm_campaign = String(obj.utm?.campaign || "");
    }
  } catch {}
  try {
    const qs = new URLSearchParams(location.search);
    // URL 쿼리가 있으면 쿠키보다 우선 (가장 최근 클릭 우선)
    if (qs.get("utm_source")) result.utm_source = qs.get("utm_source");
    if (qs.get("utm_medium")) result.utm_medium = qs.get("utm_medium");
    if (qs.get("utm_campaign")) result.utm_campaign = qs.get("utm_campaign");
    if (qs.get("src")) result.label = qs.get("src");
  } catch {}
  return result;
}

function buildSubmitPayload() {
  const f = form;
  const val = (name) => {
    const el = f.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : "";
  };

  const phone = [val("phone1"), val("phone2"), val("phone3")]
    .filter(Boolean)
    .join("-");
  const emailId = val("email_id");
  const emailDomain = val("email_domain");
  const email = emailId && emailDomain ? `${emailId}@${emailDomain}` : "";

  // 자체 트래커 SessionId — Worker가 이걸로 D1 HeatmapEvents 조회해서
  // first-touch 출처(첫 진입 referrer/utm)를 자동 추정
  let sessionId = "";
  try {
    const raw = localStorage.getItem("_d1_hm_sid");
    if (raw) {
      const parsed = JSON.parse(raw);
      sessionId = String(parsed?.id || "");
    }
  } catch {}

  const attribution = readMarketingAttribution();
  // 슬러그 라벨이 있으면 Referral을 덮어쓴다.
  // 이유: 광고 클릭으로 들어온 사용자는 폼의 referral 옵션을 안 누르거나
  // 누르더라도 캠페인명("네이버 블로그 5월")이 채널명("네이버")보다 더 구체적이라
  // 관리자 대시보드의 슬러그별 전환수 집계(Referral === sourceLabel)가 작동하려면
  // 캠페인 라벨이 우선 들어가야 함.
  const referralValue = attribution.label || selections.referral || "";

  const fields = {
    submittedAt: new Date().toISOString(),
    name: val("name"),
    phone,
    email,
    space_type: selections.space_type || "",
    space_size: selections.space_size || "",
    postcode: val("postcode"),
    address: val("address"),
    address_detail: val("address_detail"),
    schedule: val("schedule"),
    referral: referralValue,
    branch: selections.branch || "",
    budget: val("budget"),
    detail: val("detail"),
    privacy_agreed: !!f.querySelector('input[name="privacy"]').checked,
    concept_files_count: compressedFiles.concept_files.length,
    floor_plans_count: compressedFiles.floor_plans.length,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    campaign: attribution.label,
    session_id: sessionId,
  };

  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
  compressedFiles.concept_files.forEach((item) =>
    fd.append("concept_files", item.blob, item.name),
  );
  compressedFiles.floor_plans.forEach((item) =>
    fd.append("floor_plans", item.blob, item.name),
  );

  return { fields, formData: fd };
}

async function submitInBackground(payload) {
  if (!ESTIMATES_ENDPOINT) {
    // 엔드포인트 미연결: 로컬에 누적 → 연결 후 retryPending()이 자동 발송
    queuePending(payload.fields);
    return;
  }
  try {
    const res = await fetch(ESTIMATES_ENDPOINT, {
      method: "POST",
      body: payload.formData,
      keepalive: true,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    queuePending(payload.fields);
  }
}

function queuePending(fields) {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    pending.push(fields);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch (e) {}
}

async function retryPending() {
  if (!ESTIMATES_ENDPOINT) return;
  let pending = [];
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch (e) {
    return;
  }
  if (!pending.length) return;
  // budget 누락 등 옛 스키마 pending은 항상 400을 받아 무한 재시도되므로 폐기.
  // worker validation 필수 필드가 빠진 것은 자동 폐기.
  const before = pending.length;
  pending = pending.filter(
    (f) =>
      f &&
      f.name &&
      f.phone &&
      f.email &&
      f.budget &&
      f.space_type &&
      f.space_size &&
      f.address &&
      f.schedule &&
      f.referral &&
      f.branch,
  );
  if (pending.length !== before) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (e) {}
  }
  if (!pending.length) return;
  const remaining = [];
  for (const fields of pending) {
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
      const res = await fetch(ESTIMATES_ENDPOINT, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) remaining.push(fields);
    } catch (e) {
      remaining.push(fields);
    }
  }
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
  } catch (e) {}
}
retryPending();
