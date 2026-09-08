## 운영 배치 준비 추가 검증

- 프로젝트 Git/GitHub/Cloudflare/Vercel 계정과 기존 main SHA 일치 확인. 아직 배포 전.
- 신규 CRM API 이름 `day1design-crm-api`, 구체 경로 `api.day1design.co.kr/api/mobile*`. 기존 API 전체 배포 제외.
- 아이맥 `/usr/local/bin/cloudflared` 및 token-file 지원 확인. 새 `crm-otp.day1design.co.kr` DNS와 동명 tunnel이 없는 상태 확인.
- `configure-otp-tunnel.mjs` 기본 dry-run, 명시적 `--apply`에서만 전용 tunnel/DNS 구성.
- 알림톡 provider와 승인 template ID는 현재 없으므로 실제 발송 완료 범위에 포함할 수 없다.

> 최신 확인: Chrome의 사용자 지정 계정 mkt9834@gmail.com으로 CRM 운영/개발 앱 등록 완료. 두 variant FCM 설정 연결, Debug/Release 빌드·lint 통과. 실제 FCM을 전용 emulator-5582에서 수신하고 알림 탭→인증된 알림함을 확인했다. 서비스 계정의 앱 관리 403은 더 이상 앱 등록 blocker가 아니다. 아래 발견 이력 중 미등록·미발송 설명은 이 확인으로 갱신된다.

# 운영 연결 검증 — 2026-09-09 KST

## 확인한 자격 증명과 현재 장애

- Firebase 프로젝트는 `polarad-operations`다. 초호/인프라/영업 Android 앱 설정이 기존 로컬 파일에 있다. CRM `kr.polarad.crm`과 개발용 `kr.polarad.crm.dev`는 그 설정에 없다.
- 기존 서비스 계정으로 OAuth 인증 성공. Firebase Management Android 앱 목록 조회는 HTTP 403 `PERMISSION_DENIED`, `The caller does not have permission`을 반환했다. 인증 성공과 앱 관리 권한은 구분한다. 사용자에게 앱 관리 가능한 프로젝트 로컬 인증 파일 경로를 질문했다.
- Firebase 원본 서비스 계정: `F:\chohopark\mobile-admin\gateway\.runtime\firebase-service-account.json`. 프로젝트용 사본은 `mobile-crm/.tools/production/firebase-service-account.json`이며 Git 제외 확인했다. 다른 앱의 Firebase app ID를 CRM에 사용하지 않는다.
- Dayone SENS는 `worker/.dev.vars`의 키·서비스 ID를 사용했다. 최근 24시간·pageSize=1·기록상 발신번호 필터로 GET 조회했다. HTTP 200, provider status 202, itemCount 1, 발신번호 일치 확인. 고객 본문·수신번호를 출력하지 않았다. 원본 환경 파일은 수정하지 않았다.
- 운영 발신번호는 `01042347211`로 기존 핸드오프와 실제 조회 결과가 일치한다. 원본 로컬 환경의 빈 발신번호는 운영 미등록 증거가 아니다.
- `F:\master_polarad\.env.local`의 NAVER WORKS SMTP `smtp.worksmobile.com:587`, `mkt@polarad.co.kr`로 requireTLS 인증 검증 성공. 실제 이메일 전송은 하지 않았다.
- `https://api.day1design.co.kr/api/mobile/auth/me`는 비인증 조회 시 403이다. CRM 운영 로그인 성공 증거가 아니다.

## 구현·연결

- Worker OTP → HTTPS HMAC 릴레이 → NAVER WORKS SMTP 어댑터. timestamp/signature/발신계정/수신 승인 영수증 검증, OTP 중복·동시 전송 처리, timeout, redirect 차단. Worker에서 실제 HTTP 릴레이 핸들러까지 통합 테스트했다. **운영 HTTPS 릴레이 호스트는 아직 배치하지 않았다.**
- FCM HTTP v1 OAuth/JWT, 명시적 tenant allowlist, 세션/기기 재검증, generic 알림, 기기별 영수증과 신규 알림 커서. 최초 활성화 시 과거 알림을 건너뛴다. 불명확한 발송 결과는 자동 재시도하지 않는다.
- migration `0053_crm_push.sql` 로컬 실행기에 포함했다. 운영 DB에는 적용하지 않았다.
- 스케줄러는 `CRM_ENABLED` 아래 자동화와 푸시를 독립 제어한다. 자동화 OFF·푸시 ON에서 예약 고객 문자/브리핑 생성 없이 푸시만 동작한다.
- SENS는 기존 provider helper를 사용하며 tenant별 발신 설정 및 승인 본문으로 렌더링한다. 값이 없는 변수나 미지원 변수는 발송 차단한다. HTTP 202와 provider 수락 영수증을 함께 확인한다. Alimtalk provider 연결은 포함하지 않는다.
- `.tools/production/worker-secrets.json`에 프로젝트 로컬 연결값 준비. OTP 비밀값은 최초 1회 생성하고 재사용한다. **CRM/자동화/푸시/고객 발송 플래그는 모두 false**, 릴레이 URL은 미지정이다. 파일과 서비스 계정은 Git 제외 확인했다.
- 제품 전용 PKCS12 RSA3072 서명키 최초 생성: `.tools/signing/crm-release.jks`, alias `polarad-crm`. `android/release.local.properties`의 서명과 운영 API 설정만 사용한다. 기존 키를 다시 생성하거나 APK에 포함하지 않는다.

## 검증과 후속 조건

서버 전체 회귀 테스트 273 passed / 0 failed. 로그 `.tools/operational-tests.log`. Android 검증 결과는 아래 추가 기록한다.

운영 릴레이 배치, Firebase CRM 앱 등록/맞는 설정, 범위별 Git 버전 기록·push·Worker 배포·마이그레이션, 운영 로그인·FCM 실수신/탭 및 세션 재시작 검증이 남았다. 기존 1일/2시간 예약 알림과 신규 3시간 알림의 중복 전환도 확인해야 한다.

전체 완료 전에는 사용자 휴대폰 `R3CX80FNR3H`에 설치하지 않는다. 최종 APK 업무메일 From/Reply-To/To는 `mkt@polarad.co.kr`; 아직 전송하지 않았다. 고객 문자·실제 푸시도 보내지 않았다.

## 최종 APK 및 UI 증거

- Debug SHA256: 93836f212e5c9909f928466954e4e560ba3d2ea567f95711c6a5de81f1f964e7
- Release SHA256: e0bc4f76b586df1fe06cc255a2a7398a026a2480540af183b06465f1aa8571f
- 빌드 로그: .tools/final-fcm-debug-build.log, .tools/final-fcm-release-build.log
- 실제 FCM 수신/탭: .tools/qa/46-fcm-received.png, .tools/qa/47-fcm-tap-inbox.png. 고객 데이터가 없는 전용 에뮬레이터로만 발송.
- 전용 운영 Worker: worker/wrangler.crm.toml, day1design-crm-api, api.day1design.co.kr/api/mobile* 경로와 기존 day1design D1 바인딩. 기존 웹/API 전체를 배포하는 것과 구분한다.
- iMac: 프로젝트 기존 ssh imac 경로로 framei-iMac.local/pola 확인. Node v25.6.0, cloudflared 2026.1.0, sleep=0, autorestart=1. 기존 서비스 변경 없음.
