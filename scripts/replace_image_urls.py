"""
이미지 경로를 R2 public URL로 치환
- (../)?images/...(jpg|jpeg|png|webp|gif|svg) 패턴만 치환
- 대상 확장자: .html .css .js .json
- 대상 디렉토리: site/
- --dry-run 지원
"""
import re
import sys
from pathlib import Path

R2_BASE = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/"
SITE_DIR = Path(r"F:\day1design_homepage\site")
TARGET_EXTS = {".html", ".css", ".js", ".json"}
# (../)?images/<path>.<ext>
PATTERN = re.compile(
    r'(\.\./)?images/([^\s"\'`)]+?\.(?:jpg|jpeg|png|webp|gif|svg))',
    re.IGNORECASE,
)

dry_run = "--dry-run" in sys.argv

def replace_in_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8", errors="ignore")
    new_text, count = PATTERN.subn(lambda m: R2_BASE + m.group(2), text)
    if count and not dry_run:
        path.write_text(new_text, encoding="utf-8")
    return count

total_files = 0
total_replacements = 0
for path in SITE_DIR.rglob("*"):
    if path.is_file() and path.suffix.lower() in TARGET_EXTS:
        count = replace_in_file(path)
        if count:
            total_files += 1
            total_replacements += count
            print(f"  [{count:>3}] {path.relative_to(SITE_DIR)}")

mode = "DRY" if dry_run else "APPLIED"
print(f"\n[{mode}] files={total_files}, replacements={total_replacements}")
