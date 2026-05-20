# NEXT_SESSION — 2026-05-20 — Heatmap System

## 이번 세션 핵심 산출물

### 1. Microsoft Clarity 통합 (라이브)

- 사이트 7페이지 `<head>`에 Clarity 스크립트 박힘 (Project ID: `wty53osevq`)
- 어드민 유입통계 → 출처/지점 TOP 카드 하단에 **"Microsoft Clarity 열기 ↗"** 딥링크 박스
- "소스별 전환율" 표시 항목 6 → 9개
- 대시보드: https://clarity.microsoft.com/projects/view/wty53osevq/dashboard
- 데이터 보존: 영상 30일 / 집계 13개월 (Microsoft 측). Recordings는 외부 다운로드 불가

### 2. 이용약관·개인정보처리방침 페이지 신설

- `site/pages/terms.html`, `site/pages/privacy.html`
- 7페이지 푸터 카피라이트 라인 통일: `이용약관 · 개인정보처리방침 · © 2026 DAYONE DESIGN. All rights reserved. · Made by Pola`
- **개인정보처리방침에 IP·접속위치·클릭/스크롤 행동 데이터 수집 명시** + "통계 처리 목적이며 개인 식별/추적용 아님" 강조 박스

### 3. 상담 상태 시스템 재정의

- `admin/estimates`: 드롭다운 옵션 5개 → 신규 6개로 교체
  - 고객 부재중 / 진행불가 (예산/범위/지역/일정등) / 전화상담 후 미진행 / 전화상담 후 미팅예약 / 전화상담 후 대기중 / 보류
- statusBadge 맵: 신규 6개 + 레거시 5개 모두 매핑 (과거 데이터 호환)
- 새 뱃지 클래스 `status-muted` (회색)
- **주의**: Worker 측 신규 접수 기본값은 여전히 `Status="접수대기"` — 어드민 첫 진입 시 드롭다운에 매칭 안 됨. 사용자가 첫 통화 후 6개 중 선택하는 흐름. 변경 원하면 Worker `routes/estimates.js` line 466 수정 필요
- 고객 상세 패널에 "지점" 행 추가 (평면도 다음 줄)

### 4. 자체 히트맵 시스템 (HEATMAP_SPEC.md v1.0 — Step 1~3 완료)

- **D1**: `HeatmapEvents`, `HeatmapScreenshots` (migration `0010_heatmap.sql`)
- **Worker**: `/api/heatmap/track` (공개, 7-Layer 방어), `/api/heatmap/events|pages|screenshots` (admin)
- **트래커**: `site/js/tracker.js` — 클릭 좌표(페이지%) + 스크롤 max 깊이, sendBeacon 배치 5s, admin/\* + DNT 제외
- **스크린샷**: 7페이지 × PC(1280) + Mobile(390) = 14장 풀페이지, R2 `images/heatmap/{slug}_{device}.png`
- **재캡쳐**: `node scripts/capture-heatmap-screenshots.mjs && node scripts/upload-heatmap-screenshots.mjs`
- **어드민 UI**: `/admin/heatmap` — 좌측 페이지 리스트 + 메인 PC/Mobile 양옆 + Canvas 가우시안 클릭 히트맵 + 스크롤 도달률 세로바 + 기간/유형 필터
- **시각 효과**: 반지름 `0.012 × 페이지폭`, 단일 알파 0.22, 감마 0.75, 팔레트 시안→파랑→초록→노랑→주황→빨강
- **보존**: 90일 (cron 정리 미구현, v2)

## 트러블슈팅 메모

### Vercel cleanUrls vs 트래커 path 불일치 (해결됨)

- 증상: 어드민 히트맵에서 일부 페이지에 스크린샷 안 보임
- 원인: `cleanUrls=true`로 URL에서 `.html` 떨어짐 → 트래커 `location.pathname`은 `/pages/about`, 캡쳐 storedPath는 `/pages/about.html` → 키 미스매치
- 수정: Worker `safePage()`에 `.html` 자동 제거 + 끝 슬래시 정리 (defense in depth), 캡쳐 스크립트 storedPath 동기화, 기존 D1 14건 SQL UPDATE
- 교훈: 트래커가 보내는 path 형식을 단일 정의로 통일하고 서버에서 정규화 가드

### Playwright fullPage + lazy-load 이미지 누락 (해결됨)

- 증상: community / community-detail 등 IntersectionObserver lazy-load 페이지에서 중간 영역이 비어 보임
- 원인: Playwright `fullPage: true`는 CDP로 렌더하기 때문에 IntersectionObserver가 발화 안 됨
- 수정: 캡쳐 전 viewport 단위로 끝까지 스크롤 → 모든 `<img>` decode 대기 → 상단 복귀 → fullPage 캡쳐
- community-detail 기준 PC 8247px → 9771px (1500px 추가)

### Wrangler r2 object put `--remote` 플래그 없음

- wrangler v3.x에서는 `wrangler r2 object put` 기본이 remote. `--local`만 명시. 사용 중인 스크립트는 플래그 제거됨

## v2 후보 (다음 세션 거리)

- **히트맵 보존 cron**: 90일 지난 `HeatmapEvents` 자동 삭제 (Worker cron trigger or Scheduled Workers)
- **일별 집계 테이블**: 90일 이후도 페이지×디바이스×날짜별 클릭/스크롤 카운트만 보존
- **스크린샷 자동 갱신 cron**: 주 1회 GitHub Actions로 캡쳐 + 업로드 (현재 수동)
- **히트맵 UTM/Referrer 필터**: 광고 소스별 클릭 패턴 분석
- **Worker 기본 Status 변경**: 신규 접수 시 `Status` 빈 값 또는 새 "신규" 상태로 변경 (드롭다운 동기화)
- **Clarity Data Export API ETL**: 어드민에 rage clicks·dead clicks·scroll depth 일별 집계 표시 (영구 보존)

## 외부 데이터 보존 한계 (사용자 인지 필요)

- Microsoft Clarity 영상: 30일 후 삭제, 외부 다운로드 불가
- Microsoft Clarity 집계: 13개월 보존, API로 1회/일 ETL 가능
- 자체 D1: 90일 (현재 정책) — cron 미구현이라 실제로는 무한 적재 중. v2에서 정리 필요

## 참고 경로

- 명세: `HEATMAP_SPEC.md`
- 트래커: `site/js/tracker.js`
- Worker 라우트: `worker/src/routes/heatmap.js`, `worker/src/lib/access.js`
- D1 마이그: `worker/migrations/0010_heatmap.sql`
- 어드민: `site/admin/heatmap.html`, `site/admin/heatmap.js`, `site/admin/admin.css`
- 캡쳐 도구: `scripts/capture-heatmap-screenshots.mjs`, `scripts/upload-heatmap-screenshots.mjs`
