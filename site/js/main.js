// ========== PORTFOLIO GRID ==========
const _prefix = typeof IMG_PREFIX !== "undefined" ? IMG_PREFIX : "";
let TOTAL_PROJECTS = 35;

const projectData = [
  { name: "판교 TH212 47py", folder: "판교-th212-47py", count: 22 },
  { name: "판교 TH212 46py", folder: "판교-th212-46py", count: 20 },
  {
    name: "판교 원마을 2단지 38py",
    folder: "판교-원마을-2단지-38py",
    count: 22,
  },
  {
    name: "판교 봇들마을 4단지 29py",
    folder: "판교-봇들마을-4단지-29py",
    count: 23,
    thumbAfter:
      "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/04_after.webp",
  },
  {
    name: "목동 우성2차 42py",
    folder: "목동-우성2차-42py",
    count: 46,
    thumbAfter:
      "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/05_after.webp",
  },
  {
    name: "마북동 블루밍구성센트럴 59py",
    folder: "마북동-블루밍구성센트럴-59py",
    count: 30,
  },
  {
    name: "판교 원마을12단지 43py",
    folder: "판교-원마을12단지-43py",
    count: 50,
  },
  {
    name: "분당 미켈란쉐르빌 58py",
    folder: "분당-미켈란쉐르빌-58py",
    count: 38,
  },
  { name: "도곡렉슬 43py", folder: "도곡렉슬-43py", count: 32 },
  {
    name: "서울숲 푸르지오 2차 44py",
    folder: "서울숲-푸르지오-2차-44py",
    count: 69,
  },
  {
    name: "성남 연꽃마을4단지 50py",
    folder: "성남-연꽃마을4단지-50py",
    count: 121,
  },
  {
    name: "용인 신봉마을 4단지 동일하이빌 58py",
    folder: "용인-신봉마을-4단지-동일하이빌-58py",
    count: 91,
  },
  {
    name: "판교 푸르지오그랑블 38py",
    folder: "판교-푸르지오그랑블-38py",
    count: 48,
  },
  {
    name: "동천마을 현대홈타운 37py",
    folder: "동천마을-현대홈타운-37py",
    count: 10,
  },
  {
    name: "신반포 2차 34py",
    folder: "신반포-2차-34py",
    count: 8,
    thumbAfter:
      "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/15_after.webp",
  },
  { name: "잠실리센츠 33py", folder: "잠실리센츠-33py", count: 16 },
  {
    name: "용인 대지마을 중앙하이츠빌 68py",
    folder: "용인-대지마을-중앙하이츠빌-68py",
    count: 34,
  },
  {
    name: "판교산운마을 14단지 44py",
    folder: "판교산운마을-14단지-44py",
    count: 14,
  },
  {
    name: "송도 웰카운티 3단지 45py",
    folder: "송도-웰카운티-3단지-45py",
    count: 34,
  },
  { name: "분당 아펠바움 112py", folder: "분당-아펠바움-112py", count: 14 },
  {
    name: "용산 효창베네스아파트 47py",
    folder: "용산-효창베네스아파트-47py",
    count: 22,
  },
  {
    name: "마포 카이저팰리스 49py",
    folder: "마포-카이저팰리스-49py",
    count: 62,
  },
  { name: "용인 성복자이1차 39py", folder: "용인-성복자이1차-39py", count: 12 },
  {
    name: "분당 백현마을 6단지 34py",
    folder: "분당-백현마을-6단지-34py",
    count: 15,
  },
  {
    name: "서울숲 푸르지오 41py",
    folder: "서울숲-푸르지오-41py",
    count: 34,
    thumbAfter:
      "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/25_after.webp",
  },
  { name: "부천 아이파크 34py", folder: "부천-아이파크-34py", count: 13 },
  {
    name: "송도 힐스테이트 더스카이 34py",
    folder: "송도-힐스테이트-더스카이-34py",
    count: 21,
  },
  {
    name: "청담 이편한세상 2차 41py",
    folder: "청담-이편한세상-2차-41py",
    count: 38,
  },
  { name: "송파 위례 24단지 25py", folder: "송파-위례-24단지-25py", count: 66 },
  {
    name: "성남 센트럴타운 33py",
    folder: "성남-센트럴타운-33py",
    count: 6,
    thumbAfter:
      "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/30_after.webp",
  },
  {
    name: "서울역 센트럴자이 34py",
    folder: "서울역-센트럴자이-34py",
    count: 17,
  },
  { name: "안양 박달벽산 40py", folder: "안양-박달벽산-40py", count: 14 },
  { name: "성남 센트럴타운 34py", folder: "성남-센트럴타운-34py", count: 14 },
  {
    name: "송도 더샵 퍼스트월드 56py",
    folder: "송도-더샵-퍼스트월드-56py",
    count: 52,
  },
  {
    name: "송도 더샵 퍼스트월드 65py",
    folder: "서울역-센트럴자이-34py",
    count: 17,
    rightFolder: "송도-더샵-퍼스트월드-56py",
    rightCount: 52,
    rightName: "송도 더샵 퍼스트월드 56py",
  },
];

const grid = document.getElementById("projectGrid");
const modal = document.getElementById("projectModal");
const modalTitle = document.getElementById("projectModalTitle");
const modalGrid = document.getElementById("projectModalGrid");
const modalClose = document.getElementById("projectModalClose");

const OFFICE_TOTAL = 50;

// --- Size helpers (평수 필터) ---
function getPy(folder) {
  const m = folder && folder.match(/(\d+)py/i);
  return m ? parseInt(m[1], 10) : 0;
}
function sizeMatch(py, size) {
  if (size === "all") return true;
  if (size === "20-30") return py >= 20 && py < 30;
  if (size === "30-40") return py >= 30 && py < 40;
  if (size === "40-50") return py >= 40 && py < 50;
  if (size === "50+") return py >= 50;
  return true;
}

let currentSize = "all";

// Paging (portfolio + home): 2x10 initial, 2x5 per "…" click
const HOUSE_INITIAL = 20;
const HOUSE_INCREMENT = 10;
let houseVisible = HOUSE_INITIAL;

const R2_BASE = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev";

// 이미지 로드 실패 시 사용할 중립 스켈레톤 (텍스트 없음, 1.6:1).
// "이미지 준비 중" 같은 문구는 프로덕션에 노출되면 안 되므로 텍스트를 두지 않는다.
// 어떤 데이터 드리프트·전송 실패에도 사용자에게는 옅은 단색 박스만 보인다.
const IMG_PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10" preserveAspectRatio="xMidYMid slice"><rect width="16" height="10" fill="#eef0f2"/></svg>',
  );

function buildHouseCards() {
  // 1 프로젝트 = 1 카드. 카드는 리스트에서 각자 독립으로 표시됨 (페어/병치 아님).
  // rightFolder = "상세 이미지 참조 원본글" 포인터. 설정돼 있으면 이 카드의
  // 상세 모달 갤러리는 원본글 images 로 교체. 표지·카드 위치는 자기 것 유지.
  const cards = [];
  for (let i = 0; i < TOTAL_PROJECTS; i++) {
    const proj = projectData[i];
    if (!sizeMatch(getPy(proj.folder), currentSize)) continue;
    // 썸네일 우선순위: admin 표지 → 업로드 이미지[0] → 폴더 표지(001.webp) → placeholder.
    // 폴더 fallback 덕분에 API 동기화 전 최초 렌더에서도 실제 이미지를 즉시 노출
    // (옛 사고: 하드코딩 데이터에 thumbAfter 없어 "이미지 준비 중" 이 깜빡임).
    const thumbUrl =
      proj.thumbAfter ||
      (Array.isArray(proj.images) && proj.images[0]) ||
      (proj.folder
        ? `${R2_BASE}/images/portfolio/${proj.folder}/001.webp`
        : IMG_PLACEHOLDER);
    // 우선순위: 본인 상세이미지가 있으면 본인 것 사용.
    // 본인 이미지 없고 rightFolder(상세 이미지 참조 원본글) 가 지정돼 있으면
    // 원본글의 상세이미지(images/count/folder)를 그대로 가져옴.
    // 표지(thumbAfter)는 위에서 이미 자기 것으로 결정됨 → 항상 본인 유지.
    let modalProj = proj;
    // own 우선: 본인 상세이미지가 있으면 본인 것 사용 (라이브 동작 보존).
    // own 이 없을 때만 참조 분기 진입.
    // 참조 1순위: 영구 id (rightId). 이름·folder 변경에 영향 안 받음.
    // 2순위: 레거시 rightFolder (RightId 백필 안 된 옛 record). 자기참조는
    //   object identity 로 차단 — folder 슬러그가 자기 자신과 같아도 다른 글
    //   을 정확히 찾도록 (옛 사고: -1001 = -1 동일 folder → 자기참조 오판).
    const ownHasImages = Array.isArray(proj.images) && proj.images.length > 0;
    if (!ownHasImages) {
      let right = null;
      if (proj.rightId) {
        right = projectData.find((x) => x.id === proj.rightId && x !== proj);
      } else if (proj.rightFolder) {
        right = projectData.find(
          (x) => x !== proj && x.folder === proj.rightFolder,
        );
      }
      if (right) {
        modalProj = {
          ...proj,
          images: Array.isArray(right.images) ? right.images : [],
          count: right.count || 0,
          folder: right.folder,
        };
      }
    }
    cards.push({
      thumbUrl,
      modalProj,
      displayName: proj.name,
    });
  }
  return cards;
}

function removeHouseMoreBtn() {
  const btn = document.getElementById("projectMoreBtn");
  if (btn) btn.remove();
}

function renderHouseMoreBtn(total) {
  removeHouseMoreBtn();
  if (!grid) return;
  if (houseVisible >= total) return;
  const btn = document.createElement("button");
  btn.id = "projectMoreBtn";
  btn.className = "project-more-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "더 보기");
  btn.textContent = "…";
  btn.addEventListener("click", () => {
    houseVisible += HOUSE_INCREMENT;
    renderHouse();
  });
  grid.insertAdjacentElement("afterend", btn);
}

// Render HOUSE grid — 2열, 프로젝트당 2장 썸네일 (평수 필터 + 페이징 지원)
function renderHouse(size) {
  if (!grid) return;
  if (typeof size === "string") {
    currentSize = size;
    houseVisible = HOUSE_INITIAL;
  }
  grid.innerHTML = "";
  grid.className = "project-grid";
  const cards = buildHouseCards();
  const limit = Math.min(houseVisible, cards.length);
  for (let k = 0; k < limit; k++) {
    const { thumbUrl, modalProj, displayName } = cards[k];
    const card = document.createElement("div");
    card.className = "project-card";
    // Above-the-fold (first 4) eager + high priority, rest lazy
    const loadAttr =
      k < 4
        ? 'fetchpriority="high" decoding="async"'
        : 'loading="lazy" decoding="async"';
    card.innerHTML = `
      <img class="img-after" src="${thumbUrl}" alt="${displayName}" ${loadAttr}>
      <div class="project-overlay">
        <span class="project-name">${displayName}</span>
      </div>
    `;
    // 이미지 로드 실패 시 placeholder로 교체 (R2 fallback 누락 파일 회피)
    const imgEl = card.querySelector(".img-after");
    if (imgEl) {
      // 로드 완료 시 스켈레톤 배경 제거 (사진 위에 색 비칠 여지 0).
      // 캐시 히트로 이미 complete 인 경우도 즉시 처리.
      const markLoaded = () => card.classList.add("is-loaded");
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        markLoaded();
      } else {
        imgEl.addEventListener("load", markLoaded, { once: true });
      }
      imgEl.addEventListener(
        "error",
        () => {
          if (imgEl.src !== IMG_PLACEHOLDER) {
            imgEl.src = IMG_PLACEHOLDER;
            card.classList.add("no-image");
          }
        },
        { once: true },
      );
    }
    // 모달 첫 이미지 prefetch — hover/touch 시 미리 캐시에 올려 클릭 시 즉시 표시.
    // (모달 클릭 후 첫 장이 늦게 뜨던 지연 완화)
    let _prefetched = false;
    const prefetchModalFirst = () => {
      if (_prefetched) return;
      _prefetched = true;
      const first =
        (Array.isArray(modalProj.images) && modalProj.images[0]) ||
        (modalProj.folder
          ? `${R2_BASE}/images/portfolio/${modalProj.folder}/001.webp`
          : "");
      if (first) {
        const pre = new Image();
        pre.decoding = "async";
        pre.src = first;
      }
    };
    card.addEventListener("mouseenter", prefetchModalFirst, { once: true });
    card.addEventListener("touchstart", prefetchModalFirst, {
      once: true,
      passive: true,
    });
    card.addEventListener("click", () => openProjectModal(modalProj));
    grid.appendChild(card);
  }
  renderHouseMoreBtn(cards.length);
}

// Render OFFICE grid — 고정 컬럼 (round-robin 분배)
// CSS columns는 이미지 로드 시마다 리밸런싱되어 슬롯머신처럼 튐
// 뷰포트에 따라 2~3 컬럼 반응형 (모바일에서 너무 작게 보이지 않게)
function getOfficeColCount() {
  const w = window.innerWidth;
  if (w >= 900) return 3;
  return 2;
}

let _officeResizeBound = false;
function renderOffice() {
  if (!grid) return;
  removeHouseMoreBtn();
  grid.innerHTML = "";
  grid.className = "project-grid office-grid";

  const COL_COUNT = getOfficeColCount();
  grid.dataset.cols = String(COL_COUNT);
  const cols = [];
  for (let c = 0; c < COL_COUNT; c++) {
    const col = document.createElement("div");
    col.className = "office-col";
    cols.push(col);
    grid.appendChild(col);
  }

  for (let i = 1; i <= OFFICE_TOTAL; i++) {
    const num = String(i).padStart(3, "0");
    const card = document.createElement("div");
    card.className = "project-card";
    const officeLoad =
      i <= 6
        ? 'fetchpriority="high" decoding="async"'
        : 'loading="lazy" decoding="async"';
    card.innerHTML = `<img class="img-after" src="https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/office/${num}.webp" alt="Office ${i}" ${officeLoad}>`;
    card.addEventListener("click", () => openOfficeLightbox(i - 1));
    cols[(i - 1) % COL_COUNT].appendChild(card);
  }

  // Responsive: re-render if viewport crosses breakpoint
  if (!_officeResizeBound) {
    _officeResizeBound = true;
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!grid.classList.contains("office-grid")) return;
        const target = getOfficeColCount();
        if (parseInt(grid.dataset.cols) !== target) renderOffice();
      }, 150);
    });
  }
}

// Office lightbox (no modal, direct lightbox)
function openOfficeLightbox(index) {
  lbImages = [];
  for (let i = 1; i <= OFFICE_TOTAL; i++) {
    lbImages.push(
      `https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/office/${String(i).padStart(3, "0")}.webp`,
    );
  }
  lbIndex = index;
  lbZoom = 1;
  let lb = document.getElementById("lightbox");
  if (!lb) createLightbox();
  lbShow();
  markLightboxOpen();
}

// Filter tabs (HOUSE / OFFICE)
const filterBtns = document.querySelectorAll(".filter-tabs button");
const sizeSubFilter = document.getElementById("sizeSubFilter");
const houseSubGroup = sizeSubFilter?.querySelector('[data-group="house"]');
const officeSubGroup = sizeSubFilter?.querySelector('[data-group="office"]');
const sizeBtns = houseSubGroup ? houseSubGroup.querySelectorAll("button") : [];

function showHouseSubGroup() {
  houseSubGroup?.classList.remove("hidden");
  officeSubGroup?.classList.add("hidden");
}
function showOfficeSubGroup() {
  officeSubGroup?.classList.remove("hidden");
  houseSubGroup?.classList.add("hidden");
}

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter;
    if (filter === "office") {
      showOfficeSubGroup();
      renderOffice();
    } else {
      showHouseSubGroup();
      // reset 평수 필터 to 전체
      sizeBtns.forEach((b) => b.classList.remove("active"));
      const allBtn = houseSubGroup?.querySelector('button[data-size="all"]');
      if (allBtn) allBtn.classList.add("active");
      currentSize = "all";
      renderHouse("all");
    }
  });
});

// Sub filter (HOUSE 평수)
sizeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    sizeBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderHouse(btn.dataset.size);
  });
});

// Initial render (URL 파라미터 cat=office / size=20-30 등 지원)
if (grid) {
  const params = new URLSearchParams(location.search);
  const pathCategory = location.pathname
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    ?.toLowerCase();
  const urlCat =
    params.get("cat") ||
    (pathCategory === "office"
      ? "office"
      : pathCategory === "house"
        ? "house"
        : "");
  const urlSize = params.get("size");

  if (urlCat === "office") {
    filterBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.filter === "office"),
    );
    showOfficeSubGroup();
    renderOffice();
  } else if (urlSize) {
    filterBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.filter === "house"),
    );
    showHouseSubGroup();
    sizeBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.size === urlSize),
    );
    renderHouse(urlSize);
  } else {
    renderHouse();
  }
}

// Modal + 오버레이 히스토리 (뒤로가기로 모달/라이트박스만 닫기)
// 모달·라이트박스를 계층 스택으로 다룬다. 각 레이어를 열 때 history 엔트리를
// 1개 push하고, 닫기 액션은 history.back()만 호출한다. 실제 DOM 닫기는 오직
// popstate에서만 수행해 "뒤로가기 시 페이지 이탈" 대신 오버레이만 닫히게 한다.
// URL은 세 번째 인자를 생략(현재 path+query 그대로 유지)해 색인에 영향 없음.
let modalOpen = false;
let lightboxOpen = false;

function openProjectModal(proj) {
  modalTitle.textContent = proj.name;
  modalGrid.innerHTML = "";
  // 관리자가 업로드한 이미지(D1 images)가 있으면 우선 사용, 없으면 폴더 fallback
  const urls =
    Array.isArray(proj.images) && proj.images.length
      ? proj.images
      : Array.from(
          { length: proj.count || 0 },
          (_, i) =>
            `${R2_BASE}/images/portfolio/${proj.folder}/${String(i + 1).padStart(3, "0")}.webp`,
        );
  urls.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = `${proj.name} ${i + 1}`;
    // 모달 첫 화면(상위 3장)은 즉시 로드 — lazy 면 모달을 열어도 빈 화면이 지연됨.
    // 나머지는 스크롤 시 lazy 로드.
    if (i < 3) {
      img.decoding = "async";
      img.setAttribute("fetchpriority", "high");
    } else {
      img.loading = "lazy";
      img.decoding = "async";
    }
    img.onerror = function () {
      this.remove();
    };
    img.addEventListener("click", () => openLightbox(img.src));
    modalGrid.appendChild(img);
  });
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  if (modalOpen) {
    // 이미 열린 상태에서 다른 프로젝트로 교체 → 엔트리 추가 없이 현재 상태만 교체
    history.replaceState({ d1Overlay: "modal" }, "");
    return;
  }
  modalOpen = true;
  history.pushState({ d1Overlay: "modal" }, "");
}

// DOM만 닫기 (popstate 전용 — history는 건드리지 않음)
function closeProjectModalOnly() {
  modal.classList.remove("open");
  document.body.style.overflow = "";
  modalOpen = false;
}

// 닫기 요청 (버튼/배경/ESC) → 히스토리가 있으면 back으로 위임
function requestCloseProjectModal() {
  if (modalOpen) {
    history.back();
    return;
  }
  closeProjectModalOnly();
}

if (modalClose) modalClose.addEventListener("click", requestCloseProjectModal);
if (modal)
  modal.addEventListener("click", (e) => {
    if (e.target === modal) requestCloseProjectModal();
  });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (lightboxOpen) closeLightbox();
    else if (modalOpen) requestCloseProjectModal();
  }
  if (lightboxOpen && e.key === "ArrowRight") lbNav(1);
  if (lightboxOpen && e.key === "ArrowLeft") lbNav(-1);
});

// 뒤로가기 → 열린 오버레이 중 최상단(라이트박스 > 모달)만 닫는다
window.addEventListener("popstate", () => {
  if (lightboxOpen) closeLightboxOnly();
  else if (modalOpen) closeProjectModalOnly();
});

// Lightbox 뷰어 (원본 동일 UI)
let lbImages = [];
let lbIndex = 0;
let lbZoom = 1;

function createLightbox() {
  const lb = document.createElement("div");
  lb.id = "lightbox";
  lb.innerHTML = `
    <div class="lb-counter"><span class="lb-current">1</span> / <span class="lb-total">1</span></div>
    <div class="lb-toolbar">
      <button class="lb-btn lb-fit" title="원본 크기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>
      <button class="lb-btn lb-zoom-in" title="확대"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="7" y1="10" x2="13" y2="10"/><line x1="10" y1="7" x2="10" y2="13"/></svg></button>
      <button class="lb-btn lb-zoom-out" title="축소" disabled><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="7" y1="10" x2="13" y2="10"/></svg></button>
      <button class="lb-btn lb-close" title="닫기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/></svg></button>
    </div>
    <button class="lb-arrow lb-prev">&#8592;</button>
    <button class="lb-arrow lb-next">&#8594;</button>
    <div class="lb-img-wrap"><img src="" draggable="false"></div>
  `;
  lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
  lb.querySelector(".lb-prev").addEventListener("click", () => lbNav(-1));
  lb.querySelector(".lb-next").addEventListener("click", () => lbNav(1));
  lb.querySelector(".lb-fit").addEventListener("click", lbFitToggle);
  lb.querySelector(".lb-zoom-in").addEventListener("click", () =>
    lbSetZoom(lbZoom + 0.5),
  );
  lb.querySelector(".lb-zoom-out").addEventListener("click", () =>
    lbSetZoom(lbZoom - 0.5),
  );
  lb.querySelector(".lb-img-wrap").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLightbox();
  });
  document.body.appendChild(lb);
  return lb;
}

function openLightbox(src) {
  const imgs = modalGrid.querySelectorAll("img");
  lbImages = [...imgs].map((img) => img.src);
  lbIndex = lbImages.indexOf(src);
  if (lbIndex < 0) lbIndex = 0;
  lbZoom = 1;
  if (!document.getElementById("lightbox")) createLightbox();
  lbShow();
  markLightboxOpen();
}

function lbShow() {
  const lb = document.getElementById("lightbox");
  const img = lb.querySelector(".lb-img-wrap img");
  img.src = lbImages[lbIndex];
  img.style.transform = "scale(1)";
  lbZoom = 1;
  lb.querySelector(".lb-current").textContent = lbIndex + 1;
  lb.querySelector(".lb-total").textContent = lbImages.length;
  lb.querySelector(".lb-zoom-out").disabled = true;
  lb.querySelector(".lb-prev").style.visibility =
    lbIndex > 0 ? "visible" : "hidden";
  lb.querySelector(".lb-next").style.visibility =
    lbIndex < lbImages.length - 1 ? "visible" : "hidden";
}

function lbNav(dir) {
  lbIndex = Math.max(0, Math.min(lbImages.length - 1, lbIndex + dir));
  lbShow();
}

function lbSetZoom(z) {
  const lb = document.getElementById("lightbox");
  lbZoom = Math.max(1, Math.min(5, z));
  lb.querySelector(".lb-img-wrap img").style.transform = `scale(${lbZoom})`;
  lb.querySelector(".lb-zoom-out").disabled = lbZoom <= 1;
}

function lbFitToggle() {
  lbSetZoom(lbZoom <= 1 ? 2 : 1);
}

// 라이트박스 오픈 + 히스토리 엔트리 1개 push (모달 위 레이어)
function markLightboxOpen() {
  document.getElementById("lightbox").classList.add("open");
  if (!lightboxOpen) {
    lightboxOpen = true;
    history.pushState({ d1Overlay: "lightbox" }, "");
  }
}

// DOM만 닫기 (popstate 전용)
function closeLightboxOnly() {
  const lb = document.getElementById("lightbox");
  if (lb) lb.classList.remove("open");
  lightboxOpen = false;
}

// 닫기 요청 (버튼/배경/ESC) → 히스토리가 있으면 back으로 위임
function closeLightbox() {
  if (lightboxOpen) {
    history.back();
    return;
  }
  closeLightboxOnly();
}

// ========== BRAND FILM VIDEO (lazy autoplay) ==========
document.querySelectorAll(".brandfilm-player").forEach((player) => {
  const video = player.querySelector(".brandfilm-element");
  const playBtn = player.querySelector(".brandfilm-play-toggle");
  const soundBtn = player.querySelector(".brandfilm-sound-toggle");
  const src = player.dataset.videoSrc;
  const poster = player.dataset.posterSrc;
  const isMobileMuted = window.matchMedia(
    "(max-width: 767px), (pointer: coarse)",
  ).matches;
  let loaded = false;
  let loadStarted = false;
  let controlsTimer = null;

  if (!video || !src) return;
  if (poster) video.poster = poster;
  if (isMobileMuted) player.classList.add("is-mobile-muted");

  const setPlayState = (isPlaying) => {
    if (!playBtn) return;
    playBtn.classList.toggle("is-playing", isPlaying);
    playBtn.setAttribute(
      "aria-label",
      isPlaying ? "Pause DAYONE BRAND FILM" : "Play DAYONE BRAND FILM",
    );
  };

  const setSoundState = () => {
    if (!soundBtn) return;
    soundBtn.classList.toggle("is-muted", video.muted);
    soundBtn.setAttribute(
      "aria-label",
      video.muted ? "Unmute DAYONE BRAND FILM" : "Mute DAYONE BRAND FILM",
    );
  };

  const showControls = () => {
    if (!loaded) return;
    player.classList.add("controls-visible");
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => {
      player.classList.remove("controls-visible");
    }, 2400);
  };

  const playVideo = () => {
    video.muted = isMobileMuted ? true : video.muted;
    setSoundState();
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise
        .then(() => setPlayState(true))
        .catch(() => setPlayState(false));
    } else {
      setPlayState(true);
    }
  };

  const loadVideo = ({ shouldPlay = true } = {}) => {
    if (!loaded) {
      if (loadStarted) return;
      loadStarted = true;
      video.src = src;
      video.load();
      loaded = true;
      player.classList.add("is-loaded");
    }
    if (shouldPlay) playVideo();
  };

  const isNearViewport = () => {
    const rect = player.getBoundingClientRect();
    const margin = Math.min(window.innerHeight, 700);
    return rect.top < window.innerHeight + margin && rect.bottom > -margin;
  };

  const loadWhenNear = () => {
    if (!loaded && isNearViewport()) loadVideo();
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadVideo();
            observer.disconnect();
          }
        });
      },
      { rootMargin: "700px 0px", threshold: 0.01 },
    );
    observer.observe(player);
  }

  let fallbackTimer = null;
  const scheduleFallbackCheck = () => {
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(loadWhenNear, 100);
  };
  window.addEventListener("load", loadWhenNear, { once: true });
  window.addEventListener("scroll", scheduleFallbackCheck, { passive: true });
  window.addEventListener("resize", scheduleFallbackCheck);
  setTimeout(loadWhenNear, 1200);

  video.addEventListener("play", () => setPlayState(true));
  video.addEventListener("pause", () => setPlayState(false));
  video.addEventListener("volumechange", setSoundState);

  player.addEventListener("click", () => {
    if (!loaded) loadVideo();
    showControls();
  });

  playBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!loaded) {
      loadVideo();
      showControls();
      return;
    }
    if (video.paused) playVideo();
    else video.pause();
    showControls();
  });

  soundBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isMobileMuted) {
      video.muted = true;
      setSoundState();
      showControls();
      return;
    }
    if (!loaded) loadVideo({ shouldPlay: false });
    video.muted = !video.muted;
    setSoundState();
    if (video.paused) playVideo();
    showControls();
  });

  setPlayState(false);
  setSoundState();
});

// ========== HERO SLIDER ==========
(async function initHeroSlider() {
  const track = document.getElementById("heroTrack");
  if (!track) return;

  // 로더가 히어로 첫 이미지 로드까지 기다릴 수 있게 이벤트 dispatch
  const signalHeroReady = () => {
    window.dispatchEvent(new CustomEvent("day1:hero-ready"));
  };

  const DEFAULTS = { maxSlides: 10, autoPlayMs: 6000 };
  const prefix = typeof IMG_PREFIX !== "undefined" ? IMG_PREFIX : "";

  let slides = [];
  let config = { ...DEFAULTS };

  try {
    const API_BASE =
      (typeof window !== "undefined" && window.DAY1_API_BASE) || "";
    let data = null;
    // <head>에서 선제 시작한 히어로 fetch 재사용 (중복 요청 방지 + 첫 이미지 preload)
    if (typeof window !== "undefined" && window.__heroPromise) {
      try {
        data = await window.__heroPromise;
      } catch {}
    }
    if (!data && API_BASE) {
      try {
        // cache buster + Worker TTL 5초 → admin 변경이 다음 페이지 로드 즉시 반영
        const r = await fetch(`${API_BASE}/api/hero/slides?ts=${Date.now()}`);
        if (r.ok) data = await r.json();
      } catch {}
    }
    if (!data) {
      const res = await fetch(`${prefix}data/hero-slides.json`);
      data = await res.json();
    }
    if (data.config) Object.assign(config, data.config);
    slides = (data.slides || []).slice(0, config.maxSlides);
  } catch (e) {
    console.warn("[hero-slider] load failed:", e);
    signalHeroReady();
    return;
  }

  if (slides.length === 0) {
    signalHeroReady();
    return;
  }

  const slider = track.closest(".hero-slider");
  if (slides.length === 1) slider.classList.add("single");

  // Only the first slide gets its background-image inline (LCP).
  // Other slides store the URL in data-bg and load it just before activation.
  // 첫 슬라이드도 .active는 이미지 로드 완료 후에만 부여 → pop-in/섬광 방지.
  track.innerHTML = slides
    .map((s, i) => {
      const alt = (s.alt || "").replace(/"/g, "&quot;");
      const style = i === 0 ? `background-image:url('${s.image}');` : "";
      const dataBg = i === 0 ? "" : ` data-bg="${s.image}"`;
      if (s.href) {
        return `<a href="${s.href}" class="hero-slide" style="${style}"${dataBg} aria-label="${alt}"></a>`;
      }
      return `<div class="hero-slide" style="${style}"${dataBg} role="img" aria-label="${alt}"></div>`;
    })
    .join("");

  // 첫 슬라이드 이미지 로드 완료 시에만 .active 부여 + 로더 신호
  const activateFirst = () => {
    const el = track.querySelector(".hero-slide");
    if (el && !el.classList.contains("active")) el.classList.add("active");
    signalHeroReady();
  };
  const firstSlideImg = new Image();
  firstSlideImg.onload = activateFirst;
  firstSlideImg.onerror = activateFirst;
  firstSlideImg.src = slides[0].image;

  const dotsEl = document.getElementById("heroDots");
  if (dotsEl) {
    dotsEl.innerHTML = slides
      .map(
        (_, i) =>
          `<button class="hero-dot${i === 0 ? " active" : ""}" data-idx="${i}" aria-label="슬라이드 ${i + 1}"></button>`,
      )
      .join("");
  }

  const slideEls = track.querySelectorAll(".hero-slide");
  const dotEls = dotsEl ? dotsEl.querySelectorAll(".hero-dot") : [];
  let current = 0;
  let timer = null;

  // L2: 슬라이드 이미지 디코드 완료까지 대기 후 backgroundImage 세팅.
  // URL만 세팅하고 바로 .active 부여하던 기존 방식은 느린 네트워크에서
  // 투명 div가 페이드인 → pop-in 플래시 유발. Promise 기반으로 로드 보장.
  function waitForSlideImage(el) {
    if (!el) return Promise.resolve();
    const url = el.dataset.bg;
    if (!url) return Promise.resolve(); // 이미 세팅된 슬라이드
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        el.style.backgroundImage = `url('${url}')`;
        el.removeAttribute("data-bg");
        resolve();
      };
      img.onload = done;
      img.onerror = done;
      img.src = url;
      // 무한 hang 방어 — 4초 안에 onload/onerror 둘 다 안 오면 진행
      setTimeout(done, 4000);
    });
  }

  function clearPreviousSlides() {
    slideEls.forEach((el) => el.classList.remove("prev"));
  }

  // 새 슬라이드를 이전 슬라이드 위로 페이드인한 뒤, 전환이 끝나면 이전 장면을 제거한다.
  // 이 방식은 전환 중 뒤쪽 고정 배경이나 바탕색이 비치는 순간을 막는다.
  function goTo(idx) {
    const target = (idx + slides.length) % slides.length;
    if (target === current && slideEls[target]?.classList.contains("active"))
      return;

    waitForSlideImage(slideEls[target]).then(() => {
      const prevIndex = current;
      const previous = slideEls[prevIndex];
      if (previous && prevIndex !== target) previous.classList.add("prev");
      // 더블 rAF: backgroundImage 세팅 → 레이아웃 → 페인트 보장 후 transition 시작
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          slideEls.forEach((el, i) =>
            el.classList.toggle("active", i === target),
          );
          dotEls.forEach((el, i) =>
            el.classList.toggle("active", i === target),
          );
          current = target;
          const active = slideEls[target];
          const done = () => clearPreviousSlides();
          active?.addEventListener("transitionend", done, { once: true });
          setTimeout(done, 900);
          // 다음 슬라이드 백그라운드 preload
          waitForSlideImage(slideEls[(target + 1) % slides.length]);
        }),
      );
    });
  }
  function next() {
    goTo(current + 1);
  }
  function prev() {
    goTo(current - 1);
  }

  // 슬라이드 #2 idle 프리로드 — 첫 오토어드밴스가 즉시 부드럽게
  if (slides.length > 1) {
    const preloadNext = () => waitForSlideImage(slideEls[1]);
    if ("requestIdleCallback" in window) {
      requestIdleCallback(preloadNext, { timeout: 2000 });
    } else {
      setTimeout(preloadNext, 1500);
    }
  }
  function resetTimer() {
    if (timer) clearInterval(timer);
    if (slides.length > 1) timer = setInterval(next, config.autoPlayMs);
  }

  const prevBtn = document.getElementById("heroPrev");
  const nextBtn = document.getElementById("heroNext");
  if (prevBtn)
    prevBtn.addEventListener("click", () => {
      prev();
      resetTimer();
    });
  if (nextBtn)
    nextBtn.addEventListener("click", () => {
      next();
      resetTimer();
    });
  dotEls.forEach((dot) =>
    dot.addEventListener("click", (e) => {
      goTo(parseInt(e.currentTarget.dataset.idx, 10));
      resetTimer();
    }),
  );

  // 무한 롤링 — 호버/터치 정지 없음 (모바일 mouseleave 누락으로 영구 stuck 방지)
  // 백그라운드 탭 복귀 시 즉시 재개 (브라우저 throttle로 죽은 타이머 살림)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resetTimer();
  });

  resetTimer();
})();

// ========== PORTFOLIO API 동기화 ==========
// admin 변경이 라이브에 빠르게 반영되되, 변경 없으면 재렌더 안 함
// (사용자가 "더 보기"로 늘려놓은 카드 리스트가 8초 polling 마다 깜빡임/초기화
//  되는 사고 차단). signature 비교로 진짜 변경 있을 때만 renderHouse().
let _portfolioLastSig = "";
async function syncPortfolioFromApi() {
  const API_BASE =
    (typeof window !== "undefined" && window.DAY1_API_BASE) || "";
  if (!API_BASE || !grid) return;
  try {
    const res = await fetch(`${API_BASE}/api/portfolio?ts=${Date.now()}`);
    if (!res.ok) return;
    const d = await res.json();
    if (!Array.isArray(d.records)) return;

    // 변경 감지용 signature — id/order/사진/참조 (rightId 우선) 모두 포함
    const sig = d.records
      .map(
        (r) =>
          `${r.id}|${r.order}|${r.thumbAfter || ""}|${(Array.isArray(r.images) && r.images.length) || 0}|${r.rightId || r.rightFolder || ""}`,
      )
      .join("||");
    if (sig === _portfolioLastSig) return; // 변경 없음 → 그대로 둠
    _portfolioLastSig = sig;

    projectData.length = 0;
    d.records.forEach((r) => {
      const o = {
        id: r.id,
        name: r.name,
        folder: r.folder,
        count: r.count,
        thumbAfter: r.thumbAfter || "",
        thumbBefore: r.thumbBefore || "",
        images: Array.isArray(r.images) ? r.images : [],
      };
      // 참조: 영구 id (rightId) 가 우선. rightName/rightFolder/rightCount 는
      // Worker 가 RightId 기준으로 derive 해서 응답 — 이름이 바뀌어도 자동 동기.
      if (r.rightId) o.rightId = r.rightId;
      if (r.rightName) {
        o.rightName = r.rightName;
        o.rightFolder = r.rightFolder;
        o.rightCount = r.rightCount;
      }
      projectData.push(o);
    });
    TOTAL_PROJECTS = projectData.length;

    if (
      grid.classList.contains("project-grid") &&
      !grid.classList.contains("office-grid")
    ) {
      // 인자 없이 호출 — 사용자가 "더 보기"로 늘린 houseVisible 유지
      renderHouse();
    }
  } catch (e) {
    // 조용히 fallback 유지
  }
}

syncPortfolioFromApi();
// 라이브 탭이 띄워진 상태에서도 admin 변경이 반영되도록 폴링.
// 활성 탭일 때만 폴링(백그라운드 탭은 멈춤). 탭 복귀(focus/visibilitychange)
// 시에는 즉시 갱신하므로, 보고 있던 사용자는 항상 최신. 따라서 유휴 폴링은
// 30초로 충분 — Worker 요청/D1 read 부하를 8초 대비 ~73% 절감(기능 동일).
let _portfolioPollTimer = null;
function startPortfolioPolling() {
  if (_portfolioPollTimer) return;
  _portfolioPollTimer = setInterval(() => {
    if (!document.hidden) syncPortfolioFromApi();
  }, 30000);
}
function stopPortfolioPolling() {
  if (_portfolioPollTimer) {
    clearInterval(_portfolioPollTimer);
    _portfolioPollTimer = null;
  }
}
startPortfolioPolling();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    syncPortfolioFromApi();
    startPortfolioPolling();
  } else {
    stopPortfolioPolling();
  }
});
window.addEventListener("focus", syncPortfolioFromApi);
