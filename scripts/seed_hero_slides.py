"""
hero-slides.json 초기 데이터 시드:
포트폴리오(시공사례) 프로젝트 35개 중 랜덤 10개 대표 이미지(001.webp) 선택.

추후 관리자 API(PUT /api/hero/slides)가 같은 JSON 파일을 갱신하면 자동 반영됨.
"""
import json
import random
import re
from pathlib import Path

ROOT = Path(r"F:\day1design_homepage")
MAIN_JS = ROOT / "site" / "js" / "main.js"
HERO_JSON = ROOT / "site" / "data" / "hero-slides.json"
R2_BASE = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev"

# main.js의 projectData 배열에서 folder 값 파싱
text = MAIN_JS.read_text(encoding="utf-8")
folders = re.findall(r'folder:\s*"([^"]+)"', text)
folders = list(dict.fromkeys(folders))  # dedup, order 보존
print(f"[seed] found {len(folders)} project folders")

random.seed(1)  # 재현 가능
sample = random.sample(folders, k=min(10, len(folders)))

slides = [
    {
        "image": f"{R2_BASE}/images/portfolio/{folder}/001.webp",
        "href": "pages/portfolio.html",
        "alt": folder.replace("-", " "),
    }
    for folder in sample
]

data = {
    "config": {
        "maxSlides": 10,
        "autoPlayMs": 6000,
        "note": "관리자 대시보드가 이 JSON을 PUT으로 갱신하면 자동 반영. 초기값은 시공사례 랜덤 10장 시드."
    },
    "slides": slides,
}

HERO_JSON.write_text(
    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(f"[seed] wrote {len(slides)} slides to {HERO_JSON}")
for s in slides:
    print(f"  - {s['image']}")
