# CRM 알림 도메인 계약

기준: 2026-09-09 KST

이 문서는 Android 우선 CRM과 기존 Worker/D1를 연결할 때 지켜야 할 알림 경계를 고정한다. 현재 구현은 순수 결정 함수와 테스트만 제공하며, D1 저장·Cloudflare Queue·FCM·SENS 호출·실제 발송을 수행하지 않는다.

## 알림 종류

내부 업무 알림은 다음 세 종류다.

- `new_customer`: 신규 고객 접수. 발행 시점 수신자 스냅샷과 이름·연락처·지역·예산을 함께 저장한다.
- `visit_reminder`: 방문 예약 3시간 전 고객 리마인더.
- `measurement_reminder`: 실측 예약 3시간 전 고객 리마인더.

`daily_briefing`은 내부 업무 알림과 별도다. 매일 KST 10:00(`01:00Z`)에 마케팅 효율 브리핑을 위한 별도 작업으로 예약한다.

## 수신자와 읽음

전체 또는 선택 수신자를 발행 시점에 스냅샷한다. 스냅샷 대상은 동일 `tenant_id`의 `role=staff`이면서 active이고 disabled가 아닌 직원뿐이다. 업체 대표(owner)는 직원 전체/개별알림의 직원 수신자 목록에 자동 포함하지 않는다. 선택 목록에 없는 ID와 다른 업체 직원은 버린다. 중복 ID는 하나로 줄인다.

알림 행을 공유하더라도 읽음 상태는 수신자별 행 또는 수신자별 상태로 저장해야 한다. 읽기 API는 `notification.tenant_id === actor.tenant_id`와 `recipient_id === actor.id`를 모두 확인한다. 발송 성공은 읽음이 아니다.

권장 최소 저장 구조는 다음과 같다.

| 저장 단위 | 필드와 제약 |
| --- | --- |
| `notification` | `id`, `tenant_id`, `type`, `actor_id`, `payload_json`, `created_at` |
| `notification_recipient` | `notification_id`, `tenant_id`, `recipient_id`, `read_at`, `audience_snapshot_json`; `(notification_id, recipient_id)` unique |
| `notification_outbox` | `idempotency_key` unique, `tenant_id`, `kind`, `appointment_id`, `appointment_version`, `recipient_id`, `channel`, `status`, `available_at`, `sent_at`, `failure_code` |

모든 쓰기는 같은 업체 검증과 감사 기록을 포함하는 트랜잭션으로 처리한다. `tenant_id`를 클라이언트가 임의로 정한 값으로 신뢰하지 말고 인증 세션에서 얻는다.

## 예약 리마인더

`due_at = starts_at - 3 hours`다. 예약 시각이 지났거나 이미 `sent_at`이 있으면 다시 만들지 않는다. 중복 방지 키는 다음 값을 모두 포함하는 안정적인 키다.

```text
tenant_id:appointment_id:appointment_version:notification_type:recipient_id:channel
```

예약 변경은 버전을 증가시켜 이전 outbox 키와 분리한다. 예약 취소·정지·OFF가 있어도 큐에 들어간 작업이 남을 수 있으므로 실제 발송 직전에 다음을 다시 확인한다.

1. 업체가 active인지
2. 예약이 같은 업체인지
3. 예약 상태가 `scheduled`, `confirmed`, `booked` 중 하나인지
4. 예약 버전이 outbox의 기대 버전과 같은지
5. 해당 채널이 현재 ON인지
6. 리마인더 시간이 도래했는지

하나라도 실패하면 `sent`로 표시하지 않고 `tenant_inactive`, `reservation_inactive`, `appointment_version_changed`, `channel_disabled` 등의 이유로 무효화/재검토한다.

예약 생성 또는 변경이 3시간 이내면 자동 발송 정책이 확정되지 않았다. 기본값은 `manual_review`이며 자동 발송하지 않는다. 별도 제품 정책으로 `send_once`를 명시한 경우에만 1회 즉시 발송 경로를 열 수 있다. 이 결정은 임계시간을 지났다는 이유만으로 추론하지 않는다.

방문과 실측은 서로 다른 타입과 문구를 사용한다. 미리보기는 `draft`와 `approved` 상태를 표시하며, 미리보기에서 상태를 바꾸거나 실제 발송하지 않는다. 알림톡 `approved` 문구는 플랫폼 관리자가 승인한 템플릿과 일치하는지 별도 검증해야 한다. 변수는 이름·날짜·시간·방문 장소/실측 현장·주소·연락처를 구분해 치환한다.

## 구현 경계와 검증

`worker/src/lib/crm-notifications.js`는 위 결정을 부작용 없이 반환한다. 실제 Worker 통합 시에는 D1 unique 제약으로 outbox 삽입을 원자화하고, 재시도 횟수·dead-letter/manual review 상태·FCM/SENS provider 결과를 별도 저장해야 한다. 이 파일의 테스트가 통과해도 메일·알림톡·SMS·FCM 전달 성공이나 Android 수신을 의미하지 않는다.
