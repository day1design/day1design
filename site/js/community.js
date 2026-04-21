// ========== COMMUNITY ==========
const PER_PAGE = 16;
let communityData = [];
let currentFilter = "residential";
let currentPage = 1;

fetch("../data/community.json")
  .then((r) => r.json())
  .then((data) => {
    communityData = data.posts || [];
    renderCommunity();
  });

function getCateClass(cat) {
  if (!cat) return "";
  if (cat.includes("포트폴리오")) return "portfolio";
  if (cat.includes("디자인제안")) return "design";
  if (cat.includes("상업")) return "commercial";
  return "";
}

function getFiltered() {
  if (currentFilter === "all") return communityData;
  if (currentFilter === "residential")
    return communityData.filter((p) => p.board === "Residential");
  if (currentFilter === "commercial")
    return communityData.filter((p) => p.board === "Commercial");
  return communityData;
}

function renderCommunity() {
  const grid = document.getElementById("communityGrid");
  const pagination = document.getElementById("pagination");
  if (!grid) return;

  const filtered = getFiltered();
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const start = (currentPage - 1) * PER_PAGE;
  const pageItems = filtered.slice(start, start + PER_PAGE);

  grid.innerHTML = "";
  pageItems.forEach((post) => {
    const thumbUrl =
      post.thumb ||
      (post.images && post.images[0]
        ? post.images[0].replace("/upload/", "/thumbnail/")
        : "") ||
      "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/hero/hero-main-bg.webp";
    const cleanTitle = (post.title || "").replace(/\s+/g, " ").trim();
    const bodyText = (post.body_text || "").replace(/\s+/g, " ").trim();
    const excerpt =
      bodyText.length > 80 ? bodyText.substring(0, 80) + "…" : bodyText;
    const card = document.createElement("a");
    card.className = "comm-card";
    card.href = `community-detail.html?idx=${post.idx}`;
    card.innerHTML = `
      <div class="comm-card-thumb"><img src="${thumbUrl}" alt="${cleanTitle}" loading="lazy"></div>
      <div class="comm-card-info">
        <p class="comm-card-title"><span class="comm-card-cate ${getCateClass(post.category)}">${post.category || ""}</span> ${cleanTitle}</p>
        <p class="comm-card-excerpt">${excerpt}</p>
        <p class="comm-card-meta">${post.date || ""} · 조회 ${post.views || 0}</p>
      </div>
    `;
    grid.appendChild(card);
  });

  // Pagination
  if (pagination) {
    pagination.innerHTML = "";
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      if (i === currentPage) btn.classList.add("active");
      btn.addEventListener("click", () => {
        currentPage = i;
        renderCommunity();
        window.scrollTo(0, 300);
      });
      pagination.appendChild(btn);
    }
  }
}

// Filter tabs
document.querySelectorAll(".filter-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".filter-tabs button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    currentPage = 1;
    renderCommunity();
  });
});
