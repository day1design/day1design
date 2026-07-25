# NEXT SESSION — 접수채널 유입량 + 광고썸네일 + 이메일 수신자 + Meta 저장체계 (2026-07-25)

커밋 11개, 전부 push·배포 완료. **Worker 재배포 2회**(최종 버전 `8f761cad`).

```
a8beda0 feat(admin)    접수채널(Source) 기준 통계 추가
ee239e2 fix(deploy)    .codegraph 113MB → Vercel 배포 전면 차단 해제
af25c55 docs           세션 핸드오프(이 문서)
2413914 test(upload)   업로드 정책 가드를 현행 기준으로 정정
ce0ab24 test(worker)   저장소 밖에 있던 가드 테스트 4개 편입
62920ae feat(admin)    상담신청 통계를 기간 필터로 전환
584e716 refactor       기간 컨트롤 일원화 + 「접수채널별 유입량」 박스 통합
459c346 docs           핸드오프 갱신
206dd50 fix(meta-ads)  광고 썸네일 R2 프록시 (실패 — 아래 §3 참조)
ea9ad15 docs           핸드오프에 썸네일 건 반영
ae91cd4 fix(meta-ads)  썸네일을 R2 공개 URL 로 서빙 — 이미지 401 해소 (최종)
```

워커 테스트 **104/104 통과**. 라이브에서 썸네일 표시 확인 완료.

---

## 1. 접수채널 유입량 통계 (완료·배포)

사용자 결정: **채널 기준 = `Estimates.Source`** (Meta / 홈페이지 / 네이버 / 구글 / 기타).
Referral(고객 직접입력)·Platform(FB/IG 세분화)은 채택하지 않음 — Platform 은 D1 의
meta 373건이 전부 `facebook` 이라 세분화 값이 사실상 없고, Referral 은 미입력 83건으로
커버리지 구멍.

**왜 별도 카드를 만들었나**: 유입통계의 「소스별 전환율」은 방문 분모가 필요해
`keys.delete("meta")` 로 Meta 를 제외한다(`site/admin/analytics.js`). 그런데 전체 접수
474건 중 Meta 가 373건(79%)이라 주력 채널이 통계에서 통째로 빠져 보였다. **이 둘을
합치려 하지 말 것 — 분모가 다르다.**

| 화면 | 함수 | DOM id | 집계 대상 |
| --- | --- | --- | --- |
| 유입통계 | `renderSubmissionChannels()` (`analytics.js`) | `submissionChannels` | `currentSubmissionRows` (선택 기간) |
| 상담신청 | `renderChannelStats(list)` (`estimates.js`) | `estChannelList` | `filtered()` (기간·상태·검색·유입탭) |

실측 분포: `Meta 373(79%) / 홈페이지 95(20%) / Naver 5(1.1%) / Google 1(0.2%)`

**비중 포맷 주의**: `fmtPercent()` 는 정수 반올림이라 0.2% 가 `0%` 로 뭉개진다.
10% 미만 소수 1자리를 살리는 `fmtConversionRate()`/`fmtShare()` 를 쓸 것.

### 상담신청 화면 최종 구조 (584e716)

```
┌─ 접수채널별 유입량 ─────────  현재 조건 474건 · 4개 채널 ─┐
│ [당일][3일][7일][15일][30일][60일][90일][전체●][선택기간] │
│  Meta 373 79%  홈페이지 95 20%  Naver 5 1.1%  Google 1 0.2%│
│  선택한 기간이 아래 접수카드 목록과 엑셀에도 함께 적용됩니다. │
└────────────────────────────────────────────────────────────┘
[상태▾] [엑셀 다운로드] [검색            ]
유입 [전체][Meta][홈페이지]
─ 접수카드 목록 (선택 기간 기준) ─
```

**설계 의도 — 되돌리지 말 것:**

- **기간 컨트롤은 이 화면에 하나뿐이다.** 처음엔 세그먼트를 넣고 툴바 날짜입력을
  그대로 뒀는데, 컨트롤이 둘이라 "어느 쪽이 통계를 지배하나" 로 혼동이 생겼다.
  툴바 날짜입력을 없애고 세그먼트에 `[선택기간]` 을 넣어 일원화했다.
  **툴바에 기간 입력을 다시 추가하지 말 것.**
- **날짜칸(`estRangePicker`)은 `선택기간` 일 때만 노출.** 다른 버튼은 기간을 스스로
  계산하므로 입력칸이 떠 있으면 어느 값이 진짜인지 헷갈린다 (`togglePeriodPicker`).
- **별도 상태를 두지 않는다.** 세그먼트가 기존 `filterFrom`/`filterTo` 를 직접
  세팅하므로 접수채널·목록·CSV 파일명이 한 경로로 따라온다. 별도 periodKey 상태를
  만들면 통계와 목록이 어긋날 여지가 생긴다.
- N일 = **오늘 포함** 최근 N일 (당일=0 → 오늘 하루). 기본값은 `전체`.
- 일간·주간·월간 3카드는 제거됨(사용자 요청). `.est-stat-label` 만 남아 재사용 중.
- 유입탭 "홈페이지" 는 `Source !== "meta"` 라 네이버·구글도 섞여 나온다(기존 탭 의미).

드라이런 검증(라이브 미접촉): 9개 버튼의 from~to·건수·날짜칸 노출 여부 전부 일치.
선택기간 왕복(`30일 → 선택기간 값 유지 → 직접입력 10건 → 7일 복귀 시 재계산·날짜칸
숨김`)까지 통과. 자정 경계(00:00:10 / 23:59:50) 포함 확인.

---

## 2. Vercel 배포 전면 차단 해제 (ee239e2)

`vercel --prod` 가 `File size limit exceeded (100 MB)` 로 실패. 업로드 총량 112.9MB 가
**`.codegraph/codegraph.db` 113MB 단일 파일** 이었다(code-review-graph MCP 산출물).
100MB 한도는 총량이 아니라 **단일 파일**에도 걸린다.

- `.vercelignore`: `.codegraph`, `test-results`(401MB), `_backup`, `_fav_tmp`,
  `blog-infographic-gangnam`, `workers` 제외
- `.gitignore`: `.codegraph/`, `test-results/`, `_fav_tmp/` 추가

**진단 요령**: `vercel` 출력의 `Uploading (NNN MB)` 총량을 적어두고
`find . -type f -size +50M -not -path "./.git/*"` 로 대조. 총량과 일치하는 단일 파일이
범인이다. MCP 를 다시 쓰면 `.codegraph` 는 재생성되지만 이제 무시된다.

---

## 3. 광고 썸네일 미리보기 깨짐 → R2 로 고정 (206dd50 → ae91cd4)

**원인**: Meta 의 `thumbnail_url` 은 **서명 URL** 이다 — 쿼리의 `oe=` 가 만료
타임스탬프(16진수 epoch)이고 발급 후 **약 7일**이면 죽는다. 동기화 시점 URL 을
`MetaAdsAd.ThumbnailUrl` 에 그대로 박아두니 일주일 뒤 전부 깨졌다.

실측(2026-07-25) — 행 날짜별 저장 URL 을 직접 호출:

| 행 날짜 | oe 만료 | HTTP |
| --- | --- | --- |
| 2026-03-02 / 04-15 | 2026-05-25 | 연결거부 |
| 2026-05-20 | 05-27 | 연결거부 |
| 2026-06-20 | 06-27 | 연결거부 |
| 2026-07-10 | 07-17 | 연결거부 |
| **2026-07-24** | 07-29 | **200** |

565행 중 fbcdn 562행. 최근 며칠분 외 **전부 만료** 상태였다.

### 첫 시도는 실패했다 — 같은 실수 반복 금지 (206dd50 → ae91cd4)

처음엔 워커가 이미지를 직접 서빙하는 프록시(`GET /thumb/{creativeId}`)로 만들었다.
**작동하지 않았다.** 화면에 아무것도 안 떴다.

> `<img>` 는 `Authorization` 헤더를 못 보낸다. 그런데 어드민 인증은 localStorage
> 토큰 경로에 의존한다 → 이미지 요청만 401 로 떨어지고, `alt=""` 라 깨진 아이콘조차
> 없이 **빈칸**으로 보인다.

진단은 R2 로 했다 — 요청이 한 번이라도 성공했으면 객체가 쌓였을 텐데 공개 URL 이
404 였다. 즉 성공 0건 → 인증 실패를 가리켰다. (`curl` 로는 401/403 구분만 되고
쿠키 유무를 재현할 수 없어 R2 적재 여부가 더 빠른 판별이었다.)

**⚠ 이미지 프록시로 되돌리지 말 것.** 인증이 필요한 URL 은 `<img src>` 가 될 수 없다.

### 최종 구조 (ae91cd4)

인증이 필요한 것과 아닌 것을 분리한다.

| 무엇 | 어떻게 | 인증 |
| --- | --- | --- |
| 썸네일 URL 목록 | `GET /api/meta-ads/thumbs?ids=a,b,c` (`adminUtil.api`) | 필요 (fetch 라 가능) |
| 이미지 자체 | R2 공개 버킷 `meta-ads/thumbs/{creativeId}` | **불필요** |

- 워커: R2 에 있으면 공개 URL 만 반환(외부 호출 0). 없으면 Graph 로 현재 URL 조회 →
  원본 fetch → R2 put → 공개 URL 반환.
- 어드민(`site/admin/meta-ads.js`): `thumbCell` 이 폴백 아이콘을 먼저 그리고
  (`.mads-thumb-slot`, CSS `display: contents`), `loadThumbs` 가 받아온 URL 로 교체.
  표 렌더를 붙잡지 않는다.
- **미스는 호출당 15건 상한** — 미스 1건 = Graph + 원본 = 외부요청 2회. CF Free
  subrequest 50 한도 보호. 나머지는 `null` 로 주고 다음 호출에서 채운다.
  크리에이티브 32개라 두어 번 열면 다 찬다.
- `content-type` 은 `image/(jpeg|png|webp|gif|avif)` 화이트리스트로 정규화.
- `ids` 는 `[A-Za-z0-9_-]{1,64}` 만 통과(경로 주입 차단).
- Meta 에서 삭제된 크리에이티브는 `null` → 폴백 아이콘 유지.

가드: `worker/tests/meta-ads-thumb.test.mjs` (7건 — R2 히트 시 외부호출 0 / 미스 시
복사 / content-type 정규화 / Graph 실패 null / **15건 상한** / 잘못된 id 무시 /
미인증 401).

**참고**: D1 의 `ThumbnailUrl` 컬럼은 그대로 두었다(동기화 코드 미변경). 어드민이
더 이상 쓰지 않을 뿐이다. 정리하려면 sync 쪽도 같이 봐야 한다.

---

## 4. 내부 알림 이메일 수신자 — 실효 1개뿐

사용자 질문("mkt@polar.co.kr 이랑 다른 이메일들도 있지?") → **없다.**

- 코드: `notifyEmail()` → `to: [GMAIL_NOTIFY_TO, NOTIFY_EMAIL_TO, GMAIL_USER]` 중복제거
  (`worker/src/lib/email.js:143`)
- 시크릿 실측: `GMAIL_NOTIFY_TO` 등록됨 · `NOTIFY_EMAIL_TO` **미설정** · `GMAIL_USER` 있음
- Gmail 보낸편지함 실측 3건(7/24 23:48 Meta · 23:26 홈페이지 · 7/21) 전부
  `To: day1design.co@gmail.com` **단일**

**수신자 추가**: 코드 수정 불필요. `sendEmail()` 이 `To:` 헤더에 `join(", ")` 하므로
콤마구분 문자열이 그대로 다중수신으로 동작한다.
```
printf "%s" "a@x.com,b@y.com" | wrangler secret put GMAIL_NOTIFY_TO
```
(`echo` 금지 — 개행이 섞인다)

**시크릿 값 확인법**: CF 시크릿은 write-only 라 이름만 보인다. 실제 수신자는
**Gmail API 로 보낸편지함 `To:` 헤더를 읽어** 확인한다 (`GMAIL_REFRESH_TOKEN` 스코프가
`https://mail.google.com/` 이라 읽기 가능). 테스트 메일을 보낼 필요 없다.

---

## 5. Meta 접수 저장체계 — 이상 없음

사용자 요구: "meta 접수되는건 절대 누락안되게, 오류 나는것까지도 잡아서 저장".
**테스트 리드 주입 0건**, 코드·기존 로그·가드테스트만으로 검증.

| 상황 | R2 원문 | D1 레코드 | 텔레그램 | 폴러 응답 |
| --- | --- | --- | --- | --- |
| 정상 | — | `접수대기` | ✓ | 200 |
| 이름·전화 매핑 실패 | `meta_invalid` | **`오류` 카드** | ✓ | 400 `captured` (큐 안 막힘) |
| D1 저장 실패 | `meta_d1_failed` | 없음(설계) | ✓ | 502 → **재시도** |
| 중복 leadId | — | 기존건 반환 | — | 200 |

누락 방지 핵심 2개:
1. 실패건은 `processed` 에 넣지 않고 워터마크를 그 리드 시각으로 되돌린다
   (`workers/imac-meta-lead-poller/worker.mjs:590-614`) → 다음 조회창(−48h)에 반드시 재포함
2. `MetaLeadId` 유니크 인덱스 → 재시도해도 카드 1장

D1 저장 실패 시 D1 '오류' 카드가 없는 건 D1 자체가 불가한 상황이라 그렇고,
R2 + 텔레그램 + 폴러 재시도로 커버된다. **폴러가 죽으면 이 재시도가 안 도는데,
하트비트 → `checkLeadPoller` 헬스체크가 잡는다.**

Worker HEAD `9672312` 가 07-25 06:48:10 라이브. 그 이전 facebook 리드 IntakeEvents 에
`email` 스텝이 없는 건 배포 전이라 정상.

---

## 6. 테스트 — 104/104 통과 (직전 세션의 미해결 항목 해소)

### upload-policy 실패 3건 → **회귀 아님, 낡은 테스트였다** (2413914)

`upload-policy.js` 는 커밋이 단 1개이고, 그게 정책을 **의도적으로 푼** 커밋이다:

> `986f9d7` (2026-05-20) — 업로드 정책 완화 (히어로 슬라이드 한정):
> worker upload-policy.js: 이미지 타입이면 webp 외(jpg/png/gif/avif)도 통과.

시점도 맞는다 — 테스트 파일 mtime **2026-05-12**, 완화 커밋 **05-20** (8일 뒤).
완화는 지금도 유효: `site/admin/hero-slides.js` 3곳에서 `skipCompressUnder: 5MB` 사용 중.
5MB 이하 히어로는 admin 에서 webp 변환 없이 원본을 올리므로 워커가 jpg/png 를 받아야 한다.

**⚠ "이미지는 webp 만" 으로 조이면 그게 회귀다.** 테스트를 현행 기준으로 다시 썼고
파일 상단에 경위와 "되돌리지 말 것" 을 박아뒀다. `isWebpImageUpload()` 는 export 만 되고
업로드 게이트로 쓰이지 않는 헬퍼라는 것도 테스트로 고정.

### untracked 테스트 4개 편입 (ce0ab24)

`access`(5) · `index-access`(9) · `portfolio-route`(2) · `services`(3). 전부 통과하는데
저장소 밖이라 `git clean` 한 번이면 사라지고 환경마다 `npm test` 결과가 달랐다.
오리진별 접근제어·관리자 로그인·호스트별 에셋 서빙·D1/R2 주입 계약을 지킨다.
더미 자격증명만 사용(`secret-pass`·`jwt-secret`·`test-secret`).

### 썸네일 가드 7건 신설 (ae91cd4)

`meta-ads-thumb.test.mjs`. `globalThis.fetch` 를 스텁으로 갈아끼워 외부 호출 0으로
검증한다. 핵심 계약 두 개: **R2 히트일 때 Graph 를 호출하지 않는 것**과
**미스 처리 15건 상한**(둘 다 rate limit / subrequest 한도 보호).

---

## 남은 것 / 다음 세션

- **Meta `Platform` 이 373건 전부 `facebook`** — 인스타 리드도 facebook 으로 기록되는지
  확인 필요. `normalizePlatform()` (`worker/src/routes/meta-lead.js`).
  확인되면 FB/IG 세분화 통계가 비로소 의미를 가진다.
- **업로드 정책의 ext-only 통과 구멍** (급하지 않음): `isImageUpload` 가
  `type.startsWith("image/") || ext 매칭` 이라 `x.png` + `type: text/html` 이 통과하고,
  `upload.js` 가 그 type 을 R2 contentType 으로 그대로 쓴다. `verifyAdmin()` 뒤라
  관리자 인증이 전제이고 R2 는 다른 오리진이라 세션 탈취로는 안 이어진다.
  닫으려면 두 조건을 AND 로 묶으면 된다. 테스트에는 주석으로만 기록(구멍을 정상으로
  못박지 않기 위해).
- **썸네일 R2 적재 진행 확인**: 크리에이티브 32개가 호출당 최대 15건씩 순차 적재된다.
  광고 페이지를 두어 번 열면 다 찬다. 며칠 뒤 다시 열어 과거 광고 썸네일이 계속
  뜨는지 확인할 것(만료가 더는 영향을 주지 않는다는 실증). 끝까지 아이콘으로 남는
  건 Meta 에서 삭제된 크리에이티브다.
- **`MetaAdsAd.ThumbnailUrl` 정리 여부**: 어드민이 더는 쓰지 않지만 sync 는 여전히
  만료될 URL 을 기록한다. 지우려면 sync·스키마·`listAds` 응답을 같이 봐야 한다.
  당장 해가 없어 미뤘다.
- `git stash list` 의 `stash@{0}`(2026-05-26 WIP)는 **증거·복구 원본이라 drop 금지**
  (CLAUDE.md 불변규칙 3).
- Vercel CLI 출력에 `VERCEL_TOKEN` 이 평문 노출된다 — 로그·스크린샷 공유 시 마스킹.

## 사용자 작업 방식 (이번 세션 확인)

- **라이브 테스트 리드 주입 금지.** 작동 여부는 드라이런(코드·기존 로그·가드테스트·
  read-only API)으로만 검증한다. 테스트 접수가 접수관리를 오염시키고 SMS·CAPI·시트까지
  같이 발화된다.
- 작업 보고는 세션 터미널에만. 텔레그램·외부 채널 발송 금지.

## 참고 경로

- 안전망 불변규칙: `F:\day1design_homepage\CLAUDE.md` §불변규칙 1·2·6
- 가드 테스트: `worker/tests/estimates-safetynet.test.mjs`, `meta-lead-poll.test.mjs`,
  `upload-policy.test.mjs`, `meta-ads-thumb.test.mjs`, `access.test.mjs`,
  `index-access.test.mjs`
- 배포 순서: **Worker 먼저 → Vercel**. 워커 변경이 있으면
  `cd worker && wrangler deploy` (셸의 `CLOUDFLARE_API_TOKEN` 을 비우고 Global API Key
  사용), 이어서 `vercel --prod`. `npx` 가 깨지면 전역 `vercel` / `worker/node_modules/.bin/wrangler`
  직접 호출.
- 캐시버전: admin.css 는 전 admin HTML 일괄(`?v=20260725-inflow`), 변경된 JS 만 개별 갱신
  (`estimates.js?v=20260725-inflow`, `meta-ads.js?v=20260725-thumbproxy`,
  `analytics.js?v=20260725-channel`).
