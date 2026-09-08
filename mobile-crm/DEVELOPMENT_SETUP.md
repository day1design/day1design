# Android 우선 개발 환경

2026-09-08 KST. 도구 확보 및 독립 테스트 APK 빌드 완료.

## 준비 완료
- 기존 Android Studio / JDK 17 / ADB / 에뮬레이터 확인. WHPX 가속 사용 가능.
- Gradle 8.13 공식 배포본 다운로드 및 SHA-256 검증.
- Android SDK 36 / Build Tools 35.0.0 / Command-line Tools 23.0 추가.
- AGP 8.13.2 + Gradle 8.13 + JDK 17로 33개 작업 실행, BUILD SUCCESSFUL.
- 최신 CLI는 SDK/cmdline-tools/latest-2. 기존 latest 12.0은 다른 작업을 위해 유지.
- npm 및 패키지 러너 사용 없음. 전역 PATH 변경 없음.

## 경로
- 도구: F:\day1design_homepage\mobile-crm\.tools
- SDK: C:\Users\flame\AppData\Local\Android\Sdk
- IDE: C:\Program Files\Android\Android Studio
- 검증 로그: F:\day1design_homepage\mobile-crm\.tools\android-build-check.log
- 검증 APK: F:\day1design_homepage\mobile-crm\.tools\android-build-check\app\build\outputs\apk\debug\app-debug.apk

## 남은 제품 개발
테스트 APK는 CRM 제품 앱이 아닌 도구 검증용이다. 휴대폰 설치·운영 변경·발송은 하지 않았다. 승인된 UI의 제품 구현, 실제 OTP·테넌트 격리·웹 공통 데이터 연결·전용 Firebase/푸시 설정·제품 서명·실기기 검증은 남아 있다. 와이어프레임의 가상 인증과 가상 데이터를 제품 구현으로 취급하지 않는다.

공통 기능은 기존 웹과 원본을 공유하고 앱 전용 화면은 웹에 신설하지 않는다. 기존 단일 업체 관리자 토큰을 앱에 포함하지 않는다. 고객 메시지는 QA로 발송하지 않는다.

iOS는 Android 이후 진행한다. Xcode는 호환 macOS의 Mac이 필요하므로 현재 Windows에 설치하지 않았다. Mac 접근/설치 상태는 아직 미확인이다. 개발자 계정 등록과 도구 설치는 별개다.

## 공식 근거
- https://developer.android.com/studio/install
- https://developer.android.com/build/releases/agp-8-13-0-release-notes
- https://gradle.org/release-checksums/
- https://developer.apple.com/xcode/system-requirements/
