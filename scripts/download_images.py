"""
Day1Design 이미지 일괄 다운로드 + WebP 변환 스크립트
- portfolio 이미지: 프로젝트별 폴더로 정리
- 공통 이미지: 카테고리별 폴더로 정리
- 원본 다운로드 후 WebP 변환 (품질 80, max 1920px)
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False
    print("[WARN] Pillow not installed. WebP conversion will be skipped.")

BASE_DIR = Path(r"F:\day1design_homepage\site\images")
PORTFOLIO_DIR = BASE_DIR / "portfolio"
MAX_WIDTH = 1920
WEBP_QUALITY = 80
MAX_WORKERS = 8
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://day1design.co.kr/"
}


def slugify(text):
    text = text.strip().lower()
    text = re.sub(r'[^\w\s가-힣-]', '', text)
    text = re.sub(r'[\s]+', '-', text)
    return text


def download_file(url, dest_path):
    if dest_path.exists():
        return "skip"
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        with open(dest_path, 'wb') as f:
            f.write(data)
        return "ok"
    except Exception as e:
        return f"error: {e}"


def convert_to_webp(src_path, dest_path=None):
    if not HAS_PILLOW:
        return
    if dest_path is None:
        dest_path = src_path.with_suffix('.webp')
    if dest_path.exists():
        return
    try:
        with Image.open(src_path) as img:
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGBA')
            else:
                img = img.convert('RGB')
            w, h = img.size
            if w > MAX_WIDTH:
                ratio = MAX_WIDTH / w
                img = img.resize((MAX_WIDTH, int(h * ratio)), Image.LANCZOS)
            img.save(dest_path, 'WEBP', quality=WEBP_QUALITY)
    except Exception as e:
        print(f"  [WEBP ERROR] {src_path.name}: {e}")


def download_and_convert(url, dest_path):
    result = download_file(url, dest_path)
    if result == "ok" and HAS_PILLOW:
        webp_path = dest_path.with_suffix('.webp')
        convert_to_webp(dest_path, webp_path)
    return url, dest_path, result


def process_portfolio():
    data_path = Path(r"F:\day1design_homepage\day1design_portfolio_data.json")
    with open(data_path, 'r', encoding='utf-8') as f:
        projects = json.load(f)

    tasks = []
    for proj in projects:
        folder_name = slugify(proj['project_name'])
        proj_dir = PORTFOLIO_DIR / folder_name
        for i, img_url in enumerate(proj['images'], 1):
            # upload/ URLs are 403, use thumbnail/ instead
            img_url = img_url.replace('/upload/', '/thumbnail/')
            ext = '.jpg'
            if '.png' in img_url.lower():
                ext = '.png'
            filename = f"{i:03d}{ext}"
            dest = proj_dir / filename
            tasks.append((img_url, dest))

    return tasks


def process_common_images():
    inv_path = Path(r"F:\day1design_homepage\image-inventory.json")
    with open(inv_path, 'r', encoding='utf-8') as f:
        inventory = json.load(f)

    tasks = []
    for img in inventory['images']:
        url = img['url']
        purpose = img.get('purpose', 'misc')
        suggested = img.get('suggestedFilename', '')

        if 'logo' in purpose:
            folder = BASE_DIR / "logo"
        elif 'hero' in purpose:
            folder = BASE_DIR / "hero"
        elif 'about' in purpose:
            folder = BASE_DIR / "about"
        elif 'community' in purpose:
            folder = BASE_DIR / "community"
        elif 'map' in purpose:
            folder = BASE_DIR / "maps"
        elif 'icon' in purpose or 'sns' in purpose:
            folder = BASE_DIR / "icons"
        elif 'popup' in purpose:
            folder = BASE_DIR / "hero"
        elif 'estimates' in purpose:
            folder = BASE_DIR / "about"
        elif 'portfolio' in purpose:
            continue  # handled by process_portfolio
        else:
            folder = BASE_DIR / "misc"

        if suggested:
            filename = suggested
        else:
            filename = url.split('/')[-1]

        dest = folder / filename
        tasks.append((url, dest))

    return tasks


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    tasks = []
    if mode in ("all", "common"):
        print("=== Common images ===")
        common_tasks = process_common_images()
        print(f"  {len(common_tasks)} images to process")
        tasks.extend(common_tasks)

    if mode in ("all", "portfolio"):
        print("=== Portfolio images ===")
        portfolio_tasks = process_portfolio()
        print(f"  {len(portfolio_tasks)} images to process")
        tasks.extend(portfolio_tasks)

    if not tasks:
        print("No tasks to process.")
        return

    print(f"\nTotal: {len(tasks)} images")
    print(f"Workers: {MAX_WORKERS}")
    print(f"WebP conversion: {'enabled' if HAS_PILLOW else 'disabled'}")
    print()

    ok = skip = err = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(download_and_convert, url, dest): (url, dest)
            for url, dest in tasks
        }
        for i, future in enumerate(as_completed(futures), 1):
            url, dest, result = future.result()
            if result == "ok":
                ok += 1
            elif result == "skip":
                skip += 1
            else:
                err += 1
                print(f"  [ERR] {dest.name}: {result}")

            if i % 50 == 0:
                elapsed = time.time() - start
                print(f"  Progress: {i}/{len(tasks)} ({ok} ok, {skip} skip, {err} err) [{elapsed:.0f}s]")

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.0f}s: {ok} downloaded, {skip} skipped, {err} errors")


if __name__ == "__main__":
    main()
