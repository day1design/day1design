# 폴라애드 인테리어 CRM — Android 개발

Android 네이티브 앱과 기존 Estimates 원본을 사용하는 Worker 모바일 API입니다. 로컬 SQLite D1 호환 실행기에서 인증·고객 변경·예약·알림·업체 관리를 검증했습니다. 운영 배포 및 원격 접속 가능한 배포 APK는 아직 아닙니다.

## 구조

- `android/`: Java Android 앱, 개발 패키지 `kr.polarad.crm.dev`
- `../worker/src/routes/mobile-*.js`: 인증된 모바일 API
- `../worker/src/lib/crm-*.js`: OTP/세션·분석·알림·자동화
- `../worker/migrations/0045`부터 `0052`: 신규 CRM 스키마, 운영 미적용
- `server/worker-local.mjs`: 실제 Worker handler를 격리 SQLite로 실행
- `server/d1-local.mjs`: D1 prepare/batch 로컬 호환기, rollback 검증
- `server/app.py`: 보존한 초기 Python 데모
- `qa/`: 전용 에뮬레이터 QA 도구
- `DEVELOPMENT_PROGRESS_20260909.md`: 최신 검증과 운영 전환 조건

기기 등록 API 계약은 `DEVICE_CONTRACT.md`를 참조합니다. 실제 FCM 수신은 아직 검증되지 않았습니다.

## 실행

프로젝트 루트의 PowerShell에서 기존 로컬 도구를 직접 사용합니다.

```powershell
& .\mobile-crm\scripts\start-worker-local.ps1
& .\mobile-crm\scripts\build-android.ps1
```

Worker 실행기는 `127.0.0.1:18792`만 사용합니다. Android debug가 사용하는 기기 포트 `18791`을 해당 로컬 서버에 연결합니다. 전용 AVD를 확인한 뒤에만 다음을 실행합니다.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5582 emu avd name
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5582 reverse tcp:18791 tcp:18792
```

이번 전용 AVD는 `polarad_crm_dev` / `emulator-5582`입니다. 기존 AVD/실기기는 변경하지 않습니다. 이미 서버가 실행 중이면 시작 스크립트는 중복 실행을 거부합니다.

계정: `owner@day1.local`, `staff@day1.local`, `platform@polarad.local`. 실제 메일을 보내지 않고 생성한 랜덤 OTP를 ignored `.tools/worker-runtime/inbox/`에 저장합니다. 운영 환경 파일은 이 실행기에 로드하지 않습니다. DB와 세션 키도 `.tools/worker-runtime/`에만 있습니다.

플랫폼·로그인은 폴라애드, 데이원 업무공간은 기존 관리자 왼쪽 사이드바 원본 로고를 사용합니다. 원본 기획서는 아래 위치입니다.

F:\day1design_homepage\docs\polarad-interior-crm-plan-20260908\index.html

운영 연결/서명/푸시 수신은 별도 검증이 필요합니다. 로컬 빌드 또는 알림함 저장을 이메일·FCM·SMS 전달 성공으로 해석하지 않습니다.
