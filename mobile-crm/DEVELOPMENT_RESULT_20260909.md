> 최신 구현·검증 상태: [DEVELOPMENT_PROGRESS_20260909.md](DEVELOPMENT_PROGRESS_20260909.md). 아래 내용은 당시 기록이며 최신 완료 범위나 APK 해시로 사용하지 않는다.

# Android 우선 실제 개발 결과 — 2026-09-09 KST

핸드오프의 첫 실행 가능한 개발 단계를 구현했다. 격리된 SQLite API에 Android가 실제 HTTP 요청을 보내고 영속 저장한다. 운영 D1/웹 관리자와 동기화된 제품 완성본은 아니다.

## 로고 수정
기획서의 데이원 업체 화면과 Android 업체 화면에 기존 관리자 왼쪽 사이드바 원본을 적용했다. 원본 참조는 `site/admin/admin.js:307`의 favicon-192.png이며 복사본 SHA256은 `0e9b5f74ac7badf84aa9589639f1ac45ff5bd7f29078fd72a6ba8183fb18bb5a`이다. 공통 로그인과 폴라애드 플랫폼 화면은 플랫폼 브랜드를 유지한다.
기획서: `F:\day1design_homepage\docs\polarad-interior-crm-plan-20260908\index.html`
기획서 QA: 105개 뷰, 14개 체크, 오류·가로 넘침·외부 요청 0. 보드 로고는 데이원 30개, 공통/플랫폼 5개로 확인했다.

## 구현 범위
- `server/app.py`, `seed.py`, `test_server.py`: 이메일 OTP, 해시 세션, 업체/사용자 활성 확인, 고객 목록/상세/수정, 같은 업체 담당자, 방문·실측 예약, 상담결과, 계약, 감사기록, 버전 충돌 차단.
- `android/`: 네이티브 Java UI, 이메일 인증, Keystore 세션 저장, 로그인 복원, 조회/저장 폼, 하단 선택 창, 연결 재시도, 409 최신정보 재조회, 정지/만료 시 화면 제거, 서버 로그아웃.
- `LEGACY_INTEGRATION.md`: 기존 Estimates/메모/상담/계약 필드와 알림 부작용 조사. 기존 관리자 토큰을 앱에 배포하지 않는다.
- `scripts/start-dev-server.ps1`, `scripts/build-android.ps1`: 로컬 서버 시작 및 설치된 Gradle/JDK/SDK를 사용한 오프라인 빌드. 기존 DB는 자동 초기화하지 않는다.

## 검증 증거
API HTTP 테스트 14개 통과. OTP 만료/재사용/경합/제한, 다른 업체 접근, 직원 쓰기 거절, 정지, 세션 폐기, CAS 경합, 하위 기록 중복 방지, 요청/조회 범위를 검증했다.
최종 `assembleDebug lintDebug` 성공. lint는 오류 0, 경고 11개다. 경고는 화면 방향 고정, backup extraction rules, 리소스 반사 조회/미사용, 아이콘 및 문자열 관련이며 제거됐다고 주장하지 않는다. Gradle 9 호환성 deprecation 경고도 남는다.
전용 `polarad_crm_dev` / `emulator-5582`에서 앱 버튼으로 인증→고객 조회→담당자 저장→방문/실측 각각 저장→상담결과→6,200만원 계약 저장을 확인했다. 초기 기능 빌드에서 저장 흐름을 수행한 뒤 최종 APK를 덮어 설치해 콜드 복원, 409 충돌 재조회, 연결 끊김/재시도, 업체 정지, 로그아웃 서버 세션 삭제, 직원 조회 전용을 재검증했다.
최근 에뮬레이터 logcat 1500줄에서 FATAL EXCEPTION은 없었다. 전체 실행 이력 무오류 보장은 아니다.
증거: `.tools/qa/results.json`, `.tools/qa/01-login.png`부터 `12-staff-readonly.png`, `.tools/backend-tests.log`, `.tools/final-build.log`, `android/app/build/reports/lint-results-debug.txt`.

## APK
`F:\day1design_homepage\mobile-crmndroidppuild\outputspk\debugpp-debug.apk`
패키지: `kr.polarad.crm.dev` / 크기: 103752 bytes
SHA256: `020b85020e7c4dc5f09c3387e9e81aac01bd9d1d8fb109e0d256c8b41854bdad`
개발 debug APK이며 제품 서명/업데이트 패키지가 아니다. 실물 휴대폰에 설치하지 않았다. release API 주소는 미설정 상태다.

## 현재 로컬 실행 상태
서버는 loopback 127.0.0.1:18791, DB는 `server/runtime/crm.sqlite3`, OTP는 `server/runtime/inbox`의 로컬 파일로만 전달된다. 실제 메일을 보내지 않는다. owner@day1.local / staff@day1.local은 가상 계정이며 코드는 앱 요청 후 inbox에서 확인한다.
전용 에뮬레이터 5582와 로컬 서버를 이어서 확인할 수 있도록 실행 상태로 남겼다. 마지막 앱 상태는 직원 계정 고객 상세다. 기존 emulator-5580은 변경하지 않았다. 연결은 `adb -s emulator-5582 reverse tcp:18791 tcp:18791`; 실행 전 AVD 이름을 재확인한다. PID는 재시작으로 바뀔 수 있어 이름/포트를 다시 확인해야 한다.
가상 고객 customer-1의 version은 7이며 충돌 QA에서 로컬 경쟁 수정을 1회 모사했다. 업체 정지는 테스트 후 원복했다.

## 남은 실제 제품 작업
1. 기존 Worker/D1와 공통으로 사용할 업체·멤버·세션 모델 및 데이터 이관/어댑터를 구현하고 운영 부작용 없이 통합 검증.
2. 실제 이메일 OTP 전송 경로와 HTTPS 개발/운영 API 연결. 직원 권한 정책은 아직 미확정이므로 현재 임시 조회 전용.
3. 플랫폼 업체 등록/관리, FCM 및 outbox, 고객 메시지, 리마인더, 통계/브리핑, 전체 35화면 기능 확장.
4. 제품 패키지/서명/업데이트 방식 확정, 실기기 인증·콜드 재실행 검증, iOS 후속 개발.
5. UI 제품화: 상세의 일부 상태 코드/상담 시각 원문, 스크롤 중 시스템 바 겹침, 다양한 화면 크기/접근성, lint 경고 해결. 현재 기획서 전체 UI 재현 완료를 의미하지 않는다.

운영 Worker/site 변경, 고객 데이터 쓰기, 실제 메일/메시지/푸시, commit/push/deploy는 하지 않았다. 기존 혼합 작업트리 변경은 보존했다. Codacy MCP 도구가 없어 Codacy 분석은 미수행; 연결 문제는 확장 MCP 재설정 또는 Copilot MCP 설정 확인 후 재검증한다.
