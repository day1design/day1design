"""
community.json 내 imweb CDN URL을 → R2 public URL로 재매핑.
- thumb:         posts/{idx}_thumb.{webp|png}
- images[i]:     posts/{idx}_{i+1:03d}.{webp|png}  (i = 0-based)
- content_blocks[type=image].src: images[]와 동일 URL → 같은 매핑

실제 로컬 파일 존재 확인 후 R2 URL 생성.
없는 파일은 WARN 로그 + 원본 URL 유지.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(r"F:\day1design_homepage\site")
JSON_PATH = ROOT / "data" / "community.json"
POSTS_DIR = ROOT / "images" / "community" / "posts"
R2_BASE = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/community/posts/"
EXT_ORDER = (".webp", ".png", ".jpg")

def local_for(idx: str, stem: str) -> str | None:
    """stem = 'thumb' or '001'. Returns R2 URL if local file exists, else None."""
    for ext in EXT_ORDER:
        p = POSTS_DIR / f"{idx}_{stem}{ext}"
        if p.exists():
            return R2_BASE + f"{idx}_{stem}{ext}"
    return None

# backup
backup = JSON_PATH.with_suffix(".json.bak")
if not backup.exists():
    shutil.copy(JSON_PATH, backup)
    print(f"[backup] {backup}")

with open(JSON_PATH, encoding="utf-8") as f:
    data = json.load(f)

posts = data.get("posts", [])
thumb_ok = thumb_missing = 0
img_ok = img_missing = 0
cb_ok = cb_missing = 0
missing_samples = []

for post in posts:
    idx = str(post["idx"])

    if post.get("thumb"):
        url = local_for(idx, "thumb")
        if url:
            post["thumb"] = url
            thumb_ok += 1
        else:
            thumb_missing += 1
            if len(missing_samples) < 5:
                missing_samples.append(f"thumb[{idx}]")

    url_to_local = {}
    for i, orig_url in enumerate(post.get("images", []), 1):
        stem = f"{i:03d}"
        mapped = local_for(idx, stem)
        if mapped:
            url_to_local[orig_url] = mapped
            post["images"][i - 1] = mapped
            img_ok += 1
        else:
            img_missing += 1
            if len(missing_samples) < 10:
                missing_samples.append(f"img[{idx}_{stem}]")

    for block in post.get("content_blocks", []):
        if block.get("type") == "image" and "src" in block:
            orig_src = block["src"]
            if orig_src in url_to_local:
                block["src"] = url_to_local[orig_src]
                cb_ok += 1
            else:
                cb_missing += 1

with open(JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"[done] thumb: ok={thumb_ok}, missing={thumb_missing}")
print(f"[done] images: ok={img_ok}, missing={img_missing}")
print(f"[done] content_blocks images: ok={cb_ok}, missing={cb_missing}")
if missing_samples:
    print(f"[missing samples] {missing_samples}")
