"""
WebP 이미지 500KB 이하로 재압축
- 500KB 초과 파일만 대상
- 품질을 점진적으로 낮추며 500KB 이하가 될 때까지 반복
- max-width 1600px로 리사이징
"""
import os
from pathlib import Path
from PIL import Image

TARGET_KB = 500
MAX_WIDTH = 1600
IMG_DIR = Path(r"F:\day1design_homepage\site\images")

compressed = 0
skipped = 0
total_saved = 0

for webp in IMG_DIR.rglob("*.webp"):
    size_kb = webp.stat().st_size / 1024
    if size_kb <= TARGET_KB:
        skipped += 1
        continue

    original_kb = size_kb
    try:
        with Image.open(webp) as img:
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGBA')
            else:
                img = img.convert('RGB')

            w, h = img.size
            if w > MAX_WIDTH:
                ratio = MAX_WIDTH / w
                img = img.resize((MAX_WIDTH, int(h * ratio)), Image.LANCZOS)

            # Try decreasing quality until under 500KB
            for quality in [80, 70, 60, 50, 40]:
                img.save(webp, 'WEBP', quality=quality)
                new_kb = webp.stat().st_size / 1024
                if new_kb <= TARGET_KB:
                    break

        new_kb = webp.stat().st_size / 1024
        saved = original_kb - new_kb
        total_saved += saved
        compressed += 1
        if compressed % 100 == 0:
            print(f"  Progress: {compressed} files compressed...")
    except Exception as e:
        print(f"  [ERR] {webp.name}: {e}")

print(f"\nDone: {compressed} compressed, {skipped} already OK")
print(f"Total saved: {total_saved/1024:.1f} MB")
