# 웹 원본 연결 조사 — 2026-09-08 KST

현재 Android 개발 API는 격리 SQLite를 사용한다. 운영 웹과 동기화된 상태가 아니다.

| 앱 데이터 | 기존 원본 | 연결 시 주의 |
| --- | --- | --- |
| 고객 정보·담당자 | Estimates: Name, Phone, Address, EstimateAmount, Assignee, Status | 기존 식별자 보존, tenant 소유 매핑과 행 버전 필요 |
| 방문 상담 | ConsultAt, ConsultBranch, ConsultCancelledAt | ISO 시각. 현재 한 접수에 한 상담 슬롯; 앱의 다회 일정과 구분 |
| 상담 이력 | EstimateMemos: EstimateId, Body, Author, CreatedAt, UpdatedAt | 기존 Memo 덮어쓰기 금지. 결과 종류/완료 확인/후속 행동은 확장 모델 필요 |
| 계약 | ContractAt, ContractOwner, ContractAmount | 원본 금액·담당자·시각 유지 |
| 실측 | 대응 원본 없음 | tenant/customer 소유를 포함한 다회 일정 테이블 필요 |

## 확인한 코드
- worker/src/routes/estimates.js: handleEstimates는 목록 GET 및 ID PATCH/DELETE를 제공한다. 단일 고객 GET이 이미 있다고 가정하지 않는다.
- worker/src/routes/estimates.js: patchEstimate는 예약 변경 시 ConsultRemind1dAt/ConsultRemind2hAt를 초기화하고 상담 알림을 호출한다. 개발 QA를 이 API에 연결하면 외부 알림 부작용이 생길 수 있다.
- worker/src/lib/auth.js: verifyAdmin은 day1_admin 쿠키 또는 Bearer JWT의 sub=admin을 검증한다. 업체 membership 검증이 아니다. 이 토큰을 Android에 복사하지 않는다.
- worker/migrations/0001_init.sql 및 0041~0044: 기존 고객·메모·상담·계약 스키마 근거.

## 실서비스 연결 전 작업
1. D1의 기존 데이원 레코드 소유를 서버에서 명시하고 신규 tenant/membership/session/row-version 확장을 로컬 D1에서 검증한다.
2. 기존 웹과 Android가 동일한 domain mutation을 호출하게 만들고, 읽기·쓰기·파일·집계 전부에 서버 tenant 경계를 적용한다.
3. 웹 변경에도 version이 증가하도록 연결한 후 교차 클라이언트 충돌을 검증한다. 앱 단독 버전 검사는 웹 동시 수정 보호가 아니다.
4. 기존 최초 접수 고객 발송을 보존하며 신규 outbox와 중복되지 않도록 연결한다. 3시간 리마인드는 기존 내부 1일/2시간 규칙과 대상을 구분한다.
5. 현재 프로젝트 로컬 권한으로 배포 경로를 확인한 뒤 승인 범위에서 전환한다. 운영 고객으로 테스트하지 않는다.
