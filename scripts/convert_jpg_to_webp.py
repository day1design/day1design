"""
JPG → WebP 변환 (대응 WebP가 없는 JPG만 대상)
- quality=80, max-width=1600
- 원본 JPG는 보존 (삭제는 별도 단계에서)
- 변환 후 .webp 파일이 같은 경로에 생성됨
"""
import sys
from pathlib import Path
from PIL import Image

TARGET_QUALITY = 80
MAX_WIDTH = 1600
IMG_DIR = Path(r"F:\day1design_homepage\site\images")

targets = []
for jpg in IMG_DIR.rglob("*.jpg"):
    webp = jpg.with_suffix(".webp")
    if not webp.exists():
        targets.append(jpg)

print(f"[convert] target JPG count (no webp pair): {len(targets)}", flush=True)

converted = 0
errors = 0
total_input = 0
total_output = 0

for i, jpg in enumerate(targets, 1):
    webp = jpg.with_suffix(".webp")
    try:
        size_in = jpg.stat().st_size
        total_input += size_in

        with Image.open(jpg) as img:
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")

            w, h = img.size
            if w > MAX_WIDTH:
                ratio = MAX_WIDTH / w
                img = img.resize((MAX_WIDTH, int(h * ratio)), Image.LANCZOS)

            img.save(webp, "WEBP", quality=TARGET_QUALITY)

        total_output += webp.stat().st_size
        converted += 1

        if i % 50 == 0 or i == len(targets):
            saved_mb = (total_input - total_output) / 1048576
            print(f"  [{i}/{len(targets)}] converted. saved so far: {saved_mb:.1f} MB", flush=True)
    except Exception as e:
        errors += 1
        print(f"  [ERR] {jpg}: {e}", flush=True)

saved_mb = (total_input - total_output) / 1048576
print(f"\n[done] converted={converted}, errors={errors}", flush=True)
print(f"[done] input={total_input/1048576:.1f}MB, output={total_output/1048576:.1f}MB, saved={saved_mb:.1f}MB", flush=True)
