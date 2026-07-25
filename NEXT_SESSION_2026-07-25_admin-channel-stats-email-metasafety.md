# NEXT SESSION — 접수채널 통계 + 이메일 수신자 + Meta 저장체계 점검 (2026-07-25)

## 이번 세션 결과 (완료)

### 1. 접수채널(Source) 기준 통계 추가 — 배포 완료

사용자 결정: **채널 기준 = `Estimates.Source`** (Meta / 홈페이지 / 네이버 / 구글 / 기타).
Referral(고객 직접입력)·Platform(FB/IG 세분화)은 채택하지 않음 — Platform 은 D1 의
meta 373건이 전부 `facebook` 이라 세분화 값이 사실상 없음, Referral 은 미입력 83건으로
커버리지 구멍.

배경: 유입통계의 「소스별 전환율」은 방문 분모가 필요해 `keys.delete("meta")` 로
Meta 를 제외한다(`site/admin/analytics.js`). 그런데 전체 접수 474건 중 Meta 가
373건(79%)이라 주력 채널이 통계에서 통째로 빠져 보였다. 그래서 **기존 전환율 카드는
그대로 두고 접수 건수 기준 카드를 따로 신설**하는 방향으로 갔다.

| 화면 | 추가된 것 | 위치 |
| --- | --- | --- |
| 유입통계 | 「접수채널」 패널 (Meta 포함 전량, 건수·비중) | 전환 퍼널 바로 아래 |
| 상담신청 | 접수채널 집계 밴드 (현재 필터 반영) | 유입탭 아래, 목록 위 |

- `site/admin/analytics.js` — `renderSubmissionChannels()` 신설, `renderOpsInsights()` 에서 호출
- `site/admin/estimates.js` — `renderChannelStats(list)` + `fmtShare()` 신설, `render()` 에서 호출
- `site/admin/analytics.html` / `estimates.html` — 패널 마크업
- `site/admin/admin.css` — `.est-channel-*` 스타일 (모바일은 grid 2컬럼)
- 전 admin HTML `admin.css?v=20260725-channel` 일괄 갱신

**중요 — 상담신청 밴드의 집계 기준**: 상단 일간·주간·월간 3칸은 전체 records 기준이지만,
접수채널 밴드는 `filtered()` 결과를 센다. 즉 기간·상태·검색·유입탭이 그대로 반영된다.
유입탭 "홈페이지" 는 `Source !== "meta"` 라 네이버·구글도 섞여 나온다(기존 탭 의미 그대로).

드라이런 검증(라이브 미접촉, `node` 하네스로 D1 실측 분포 재현):
```
Meta 373 (79%) / 홈페이지 95 (20%) / Naver 5 (1.1%) / Google 1 (0.2%)
```
1%·0.2% 같은 소수 비중이 0% 로 뭉개지지 않는지, 빈 결과·미지정 Source 폴백까지 확인함.

커밋 `a8beda0` · 라이브 검증 완료 (admin.day1design.co.kr/estimates·/analytics 에서
`estChannelList`·`submissionChannels`·새 `?v` 응답 확인).

### 2. Vercel 배포 전면 차단 해제 — 원인은 `.codegraph`

`vercel --prod` 가 `File size limit exceeded (100 MB)` 로 실패. 업로드 총량 112.9MB 가
**`.codegraph/codegraph.db` 113MB 단일 파일** 이었다 (code-review-graph MCP 산출물).
`.vercelignore` 에 없어서 그대로 업로드됨.

- `.vercelignore`: `.codegraph`, `test-results`(401MB), `_backup`, `_fav_tmp`,
  `blog-infographic-gangnam`, `workers` 제외
- `.gitignore`: `.codegraph/`, `test-results/`, `_fav_tmp/` 추가

커밋 `ee239e2`. **MCP 를 다시 쓰면 이 파일이 재생성되지만 이제는 무시된다.**

### 3. 내부 알림 이메일 수신자 — 실제로 1개뿐

사용자 질문("mkt@polar.co.kr 이랑 다른 이메일들도 있지?") → **없다.**

- 코드: `notifyEmail()` → `to: [GMAIL_NOTIFY_TO, NOTIFY_EMAIL_TO, GMAIL_USER]` 중복제거
  (`worker/src/lib/email.js:143`)
- 시크릿 실측: `GMAIL_NOTIFY_TO` 등록됨 · `NOTIFY_EMAIL_TO` **미설정** · `GMAIL_USER` 있음
- Gmail 보낸편지함 실측 3건(7/24 23:48 Meta · 23:26 홈페이지 · 7/21) 전부
  `To: day1design.co@gmail.com` **단일**
- 즉 `GMAIL_NOTIFY_TO` 값이 GMAIL_USER 와 같거나 빈 값 → 실효 수신처 1개

**수신자 추가 방법**: `GMAIL_NOTIFY_TO` 를 콤마구분으로 갱신하면 된다. `sendEmail()` 이
`To:` 헤더에 `join(", ")` 하므로 다중수신 그대로 동작. 코드 수정 불필요.
```
printf "%s" "a@x.com,b@y.com" | wrangler secret put GMAIL_NOTIFY_TO
```
(`echo` 금지 — 개행이 섞인다)

### 4. Meta 접수 저장체계 점검 — 이상 없음

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

`worker/tests/estimates-safetynet.test.mjs` + `meta-lead-poll.test.mjs` **27/27 통과**.

D1 저장 실패 시 D1 '오류' 카드가 없는 건 D1 자체가 불가한 상황이라 그렇고,
R2 + 텔레그램 + 폴러 재시도로 커버된다. **폴러가 죽으면 이 재시도가 안 도는데,
하트비트 → `checkLeadPoller` 헬스체크가 잡는다.**

배포 상태: Worker HEAD `9672312` 가 07-25 06:48:10 라이브. 그 이전 facebook 리드
IntakeEvents 로그에 `email` 스텝이 없는 건 배포 전이라 정상 (이번 커밋에서 Meta 리드
내부 알림 메일이 워커로 흡수됨).

## 남은 것 / 주의

- **`worker/tests/upload-policy.test.mjs` 3건 실패** — `npm test` 92건 중 89 pass.
  실패한 3건은 전부 **미커밋(untracked) 로컬 테스트 파일**이고 접수·Meta 안전망과 무관.
  WebP 전용 업로드 정책이 415 대신 200 을 반환한다는 주장인데, 이 테스트가 맞는지
  (= 실제 정책 회귀인지) 아니면 테스트가 낡은 건지 **다음 세션에서 확인 필요.**
- Meta `Platform` 컬럼이 373건 전부 `facebook` — instagram 리드도 facebook 으로
  기록되는지 확인 필요. 확인되면 FB/IG 세분화 통계도 의미가 생긴다.
  (`normalizePlatform()` in `worker/src/routes/meta-lead.js`)
- `git stash list` 의 `stash@{0}`(2026-05-26 WIP)는 **증거·복구 원본이라 drop 금지**
  (CLAUDE.md 불변규칙 3).
- Vercel CLI 출력에 `VERCEL_TOKEN` 이 평문 노출된다 — 로그·스크린샷 공유 시 마스킹.

## 사용자 작업 방식 (이번 세션에서 확인)

- **라이브 테스트 리드 주입 금지.** 작동 여부는 드라이런(코드·기존 로그·가드테스트)으로만 검증.
- 작업 보고는 이 세션 터미널에만. 텔레그램·외부 채널 발송 금지.

## 참고 경로

- 안전망 불변규칙: `F:\day1design_homepage\CLAUDE.md` §불변규칙 1·2·6
- 가드 테스트: `worker/tests/estimates-safetynet.test.mjs`, `worker/tests/meta-lead-poll.test.mjs`
- 배포: `scripts/deploy.ps1 main` (admin 은 main Vercel 프로젝트에 통합됨).
  `npx vercel` 이 깨지면 전역 `vercel` 직접 호출.
