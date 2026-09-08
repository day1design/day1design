# Android 기기 등록 API

모든 경로는 /api/mobile, Bearer 인증 및 활성 업체/계정을 요구한다. 실제 FCM 송신 구현은 아직 연결되지 않았다. 등록 성공 응답은 delivery_verified:false이다.

- POST /devices: id(UUID), push_token(20~4096자의 FCM 등록 토큰), notifications_enabled(boolean), preview_mode(generic 기본값 또는 details). 업체/사용자/세션은 서버 인증에서만 정한다. 반환은 id, registered, delivery_verified이며 토큰을 되돌려주지 않는다.
- GET /devices: 현재 사용자 자신의 최대 5개 등록 메타데이터. push_token은 반환하지 않는다.
- DELETE /devices/{id}: 자신의 등록만 해제. 다른 사용자/업체 ID는 404.

사용자당 최대 5개, id와 토큰 충돌은 다른 사용자로 넘기지 않고 409. 만료/폐기 세션 등록만 동일 id/토큰 재사용 시 제거 가능하다. 등록 시 현재 세션/활성 계정/업체정지를 같은 transaction에서 재검증한다.

migration 0052의 trigger는 로그아웃/직원 비활성/업체정지 때 등록을 삭제한다. 기존 session revoke 흐름을 그대로 사용한다. 모든 푸시 소비자는 등록행만 신뢰하지 말고 해당 session의 expires_at/revoked_at, user.active, tenant.suspended, 알림 수신자 membership을 전송 직전 다시 확인해야 한다.

Android FCM SDK와 실제 전송 provider, 토큰 갱신/권한 UI/수신 탭 이동은 후속 구현이다. generic 미리보기는 향후 푸시에서 개인정보 대신 업무 알림이 있음을 표시하는 기본 정책값이다. 현재 API의 설정 저장만으로 잠금화면 노출이나 FCM 수신을 보장하지 않는다.

검증: 5개 경계 테스트 및 실제 격리 Worker HTTP 등록/목록/로그아웃/401 확인. 실제 provider·고객·휴대폰은 사용하지 않았다.
