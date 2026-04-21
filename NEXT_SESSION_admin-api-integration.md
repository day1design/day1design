# Next Session: 관리자 API 연동 + 남은 작업

## 이번 세션(2026-04-21) 완료 작업

### Vercel/인프라

- 옛 pola 계정 → `day1designco-3854's projects` 팀으로 재연동
- GitHub `day1design/day1design` main push → Vercel 자동 배포 (rootDirectory=`site`)
- Public URL: https://day1design.vercel.app (SSO 예외 도메인)

### R2 이미지 이관

- 버킷 `day1design-r2` (APAC), public URL: `https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev/images/...`
- JPG→WebP 변환 1,012장 (334MB 절감)
- 중복 JPG 3,518장 삭제
- 최종: 5,137개 / 520MB 업로드
- `community.json` imweb CDN URL 3,810건 → R2 URL 재매핑 (2건 손상만 잔존)

### UI / UX

- 헤더 메뉴 4개 영문 + 호버 한글 크로스페이드 (Option A)
  - ABOUT US/PORTFOLIO/COMMUNITY/ESTIMATE ↔ 회사소개/포트폴리오/커뮤니티/견적문의
- ABOUT sub-tabs(LNB): DAYONE IS / PROJECT FLOW (sticky)
- PORTFOLIO filter-tabs(LNB) + 평수 서브필터(HOUSE 전체/20~30/30~40/40~50/50+)
- COMMUNITY 필터 탭 제거 (Residential 고정)
- 하위 페이지 `header scrolled` hardcoded 제거 → 메인과 동일 동작
- 헤더 메뉴 active 밑줄 제거 → bold + 색상만
- LNB 스타일:
  - 기본: #b8b1a2
  - hover: brand-beige(#5A5448) + font 13→15px + weight 700
  - active: brand-beige + bold + 배경 #efe6d0
- 메인 히어로 슬라이더 (data/hero-slides.json, 최대 10장, 자동 6초, crossfade + hover 일시정지 + pill 인디케이터)
- 시공사례 10장 랜덤 시드 (`scripts/seed_hero_slides.py`)
- 헤더 호버 드롭다운 LNB: common.js 런타임 injection으로 전 페이지 자동 적용
  - ABOUT US: DAYONE IS / PROJECT FLOW
  - PORTFOLIO: HOUSE 전체 / 20~30평 / 30~40평 / 40~50평 / 50평 이상 / OFFICE
  - URL 파라미터 `?cat=office` / `?size=30-40` 자동 필터 적용

### 파일 정리

- 루트 62→5개 (site/ scripts/ docs/ \_archive/ \_private/ + .gitignore)
- 민감 문서(사업자등록증, 기획안 7.8GB) → `_private/`
- 개발 아티팩트 → `_archive/`
- `.gitignore`: images/, .env\*, \_private/, \_archive/, docs/ 제외

## 관리자 대시보드 범위 (5개 메뉴 확정)

사용자 결정(2026-04-21): 백엔드 스택 = **Cloudflare Worker + R2 + Airtable**

1. **히어로 이미지** — 업로드/수정/삭제/순서 조정
2. **시공포트폴리오** — 기존 업로드 현장 모두 게시글화, 편집 가능
3. **커뮤니티** — 업로드/수정/삭제/편집
4. **상담신청 관리** — 접수 내역 + 상태/담당자/메모
5. **유입통계** — 도메인 연결 후 GA4/CF Analytics 연동

원칙: **관리자 입력 필드 = 프론트엔드가 실제 렌더에 쓰는 필드**. 둘이 일치해야 빈 값/깨진 게시글이 안 생김.

**중요**: 포트폴리오 ≠ 커뮤니티. 구조 통합하지 말 것. 포트폴리오는 현재 `projectData`(name/folder/count) 필드 그대로. 커뮤니티는 `content_blocks[]` 블록 에디터 구조 그대로.

## 확정 스키마 (프론트엔드 렌더 기준)

### ① HeroSlides (기존: `site/data/hero-slides.json`)

```
config: { maxSlides: 10, autoPlayMs: 6000 }
slides[]: { image, href?, alt? }
```

- `image` R2 public URL 필수
- `href` 비우면 클릭 불가
- 관리자 UI 스켈레톤 완료: `site/admin/hero-slides.html` (JS 미작성)

### ② Portfolio (기존: `site/js/main.js`의 하드코딩 `projectData`)

```
{ name, folder, count, category(HOUSE|OFFICE), order,
  rightFolder?, rightCount?, rightName?  // 카드에 2개 묶을 때만
}
```

- 이미지 경로 규칙 (유지):
  - 상세: `/images/portfolio/{folder}/{001..count}.webp`
  - 썸네일: `/images/portfolio-thumbs/{NN}_after.webp`, `{NN}_before.webp`
  - OFFICE 50장 고정: `/images/office/{001..050}.webp`
- 평수 필터는 현재 `folder` 정규식 `/(\d+)py/i`에서 추출 (유지)
- 관리자 업로드 시 파일명 규칙 자동 적용 + count 자동 증가

### ③ Community (기존: `site/data/community/{idx}.json` + `community-list.json`)

```
{ idx, title, category, date(YYYY-MM-DD), board(Residential|Commercial),
  thumb, images[], views, excerpt,
  content_blocks[]: [
    { type: "text",  content: string } |
    { type: "image", src: string }
  ]
}
```

- 관리자 UI는 **블록 에디터 필수** — text/image 인터리브 순서가 본문 그 자체
- `community-list.json`(52KB, 86 posts) = 목록용 경량 (excerpt/thumb/meta만)
- `community/{idx}.json` = 상세용 풀버전 (content_blocks 포함)
- `category` 값 예시: `"주거-디자인제안"`, `"주거-포트폴리오"`, `"상업-..."`
- 사이드 관련사례 필터: 같은 `board` + 본인 제외

### ④ Estimates (신규 Airtable 테이블)

프론트 → Worker 수신 필드 (`site/js/estimates.js:buildSubmitPayload`):

```
텍스트: submittedAt, name, phone, email,
       space_type, space_size, postcode, address, address_detail,
       schedule, referral, branch, detail,
       privacy_agreed, concept_files_count, floor_plans_count
파일:   concept_files[] (이미지만, multipart),
       floor_plans[] (이미지/PDF/도면, multipart)
```

관리자 전용 추가 필드:

- `status`: "접수대기" / "상담중" / "견적완료" / "계약완료" / "취소"
- `assignee`, `contacted_at`, `memo`, `estimate_amount?`

### ⑤ Analytics (도메인 연결 후)

- GA4 Data API 또는 Cloudflare Web Analytics
- 지표: PV, UV, 유입경로, 체류, 이탈, 상담신청 전환율

### (관리 제외) content.json

사용자 결정: 연락처/지점/팝업/폼 옵션은 **JSON 직접 수정**, 관리자 UI 대상 아님.

## 2026-04-21 세션 추가 완료

### ✅ Worker API (신규) — `worker/`

- `worker/wrangler.toml`, `package.json`, `.dev.vars.example`, `.gitignore`
- `worker/src/index.js` — 라우터
- `worker/src/lib/` — cors, response, security(허니팟·rate limit·escapeHtml), auth(관리자 토큰), airtable, r2, telegram
- `worker/src/routes/` — estimates, hero, portfolio, community, auth, upload
- 보안 7-Layer 전부 적용 (CORS 화이트리스트, Content-Type, 허니팟, 타임스탬프, Rate Limit IP별 10회/시간, escapeHtml, 500 에러 텔레그램 알림)
- 텔레그램 네임태그 `[day1design/estimates]`

### ✅ 관리자 UI — `site/admin/`

- `config.js` — API_BASE 교체 포인트
- `admin.js` — 공통 API wrapper (x-admin-token 헤더 + 쿠키 병용, 401 자동 리다이렉트, 토스트)
- `login.html` — 토큰 입력 로그인
- `index.html` — 대시보드 (5개 메뉴 카드 + 건수 표시 + API 상태)
- `hero-slides.html` (기존) + `hero-slides.js` (신규 연결)
- `portfolio.html` + `portfolio.js` — 테이블 + 편집 모달
- `community.html` + `community.js` — 목록 + 필터 + 삭제
- `community-edit.html` + `community-edit.js` — **블록 에디터** (text/image 순서, ↑↓✕, 이미지 업로드)
- `estimates.html` + `estimates.js` — 목록 + 상세 패널 (파일 프리뷰 + 상태/담당자/메모 변경)
- `admin.css` — 확장 (dash-grid, data-table, modal, block-editor, est-layout, 상태 배지 등)

### ✅ Airtable 스키마 + 마이그레이션

- `worker/AIRTABLE_SCHEMA.md` — 4개 테이블 필드 정의 (Estimates/HeroSlides/Portfolio/Community)
- `scripts/migrate-to-airtable.js` — 기존 JSON 데이터 업로드 (`--target=hero|portfolio|community|all`, `--dry-run`)

### ✅ 프론트 연결 포인트

- `site/js/config.js` (신규) — `window.DAY1_API_BASE` 설정
- `site/pages/estimates.html` — config.js 로드
- `site/js/estimates.js` — `ESTIMATES_ENDPOINT`가 `DAY1_API_BASE` 참조

## 사용자 배포 순서 (다음에 직접 실행)

### 1) Airtable Base 생성

1. [airtable.com](https://airtable.com) → Create base → `day1design`
2. `worker/AIRTABLE_SCHEMA.md` 스키마 그대로 4개 테이블 생성
   - Estimates / HeroSlides / Portfolio / Community
3. Account → Developer hub → Personal access token
   - Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
   - Access: `day1design` base만
4. URL에서 Base ID 추출 (`appXXXXXXXXXXXXXX`)

### 2) Worker 로컬 설정

```bash
cd F:/day1design_homepage/worker
cp .dev.vars.example .dev.vars
# .dev.vars 편집: AIRTABLE_TOKEN, AIRTABLE_BASE_ID, ADMIN_TOKEN(직접 랜덤 생성)
npm install
wrangler login   # 최초 1회, 이미 로그인됐다면 스킵
```

### 3) 기존 데이터 마이그레이션

```bash
cd F:/day1design_homepage
# .env.local에 AIRTABLE_TOKEN, AIRTABLE_BASE_ID 추가 (worker/.dev.vars와 동일 값)
node scripts/migrate-to-airtable.js --target=hero --dry-run    # 확인
node scripts/migrate-to-airtable.js --target=all               # 실행 (총 131건)
```

### 4) Worker 배포

```bash
cd F:/day1design_homepage/worker
wrangler secret put AIRTABLE_TOKEN
wrangler secret put AIRTABLE_BASE_ID
wrangler secret put ADMIN_TOKEN
# 선택:
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID

wrangler deploy
# → 출력되는 Worker URL 메모 (예: https://day1design-api.xxx.workers.dev)
```

### 5) 프론트 설정 및 재배포

`site/admin/config.js`와 `site/js/config.js`의 URL을 Worker URL로 교체:

```js
// site/admin/config.js
window.ADMIN_API_BASE = "https://day1design-api.xxx.workers.dev";

// site/js/config.js
window.DAY1_API_BASE = "https://day1design-api.xxx.workers.dev";
```

Vercel로 push → 자동 배포.

### 6) 검증

- `https://day1design.vercel.app/admin/login.html` → ADMIN_TOKEN 입력 → 대시보드
- 각 메뉴 데이터 로드 확인 (Airtable 마이그레이션 데이터)
- 상담신청 폼 테스트 제출 → Airtable `Estimates` 테이블 확인 + 텔레그램 알림 수신

## 다음 세션 TODO (프론트 전면 API 전환)

현재 프론트는 여전히 **정적 JSON 기반**입니다. 관리자가 편집한 내용을 프론트에 반영하려면:

- [ ] `site/js/main.js`의 하드코딩 `projectData`를 `GET /api/portfolio` fetch로 전환
- [ ] `site/js/main.js`의 hero-slider fetch를 `GET /api/hero/slides`로 전환 (fallback: 기존 JSON)
- [ ] `site/js/community.js`의 `community-list.json` fetch를 `GET /api/community`로 전환
- [ ] `site/pages/community-detail.html`의 inline script를 `GET /api/community/:idx`로 전환
- [ ] 로딩 상태 UI / 실패 시 정적 JSON fallback 처리
- [ ] 각 페이지 HTML에 `config.js` 로드 추가

→ 이 작업은 **Airtable 마이그레이션 완료 후 안전하게 진행** (마이그레이션 전 전환하면 빈 화면).

## 추가 TODO

- [ ] CF Worker 배포 후 실제 URL 확정 → `ALLOWED_ORIGINS`에 프로덕션 도메인 추가 반영
- [ ] 관리자 페이지를 `/admin/*` 경로에서 CF Access로 보호 업그레이드 (옵션)
- [ ] 이미지 업로드 시 자동 webp 변환 옵션 (현재는 원본 그대로 저장)
- [ ] 포트폴리오 bulk 이미지 업로드 UI (현재는 개별 필드만)

### 3. 커스텀 도메인 day1design.co.kr → Vercel

- 현재 Vercel 프로젝트 `day1design`(team_fuEnkCHCSVhgGlS7m39Jhz1e)에 도메인 추가
- DNS에서 CNAME(또는 A) 레코드 Vercel로
- 커스텀 도메인 연결 후 SSO 보호(`all_except_custom_domains`) 자동 해제 → 공개 접근

### 4. community 본문 이미지 손상 1건(`164087464_003`)

- 원본 JPG 손상 상태(Pillow decompression bomb 에러)
- imweb에서 재다운로드 또는 해당 이미지 제거 필요

## 참고 경로

- 프로젝트 루트: `F:\day1design_homepage\`
- 라이브: https://day1design.vercel.app
- GitHub: git@github-day1design:day1design/day1design.git (main = production)
- Vercel 팀: `day1designco-3854's projects` / 프로젝트 `day1design` / rootDirectory `site`
- R2: day1design-r2 (APAC) / pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev
- 환경변수: `site/.env.local`
- Git Author: `day1design.co@gmail.com`

## 관련 메모리

- `project_migration_status.md`
- `project_env_setup.md`
- `feedback_file_relocations.md`
- `feedback_asset_preservation.md`
