"""
S-Core Dream 웹폰트 경량화 (2단 구성)

- 기본 파일(core): KS X 1001 완성형 한글 2,350자 + 사이트에서 실제로 쓰는 글자 + 영문·숫자·기호.
  모든 페이지는 이 파일 하나만 받는다 (굵기당 약 250KB → 100KB).
- 보조 파일(rare): 원본 전체 폰트를 그대로 쓰되, unicode-range 를 "기본 파일에 없는 글자"로만 지정한다.
  페이지에 그런 글자(예: 똠·뷁)가 나올 때만 브라우저가 자동으로 내려받는다.
  → 나중에 새 글자가 쓰여도 손댈 필요가 없다. 이 스크립트를 다시 돌리는 건 자주 쓰게 된 글자를
    기본 파일로 옮겨 보조 파일 다운로드를 줄이고 싶을 때뿐이다.

사용법 (저장소 루트에서):
  python scripts/build_font_subset.py            # 서브셋 생성 + site/css/fonts.css·preload 갱신
  python scripts/build_font_subset.py --upload   # 위 작업 + 기본 파일을 R2 에 업로드 (배포 시)
  python scripts/build_font_subset.py --check    # fonts.css 가 가리키는 기본 파일이 R2 에 있는지 확인
  --no-live : 라이브 API(포트폴리오·커뮤니티·히어로) 글자 수집을 건너뛴다

⚠ fonts.css 를 배포하기 전에 반드시 --upload 로 기본 파일을 먼저 올리고 --check 로 확인할 것.
   (파일이 없으면 jsdelivr 전체 폰트로 폴백되어 깨지지는 않지만 경량화 효과가 사라진다)
"""

import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CSS_PATH = SITE / "css" / "fonts.css"
R2 = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev"  # 원본 폰트 내려받기용
CDN = "https://img.day1design.co.kr"  # 페이지가 폰트를 받는 주소 (R2 커스텀 도메인, 엣지 캐시)
R2_BUCKET = "day1design-r2"
JSDELIVR = "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2"
API = "https://api.day1design.co.kr"
WEIGHTS = [(300, "3Light"), (400, "4Regular"), (500, "5Medium"), (600, "6Bold"), (700, "7ExtraBold")]
SRC_CACHE = Path(tempfile.gettempdir()) / "day1design-font-src"
OUT_ROOT = Path(tempfile.gettempdir()) / "day1design-font-subset"

# 기본 파일에 항상 넣는 비(非)한글 글자. 사이트에서 실제로 쓰는 기호(→ ※ ㎡ 등)는 글자 수집으로
# 자동 포함되므로 여기는 최소로 둔다. 기호 블록을 통째로 넣으면 굵기당 약 35KB 커진다(2026-10-14 실측).
BASE_BLOCKS = [
    (0x0020, 0x007E),  # 영문·숫자·기본 기호
    (0x00A0, 0x00FF),  # 라틴 보충 (· × ° 등)
    (0x2010, 0x2027),  # 대시·따옴표·말줄임표
    (0x2030, 0x203B),  # ‰ ′ ″ ※
    (0x3000, 0x3011),  # 한중일 문장부호·괄호
    (0x3131, 0x318E),  # 한글 호환 자모 (ㅋㅋ, ㅎㅎ)
]
SCAN_EXT = {".html", ".js", ".mjs", ".json", ".css", ".txt", ".xml"}


def ksx1001_hangul():
    chars = set()
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(ord(bytes([hi, lo]).decode("euc-kr")))
            except UnicodeDecodeError:
                pass
    return chars


def scan_static():
    used = set()
    for p in SITE.rglob("*"):
        if p.is_file() and p.suffix.lower() in SCAN_EXT and "images" not in p.parts:
            try:
                used.update(ord(c) for c in p.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                pass
    return used


def _strings(node, out):
    if isinstance(node, str):
        out.update(ord(c) for c in node)
    elif isinstance(node, dict):
        for v in node.values():
            _strings(v, out)
    elif isinstance(node, list):
        for v in node:
            _strings(v, out)


def _get_json(path):
    req = urllib.request.Request(API + path, headers={"Origin": "https://day1design.co.kr", "User-Agent": "font-subset"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def scan_live():
    used = set()
    try:
        for page in range(1, 30):  # 페이지당 100건, 상한 30쪽
            j = _get_json(f"/api/portfolio?page={page}&limit=100")
            _strings(j.get("records", []), used)
            if not j.get("hasMore"):
                break
        _strings(_get_json("/api/community"), used)
        _strings(_get_json("/api/hero/slides"), used)
    except Exception as e:  # 라이브 수집 실패는 치명적이지 않다 (보조 파일이 받쳐 준다)
        print(f"  ! 라이브 API 글자 수집 실패, 정적 파일만 사용: {e}")
    return used


def fetch_source(name):
    SRC_CACHE.mkdir(parents=True, exist_ok=True)
    fp = SRC_CACHE / f"S-CoreDream-{name}.woff2"
    if not fp.exists():
        req = urllib.request.Request(f"{R2}/fonts/S-CoreDream-{name}.woff2", headers={"User-Agent": "font-subset"})
        with urllib.request.urlopen(req, timeout=60) as r:  # r2.dev 는 기본 Python UA 를 403 으로 거부
            fp.write_bytes(r.read())
    return fp


def to_ranges(codepoints):
    runs = []
    for c in sorted(codepoints):
        if runs and c == runs[-1][1] + 1:
            runs[-1][1] = c
        else:
            runs.append([c, c])
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in runs)


def build(live):
    ks = ksx1001_hangul()
    used = scan_static() | (scan_live() if live else set())
    sources = {name: fetch_source(name) for _, name in WEIGHTS}
    cmap = set(TTFont(sources["4Regular"]).getBestCmap())
    base = {c for c in cmap for a, b in BASE_BLOCKS if a <= c <= b}
    used_in_font = used & cmap
    core = (ks & cmap) | base | used_in_font
    rare = cmap - core

    used_hangul = {c for c in used_in_font if 0xAC00 <= c <= 0xD7A3}
    extra = sorted(used_hangul - ks)
    print(f"사이트에서 쓰는 한글 {len(used_hangul)}자 (KS X 1001 밖 {len(extra)}자: {''.join(map(chr, extra))})")
    print(f"기본 파일 {len(core)}자 / 보조 파일 범위 {len(rare)}자")

    blobs = {}
    for weight, name in WEIGHTS:
        # recalcTimestamp=False: 저장 시각이 파일에 박히면 같은 글자여도 해시(파일명)가 매번 바뀐다
        f = TTFont(sources[name], recalcTimestamp=False)
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=core)
        sub.subset(f)
        buf = io.BytesIO()
        f.flavor = "woff2"
        f.save(buf)
        blobs[name] = buf.getvalue()

    digest = hashlib.sha1(b"".join(blobs[n] for _, n in WEIGHTS)).hexdigest()[:10]
    out = OUT_ROOT / f"core-{digest}"
    out.mkdir(parents=True, exist_ok=True)
    for name, data in blobs.items():
        (out / f"S-CoreDream-{name}.woff2").write_bytes(data)
        orig = sources[name].stat().st_size
        print(f"  {name:11s} {orig // 1024:4d}KB → {len(data) // 1024:3d}KB")
    return digest, out, to_ranges(rare)


def write_css(digest, rare_range):
    core_dir = f"{CDN}/fonts/core-{digest}"
    faces = []
    for weight, name in WEIGHTS:
        faces.append(
            "@font-face {\n"
            '  font-family: "S-Core Dream";\n'
            f"  font-weight: {weight};\n"
            "  font-style: normal;\n"
            "  src:\n"
            f'    url("{core_dir}/S-CoreDream-{name}.woff2") format("woff2"),\n'
            f'    url("{JSDELIVR}/S-CoreDream-{name}.woff") format("woff");\n'
            "  font-display: swap;\n"
            "}\n"
            "@font-face {\n"
            '  font-family: "S-Core Dream";\n'
            f"  font-weight: {weight};\n"
            "  font-style: normal;\n"
            "  src:\n"
            f'    url("{CDN}/fonts/S-CoreDream-{name}.woff2") format("woff2"),\n'
            f'    url("{JSDELIVR}/S-CoreDream-{name}.woff") format("woff");\n'
            "  font-display: swap;\n"
            f"  unicode-range: {rare_range};\n"
            "}\n"
        )
    header = (
        "/* S-Core Dream - 에스코어드림 웹폰트 (자동 생성 파일 — 직접 고치지 말 것)\n"
        " * 생성: python scripts/build_font_subset.py  (원리·배포 순서는 스크립트 머리말 참고)\n"
        " *\n"
        " * 굵기마다 @font-face 두 개:\n"
        " *   1) 기본 파일 core-*: KS X 1001 한글 2,350자 + 사이트에서 쓰는 글자 + 영문·기호.\n"
        " *      모든 페이지는 이것만 받는다 (원본 약 250KB → 약 100KB).\n"
        " *   2) 원본 전체 폰트: unicode-range 가 '기본 파일에 없는 글자'뿐이라, 그런 글자가\n"
        " *      페이지에 나올 때만 브라우저가 자동으로 받는다. 새 글자가 생겨도 손댈 필요 없음.\n"
        " *   순서 중요: 기본 파일을 먼저, 원본을 뒤에 선언한다.\n"
        " *\n"
        " * 폰트는 항상 CORS 요청이다. img.day1design.co.kr/fonts/ 응답에는 Cloudflare 응답 헤더 규칙이\n"
        " * Access-Control-Allow-Origin: * 를 붙인다(엣지 캐시가 Origin 별 응답을 섞어도 안 깨지게).\n"
        " * 규칙이 사라지면 2순위 src 인 jsdelivr woff 로 자동 폴백한다.\n"
        " */\n"
    )
    CSS_PATH.write_text(header + "".join(faces), encoding="utf-8", newline="\n")


def update_html(digest):
    font_url = re.compile(
        "(?:" + re.escape(R2) + "|" + re.escape(CDN) + r")/fonts/(?:core-[0-9a-f]+/)?(S-CoreDream-\w+\.woff2)"
    )
    preload = re.compile(r"<link\b[^>]*>", re.S)
    css_ver = re.compile(r"(fonts\.css\?v=)[\w.-]+")
    changed = []
    for p in [SITE / "index.html", *sorted((SITE / "pages").glob("*.html"))]:
        text = p.read_bytes().decode("utf-8")  # 줄바꿈(CRLF/LF) 그대로 보존

        def fix_link(m):
            tag = m.group(0)
            if 'as="font"' not in tag:
                return tag
            return font_url.sub(lambda u: f"{CDN}/fonts/core-{digest}/{u.group(1)}", tag)

        new = css_ver.sub(lambda m: m.group(1) + f"core-{digest}", preload.sub(fix_link, text))
        if new != text:
            p.write_bytes(new.encode("utf-8"))
            changed.append(p.relative_to(ROOT).as_posix())
    print("갱신한 HTML:", ", ".join(changed) or "없음")


def load_env():
    env = dict(os.environ)
    for line in (SITE / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    # Global API Key 방식만 쓴다. 셸에 남은 토큰이 있으면 wrangler 가 그쪽을 우선해 실패한다.
    env.pop("CLOUDFLARE_API_TOKEN", None)
    env.pop("CF_API_TOKEN", None)
    return env


def upload(digest, out):
    wrangler = ROOT / "worker" / "node_modules" / ".bin" / ("wrangler.cmd" if os.name == "nt" else "wrangler")
    env = load_env()
    for _, name in WEIGHTS:
        key = f"{R2_BUCKET}/fonts/core-{digest}/S-CoreDream-{name}.woff2"
        cmd = [str(wrangler), "r2", "object", "put", key, "--file", str(out / f"S-CoreDream-{name}.woff2"),
               "--content-type", "font/woff2", "--cache-control", "public, max-age=31536000, immutable"]
        r = subprocess.run(cmd, cwd=ROOT / "worker", env=env, capture_output=True, text=True, encoding="utf-8")
        print(f"  업로드 {key}: {'OK' if r.returncode == 0 else '실패'}")
        if r.returncode != 0:
            print(r.stdout[-600:], r.stderr[-600:])
            sys.exit(1)


def check():
    css = CSS_PATH.read_text(encoding="utf-8")
    urls = sorted(set(re.findall(re.escape(CDN) + r"/fonts/core-[0-9a-f]+/S-CoreDream-\w+\.woff2", css)))
    if not urls:
        print("fonts.css 에 기본 파일 주소가 없습니다")
        sys.exit(1)
    bad = 0
    for u in urls:
        req = urllib.request.Request(u, headers={"Origin": "https://day1design.co.kr", "User-Agent": "font-subset"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                size, acao = len(r.read()), r.headers.get("Access-Control-Allow-Origin")
            ok = size > 10000 and acao
            print(f"  {'OK ' if ok else 'BAD'} {u.rsplit('/', 2)[-2]}/{u.rsplit('/', 1)[-1]} {size // 1024}KB CORS={acao}")
            bad += 0 if ok else 1
        except Exception as e:
            print(f"  BAD {u}: {e}")
            bad += 1
    sys.exit(1 if bad else 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--no-live", action="store_true")
    a = ap.parse_args()
    if a.check:
        check()
        return
    digest, out, rare_range = build(live=not a.no_live)
    write_css(digest, rare_range)
    update_html(digest)
    print(f"기본 파일 출력: {out}")
    if a.upload:
        upload(digest, out)
    else:
        print("배포 전에 --upload 로 R2 에 올리고 --check 로 확인하세요.")


if __name__ == "__main__":
    main()
