> 최신 구현·검증 상태: [DEVELOPMENT_PROGRESS_20260909.md](DEVELOPMENT_PROGRESS_20260909.md). 아래 내용은 당시 기록이며 최신 완료 범위나 APK 해시로 사용하지 않는다.

# 폴라애드 인테리어 CRM 세션 핸드오프

기준: 2026-09-08 KST. 작업 위치: `F:\day1design_homepage`.

## 1. 현재 단계와 사용자 승인

사용자는 UI/UX와 인프라를 먼저 설계하고 로컬 HTML로 검토한 뒤, 실제 개발을 Android 우선 → iOS 후속 순서로 진행하도록 승인했다. 개발 도구 확보도 명시적으로 요청했다. 최신 요청은 “세션핸드오프하고 하자”이므로 이 문서 작성 후 이번 세션을 마친다.

현재 결과는 **35개 화면의 로컬 기획 프로토타입과 Android 빌드 도구 검증**이다. 실제 CRM 앱, 운영 OTP, 다중 업체 API, 실기기 푸시는 아직 구현·검증하지 않았다. 다음 세션은 기존 기획을 처음부터 다시 만들거나 진행 허락을 다시 묻지 말고 실제 개발을 위한 코드·스키마 확인부터 이어간다. 중요한 미확정 제품 정책은 별도로 확정한다.

## 2. 최신 확정 요구사항

이 표는 대화의 최신 수정사항을 반영한다. 누적 기획 파일의 오래된 문구와 충돌하면 이 표를 우선한다.

| 영역 | 확정 내용 |
| --- | --- |
| 제품 | **폴라애드 인테리어 CRM** SaaS. 데이원 전용 앱에서 변경됨. 폴라애드 로고 사용. |
| 관리자 | 플랫폼 전체관리자 → 업체 등록·계정·연동값·사용정지 관리 → 각 업체 CRM 구조. 관리자 이메일 `mkt@polarad.co.kr`. |
| 인증 | 이메일 아이디 입력 후 해당 계정 이메일로 OTP 발급·입력. 서버에서 업체/역할 판정. 데이원 대표는 `gahyun.co@gmail.com`. 두 메일 동시 발송 방식은 폐기. 다른 업체 목록이나 존재 노출 금지. |
| 업체 계정 | 대표와 직원 분리. 직원별 이메일 인증. 대표가 직원 등록·관리. 직원이 없으면 직원 대상 알림 기능 비활성화, 등록하면 활성화. 직원의 세부 조회·수정·통계 권한은 구현 전에 정책 확정 필요. |
| 거래 종료 | 업체 사용정지로 로그인·기존 세션의 서버 데이터·파일 접근·푸시·브리핑·리마인드 차단. 데이터 삭제는 별도. 재활성화와 감사 이력 고려. 이미 캡처·다운로드한 정보는 회수 불가하며 오프라인 캐시 즉시 회수도 보장 불가. 공개 홈페이지/신규 접수 중지는 별도 범위. |
| 웹 연동 | 기존 상담신청 관리 기능, 고객정보·담당자·예약·상담결과·계약 등 공통 기능은 같은 원본 데이터에 연결하여 웹↔앱 수정 반영. 앱 전용 기능 때문에 웹 화면을 신설할 필요는 없음. |
| 고객 카드 | 이름·연락처·지역·예산, 검색·상태·담당자, 상담 이력과 기존 관리 기능 유지. 상담 종료 후 결과 작성 → 기존 고객 접수카드 상담결과에 추가. 시간 경과만으로 상담 종료 처리하지 않음. 기존 계약전환도 앱에서 제공. |
| 일정 | 방문/상담과 실측을 구분. 고객 카드에서 실측 예약하면 일정관리와 알림에 반영. 캘린더 제공. |
| 내부 업무 알림 | **신규고객접수 / 방문예약 일정 / 실측예약 일정**. 신규 접수 알림에 이름·연락처·지역·예산 표시 요구. 잠금화면 노출 설정과 수신 권한은 보안 설계에 반영. |
| 직원 알림 | 같은 업체 직원 **전체알림과 개별알림 모두** 제공. 담당자 지정 시 해당 담당자에게 개별알림. 단순 회사 공지 중심에서 변경됨. 수신자별 읽음 분리, 발송 성공과 읽음 구분. 전체알림 수신자는 발행 시점 대상자로 기록. |
| 고객 메시지 | 기존 최초 DB접수 고객 확인 메시지 유지. 방문 및 실측 모두 **예약 3시간 전** 고객 리마인드. 날짜·시간·방문장소/실측현장·주소·지도·연락처 포함. 방문 장소와 실측 현장을 혼동하지 않음. |
| 편집·미리보기 | 앱에서 메시지 문구 수정, 변수 삽입, ON/OFF. 고객이 실제 보는 SMS/알림톡 형태의 미리보기 제공. 예시 이름·날짜·시간·주소 치환. 미리보기 채널 전환은 실제 발송 채널 변경과 다름. |
| SENS | 키·서비스ID·발신번호·채널·승인 템플릿 연결값은 플랫폼 관리자만 관리하며 서버에 보관. 알림톡 문구는 승인 템플릿 일치/재승인 필요. 초안 저장과 실제 발송 적용 분리. 기존 최초 접수 발송과 중복 방지. |
| 발송 재검증 | 예약 변경·취소·OFF·업체정지 시 대기 발송 무효화 및 실행 시 재검증. 예약 3시간 이내 신규/변경 시 즉시 1회 발송은 제안 상태이며 확정 아님. |
| 통계 | 접수·유입·Meta 통계를 축소하지 않고 앱에 최적화. 업체/내부채널별 방문→접수 흐름 및 접수량 변화, 이탈 구간과 조치 근거를 보여주는 앱 전용 분석. |
| 지표 | CPL/CPC/CPM, 홈페이지 방문과 실제 저장 접수 기준. Meta 네이티브 리드, 웹 접수, GA4 세션, Pixel/CAPI 이벤트를 같은 수치로 취급하지 않음. 기간·분모·출처·갱신시각·귀속 기준 표시. 판단과 가설 구분. |
| 인디케이터 | 양호 녹색, 부진 빨강, 주의 황토/호박, 데이터 부족 회색 등 의미 있는 상태색. 색만으로 의미 전달하지 않고 문구·수치 근거 병기. 임계값은 미확정. |
| 데일리브리핑 | 매일 오전 10시 KST 마케팅 효율 체크 앱 알림과 CPL/CPC/CPM 분석. 내부 업무 알림 3종과 별도 기능으로 유지. |
| 디자인 | 모든 드롭다운은 바텀시트. 날짜/시간 선택도 같은 방향. 인테리어 앱처럼 정교하고 직관적. 왼쪽 장식선, 과도한 카드·둥근 모서리·그라데이션·그림자 배제. **색을 없애라는 요구가 아님**: 상담/방문은 차분한 파랑, 실측은 테라코타 등 구분하고 핵심 배지도 적절히 사용. |
| 업데이트 | 원격 업데이트 가능 구조. 서명·호환성·단계배포·롤백 및 스토어 정책 고려. 무조건 무인 강제설치 가능하다고 약속하지 않음. |

## 3. 로컬 기획 파일

주 진입점:

`F:\day1design_homepage\docs\polarad-interior-crm-plan-20260908\index.html`

35개 화면 / 6개 흐름 그룹. “02 전체 화면 구조”에서 크게 나열된 보드로 전체 UX를 본다. 앱 미리보기, 화면 보드, 인프라/보안, 검토 항목을 포함한다. 외부 API 없이 로컬 예시 데이터로 동작한다. **목업 OTP 260908과 브라우저 내 가짜 사용자/상태를 제품 인증·권한으로 이식하지 말 것.**

동일 폴더의 주요 파일:

- `README.md`, `ux-plan.md`, `infra-plan.md`, `notification-plan.md`, `DESIGN.md`: 누적 기획. 오래된 부분에 이후 변경과 충돌하는 내용이 있을 수 있다.
- `shell.html`, `styles.css`, `refined.css`, `restrained.css`: HTML/CSS 원본.
- `prototype.js`, `team-planning.js`, `notification-planning.js`, `reminder-settings.js`, `customer-message-plan.js`, `message-editor.js`, `employee-alerts.js`: 순차 확장된 목업. 뒤 파일이 앞 동작을 교체하는 부분이 있으므로 그대로 제품 구조로 복사하지 않는다.
- `bottom-sheets.js/.css`, `storyboard.js/.css`, `message-editor.css`: 시트·전체 보드·메시지 미리보기.
- `build_preview.py`: 현재 조합 빌더. 기존 빌드 순서를 유지한다. **옛 `refine_preview.py`는 재실행하지 않는다**. 이후 변경을 덮을 수 있다.
- `polarad-logo.png`: 로고 사본. 원본은 `H:\3.폴라애드\2.회사문서\정사각로고.png`. 독립 HTML에도 로고 포함.
- `index-v01.html`: 과거 백업.

주요 화면군: P01–04 플랫폼관리, A01 로그인, C01–07 고객관리, S01–03 일정, D01–08 분석, N01–06 알림/담당자/메시지, M01–06 설정. N05는 고객 메시지 편집, N06은 직원 전체/개별 알림 작성.

## 4. 기획 검증 기록

이 결과는 **목업 동작 검증**이며 운영 백엔드 권한이나 실제 메시지 수신 증거가 아니다.

- `qa-results.json`: 35화면 × 1440/390/360 폭 = 105뷰, 14 checks, errors/overflow/external requests 없음으로 기록.
- `qa-sheets-board.json`: 기본 select 없이 시트 선택·취소·초점·Escape·키보드, 35화면/6그룹 보드, 반응형 및 사용정지/재개 목업 확인.
- `qa-employee-alerts.json`: 직원0 비활성, 선택 수신자만 개별알림, 다른 직원 접근 차단, 전체알림 두 수신자 기록, 수신자별 읽음, 마지막 직원 삭제 시 비활성. errors=[] 재확인.
- `qa-message-editor.json`: 담당자 지정/카드 연결, 날짜·시간·주소 실시간 치환, 초안·필수변수 검증, SMS/알림톡 미리보기, 실측 장소·시간 구분. errors=[] 재확인.
- `employee-alert-all.png`, `employee-alert-inbox.png`, `message-editor-alimtalk.png`, `message-editor-sms.png`, `semantic-calendar.png`, `semantic-indicator.png`: 해당 폴더의 화면 증거.
- 옛 `qa-team-style.json`의 무색/텍스트 전용 스타일 판정은 최신 사용자 색상 지시보다 이전 자료다.
- `.omx/state/polarad-crm-wireframe/ralph-progress.json`: 기존 자체 시각 평가 기록. 운영 승인이나 실서비스 QA 증거가 아님.

핸드오프 시 재확인한 index.html: 266101 bytes, SHA-256 `7af9a2b071b859d10546716060e78d7e4c52527eafa3dd8134e244ef21ccc222`.

## 5. Android 개발 도구 확보 결과

문서와 상태:

`F:\day1design_homepage\mobile-crm\DEVELOPMENT_SETUP.md`

`F:\day1design_homepage\mobile-crm\toolchain-status.json`

| 도구 | 확인/확보 상태 |
| --- | --- |
| Android Studio | 기존 `C:\Program Files\Android\Android Studio`, build AI-253.32098.37.2534.15336583 확인 |
| JDK | 기존 `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot`, Java 17.0.19 |
| SDK | `C:\Users\flame\AppData\Local\Android\Sdk` |
| Gradle | 공식 8.13 배포본 다운로드·체크섬 검증. `mobile-crm\.tools\gradle-8.13` |
| AGP | Google Maven의 8.13.2로 빌드 확인 |
| SDK 추가 | platforms;android-36 / build-tools;35.0.0 / cmdline-tools;latest 설치 성공 |
| 명령행 도구 | 23.0은 `Sdk\cmdline-tools\latest-2`에 설치됨. 기존 latest 12.0은 보존. 기존 경로 사용 시 XML 버전/위치 경고 가능하므로 최신 경로의 실제 실행파일 확인 후 사용 |
| ADB/에뮬레이터 | 기존 ADB 확인, Emulator 36.5.11, WHPX 사용 가능. 기존 AVD는 실행·변경하지 않음 |

Gradle 배포 ZIP SHA-256: `20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78`.

검증용 네이티브 Java 프로젝트:

`F:\day1design_homepage\mobile-crm\.tools\android-build-check`

compileSdk/targetSdk 36, minSdk 26, buildTools 35.0.0, AGP 8.13.2. `kr.polarad.crm.toolcheck`는 **도구 검증용 패키지명이며 제품 패키지명이 아니다**. TextView만 있는 빌드 확인 앱이다. 프레임워크·최종 제품 구조를 결정한 것이 아니다.

빌드 실행 조건: 프로세스 범위 JAVA_HOME을 위 JDK로, GRADLE_USER_HOME을 `F:\day1design_homepage\mobile-crm\.tools\gradle-cache`로 설정하고 검증 프로젝트 디렉터리에서 다음 실행파일을 직접 호출했다.

```text
F:\day1design_homepage\mobile-crm\.tools\gradle-8.13\bin\gradle.bat --no-daemon --console=plain assembleDebug
```

결과: **BUILD SUCCESSFUL in 38s**, 33 actionable tasks executed. Gradle 9 관련 deprecated 경고가 있으므로 무계획 업그레이드하지 않는다.

로그:

`F:\day1design_homepage\mobile-crm\.tools\android-build-check.log`

APK:

`F:\day1design_homepage\mobile-crm\.tools\android-build-check\app\build\outputs\apk\debug\app-debug.apk`

핸드오프 시 파일 재확인: 6709 bytes, SHA-256 `ef6c320a27a42699a94488b65b908611be76874cd17dd9a82e336124b80d241f`.

`.tools/`, `.gradle/`, build/, local.properties, 환경파일, 서명키는 `mobile-crm/.gitignore`에서 제외한다. `.tools/` ignore 동작도 확인했다. 글로벌 PATH 수정, npm 계열 설치는 없었다.

**수행하지 않은 것:** 실기기 설치·앱 실행, 실제 CRM 로그인, 푸시 수신, 제품 서명키/Firebase 등록, Google/Apple 개발자 계정 권한 확인, 운영 배포, 고객 발송, 커밋/푸시. 사용자는 개발자 계정 등록을 했다고 했으나 해당 계정 상태는 직접 확인하지 않았다.

iOS는 후속 단계다. Windows에서 Xcode를 설치하지 않았다. 사용할 Mac/macOS 및 접근 가능 여부는 미확인이다.

공식 참고: https://developer.android.com/studio/install , https://developer.android.com/build/releases/agp-8-13-0-release-notes , https://gradle.org/release-checksums/ , https://developer.apple.com/xcode/system-requirements/ .

## 6. 기존 서비스 연결 근거와 작업 경계

읽기 확인한 기존 초기 고객 메시지 구현:

- `worker/src/lib/sens.js`: CUSTOMER_SMS_SUBJECT는 `[데이원디자인] 상담 접수 확인`, buildCustomerSms(channel)는 홈페이지/Instagram/Facebook 접수 안내를 구분한다. 기존 안내에는 강남/판교 사무실과 지도·홈페이지 링크가 들어간다.
- `worker/src/routes/estimates.js`: 홈페이지 접수에서 buildCustomerSms("homepage")와 sendNcpSens를 호출하는 기존 경로가 있다. 별도의 초기 이메일 발송도 있으므로 리팩터링 전에 호출·중복 방지 구조를 확인한다.
- 이 세션에서 실제 고객 전송 결과는 검증하지 않았다. 원본 문구는 소스를 다시 읽고 보존한다.
- SENS 공식 자료: https://api.ncloud-docs.com/docs/sens-alimtalk-send . 승인 템플릿 및 SMS 대체발송 정책 확인용.

마지막 확인 시 기존 변경 파일: `worker/src/lib/analytics-rollups.js`, `worker/src/routes/analytics.js`, `exit-guard.js`, `heatmap.js`, `marketing.js`, `worker/tests/analytics-route.test.mjs`, `heatmap-route.test.mjs`. 미추적 `worker/tests/marketing-read-bounds.test.mjs` 및 앞서 관찰된 migrations 0037/0038/0039도 다른 작업으로 취급한다. 이 작업의 변경이라고 가정하거나 되돌리지 않는다. 새 `mobile-crm/`은 미추적 상태다. 기타 미추적 문서/산출물이 많으므로 다음 세션 시작 때 Git 상태를 다시 읽는다.

`docs/`는 Git ignore 대상이다. 이 핸드오프와 도구 파일이 존재한다고 커밋/원격 백업되었다고 말하지 않는다. 이번 세션 커밋·푸시·배포 없음.

AGENTS.md 준수: UI는 Vercel, Worker API는 Cloudflare. 배포 시 현재 프로젝트 로컬 env/메타데이터, ignore, Git 작성자·원격 인증·배포 계정 3개 권한을 별도 확인. 글로벌 로그인이나 다른 프로젝트 자격증명을 자동 사용하지 않는다. 비밀값 출력 금지. npm/npx 및 대체 클라이언트의 registry 설치/runner 사용 금지. 설치된 프로젝트 로컬 실행파일은 직접 호출 가능.

## 7. 다음 세션 작업 순서

1. AGENTS.md와 이 문서, 최신 HTML 및 인프라 기획을 읽고 현재 Git 상태를 확인한다. 기존 웹의 고객·예약·계약 API, 인증, D1 스키마와 알림 호출을 좁게 조사한다.
2. 실제 앱의 구조와 폴더 경계를 결정한다. 기존 웹 공통 API 재사용, Android 푸시/보안 저장소, 이후 iOS 확장성과 npm 금지를 함께 고려한다. 이 세션은 Flutter/Capacitor/네이티브 중 제품 기술을 확정하지 않았다. 도구 검증 앱을 제품으로 오인하지 않는다.
3. 플랫폼 관리자·업체·대표/직원 membership, 이메일 OTP 만료/재시도/속도제한, 서버 권한과 업체정지 동작을 격리된 개발 환경에서 우선 구현·검증한다. 기존 단일 업체 운영 권한을 훼손하지 않는다. 인증코드 평문 로그·앱 내 SENS 키 금지.
4. Android의 실제 로그인→고객 목록/상세→담당자/예약/상담결과/계약 변경을 같은 서버 데이터에 연결한다. 동시 수정 충돌, 취소·재시도·오프라인·세션 만료를 고려한다.
5. 내부 푸시 3종, 직원 전체/개별알림, 수신자 권한/읽음, 예약 버전 기반 고객 메시지 outbox·중복방지·ON/OFF·문구 미리보기를 연결한다. 실제 고객에게 테스트 발송하지 않는다.
6. 통계 원본/분모를 확인하고 모바일 상세 통계, 채널 흐름 인디케이터, Meta, 10시 데일리브리핑을 구현한다. 관찰 사실과 추천 가설을 분리한다.
7. 제품 패키지명·프로젝트별 Firebase·서명·알림 권한·딥링크·업데이트 방식을 정리하고 에뮬레이터에서 관찰 가능한 동작을 검증한다. 지정 실기기 설치와 외부 발송은 승인 범위 확인 후 별도로 수행한다. 기존 다른 AVD/연결 기기를 건드리지 않는다.
8. Android가 인증된 실제 사용 흐름과 종료 후 재실행까지 검증된 다음 iOS 도구·Mac·서명·배포를 진행한다.

미확정 정책: 직원 세부 권한, 3시간 이내 예약 처리, 인디케이터 표본/임계값, 데이터 보관/정지 기간 정책, 제품 패키지명·Firebase/스토어 배포 방식, iOS Mac 접근, 알림톡 편집 승인 흐름. 기존 기획 변경이 필요한 경우 구체적인 안을 작성하여 사용자 컨펌을 받는다.

완료 판단: 도구 빌드 성공만으로 제품 완료라고 보고하지 않는다. 업체 간 접근 차단, OTP/세션/정지, 실제 공통 데이터 동기화, 사용자 시나리오와 앱 재실행, 알림 수신·탭 이동까지 각각 증거와 미검증 범위를 구분한다.

## 8. 새 세션 시작 문구

> F:\day1design_homepage\mobile-crm\SESSION_HANDOFF_20260908.md 읽고 이어서 진행해. 폴라애드 인테리어 CRM은 UI/UX 기획 후 실제 개발 승인됐고 Android 먼저, iOS는 이후야. 로컬 35화면 기획과 Android 빌드 도구 검증은 완료됐고 제품 앱은 아직이야. 기존 작업을 보존하고 현재 코드/API/스키마를 확인한 뒤 실제 개발을 이어가. 공통 기능은 기존 웹과 동기화하고 앱 전용 기능을 웹에 억지로 신설하지 마. npm 사용, 운영 고객 테스트 발송, 무단 배포는 하지 마.


## 2026-09-09 실제 개발 후속 기록
이 문서의 초기 미구현 상태 이후 Android/API 개발과 에뮬레이터 검증을 수행했다. 최신 구현·검증·제약·후속 순서는 `DEVELOPMENT_RESULT_20260909.md`를 먼저 읽는다. 데이원 업체 로고도 기존 관리자 왼쪽 사이드바 원본으로 수정했다. 운영 연결과 제품 전체 완성은 아직 아니다.
