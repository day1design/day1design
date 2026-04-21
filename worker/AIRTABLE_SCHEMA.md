# Airtable Base 스키마

> 이 파일에 맞춰 Airtable Base에 4개 테이블을 생성하세요.
> Base 생성 후 `AIRTABLE_TOKEN`(PAT), `AIRTABLE_BASE_ID`를 `worker/.dev.vars` 및 `wrangler secret put` 으로 주입.

## Base 생성

1. [Airtable](https://airtable.com) → Create a base → `day1design`
2. 우측 상단 Account → Developer hub → Personal access token 발급
   - Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
   - Access: 해당 base만
3. 토큰 복사 → `.dev.vars`에 `AIRTABLE_TOKEN=pat.xxx` 저장
4. URL에서 Base ID 추출 (예: `https://airtable.com/appXXXXXXXXXXXXXX/...` → `appXXXXXXXXXXXXXX`)

## 1. `Estimates` 테이블 (상담신청)

| 필드명           | 타입                  | 비고                                           |
| ---------------- | --------------------- | ---------------------------------------------- |
| `Name`           | Single line text      | primary field로 지정                           |
| `Phone`          | Single line text      | `010-0000-0000` 형식                           |
| `Email`          | Email                 |                                                |
| `SpaceType`      | Single line text      | 아파트/빌라/주택/상가/기타                     |
| `SpaceSize`      | Single line text      | 20~30평/30~40평/...                            |
| `Postcode`       | Single line text      |                                                |
| `Address`        | Single line text      |                                                |
| `AddressDetail`  | Single line text      |                                                |
| `Schedule`       | Single line text      |                                                |
| `Referral`       | Single line text      |                                                |
| `Branch`         | Single line text      | 강남점/판교점/지점 무관                        |
| `Detail`         | Long text             |                                                |
| `PrivacyAgreed`  | Checkbox              |                                                |
| `ConceptFiles`   | Long text             | JSON 문자열 (R2 URL 배열)                      |
| `FloorPlans`     | Long text             | JSON 문자열 (R2 URL 배열)                      |
| `SubmittedAt`    | Date (with time, ISO) |                                                |
| `IP`             | Single line text      |                                                |
| `Status`         | Single select         | 접수대기 / 상담중 / 견적완료 / 계약완료 / 취소 |
| `Assignee`       | Single line text      |                                                |
| `ContactedAt`    | Date (with time)      |                                                |
| `Memo`           | Long text             |                                                |
| `EstimateAmount` | Number                | 원 단위                                        |

## 2. `HeroSlides` 테이블 (메인 히어로)

| 필드명   | 타입             | 비고                           |
| -------- | ---------------- | ------------------------------ |
| `Image`  | URL              | primary field, R2 public URL   |
| `Href`   | Single line text | 비우면 클릭 불가               |
| `Alt`    | Single line text | 접근성/SEO                     |
| `Order`  | Number (int)     | 0부터, 오름차순 정렬           |
| `Active` | Checkbox         | 기본 체크됨, 숨김 처리 시 해제 |

## 3. `Portfolio` 테이블 (시공 포트폴리오)

| 필드명        | 타입             | 비고                                                     |
| ------------- | ---------------- | -------------------------------------------------------- |
| `Name`        | Single line text | primary field (예: "판교 TH212 47py")                    |
| `Folder`      | Single line text | R2 이미지 폴더 slug (예: "판교-th212-47py")              |
| `Count`       | Number (int)     | 상세 이미지 개수                                         |
| `Category`    | Single select    | HOUSE / OFFICE                                           |
| `Order`       | Number (int)     | 그리드 표시 순서 (0부터)                                 |
| `RightFolder` | Single line text | 카드 우측 페어링 시                                      |
| `RightCount`  | Number (int)     | 페어링 시                                                |
| `RightName`   | Single line text | 페어링 시                                                |
| `ThumbAfter`  | URL              | (선택) 그리드 after 썸네일 직접 지정. 비우면 파일명 규칙 |
| `ThumbBefore` | URL              | (선택) before 썸네일                                     |

## 4. `Community` 테이블 (커뮤니티 게시글)

| 필드명          | 타입             | 비고                                                      |
| --------------- | ---------------- | --------------------------------------------------------- |
| `Idx`           | Single line text | primary field, unique (기존 imweb ID 유지)                |
| `Title`         | Single line text |                                                           |
| `Category`      | Single line text | 주거-디자인제안 / 주거-포트폴리오 / 상업-...              |
| `Date`          | Date             |                                                           |
| `Board`         | Single select    | Residential / Commercial                                  |
| `Thumb`         | URL              | 썸네일 R2 URL                                             |
| `Views`         | Number (int)     |                                                           |
| `Excerpt`       | Long text        | 목록 카드 요약 (80자)                                     |
| `BodyText`      | Long text        | 평문 본문 (fallback)                                      |
| `Images`        | Long text        | JSON 문자열 (URL 배열)                                    |
| `ContentBlocks` | Long text        | JSON 문자열 `[{type:"text",content}\|{type:"image",src}]` |

> `ContentBlocks`가 실제 본문 렌더에 사용됨. 블록 순서가 곧 본문 순서.

## 마이그레이션 순서

Airtable에서 위 4개 테이블을 만든 뒤:

```bash
cd F:/day1design_homepage
node scripts/migrate-to-airtable.js --target=hero        # 10건
node scripts/migrate-to-airtable.js --target=portfolio   # 35건
node scripts/migrate-to-airtable.js --target=community   # 86건
# 또는 전체
node scripts/migrate-to-airtable.js --target=all
```

스크립트는 `site/.env.local`에서 `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`를 읽습니다.
