// ========== COMMUNITY (RESIDENTIAL only) ==========
const PER_PAGE = 16;
let communityData = [];
let currentPage = 1;

(async function loadCommunity() {
  const API_BASE =
    (typeof window !== "undefined" && window.DAY1_API_BASE) || "";
  let data = null;
  if (API_BASE) {
    try {
      const r = await fetch(`${API_BASE}/api/community`);
      if (r.ok) data = await r.json();
    } catch {}
  }
  if (!data) {
    try {
      const r = await fetch("../data/community-list.json");
      data = await r.json();
    } catch (e) {
      console.warn("[community] load failed:", e);
      return;
    }
  }
  communityData = data.posts || [];
  renderCommunity();
})();

function getCateClass(cat) {
  if (!cat) return "";
  if (cat.includes("포트폴리오")) return "portfolio";
  if (cat.includes("디자인제안")) return "design";
  if (cat.includes("상업")) return "commercial";
  return "";
}

function getFiltered() {
  return communityData.filter((p) => p.board === "Residential");
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
  pageItems.forEach((post, i) => {
    const thumbUrl =
      post.thumb ||
      "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/hero/hero-main-bg.webp";
    const cleanTitle = (post.title || "").replace(/\s+/g, " ").trim();
    const rawExcerpt = (post.excerpt || post.body_text || "")
      .replace(/\s+/g, " ")
      .trim();
    const excerpt =
      rawExcerpt.length > 80 ? rawExcerpt.substring(0, 80) + "…" : rawExcerpt;
    const card = document.createElement("a");
    card.className = "comm-card";
    card.href = `community-detail.html?idx=${post.idx}`;
    const loadAttr =
      i < 4
        ? 'fetchpriority="high" decoding="async"'
        : 'loading="lazy" decoding="async"';
    card.innerHTML = `
      <div class="comm-card-thumb"><img src="${thumbUrl}" alt="${cleanTitle}" ${loadAttr}></div>
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
