# 아이맥 Meta 리드 폴러 (day1design)

Meta 인스턴트폼 리드를 시스템 사용자 토큰으로 직접 조회해 day1design 워커로
전달하는 one-shot LaunchAgent. **Make 시나리오 대체**용이며 폴라애드·자수성가
폴러와 같은 패턴이다.

## 실행 모델

- label: `com.day1design.meta-lead-poller`
- host: `imac`(192.168.0.210, user `pola`) / remote dir: `/Users/pola/day1design-meta-lead-poller`
- interval: 20분(`StartInterval 1200`), 로그인·재부팅 후 즉시 1회
- logs: `logs/worker.log`, `logs/worker.err.log`
- recovery: 마지막 성공 시각에서 48시간을 겹쳐 조회하고 `leadId` 로 중복 제거

## 중복 방지 (2중)

1. 폴러 `state.json` 의 `processed[leadId]` — 같은 실행 흐름에서의 재전송 차단
2. 워커 D1 `Estimates.MetaLeadId` 유니크 인덱스 — 상태파일이 날아가도 **중복 접수·중복
   문자 0**. 워커는 이미 있는 leadId 에 `{duplicate:true}` 만 돌려주고 저장·알림·문자를
   전부 건너뛴다.

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
