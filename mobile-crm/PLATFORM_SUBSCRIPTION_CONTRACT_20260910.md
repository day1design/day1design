# 플랫폼 관리자 업체 알림 구독 계약

현재 승인 범위는 `CRM_PLATFORM_EMAILS`에 등록된 현재 플랫폼 owner 한 명이 `day1design`의 `new_customer` 알림만 선택적으로 구독하는 것이다. 기본값은 비활성이다. 다른 관리자나 업체로 자동 확장하지 않는다.

## API

- `GET /api/mobile/platform/notification-subscriptions`
  - 플랫폼 allowlist owner 세션만 허용
  - 현재 관리자 본인의 구독 목록을 반환
- `POST /api/mobile/platform/notification-subscriptions`
  - body: `{ "tenant_id": "day1design", "notification_type": "new_customer", "enabled": true }`
  - 허용된 현재 플랫폼 owner만 활성화 가능
- `DELETE /api/mobile/platform/notification-subscriptions/day1design`
  - 현재 관리자 본인의 `day1design/new_customer` 구독만 비활성화

구독 생성 시 기존 알림은 cursor 기준으로 건너뛰며 과거 알림을 재전송하지 않는다. 신규 알림은 원본 업체 알림을 보존한 채 플랫폼 inbox relay로 한 번만 생성한다.

## 알림 탭

FCM data에는 relay `notification_id`와 `source_tenant_id=day1design`, `source_notification_id`가 포함된다. 탭은 기존 `/notifications/{notification_id}`로 플랫폼 inbox relay를 열고, 서버가 활성 구독·플랫폼 관리자 세션·`day1design` 업체 상태를 다시 확인한 뒤 원본 고객 화면으로 이동할 target metadata를 반환한다. 구독 해제 또는 업체 중지 후에는 inbox/detail/read 모두 거부한다.

잠금화면은 Android가 generic public version을 표시하고, 잠금 해제 상태에서만 상세 data를 표시한다. 서버는 full data를 preview 설정만으로 제거하지 않는다.
