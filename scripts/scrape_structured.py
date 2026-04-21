#!/usr/bin/env python3
"""
Scrape structured content blocks from day1design.co.kr community posts.
Preserves the original text-image interleaved structure.
"""

import sys
import json
import time
import re
import shutil
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "beautifulsoup4"])
    import requests
    from bs4 import BeautifulSoup

DATA_PATH = Path("F:/day1design_homepage/site/data/community.json")
BACKUP_PATH = DATA_PATH.with_suffix(f".backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")

# Images to skip (logos, SNS icons)
SKIP_IMAGES = {
    "d901ab31360f7.png",  # DAYONE DESIGN logo
    "22c1e06963318.png",  # youtube
    "92d653689ec7a.png",  # instagram
    "c90f18a88d0f8.png",  # blog/naver
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}


def should_skip_image(src: str, tag) -> bool:
    """Check if an image should be skipped."""
    if not src:
        return True
    # Check against known skip list
    for skip in SKIP_IMAGES:
        if skip in src:
            return True
    # Check dimensions
    width = tag.get("width", "")
    height = tag.get("height", "")
    try:
        if width and int(str(width).replace("px", "")) < 100:
            return True
        if height and int(str(height).replace("px", "")) < 100:
            return True
    except (ValueError, TypeError):
        pass
    # Skip if style has small dimensions
    style = tag.get("style", "")
    if style:
        w_match = re.search(r'width:\s*(\d+)px', style)
        h_match = re.search(r'height:\s*(\d+)px', style)
        if w_match and int(w_match.group(1)) < 100:
            return True
        if h_match and int(h_match.group(1)) < 100:
            return True
    return False


def get_full_res_url(url: str) -> str:
    """Convert thumbnail URL to full resolution upload URL."""
    if not url:
        return url
    return url.replace("/thumbnail/", "/upload/")


def get_image_src(tag) -> str:
    """Extract image source from various attributes."""
    # Try data-src first (lazy loading), then src, then source srcset
    src = tag.get("data-src") or tag.get("src") or ""
    if not src:
        # Check for <source> child with srcset
        source = tag.find("source")
        if source:
            src = source.get("srcset", "")
    # Handle srcset (take first URL)
    if "," in src:
        src = src.split(",")[0].strip().split(" ")[0]
    return src.strip()


def clean_text(text: str) -> str:
    """Clean text content."""
    if not text:
        return ""
    # Remove bare URLs
    text = re.sub(r'https?://\S+', '', text)
    # Remove iframe references
    text = re.sub(r'\[iframe[^\]]*\]', '', text, flags=re.IGNORECASE)
    # Remove naver blog plugin text
    text = re.sub(r'네이버 블로그.*?플러그인', '', text, flags=re.DOTALL)
    text = re.sub(r'이 블로그.*?, .*?, .*?$', '', text, flags=re.MULTILINE)
    # Remove "공유하기" social sharing text
    text = re.sub(r'공유하기\s*(글\s*요소|URL\s*주소.*)', '', text, flags=re.DOTALL)
    # Clean whitespace
    text = re.sub(r'\xa0', ' ', text)  # non-breaking space
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    return text


def parse_content_blocks(html_content: str) -> tuple[list[dict], list[str]]:
    """Parse HTML content into ordered content blocks and image list."""
    soup = BeautifulSoup(html_content, 'html.parser')

    # Find the main content area
    content_area = soup.select_one('.board_txt_area.fr-view')
    if not content_area:
        content_area = soup.select_one('.board_txt_area')
    if not content_area:
        return [], []

    blocks = []
    valid_images = []
    current_text_parts = []

    def flush_text():
        """Flush accumulated text parts as a text block."""
        if current_text_parts:
            combined = "\n".join(current_text_parts)
            cleaned = clean_text(combined)
            if cleaned:
                blocks.append({"type": "text", "content": cleaned})
            current_text_parts.clear()

    def process_element(el):
        """Recursively process an element and its children."""
        nonlocal current_text_parts

        if el.name == 'img' or (el.name == 'picture'):
            # Handle picture element
            if el.name == 'picture':
                img_tag = el.find('img')
                if not img_tag:
                    return
            else:
                img_tag = el

            src = get_image_src(img_tag)
            if src and not should_skip_image(src, img_tag):
                flush_text()
                full_src = get_full_res_url(src)
                blocks.append({"type": "image", "src": full_src})
                valid_images.append(full_src)
            return

        if el.name == 'iframe':
            return  # Skip iframes

        if el.name in ('script', 'style', 'noscript'):
            return

        # Check if this is a block-level element
        block_tags = {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                      'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'td',
                      'th', 'pre', 'figure', 'figcaption', 'section', 'article',
                      'header', 'footer', 'br'}

        if el.name in block_tags:
            # Check if this element contains images directly or in children
            has_img = el.find('img') or el.find('picture')

            if has_img:
                # Process children individually to interleave text and images
                for child in el.children:
                    if isinstance(child, str):
                        text = child.strip()
                        if text:
                            current_text_parts.append(text)
                    elif hasattr(child, 'name'):
                        process_element(child)
                if el.name == 'p' or el.name == 'div':
                    pass  # Don't add extra newline after p/div with images
            else:
                # Pure text block element
                text = el.get_text(separator=' ', strip=True)
                if text:
                    current_text_parts.append(text)

            if el.name == 'br':
                pass  # br is handled by get_text
        elif el.name == 'a':
            # Check for image links
            img = el.find('img')
            if img:
                process_element(img)
            else:
                text = el.get_text(strip=True)
                if text:
                    current_text_parts.append(text)
        elif el.name == 'span' or el.name == 'strong' or el.name == 'em' or el.name == 'b' or el.name == 'i' or el.name == 'u':
            text = el.get_text(strip=True)
            if text:
                current_text_parts.append(text)
        elif el.name is None:
            # NavigableString
            text = str(el).strip()
            if text:
                current_text_parts.append(text)
        else:
            # Other elements - process children
            for child in el.children:
                if isinstance(child, str):
                    text = child.strip()
                    if text:
                        current_text_parts.append(text)
                elif hasattr(child, 'name'):
                    process_element(child)

    # Process top-level children of content area
    for child in content_area.children:
        if isinstance(child, str):
            text = child.strip()
            if text:
                current_text_parts.append(text)
        elif hasattr(child, 'name'):
            process_element(child)

    # Flush remaining text
    flush_text()

    # Remove empty blocks and merge adjacent text blocks
    merged_blocks = []
    for block in blocks:
        if block["type"] == "text" and not block["content"]:
            continue
        if (merged_blocks and
            merged_blocks[-1]["type"] == "text" and
            block["type"] == "text"):
            merged_blocks[-1]["content"] += "\n\n" + block["content"]
        else:
            merged_blocks.append(block)

    return merged_blocks, valid_images


def scrape_post(post: dict, session: requests.Session) -> tuple[list[dict], list[str]]:
    """Scrape a single post and return content blocks and images."""
    board = post["board"]
    idx = post["idx"]
    url = f"https://day1design.co.kr/{board}/?bmode=view&idx={idx}&t=board"

    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        resp.encoding = 'utf-8'
        return parse_content_blocks(resp.text)
    except requests.RequestException as e:
        print(f"  ERROR fetching {url}: {e}")
        return [], []


def main():
    # Load data
    print(f"Loading {DATA_PATH}...")
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    posts = data["posts"]
    total = len(posts)
    print(f"Total posts: {total}")

    # Create backup
    print(f"Creating backup at {BACKUP_PATH}...")
    shutil.copy2(DATA_PATH, BACKUP_PATH)

    session = requests.Session()
    success_count = 0
    error_count = 0
    batch_size = 10

    for i, post in enumerate(posts):
        idx = post["idx"]
        title = post["title"][:40]

        # Skip if already has content_blocks
        if "content_blocks" in post and post["content_blocks"]:
            print(f"  [{i+1}/{total}] SKIP (already has content_blocks): {title}")
            success_count += 1
            continue

        print(f"  [{i+1}/{total}] Scraping idx={idx}: {title}...")

        content_blocks, valid_images = scrape_post(post, session)

        if content_blocks:
            post["content_blocks"] = content_blocks
            post["images"] = valid_images
            success_count += 1
            img_count = sum(1 for b in content_blocks if b["type"] == "image")
            txt_count = sum(1 for b in content_blocks if b["type"] == "text")
            print(f"    -> {txt_count} text blocks, {img_count} images")
        else:
            post["content_blocks"] = []
            error_count += 1
            print(f"    -> No content found")

        # Save intermediate results every batch_size posts
        if (i + 1) % batch_size == 0:
            print(f"\n  --- Saving intermediate results ({i+1}/{total}) ---\n")
            with open(DATA_PATH, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        # Progress report every 10 posts
        if (i + 1) % 10 == 0:
            print(f"\n  === Progress: {i+1}/{total} (success={success_count}, errors={error_count}) ===\n")

        time.sleep(0.5)

    # Final save
    print(f"\nSaving final results...")
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\nDone! Processed {total} posts.")
    print(f"  Success: {success_count}")
    print(f"  Errors: {error_count}")
    print(f"  Backup: {BACKUP_PATH}")


if __name__ == "__main__":
    main()
