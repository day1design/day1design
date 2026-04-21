"""
Day1Design 커뮤니티 게시글 스크래핑
- 목록 6페이지(Residential) + 1페이지(Commercial)에서 idx 수집
- 각 상세 페이지에서 본문 텍스트 + 이미지 URL 추출
"""
import json
import re
import time
import urllib.request
from pathlib import Path
from html.parser import HTMLParser

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://day1design.co.kr/"
}

BASE = "https://day1design.co.kr"
OUTPUT = Path(r"F:\day1design_homepage\site\data\community.json")


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='replace')


class ListParser(HTMLParser):
    """Extract post links from community list pages."""
    def __init__(self):
        super().__init__()
        self.posts = []
        self._in_title = False
        self._in_cate = False
        self._in_date = False
        self._current = {}

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'a' and 'post_link_wrap' in attrs_dict.get('class', ''):
            href = attrs_dict.get('href', '')
            idx_match = re.search(r'idx=(\d+)', href)
            if idx_match:
                self._current = {'idx': idx_match.group(1), 'href': href}

    def handle_endtag(self, tag):
        pass


def parse_list_page(html, category_prefix):
    posts = []
    # Extract idx values
    idx_matches = re.findall(r'idx=(\d+)', html)
    seen = set()
    unique_idxs = []
    for idx in idx_matches:
        if idx not in seen:
            seen.add(idx)
            unique_idxs.append(idx)

    # Extract titles - look for post_link_wrap links
    title_pattern = re.compile(
        r'<a[^>]*post_link_wrap[^>]*idx=(\d+)[^>]*>.*?'
        r'<[^>]*title-block[^>]*>(.*?)</(?:div|p|span|h\d)>',
        re.DOTALL
    )
    title_map = {}
    for match in title_pattern.finditer(html):
        idx = match.group(1)
        title_html = match.group(2)
        # Clean HTML tags
        title_text = re.sub(r'<[^>]+>', ' ', title_html).strip()
        # Remove category prefix
        title_text = re.sub(r'^(주거|상업)-(디자인제안|포트폴리오)\s*', '', title_text).strip()
        title_map[idx] = title_text

    # Extract categories
    cate_pattern = re.compile(
        r'idx=(\d+).*?<em[^>]*>([^<]*(?:디자인제안|포트폴리오)[^<]*)</em>',
        re.DOTALL
    )
    cate_map = {}
    for match in cate_pattern.finditer(html):
        cate_map[match.group(1)] = match.group(2).strip()

    # Extract dates
    date_pattern = re.compile(r'(\d{4}-\d{2}-\d{2})')
    date_blocks = re.findall(r'card-summary[^>]*>(.*?)</div>', html, re.DOTALL)

    for i, idx in enumerate(unique_idxs):
        post = {
            'idx': idx,
            'title': title_map.get(idx, ''),
            'category': cate_map.get(idx, category_prefix),
        }
        posts.append(post)

    return posts


def scrape_detail(idx, category_base):
    url = f"{BASE}/{category_base}/?bmode=view&idx={idx}&t=board"
    try:
        html = fetch(url)
    except Exception as e:
        print(f"  [ERR] idx={idx}: {e}")
        return None

    # Extract views
    views_match = re.search(r'조회수\s*(\d+)', html)
    views = int(views_match.group(1)) if views_match else 0

    # Extract date
    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', html)
    date = date_match.group(1) if date_match else ''

    # Extract images from content
    img_pattern = re.compile(r'(?:src|data-src)=["\']([^"\']*cdn\.imweb\.me/upload/[^"\']+)["\']')
    images = list(dict.fromkeys(img_pattern.findall(html)))  # unique, ordered

    # Extract body text (rough: get main content area)
    # Look for fr-view or board content
    body_match = re.search(
        r'<div[^>]*fr-view[^>]*>(.*?)</div>\s*(?:</div>|<div[^>]*class="[^"]*board)',
        html, re.DOTALL
    )
    if not body_match:
        body_match = re.search(r'<div[^>]*board_view_content[^>]*>(.*?)</div>', html, re.DOTALL)

    body_text = ''
    if body_match:
        body_html = body_match.group(1)
        body_text = re.sub(r'<[^>]+>', '\n', body_html)
        body_text = re.sub(r'\n{3,}', '\n\n', body_text).strip()
        body_text = body_text[:2000]  # limit

    # Extract title from detail page
    title_match = re.search(r'<[^>]*board_view_title[^>]*>(.*?)</(?:div|h\d|p)>', html, re.DOTALL)
    title = ''
    if title_match:
        title = re.sub(r'<[^>]+>', '', title_match.group(1)).strip()

    return {
        'views': views,
        'date': date,
        'images': images,
        'body_text': body_text,
        'title_detail': title
    }


def main():
    all_posts = []

    # Scrape Residential lists (6 pages)
    print("=== Residential 목록 수집 ===")
    for page in range(1, 7):
        url = f"{BASE}/Residential/" if page == 1 else f"{BASE}/Residential/?page={page}"
        print(f"  Page {page}...")
        try:
            html = fetch(url)
            posts = parse_list_page(html, '주거')
            for p in posts:
                p['board'] = 'Residential'
            all_posts.extend(posts)
            print(f"    Found {len(posts)} posts")
        except Exception as e:
            print(f"    [ERR] {e}")
        time.sleep(0.3)

    # Scrape Commercial list (1 page)
    print("=== Commercial 목록 수집 ===")
    try:
        html = fetch(f"{BASE}/Commercial/")
        posts = parse_list_page(html, '상업')
        for p in posts:
            p['board'] = 'Commercial'
        all_posts.extend(posts)
        print(f"  Found {len(posts)} posts")
    except Exception as e:
        print(f"  [ERR] {e}")

    print(f"\n총 {len(all_posts)} 게시글 발견")

    # Scrape detail pages
    print("\n=== 상세 페이지 수집 ===")
    for i, post in enumerate(all_posts, 1):
        board = post['board']
        idx = post['idx']
        detail = scrape_detail(idx, board)
        if detail:
            post.update(detail)
            if detail.get('title_detail'):
                post['title'] = detail['title_detail']
            del post['title_detail']
        print(f"  [{i}/{len(all_posts)}] idx={idx} | imgs={len(post.get('images', []))} | views={post.get('views', 0)}")
        time.sleep(0.2)

    # Save
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump({'total': len(all_posts), 'posts': all_posts}, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {OUTPUT}")
    print(f"총 {len(all_posts)} 게시글, 이미지 {sum(len(p.get('images', [])) for p in all_posts)}장")


if __name__ == "__main__":
    main()
