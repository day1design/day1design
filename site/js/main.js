// ========== PORTFOLIO GRID ==========
const _prefix = typeof IMG_PREFIX !== "undefined" ? IMG_PREFIX : "";
const TOTAL_PROJECTS = 35;

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
  },
  { name: "목동 우성2차 42py", folder: "목동-우성2차-42py", count: 46 },
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
  { name: "신반포 2차 34py", folder: "신반포-2차-34py", count: 8 },
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
  { name: "서울숲 푸르지오 41py", folder: "서울숲-푸르지오-41py", count: 34 },
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
  { name: "성남 센트럴타운 33py", folder: "성남-센트럴타운-33py", count: 6 },
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

// Paging (portfolio page only): 2x10 initial, 2x5 per "…" click
const HOUSE_INITIAL = 20;
const HOUSE_INCREMENT = 10;
const isPortfolioPage = !!document.querySelector(".filter-tabs");
let houseVisible = HOUSE_INITIAL;

function buildHouseCards() {
  const cards = [];
  for (let i = 0; i < TOTAL_PROJECTS; i++) {
    const num = String(i + 1).padStart(2, "0");
    const proj = projectData[i];
    const thumbs = [`${num}_after.webp`, `${num}_before.webp`];
    thumbs.forEach((thumb, ti) => {
      const isRight = ti === 1 && proj.rightFolder;
      const modalProj = isRight
        ? {
            name: proj.rightName,
            folder: proj.rightFolder,
            count: proj.rightCount,
          }
        : proj;
      const displayName = isRight ? proj.rightName : proj.name;
      const folderForSize = isRight ? proj.rightFolder : proj.folder;
      if (!sizeMatch(getPy(folderForSize), currentSize)) return;
      cards.push({ thumb, modalProj, displayName });
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
  if (!grid || !isPortfolioPage) return;
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
  const limit = isPortfolioPage
    ? Math.min(houseVisible, cards.length)
    : cards.length;
  for (let k = 0; k < limit; k++) {
    const { thumb, modalProj, displayName } = cards[k];
    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `
      <img class="img-after" src="https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio-thumbs/${thumb}" alt="${displayName}">
      <div class="project-overlay">
        <span class="project-name">${displayName}</span>
      </div>
    `;
    card.addEventListener("click", () => openProjectModal(modalProj));
    grid.appendChild(card);
  }
  renderHouseMoreBtn(cards.length);
}

// Render OFFICE grid — 3열, 단순 이미지
function renderOffice() {
  if (!grid) return;
  removeHouseMoreBtn();
  grid.innerHTML = "";
  grid.className = "project-grid office-grid";
  for (let i = 1; i <= OFFICE_TOTAL; i++) {
    const num = String(i).padStart(3, "0");
    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `<img class="img-after" src="https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/office/${num}.webp" alt="Office ${i}">`;
    card.addEventListener("click", () => openOfficeLightbox(i - 1));
    grid.appendChild(card);
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
  document.getElementById("lightbox").classList.add("open");
}

// Filter tabs (HOUSE / OFFICE)
const filterBtns = document.querySelectorAll(".filter-tabs button");
const sizeSubFilter = document.getElementById("sizeSubFilter");
const sizeBtns = sizeSubFilter ? sizeSubFilter.querySelectorAll("button") : [];

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter;
    if (filter === "office") {
      if (sizeSubFilter) sizeSubFilter.classList.add("hidden");
      renderOffice();
    } else {
      if (sizeSubFilter) sizeSubFilter.classList.remove("hidden");
      // reset 평수 필터 to 전체
      sizeBtns.forEach((b) => b.classList.remove("active"));
      const allBtn = sizeSubFilter?.querySelector('button[data-size="all"]');
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

// Initial render
if (grid) renderHouse();

// Modal
function openProjectModal(proj) {
  modalTitle.textContent = proj.name;
  modalGrid.innerHTML = "";
  for (let i = 1; i <= proj.count; i++) {
    const num = String(i).padStart(3, "0");
    const img = document.createElement("img");
    img.src = `https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/portfolio/${proj.folder}/${num}.webp`;
    img.alt = `${proj.name} ${i}`;
    img.loading = "lazy";
    img.onerror = function () {
      this.remove();
    };
    img.addEventListener("click", () => openLightbox(img.src));
    modalGrid.appendChild(img);
  }
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeProjectModal() {
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

if (modalClose) modalClose.addEventListener("click", closeProjectModal);
if (modal)
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeProjectModal();
  });
document.addEventListener("keydown", (e) => {
  const lb = document.getElementById("lightbox");
  const lbOpen = lb && lb.classList.contains("open");
  if (e.key === "Escape") {
    if (lbOpen) closeLightbox();
    else closeProjectModal();
  }
  if (lbOpen && e.key === "ArrowRight") lbNav(1);
  if (lbOpen && e.key === "ArrowLeft") lbNav(-1);
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
  document.getElementById("lightbox").classList.add("open");
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

function closeLightbox() {
  const lb = document.getElementById("lightbox");
  if (lb) lb.classList.remove("open");
}
