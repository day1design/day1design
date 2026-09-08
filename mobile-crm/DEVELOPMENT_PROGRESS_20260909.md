> **운영 연결 최신 상태:** `OPERATIONAL_CONNECTION_20260909.md`가 아래 초기 개발 기록보다 우선한다. Firebase/SENS/SMTP 설정은 발견·검증했으며, Firebase 앱 관리 권한 403과 OTP 릴레이 운영 배치가 남아 있다. 아래 APK 해시는 이전 빌드 기록이다.

# Android CRM 개발·검증 현황 — 2026-09-09 KST

사용자 최신 지시: 남은 개발을 먼저 완료한 뒤 폴라애드 업무메일에서 자기 주소로 APK를 보낸다. **메일 발송 0회. 전체 제품 완료 아님.**

## 추가 구현과 설치 지시 반영

사용자가 연결 휴대폰에 **전체 완료 후 설치**하도록 승인했다. ADB에서 SM-S928N 연결을 확인했으며, 아직 해당 휴대폰에 설치하거나 설정을 변경하지 않았다. 다음 설치 단계에서 기기를 다시 확인한다.

이번 재개 작업으로 완료한 범위:

- 기기 등록·자기 기기 목록·해제 API와 migration 0052. 토큰을 응답에서 제외하고 사용자당 5개 제한, 세션 만료/로그아웃/직원 비활성/업체정지 경계를 검증했다. 실제 푸시 전송은 미연결이다.
- 기간 선택과 유효성 검사, 원본 접수 일별 추이·출처별 집계. 출처 정규화와 100개 초과 기타 건수로 합계를 보존한다. 방문→접수 퍼널이라고 표시하지 않는다.
- SMS/알림톡 수신 예시와 메시지 버블, 현재 업체명, 예시 변수 치환. 실제 발송은 하지 않았다.
- Worker 107/107, Android build/lint 통과. 에뮬레이터에서 기간조회/재조회/잘못된기간/채널별미리보기/콜드재실행을 확인했다.

최신 빌드 로그: `.tools/android-preview-build.log`. 서버 테스트 로그: `.tools/worker-suite-current.log`. 최신 화면: `.tools/qa/41`부터 `45` 파일. 외부 OTP/FCM/SENS/제품서명/업데이트 및 전체 요구사항은 여전히 미완료이며, 아래 선행 조건이 필요하다. 메일과 실기기 설치는 아직 수행하지 않았다.

## 확인된 결과

- Android debug 빌드와 lint 통과. lint 결과 `No issues found.`
- Worker 통합 회귀 테스트 107개 통과, 실패 0개. 실제 Worker handler를 로컬 SQLite D1 호환기로 실행해 앱과 연결했다. 원격 D1 검증은 아니다.
- 전용 `polarad_crm_dev` / `emulator-5582`에만 APK 설치. 실물 휴대폰과 기존 다른 AVD는 변경하지 않았다.
- 로컬 이메일 OTP 로그인, 기존 세션 복구 및 강제종료 후 콜드 재실행 확인.
- 데이원 업무공간은 기존 관리자 왼쪽 사이드바 원본 로고 사용. 플랫폼/공통 로그인은 폴라애드. 최종 앱 화면 및 기획 HTML에 업체별 구분 반영.
- 기존 Estimates 원본 고객정보 수정, 방문 생성·변경·취소, 버전 충돌 제어, 달력 표시 확인. 기존 웹 예약 변경은 원본 필드와 트리거로 연결한다.
- 대표의 직원 추가 후 목록 즉시 갱신, 직원 알림함과 수신자별 읽음 저장 확인.
- 개별 업무 알림 `Selected final QA`가 선택한 `qa.staff2@day1.local` 한 명에게만 저장됨을 DB에서 확인. 외부 전송이 아니다.
- 기존 템플릿 편집 시 본문 불러오기, 변수 삽입, SMS/알림톡 화면 채널 전환, 이름 치환 결과, 초안 ON 저장 확인. 승인 템플릿이나 실제 채널 발송 성공을 의미하지 않는다.
- 통계는 로컬 저장 접수 1건을 표시. 업체별 연결이 없는 Meta/Pixel/세션은 확인 필요로 표시하고 0으로 대체하지 않는다.
- 플랫폼 관리자가 격리 QA 업체를 생성·정지했고, 기존 데이원 업체는 유지됨을 확인.

## 최종 검증 APK

F:\day1design_homepage\mobile-crm\android\app\build\outputs\apk\debug\app-debug.apk

SHA256: ddccd2ab51b6a29430ab9bad855e80bf068d8639b6b4d696a5675b7772858a36

패키지 `kr.polarad.crm.dev`, versionName `0.1.0`, versionCode `1`, debug 서명이다. debug API는 기기 loopback `127.0.0.1:18791`; release API는 미설정이다. **PC 연결 없이 원격으로 사용할 완성 APK가 아니다.**

F:\day1design_homepage\mobile-crm\qa\final-evidence.json

F:\day1design_homepage\mobile-crm\.tools\qa\35-final-dayone-logo.png

F:\day1design_homepage\mobile-crm\.tools\qa\38-final-template-preview.png

F:\day1design_homepage\mobile-crm\.tools\qa\39-final-analytics.png

F:\day1design_homepage\mobile-crm\.tools\final-android-build.log

F:\day1design_homepage\mobile-crm\.tools\worker-suite.log

최종 APK 재설치 후 기간별 통계·잘못된 날짜·새로고침·SMS/알림톡 미리보기·콜드 재실행을 재확인했다. 기존 고객 변경/직원 관리 시나리오는 앞선 빌드의 검증이며 이번 변경에서 해당 코드는 수정하지 않았다.

## 코드 변경 범위

- `mobile-crm/android/`: Java 앱 인증·고객/일정·직원·알림·메시지 초안·통계·플랫폼 업체 관리.
- `worker/src/routes/mobile-crm.js`, `mobile-management.js`, `mobile-notifications.js`: 모바일 API, tenant/role 경계, 원본 고객 변경, 일정, 직원/업체 관리, 알림·초안.
- `worker/src/lib/crm-*.js`: OTP/세션/속도제한, 크기 제한 JSON 파서, 통계 출처 구분, 알림 수신자/읽음, outbox 검증, 스케줄러.
- `worker/src/index.js`, `worker/src/lib/access.js`: 정확한 모바일 경로 연결 및 feature flag. 주변의 기존 변경은 보존.
- migrations `0045`–`0052`: CRM 스키마, OTP 제한, 예약/원본 변경·담당자 알림, 날짜 조회 인덱스, 스케줄 커서. **운영 미적용.**
- `mobile-crm/server/worker-local.mjs`, `d1-local.mjs`: 운영 환경을 로드하지 않는 실제 handler 격리 실행기.
- `docs/polarad-interior-crm-plan-20260908/`: 업체별 원본 로고와 기획 HTML.

신규 고객/담당자 지정/예약 변경 내부 알림, 3시간 전 outbox 예약과 변경·취소·OFF·업체정지 무효화, 매일 10시 KST 브리핑 생성 기반은 로컬 구현했다. 신규 CRM 및 자동화 플래그는 운영에서 활성화하지 않았다. 외부 delivery adapter가 없어 발송 시도는 차단된다.

## 미완료 제품 범위와 선행 조건

1. 운영 모바일 API와 실제 이메일 OTP 전달 어댑터: 현재 `CRM_OTP_DELIVER`는 로컬 함수이며 운영 전송 경로는 구현·연결해야 한다. Worker에서 NAVER WORKS SMTP로 전달할 서버 경로/권한, 앱 운영 API 주소와 비밀값이 필요하다.
2. Android FCM 등록·서버 기기 토큰·수신 및 탭 이동, 잠금화면 노출 정책: 프로젝트별 Firebase 설정과 기존 사용 가능한 SDK 확인 후 구현·검증해야 한다. Firebase를 설정하기만 하면 완료되는 상태가 아니다. 설치 금지된 패키지 매니저로 의존성을 추가하지 않는다.
3. 고객 메시지: 플랫폼 SENS 연동값 관리, 승인 템플릿 적용/재승인, 실제 provider adapter 및 응답/중복 방지 검증이 남았다. 기존 1일/2시간 리마인드와 신규 3시간 리마인드의 운영 전환도 미완료. 채널별 수신 예시/메시지 버블과 현재 업체 발신명은 구현·에뮬레이터 확인했다. 실제 발신번호·채널·승인 템플릿 연결과 실발송 검증은 남았다.
4. 분석: 업체/채널별 원본 연결과 방문→접수 흐름·이탈 분석·추이 등 전체 기획의 분석 화면이 남았다. 임계값을 임의로 정해 효율을 단정하지 않는다.
5. 제품 패키지/서명 보존, 원격 업데이트 검증·배포/롤백 경로, 지정 실기기 로그인·푸시·콜드 재실행이 남았다. 아직 debug package만 있다.
6. 미확정 정책: 직원 조회/수정/통계 권한과 3시간 이내 신규·변경 예약 처리. 현재 직원 쓰기는 허용하지 않고, 3시간 이내 outbox는 수동 확인으로 차단한다. 최종 정책이라고 보고하지 않는다.
7. 전체 35개 기획 화면과 제품 요구사항을 전부 구현한 상태가 아니다. iOS는 Android 이후 별도 Mac 환경에서 진행한다.

## 프로젝트 설정 확인 결과

- `F:\master_polarad\.env.local`의 기존 NAVER WORKS SMTP 설정 존재 확인. SMTP 계정이 `mkt@polarad.co.kr`이고 비밀번호가 설정되어 있는지 불리언으로 확인했다. 인증 시도/메일 발송은 하지 않았다. 비밀값은 문서/로그에 남기지 않는다.
- 업무메일 From/Reply-To/수신자는 사용자 요청대로 `mkt@polarad.co.kr`. Gmail fallback 금지.
- 현재 프로젝트 `worker/.dev.vars`에 NCP SENS 키·서비스 ID 설정은 있지만 `NCP_SENS_FROM_NUMBER`는 비어 있다. Firebase/FCM 및 모바일 운영 설정은 확인되지 않았다.
- SMTP 존재만으로 모바일 운영 로그인·배포 권한이 정해지는 것은 아니다. 제품별 Firebase/API/서명 설정 경로를 받아 해당 프로젝트 기준으로 연결한다.

## 이어서 진행하는 순서와 중지 조건

제품별 운영 API/OTP 전달 경로 및 Firebase 설정 위치 확인 → 미확정 직원/단기 예약 정책 확정 → FCM·딥링크·기기 토큰/업데이트 및 SENS 플랫폼 연동 구현 → 원천 통계/전체 화면 확장 → 로컬 회귀/에뮬레이터 재검증 → 허용된 범위에서 운영·지정 실기기 검증 → 검증된 최종 APK만 업무메일로 1회 전송하고 실제 발송 결과 기록.

현재 중지 조건은 외부 설정/정책이 필요한 다음 제품 연결 단계다. 기본 기능의 로컬 검증은 끝났지만 전체 완료라고 표시하거나 개발 APK를 완제품으로 보내지 않는다.

## 로컬 재개 정보

실행/빌드 방법은 README.md 참조. 서버 loopback `18792`, ADB reverse `18791`→`18792`. 서버 재시작 시 포트와 node 실행 경로를 확인하고 이 작업의 프로세스만 재시작한다. PID는 재사용될 수 있으므로 문서 숫자만 믿고 종료하지 않는다.

로컬 DB: `.tools/worker-runtime/local.sqlite3`. 로컬 계정 owner@day1.local, staff@day1.local, platform@polarad.local. OTP는 `.tools/worker-runtime/inbox/`의 최신 해당 이메일 파일에만 있다. 실제 고객에게 발송하지 않는다. QA fixture 고객 `local-customer-1`과 신규 qa-tenant/staff2/staff3는 모두 격리 DB에만 존재한다.

Git 작업트리에 기존 분석/히트맵/마케팅 및 수많은 untracked 산출물이 섞여 있다. 이번 작업에서 commit/push/deploy/운영 migration/고객 발송/실기기 설치는 수행하지 않았다. Java LSP 및 Codacy 실행 도구는 제공되지 않아 실행하지 못했다. Gradle lint와 빌드 및 실제 UI 검증으로 보완했으며 외부 서비스 검증을 대체하지 않는다.
