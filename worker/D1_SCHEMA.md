# Day1Design D1 데이터베이스

이 Worker의 데이터 저장소는 **Cloudflare D1** (SQLite). Airtable에서 2026-04-28 마이그레이션 완료.

- DB 이름: `day1design`
- DB ID: `60c293bc-5359-4a94-bc18-c3cda0829366`
- 리전: APAC (ICN)
- 바인딩: `env.DB`

## 어댑터

`src/lib/d1.js` — Airtable 호환 시그니처(`{id, fields:{...}}`).

```js
import {
  d1List,
  d1ListAll,
  d1Get,
  d1Create,
  d1Update,
  d1Delete,
  d1ReplaceAll,
} from "../lib/d1.js";

// 필터: where 객체 (동등 비교만, 컬럼 화이트리스트 검증)
const records = await d1ListAll(env, "Estimates", {
  where: { Status: "접수대기" },
  sort: [{ field: "SubmittedAt", direction: "desc" }],
});
```

ID는 `rec` + 14자 알파뉴메릭. 마이그레이션 시 기존 Airtable id 보존.

## 테이블 5개

| 테이블          | 용도                           | 인덱스                            |
| --------------- | ------------------------------ | --------------------------------- |
| `Estimates`     | 상담 신청(공개 폼 + Meta Lead) | Status, SubmittedAt, Phone, Email |
| `EstimateMemos` | 상담 쓰레드 메모               | (EstimateId, CreatedAt)           |
| `HeroSlides`    | 메인 캐러셀(최대 10)           | "Order"                           |
| `Portfolio`     | 시공 포트폴리오                | "Order"                           |
| `Community`     | 게시글                         | (Board, Date desc), Idx UNIQUE    |

> SQL 예약어 `Order`는 `"Order"`로 인용 처리(어댑터 자동 변환).

## 운영 명령

```bash
# 스키마 적용 (운영)
npm run d1:migrate

# 로컬 D1 (Miniflare)에 스키마 적용
npm run d1:migrate:local

# 운영 D1 백업 (SQL dump → _export/d1-backup.sql)
npm run d1:export

# 임의 SQL 실행
wrangler d1 execute day1design --remote --command="SELECT COUNT(*) FROM Estimates"
```

## 마이그레이션 이력

- 2026-04-28: Airtable → D1 빅뱅 컷오버 (174건). 어댑터 alias로 라우트 6개 import 1줄만 변경.
- 백업: `_archive/airtable-legacy/_export/` (Airtable 시점 JSON + 1회용 D1 import SQL)
- 레거시 코드: `_archive/airtable-legacy/`
