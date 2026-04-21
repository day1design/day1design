"""
전 페이지 헤더/모바일/푸터 메뉴를 Option A 구조로 일괄 변환.
- <ul class="nav-list"> 내부 <a>: class="menu-item" + <span class="en">...</span><span class="ko">...</span> 구조
- mobile-nav, footer-nav: 텍스트만 PROJECT→PORTFOLIO, ESTIMATES→ESTIMATE 변경
- class="active"는 유지 (menu-item 뒤에 결합)
"""
import re
from pathlib import Path

SITE = Path(r"F:\day1design_homepage\site")
TARGETS = [
    SITE / "index.html",
    *sorted((SITE / "pages").glob("*.html")),
]

# 영문 → (최종 영문, 한글)
MAP = {
    "ABOUT US": ("ABOUT US", "회사소개"),
    "PROJECT": ("PORTFOLIO", "포트폴리오"),
    "PORTFOLIO": ("PORTFOLIO", "포트폴리오"),
    "COMMUNITY": ("COMMUNITY", "커뮤니티"),
    "ESTIMATES": ("ESTIMATE", "견적문의"),
    "ESTIMATE": ("ESTIMATE", "견적문의"),
}

# Phase 1: nav-list 내부 <li><a ...>TEXT</a></li>
NAV_LIST_BLOCK = re.compile(
    r'(<ul class="nav-list">)(.*?)(</ul>)', re.DOTALL
)
LI_A = re.compile(
    r'<li>\s*<a\s+href="([^"]+)"\s*(class="active")?\s*>([^<]+)</a>\s*</li>'
)

def convert_li(m):
    href, active, text = m.group(1), m.group(2), m.group(3).strip()
    if text not in MAP:
        return m.group(0)
    en, ko = MAP[text]
    cls = "menu-item active" if active else "menu-item"
    return (
        f'<li><a href="{href}" class="{cls}">'
        f'<span class="en">{en}</span>'
        f'<span class="ko">{ko}</span>'
        f'</a></li>'
    )

def transform_nav_list(block_match):
    inner_transformed = LI_A.sub(convert_li, block_match.group(2))
    return block_match.group(1) + inner_transformed + block_match.group(3)

# Phase 2: mobile-nav / footer-nav 내부 <a ...>TEXT</a> 텍스트만 변경
MOBILE_BLOCK = re.compile(r'(<div class="mobile-nav"[^>]*>)(.*?)(</div>)', re.DOTALL)
FOOTER_BLOCK = re.compile(r'(<div class="footer-nav">)(.*?)(</div>)', re.DOTALL)
PLAIN_A = re.compile(r'(<a\s+href="[^"]+"[^>]*>)\s*([^<]+?)\s*(</a>)')

def convert_plain(m):
    text = m.group(2).strip()
    if text in MAP:
        en, _ = MAP[text]
        return m.group(1) + en + m.group(3)
    return m.group(0)

def transform_plain_block(block_match):
    return block_match.group(1) + PLAIN_A.sub(convert_plain, block_match.group(2)) + block_match.group(3)

total_changed = 0
for path in TARGETS:
    text = path.read_text(encoding="utf-8", errors="ignore")
    new = text
    new = NAV_LIST_BLOCK.sub(transform_nav_list, new)
    new = MOBILE_BLOCK.sub(transform_plain_block, new)
    new = FOOTER_BLOCK.sub(transform_plain_block, new)

    if new != text:
        path.write_text(new, encoding="utf-8")
        changed = sum(1 for (a, b) in zip(text.splitlines(), new.splitlines()) if a != b)
        total_changed += 1
        print(f"  [UPDATED] {path.relative_to(SITE)}  (changed lines ~{changed})")
    else:
        print(f"  [SKIP]    {path.relative_to(SITE)}")

print(f"\n[done] {total_changed}/{len(TARGETS)} files updated")
