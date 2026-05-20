# Day1Design 자체 히트맵 시스템 명세 v1.0

- 작성일: 2026-05-20
- 상태: **DRAFT** (사용자 승인 후 구현 진입)
- 관련: `worker/D1_SCHEMA.md`, `site/pages/privacy.html`

## 1. 목적

사이트 페이지별로 방문자의 **클릭 위치**와 **스크롤 깊이**를 자체 수집·집계하여, 관리자 대시보드에서 PC/Mobile 와이어프레임 위에 색 농도로 시각화한다. Microsoft Clarity 의존도를 줄이고 마케팅·UX 의사결정 데이터를 우리 D1에 영속화한다.

## 2. 범위

### In scope (이번 작업)

- 클릭 히트맵 (좌표 % 기반)
- 스크롤 깊이 (페이지별 최대 도달 % 집계)
- PC / Mobile 디바이스 분리 (viewport width 768px 기준)
- 사이트 7개 페이지 트래커 삽입
- 페이지별 스크린샷 1회 수동 캡쳐 → R2 업로드
- 관리자 `/admin/heatmap` 화면

### Out of scope (이번 작업 X)

- 마우스 무브먼트 캡쳐 (rrweb 영역, 부담 큼)
- 자동 스크린샷 cron (수동 캡쳐로 시작)
- 실시간 스트리밍 (배치 집계만)
- 모바일 앱 (웹사이트만)

## 3. 컴포넌트

```
[브라우저] → tracker.js (1KB)
   ↓ sendBeacon (배치 5초 단위)
[CF Worker /api/heatmap/track]
   ↓ 7-Layer 방어 (cors, rate-limit, content-type, IP)
[D1: HeatmapEvents]
   ↓ admin이 조회
[Admin /admin/heatmap.html]
   - 페이지 리스트
   - PC + Mobile 스크린샷 양옆 배치
   - heatmap.js 캔버스 오버레이
```

## 4. D1 스키마

### 4.1 `HeatmapEvents` (이벤트 원본)

| 컬럼             | 타입    | 의미                                 | 비고                       |
| ---------------- | ------- | ------------------------------------ | -------------------------- |
| `id`             | TEXT PK | `rec` + 14자 알파뉴메릭              | Estimates 패턴 동일        |
| `Page`           | TEXT    | 페이지 경로 (`/`, `/pages/about` 등) | 쿼리스트링 제거 후 저장    |
| `EventType`      | TEXT    | `'click'` \| `'scroll'`              | enum                       |
| `Device`         | TEXT    | `'pc'` \| `'mobile'`                 | viewport width 768 기준    |
| `XPct`           | REAL    | 페이지 너비 대비 X (0~1)             | click only, scroll 시 NULL |
| `YPct`           | REAL    | 페이지 높이 대비 Y (0~1)             | click only                 |
| `ScrollDepthPct` | REAL    | 페이지 높이 대비 최대 도달 (0~1)     | scroll only                |
| `PageW`          | INTEGER | 페이지 전체 너비 px                  | 좌표 검증·표시용           |
| `PageH`          | INTEGER | 페이지 전체 높이 px                  | 동일                       |
| `ViewportW`      | INTEGER | 뷰포트 너비                          | 디바이스 분류 검증         |
| `ViewportH`      | INTEGER | 뷰포트 높이                          |                            |
| `SessionId`      | TEXT    | localStorage UUID                    | 익명, 36자                 |
| `IP`             | TEXT    | 평문 IP                              | 약관에 명시됨, 위치 분석용 |
| `Country`        | TEXT    | CF cf.country                        | 국가 코드 (KR, US 등)      |
| `Region`         | TEXT    | CF cf.region                         | 시/도                      |
| `City`           | TEXT    | CF cf.city                           |                            |
| `Referrer`       | TEXT    | document.referrer host               | 도메인만                   |
| `UtmSource`      | TEXT    | utm_source                           | URL 쿼리에서 추출          |
| `UtmMedium`      | TEXT    | utm_medium                           |                            |
| `UtmCampaign`    | TEXT    | utm_campaign                         |                            |
| `CreatedAt`      | TEXT    | ISO timestamp                        | 서버 기준                  |

**인덱스**:

- `idx_heatmap_page_device(Page, Device, EventType)` — 화면 조회 핵심
- `idx_heatmap_created_at(CreatedAt)` — 90일 보존 정리

### 4.2 `HeatmapScreenshots` (페이지별 스크린샷 메타)

| 컬럼         | 타입           | 의미                 |
| ------------ | -------------- | -------------------- |
| `Page`       | TEXT           | 페이지 경로          |
| `Device`     | TEXT           | `'pc'` \| `'mobile'` |
| `Url`        | TEXT           | R2 절대 URL          |
| `PageW`      | INTEGER        | 캡쳐 시 페이지 너비  |
| `PageH`      | INTEGER        | 캡쳐 시 페이지 높이  |
| `CapturedAt` | TEXT           | ISO                  |
| **PK**       | (Page, Device) | 페이지×디바이스 1행  |

### 4.3 마이그레이션 파일

`worker/migrations/0009_heatmap.sql`

## 5. Worker API 계약

### 5.1 `POST /api/heatmap/track` — 공개 트래커 (이벤트 수집)

**Request body** (배치 array):

```json
{
  "events": [
    {
      "type": "click",
      "page": "/pages/about",
      "x_pct": 0.45,
      "y_pct": 0.32,
      "page_w": 1280,
      "page_h": 4200,
      "viewport_w": 1280,
      "viewport_h": 800,
      "device": "pc",
      "session_id": "9f1b...",
      "referrer": "google.com",
      "utm": { "source": "google", "medium": "cpc", "campaign": "spring" },
      "ts": 1716189000000
    },
    {
      "type": "scroll",
      "page": "/pages/about",
      "scroll_depth_pct": 0.78,
      "page_w": 1280,
      "page_h": 4200,
      "viewport_w": 1280,
      "viewport_h": 800,
      "device": "pc",
      "session_id": "9f1b...",
      "ts": 1716189030000
    }
  ]
}
```

**보안 / 검증** (7-Layer):

1. CORS Origin: day1design.co.kr / vercel preview / localhost 화이트리스트
2. Content-Type: `application/json` 필수 (아니면 415)
3. JSON 파싱 try/catch (실패 400)
4. body.events 배열 필수, 최대 50개/요청
5. 각 이벤트 필드 검증 (type, page 형식, 좌표 0~1 범위)
6. IP Rate Limit: 1000건/시간/IP (히트맵은 빈도 높아 일반 폼보다 관대)
7. 500 에러 시 텔레그램 알림 `[day1design/heatmap]`

**Response**: `{ ok: true, accepted: <int> }` 200 / `{ ok: false, error: "..." }` 4xx-5xx

### 5.2 `GET /api/heatmap/events?page=...&device=...&from=...&to=...` — 관리자 조회

- 인증: `verifyAdmin` 필수
- 페이지·디바이스·기간·EventType 필터
- 응답: 좌표 배열 (집계 X, 원본 — 클라이언트에서 heatmap.js로 처리)
- 페이지당 최대 5000개 (밀도 시각화용 충분)

### 5.3 `GET /api/heatmap/pages` — 관리자 페이지 리스트

- 사이트 등록 페이지 목록 + 각 페이지의 스크린샷 URL (PC/Mobile) + 최근 이벤트 수

### 5.4 `POST /api/heatmap/screenshots` — 관리자 스크린샷 등록

- 인증: `verifyAdmin` 필수
- body: `{ page, device, url, page_w, page_h }`
- (스크린샷 자체는 admin에서 별도 업로드 또는 수동 R2 업로드 후 등록)

## 6. 클라이언트 트래커 명세

### 파일: `site/js/tracker.js`

```js
// 1. 세션 ID (localStorage UUID, 신규 생성 시 7일 TTL)
// 2. 디바이스 판별 (viewport width < 768 → 'mobile')
// 3. 페이지 로드 시: 한 번 'page_view' 이벤트 (선택)
// 4. 클릭 이벤트:
//    - document 전체 capture
//    - x_pct = (clickX + scrollX) / document.documentElement.scrollWidth
//    - y_pct = (clickY + scrollY) / document.documentElement.scrollHeight
//    - 큐에 push
// 5. 스크롤 이벤트:
//    - throttle 500ms
//    - max scroll depth만 추적 (세션 메모리)
//    - 깊이 변경 시 큐에 push
// 6. 배치 전송:
//    - 5초마다 / 큐 ≥10개 / 페이지 unload 시
//    - sendBeacon (페이지 닫혀도 전송 보장)
// 7. 오류 시 silent fail (사용자 영향 0)
```

**제약**:

- input/textarea/password 클릭은 좌표만 (내용 X)
- admin/\* 경로는 트래커 미실행 (관리자 클릭은 데이터 노이즈)
- DNT(Do Not Track) 헤더 존중 — 트래커 비활성

## 7. 관리자 UI 명세

### 페이지: `site/admin/heatmap.html`

**메뉴 위치**: 사이드바 (유입통계 다음)

**레이아웃**:

```
+--------------------+-------------------------------------------+
| 페이지 리스트       | 메인 뷰                                    |
| ┌─ index.html ────┐ | [필터: 기간 | 디바이스 | 클릭/스크롤]      |
| │  방문 1,234     │ |                                           |
| │  클릭 567       │ | ┌──────────────┐  ┌────────────┐         |
| ├─ about.html ───┤ | │              │  │            │         |
| │  방문 432       │ | │  PC 와이어   │  │ Mobile     │         |
| ├─ portfolio.html │ | │  프레임 +    │  │ 와이어     │         |
| │  ...           │ | │  히트맵      │  │ 프레임 +   │         |
| │                │ | │              │  │ 히트맵     │         |
| └────────────────┘ | └──────────────┘  └────────────┘         |
+--------------------+-------------------------------------------+
```

**기능**:

- 페이지 클릭 시 선택, 우측 캔버스 갱신
- 기간: 1d / 7d / 30d / 사용자 지정
- 디바이스 토글: PC / Mobile / 모두
- 표시 종류: 클릭 / 스크롤 / 둘 다
- 스크롤 히트맵: 페이지 세로 라인에 그라데이션 (10% 단위 도달률)
- 클릭 히트맵: heatmap.js 가우시안 블러 오버레이
- 스크린샷 변경 버튼 (admin에서 새 스크린샷 등록)

## 8. 개인정보 처리

- 수집 항목·이용목적·보유기간을 **`site/pages/privacy.html`에 명시 완료** (2026-05-20)
- 핵심 약속: "통계 처리 목적으로만 사용되며 특정 개인을 식별/추적하지 않음"
- 사이트 푸터에 개인정보처리방침 링크 노출 (7페이지)

## 9. 보존 정책

- `HeatmapEvents`: **90일** 후 자동 삭제 (Worker cron 또는 admin 수동 트리거)
- `HeatmapScreenshots`: 무기한 (수동 갱신)
- 90일 이후 일별 집계만 별도 테이블에 보존하는 안은 v2에서 검토

## 10. 단계별 작업

### Step 1 — 수집 인프라 (1~2시간)

- [ ] `worker/migrations/0009_heatmap.sql` 작성
- [ ] 마이그레이션 운영 D1 적용 (`wrangler d1 execute day1design --remote --file=...`)
- [ ] `worker/src/routes/heatmap.js` 작성 (track + admin GET)
- [ ] `worker/src/index.js`에 라우트 와이어링
- [ ] `site/js/tracker.js` 작성
- [ ] 사이트 7개 페이지에 `<script src="/js/tracker.js">` 삽입
- [ ] Worker 배포 (`wrangler deploy`)
- [ ] Vercel 배포 (git push)
- [ ] **인수 기준**: 라이브에서 클릭/스크롤 후 `HeatmapEvents`에 row 적재 확인

### Step 2 — 페이지 스크린샷 (1~2시간)

- [ ] Puppeteer 헤드리스 스크립트 (`scripts/capture-pages.mjs`) 작성
- [ ] 7개 페이지 × PC(1280×풀높이) + Mobile(390×풀높이) = 14장 캡쳐
- [ ] R2에 업로드 (`images/heatmap/{page}_{device}.webp`)
- [ ] `HeatmapScreenshots`에 14건 등록
- [ ] **인수 기준**: admin이 14장 모두 조회 가능

### Step 3 — 관리자 UI (1일)

- [ ] `site/admin/heatmap.html` + `site/admin/heatmap.js` 작성
- [ ] 사이드바 메뉴 항목 추가
- [ ] heatmap.js 라이브러리(또는 자체 canvas) 통합
- [ ] 기간/디바이스/유형 필터
- [ ] **인수 기준**: 페이지 클릭 → PC/Mobile 양옆 + 히트맵 색상 표시

## 11. 의사결정 기록

| 항목                 | 결정                    | 사유                        |
| -------------------- | ----------------------- | --------------------------- |
| IP 저장 방식         | 평문                    | 위치 분석 + 약관 명시       |
| 좌표 정규화          | 페이지 % (절대 px 아님) | 뷰포트 다양성 대응          |
| 디바이스 분리 기준   | viewport width 768      | CSS breakpoint 표준         |
| 트래커 전송 방식     | sendBeacon 배치 5s      | unload 시 보장              |
| 스크린샷 갱신        | 수동 (디자인 변경 시)   | 자동화는 v2                 |
| Admin 자체 영상 재생 | X (Clarity 새 탭)       | rrweb은 무거워 채택 X       |
| 데이터 보존          | 90일                    | D1 5GB 한도 + 마케팅 사이클 |

## 12. 위험 / 한계

- **디자인 변경 시 옛 좌표가 새 스크린샷 위에 찍힘** → 모든 자체 히트맵의 한계. 큰 디자인 변경 시 이전 데이터 archive + reset 권장
- **봇 트래픽 노이즈** → IP rate limit + UA 필터로 1차 차단, admin에서 의심 세션 제거 가능
- **D1 용량** → 90일 보존 가정 시 약 2GB 이내 예상 (이벤트당 200~300바이트, 일 10k 이벤트 기준). 한도 초과 시 일별 집계 테이블로 후처리

---

**승인 후 Step 1부터 진행. 변경 사항 발생 시 이 문서를 단일 진실 소스로 갱신.**
