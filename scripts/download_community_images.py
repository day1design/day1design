"""
커뮤니티 게시글 썸네일 + 본문 이미지 다운로드
- thumbnail URL 사용 (upload → thumbnail 변환)
- 게시글별 폴더 구분 없이 community/ 폴더에 저장
- 파일명: idx_순번.jpg
"""
import json
import os
import time
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

DEST = Path(r"F:\day1design_homepage\site\images\community\posts")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://day1design.co.kr/"
}
MAX_WORKERS = 8
WEBP_QUALITY = 70
MAX_WIDTH = 1600


def download_and_convert(url, dest_path):
    if dest_path.exists():
        return "skip"
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        # S{siteId} paths work with /upload/, date paths work with /thumbnail/
        if '/S20' in url:
            url = url.replace('/thumbnail/', '/upload/')
        else:
            url = url.replace('/upload/', '/thumbnail/')
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        with open(dest_path, 'wb') as f:
            f.write(data)
        # Convert to WebP
        if HAS_PILLOW:
            webp = dest_path.with_suffix('.webp')
            if not webp.exists():
                with Image.open(dest_path) as img:
                    if img.mode in ('RGBA', 'P'):
                        img = img.convert('RGBA')
                    else:
                        img = img.convert('RGB')
                    w, h = img.size
                    if w > MAX_WIDTH:
                        ratio = MAX_WIDTH / w
                        img = img.resize((MAX_WIDTH, int(h * ratio)), Image.LANCZOS)
                    img.save(webp, 'WEBP', quality=WEBP_QUALITY)
        return "ok"
    except Exception as e:
        return f"err: {e}"


def main():
    with open(r"F:\day1design_homepage\site\data\community.json", 'r', encoding='utf-8') as f:
        data = json.load(f)

    tasks = []
    for post in data['posts']:
        idx = post['idx']
        # Thumbnail
        if post.get('thumb'):
            ext = '.png' if '.png' in post['thumb'] else '.jpg'
            tasks.append((post['thumb'], DEST / f"{idx}_thumb{ext}"))
        # Content images
        for i, img_url in enumerate(post.get('images', []), 1):
            ext = '.png' if '.png' in img_url else '.jpg'
            tasks.append((img_url, DEST / f"{idx}_{i:03d}{ext}"))

    print(f"Total: {len(tasks)} images to download")

    ok = skip = err = 0
    start = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(download_and_convert, url, dest): (url, dest) for url, dest in tasks}
        for i, future in enumerate(as_completed(futures), 1):
            result = future.result()
            if result == "ok": ok += 1
            elif result == "skip": skip += 1
            else: err += 1
            if i % 100 == 0:
                print(f"  Progress: {i}/{len(tasks)} ({ok} ok, {skip} skip, {err} err) [{time.time()-start:.0f}s]")

    print(f"\nDone in {time.time()-start:.0f}s: {ok} downloaded, {skip} skipped, {err} errors")


if __name__ == "__main__":
    main()
