# Android 운영 연결 — 2026-09-09 KST

사용자는 운영 로그인·푸시·발송을 마친 후 연결 휴대폰 설치와 최종 APK 업무메일 전송을 요청했다.

1. 완료: 기존 Firebase `polarad-operations`, Dayone SENS 키와 운영 발신번호, NAVER WORKS 업무메일 설정 확인. SMTP 인증 성공. SENS 조회 HTTP 200 및 운영 발신번호 기록 확인. 실제 발송 없음.
2. 완료: 이메일 OTP HMAC 릴레이, FCM HTTP v1 및 감사 영수증, SENS 승인 템플릿 전송 어댑터와 독립 푸시 스케줄러 구현·회귀 검증.
3. 완료: Android Firebase SDK/token/알림 권한/탭 연결, 빌드·lint와 전용 에뮬레이터 검증.
4. 완료: 사용자 지정 Chrome 계정으로 CRM 운영/개발 앱 등록·설정 연결. 실제 FCM 수신 및 탭 이동을 전용 에뮬레이터에서 확인.
5. 진행 중: iMac OTP HTTPS 릴레이 및 Worker/D1 0045–0053 배포 완료. Workers redirect 호환성 수정과 기기별 영구 로그인 적용 후 실제 운영 로그인·재실행 검증. 알림톡 provider/승인 템플릿은 미연결.
6. 조건부 승인: 전체 제품 검증 이후만 R3CX80FNR3H 설치 및 최종 APK를 mkt@polarad.co.kr에서 같은 주소로 1회 전송. 현재 미설치·미전송.

실제 자격 증명은 `.tools/production/worker-secrets.json`에 Git 제외 상태로 준비했다. 운영 CRM/푸시는 true, 고객 자동화/발송은 false다. 기존 worker/.dev.vars는 수정하지 않았다. 키 값은 문서에 기록하지 않는다.
