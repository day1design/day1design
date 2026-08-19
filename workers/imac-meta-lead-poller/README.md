# 아이맥 Meta 리드 폴러 (day1design)

Meta 인스턴트폼 리드를 시스템 사용자 토큰으로 직접 조회해 day1design 워커로
전달하는 상주 LaunchAgent. **Make 시나리오 대체**용이며 폴라애드·자수성가
폴러와 같은 패턴이다.

## 실행 모델

- label: `com.day1design.meta-lead-poller`
- host: `imac`(192.168.0.210, user `pola`) / remote dir: `/Users/pola/day1design-meta-lead-poller`
- interval: 20분 — **`worker.mjs --daemon` 내부 루프**가 쥔다(`KeepAlive` 상주). 주기를
  `StartInterval` 에 맡기지 않는 이유는 아래 "왜 상주인가" 참고
- logs: `logs/worker.log`, `logs/worker.err.log`
- recovery: 마지막 성공 시각에서 48시간을 겹쳐 조회하고 `leadId` 로 중복 제거

### 왜 상주인가 (2026-08-20 사고)

아이맥 사용자세션 launchd(`gui/501`)가 StartInterval 스폰을 통째로 거부하는 상태에
빠져(`interval event: domain response: 36` → `pended nondemand spawn`) 이 맥의 리드 폴러
8개가 05:12~06:03 사이 동시에 멈췄다. 맥은 켜져 있었고 폴러도 정상 종료(exit 0) 상태였다.
상주 프로세스는 새 스폰을 필요로 하지 않으므로 이 스톨에 영향받지 않는다.

- 한 번의 폴링이 10분을 넘기면(요청에 타임아웃이 없다) 워치독이 프로세스를 끝내고
  `KeepAlive` 가 새로 띄운다. 남은 락은 PID 확인으로 다음 기동이 즉시 회수한다.
- 즉시 죽는 상태여도 `ThrottleInterval 300` 이라 5분에 한 번만 재기동한다(크래시 리스폰
  폭주로 launchd 도메인을 밀지 않기 위함 — 위 사고의 배경이 그 폭주였다).
- 수동 점검은 인자 없이: `node worker.mjs`(1회 폴링 후 종료).
- 살았는지 보기: `launchctl print gui/501/com.day1design.meta-lead-poller | grep -E "state|pid"`

## 중복 방지 (2중)

1. 폴러 `state.json` 의 `processed[leadId]` — 같은 실행 흐름에서의 재전송 차단
2. 워커 D1 `Estimates.MetaLeadId` 유니크 인덱스 — 상태파일이 날아가도 **중복 접수·중복
   문자 0**. 워커는 이미 있는 leadId 에 `{duplicate:true}` 만 돌려주고 저장·알림·문자를
   전부 건너뛴다.

## 누락 방지 (한 건이 큐를 막지 않는다)

- **전달 실패** — 그 리드만 `processed` 에 남기지 않고, `highWatermarkAt` 을 **실패한
  리드 시각으로 되돌린다**. 실패가 며칠 이어져도 다음 조회 창(워터마크 − 48h)에 계속
  포함되므로 성공할 때까지 재시도한다. 뒤 리드는 그대로 전달된다.
- **필수정보 없는 리드**(이름/연락처를 못 읽음) — 폴러가 막지 않고 그대로 보낸다.
  워커가 R2 원문 + D1 `Status='오류'` 카드 + 텔레그램으로 캡처하고 `captured:true` 를
  회신하면 폴러는 그 리드를 완료 처리한다(무한 재시도·큐 정체 없음).
- **전화 질문 인식 규칙은 워커와 동일**(`PHONE_TOKENS`). 폴러만 좁으면 새 폼이
  `핸드폰번호`·`mobile` 로 물었을 때 폴러 단계에서 멈춘다. 가드:
  `worker/tests/meta-lead-poll.test.mjs` 의 `[guard] 폴러와 워커의 전화 질문 인식 규칙이 일치한다`.
- 하트비트 detail 에 `captured=N failed=N` 이 실려 어드민 **시스템 상태**에서 바로 보인다.

## 필수 환경변수

프로젝트 루트 `.env.imac-meta-lead.local` 에만 저장한다(커밋 금지). 키 목록은
`.env.example` 참고.

`META_SYSTEM_USER_TOKEN` 에는 **`leads_retrieval` 권한 + 페이지(969217572947331)
자산 할당 + 잠재 고객 액세스**가 필요하다. 광고 통계용 `META_AD_ACCESS_TOKEN`
(`ads_management, ads_read, business_management`)으로는 리드 조회가 400 으로 막힌다.

## 안전한 전환 순서

1. 워커 먼저 배포(마이그 0031 적용 → `MetaLeadId` 유니크). 같은 leadId 재전송이
   `duplicate: true` 인지 확인.
2. `node worker.mjs --inspect` — 폼 질문 key 확인(값은 마스킹, 전달·발송 없음).
   워커 `FIELD_RULES` 와 어긋나면 워커 매핑을 먼저 보정.
3. `META_LEAD_DRY_RUN=1 node worker.mjs` — 읽기 권한/폼 접근만 검증(전달 없음).
4. Make 시나리오 OFF → 그 시각을 `META_LEAD_CUTOVER_AT` 에 기록.
5. `node scripts/deploy-imac-meta-lead-poller.mjs --run`
6. 신규 리드 1건으로 D1 카드 · 고객문자 · 텔레그램 알림 확인.

## 헬스체크

매 실행마다 워커 `POST /api/meta-lead/heartbeat` 로 생존 신호를 남긴다
(`SystemHeartbeats`). 리드가 0건이어도 기록되므로 **맥 전원 꺼짐 · launchd 정지 ·
토큰 만료**를 리드 없는 시간대와 구분할 수 있다.

- 워커 헬스체크(`리드 폴러 생존`)가 90분 이상 신호 없으면 `fail` → 인프라봇 알림
- 조회 자체가 실패하면 폴러가 `status=fail` 하트비트 + 인프라봇 직접 알림(2중)
- 상태파일을 하트비트보다 먼저 저장하므로, 하트비트가 실패해도 같은 리드를 다시
  전달하지 않는다.

## 검증

```bash
node --check workers/imac-meta-lead-poller/worker.mjs
node --test workers/imac-meta-lead-poller/worker.test.mjs
plutil -lint workers/imac-meta-lead-poller/com.day1design.meta-lead-poller.plist   # mac
```
