# Day1Design — 프로젝트 작업 규칙

## 불변규칙 (Invariants — 임의 변경/회귀 금지)

아래 항목은 사용자 명시 승인 없이 변경·제거·약화·리팩토링하면 안 된다. 위반은 회귀(regression)로 간주한다.

1. **접수 안전망 (누락 0)** — 모든 견적/상담 폼 제출 시도는 결과와 무관하게 흔적이 남아야 한다.
   - 정상(accepted)·origin거부(403)·검증실패(400)·허니팟·파싱실패·D1저장실패 등 **모든 outcome 을 R2 `estimates-attempts/{Y}/{M}/{D}/{ISO}-{ip}-{outcome}.json` 에 원문 보관**한다.
   - **사람으로 보이는 거부/오류는 D1 `Estimates` 에도 `Status='오류'` 레코드로 남긴다** (명백한 봇·허니팟 스팸은 R2만, 접수관리 오염 방지).
   - **자동완성 허니팟 오탐은 '정상 접수'로 살린다(고객 리드 보존)**: 허니팟이 채워져도 사람(이름·연락처 형식 정상) + 타이밍 정상(\_ts≥3초 또는 없음) + URL 없음이면 `Status='접수대기'` 로 일반 접수와 동일 처리(드롭 금지). 봇 드롭(가짜200 + R2 `honeypot_bot`)은 **허니팟 + 복합신호(초고속 \_ts<3s / URL 삽입 / 이름·연락처 둘 다 깨짐)** 가 같이 있을 때만. 허니팟 단독 차단 금지.
   - **허니팟 필드명은 자동완성 자석 금지**: `website`/`url`/`email`/`organization`/`address` 등 금지, 중립 토큰(`_hp_field`) 유지. (자석 이름이면 브라우저 자동완성이 채워 정상고객 오탐)
   - 관련 코드: `worker/src/lib/estimate-archive.js`(`archiveAttemptToR2`·`recordRejectToD1`·`captureRejectedSubmission`), `worker/src/lib/security.js`(`botSignals`), `worker/src/routes/estimates.js`(submitEstimate 각 outcome 분기·복합신호 판정), `worker/src/index.js`(origin 거부 캡처), `site/pages/estimates.html`+`site/js/estimates.js`(허니팟 필드명). **이들을 임의 제거/리팩토링 금지.**

2. **가짜 성공 금지** — 폼 제출의 성공(HTTP 200 `received`)은 **D1 저장이 확정된 뒤에만** 반환한다. D1 insert 실패 시 R2 `d1_failed` 보관 + 텔레그램 알림 + 고객에게 재시도 응답(500). 저장 안 됐는데 200 주는 코드 금지.

3. **리팩토링/배포 전 `git stash list` 확인** — 미복구 WIP stash 로 기능이 유실되는 사고를 막는다.
   - 실제 사고: 2026-05-29 폼 간소화 배포(`7a35a85`)가 **커밋되지 않고 stash 로만 남아있던** `archiveAttemptToR2` 안전망을 라이브에서 덮어써 유실 → 약 2주간 거부건 흔적 0.
   - `stash@{0}`(2026-05-26 WIP)는 **증거/복구 원본이므로 함부로 `git stash drop` 하지 말 것.**

4. **사용자가 요청하지 않은 동작 제거(회귀) 절대 금지** — "정리/간소화/리팩토링" 중이라도 기존 기능을 임의로 빼지 않는다. 빼야 한다고 판단되면 먼저 사용자에게 명시 확인.

5. **불변규칙 회귀 가드 테스트** — `worker/tests/estimates-safetynet.test.mjs` 가 위 1·2 를 강제한다. 이 테스트가 깨지면 안전망 회귀이므로 코드를 고치지 말고 원인(회귀)을 되돌린다. (`npm test` 로 실행)

## 배포

- 배포는 항상 `git commit + push` 경유. Worker 는 commit 이후에만 `wrangler deploy`. (작업트리 직접 배포 금지 — `feedback_deploy_via_git_push`)
- 통합 배포 스크립트: `scripts/deploy.ps1 all|worker|main`.
