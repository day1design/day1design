# NEXT SESSION — 이탈 방지 팝업 도입·배포 완료 (2026-08-25)

- 프로젝트: `F:\day1design_homepage` (day1design.co.kr)
- 상태: **기획 → 구현 → 배포 → 라이브 실측까지 완료.** 남은 것은 운영 판단 2건.
- 커밋: `ce63062` → `a3d7926` → `9ebda4e` → `f380457` (전부 push 완료)

---

## 1. 무엇을 만들었나

홈페이지를 떠나려는 방문자에게 데이원디자인 브리프와 간단 상담 신청을 보여주고,
받은 이름·연락처를 견적문의 폼으로 넘겨 나머지 항목만 이어 쓰게 하는 구조.

**근거(최근 30일 실측)**: 방문 4,392세션 중 79.9%가 한 페이지만 보고 이탈.
견적 페이지 도달은 7.0%(308세션), 실제 접수 41건(0.93%). 견적 폼이 일곱 항목을
필수로 요구해 문턱이 높았다.

**동작 규격**은 G3디자인 `F:\pola_homepage\33.g3design\wireframe\exit-guard.js` 계승.
뒤로가기가 가드 엔트리를 소비할 때 팝업을 띄운다(mouseout 은 모바일 무효).

---

## 2. 파일 지도

| 역할 | 파일 |
| --- | --- |
| 팝업 본체 | `site/js/exit-guard.js` (신규) |
| 폼 이어받기·도착 위치 | `site/js/estimates.js` 하단 `applyCarry()` |
| 이어받기 배너 스타일 | `site/css/estimates.css` 하단 `.est-carry` |
| 접수 분기·승격 | `worker/src/routes/estimates.js` (`isExitGuard`·`promoteId`) |
| 성과 수집·집계 | `worker/src/routes/exit-guard.js` (신규) |
| 스키마 | `worker/migrations/0035_exit_guard_lead.sql` · `0036_exit_guard_events.sql` |
| 어드민 화면 | `site/admin/analytics.html` `#exitGuardSection` · `analytics.js` `loadExitGuard()` |
| 가드 테스트 | `worker/tests/exit-guard-lead.test.mjs` · `exit-guard-stats.test.mjs` |
| 와이어프레임 | `260825_exit-guard-brief-wireframe.html` |

스크립트는 `index/portfolio/about/project-flow/community/community-detail` 6개 페이지에만
붙였다. 견적문의·개인정보·이용약관은 제외(코드 안에서도 `EXCLUDED` 로 이중 차단).

---

## 3. 지켜야 할 것 (임의 변경 금지)

1. **접수 안전망 동일 적용** — 팝업 접수도 R2 `estimates-attempts` 원문 보관,
   D1 저장 확정 후에만 200. 필수 검증 면제는 `form_type=exit_guard` 에만.
   정규 폼 검증을 함께 풀면 빈 접수가 통과한다. (`exit-guard-lead.test.mjs` 가 가드)
2. **LeadKey 승격** — 팝업이 `Status='작성중'` 으로 먼저 저장하고 발급한 키를 폼이
   실어 보내면 그 레코드를 채워 `'접수대기'` 로 올린다. 이 대조를 빼면 같은 고객이
   카드 두 장으로 갈라져 담당자가 두 번 전화한다.
3. **팝업 단계에서 고객 문자·메일·시트·CAPI 미발송** — 접수가 끝나지 않았는데
   "접수되었습니다" 문자가 먼저 가면 어긋난다. 폼 완주 시점에 전량 발송.
4. **'작성중' 은 접수관리 기본 목록에서 제외** — 이름·연락처뿐인 카드가 섞이면
   상담 카드가 오염된다. `?status=작성중` 으로만 조회된다.
5. **값 이관은 sessionStorage 로만** — URL 쿼리에 실으면 이름·전화번호가 브라우저
   히스토리·리퍼러·서버 로그·GA4 착지 페이지 보고서에 그대로 남는다.
6. **봇 판정·페이지 정규화는 `heatmap.js` 헬퍼 재사용** — 규칙이 두 벌이 되면
   유입통계와 수치가 어긋난다. `exit-guard.js`(worker) 가 import 해서 쓴다.

---

## 4. 노출 규칙 (현재 값)

| 조건 | 처리 |
| --- | --- |
| "다음에 볼게요" | **이번 방문만** 억제 (sessionStorage). 재방문하면 다시 뜬다 |
| 한 방문에서 3회 노출 | 더 붙잡지 않고 통과 (`MAX_SHOWS_PER_VISIT`) |
| 접수 완료 | `localStorage.day1_lead_done_at` 로 **30일** 억제 |
| 폼으로 이미 넘어감 | 이번 방문 억제 (`day1_exitguard_carried`) |
| 앞으로가기로 복귀 | `pageshow.persisted` 감지 → 억제 풀고 재무장 (bfcache 대응) |
| 어드민 팝업이 떠 있음 | 건너뜀 |
| 페이지를 한 번도 안 건드림 | 크롬 정책상 작동 안 함 (우회 불가) |

---

## 5. 성과 측정 (D1 영속)

`ExitGuardEvents` 에 `shown / submit / form_view / stayed / dismissed / escaped` 기록.

- `stayed` = 닫고 **15초 이상 머물거나** 사이트 안 다른 페이지로 이동 → 이탈을 막음.
  한 번의 노출에 결과는 하나만 남긴다(겹치면 붙잡은 수가 부풀려진다).
- **"얼마나 방문이 유지되는지" 는 프런트가 세지 않는다.** SessionId 가 자체 트래커
  (`_d1_hm_sid`)와 같은 값이라, 노출 시각 이후의 `HeatmapEvents` page_view 를 서버에서
  세면 정확히 나온다. 판정 규칙을 한 곳(서버)에만 둔다.
- 어드민: 유입통계 > "이탈 방지 팝업". 노출 0건이면 섹션을 숨긴다.
- 조회: `GET /api/exit-guard/stats?days=30` (관리자 인증)

**현재 데이터 0건.** 검증용 행은 확인 후 전량 삭제했다. 실제 수치는 방문자가 쌓여야 보인다.

---

## 6. 라이브 실측 결과 (2026-08-25)

| 항목 | PC | 모바일 |
| --- | --- | --- |
| 뒤로가기 → 팝업 | 정상 | 정상 |
| 팝업 닫고 다시 나가려 할 때 재노출 | 정상 | 정상 |
| 팝업 뜬 상태 뒤로가기 → 이탈 | 정상 | 정상 |
| 포트폴리오 모달 뒤로가기 → 모달만 닫힘 | 정상 | 정상 |
| 모달 닫은 뒤 한 번 더 뒤로가기 → 팝업 | 정상 | 정상 |
| 무시하고 나갔다 재방문 → 다시 뜸 | 정상 | 정상 |
| 앞으로가기 복귀 → 다시 뜸 | 정상 | 정상 |
| 접수 완료자 재방문 → 안 뜸 | 정상 | 정상 |
| 프리필·동의 승계·도착 위치 | 배너 top 86px | 배너 top 144px |

D1 적재 실측: `shown`(ShownSeq=1) → `stayed`(HeldMs=16,547) 확인 후 삭제.

---

## 7. 구현 중 잡은 함정

- **모바일 도착 위치가 58px 어긋남** — `#header` 높이는 70px 인데 그 아래 탭바가
  하나 더 있어 실제로 화면을 덮는 높이는 `--header-height`(128px)다. 요소 실측 대신
  이 토큰을 우선 읽도록 고쳤다. (`stickyOffset()` in `estimates.js`)
- **접수 완료자 재노출** — 세션 키만 있어서 접수한 방문자도 다음 방문에 팝업을 봤다.
  `localStorage.day1_lead_done_at` 추가로 30일 차단.
- **로컬 정적 서버는 cleanUrls 미지원** — `/pages/estimates` 가 404. 라이브 Vercel 은
  정상. 로컬 검증에서는 `.html` 을 붙여 열어야 한다.

---

## 8. 다음 세션에 남은 것

1. **미완성 리드 운영 방침 (사용자 결정 대기)** — 팝업만 남기고 폼을 마치지 않은
   `Status='작성중'` 건에 담당자가 전화를 걸지, 통계로만 볼지. 현재는 저장만 되고
   알림은 나가지 않는다. 별도 어드민 탭이 필요하면 만들면 된다.
2. **2주 뒤 성과 확인** — 붙잡은 비율이 낮으면 문구·브리프 구성을, 폼 완주가 낮으면
   견적 폼 항목 수를 손보는 순서.
3. 8/14 등록된 "인스타 프로필 링크 교체 (대표님 확인 필요)" 업무가 아직 `진행` 상태.

---

## 9. 함께 처리한 것

- 업무관리에 3건 등록 (2026-08-21 광고 유입 출처 추적 정비 / 08-24 출처 없이 들어오던
  문의의 유입 경로 복원 / 08-25 이탈 방지 상담 팝업 도입). D1 직접 INSERT 라 업무 봇
  알림은 나가지 않았다. 등록 SQL 은 `scripts/d1-seeds/works_seed_2608.sql`.
- 배포: D1 마이그 0035·0036 → Worker `e0e0104a-2a87-41bf-baa2-e3a42d3e4371`
  → Vercel `dpl_DvWFjrfSBB65k2eSTLFTyeJFvxTS`. 테스트 123건 통과.
