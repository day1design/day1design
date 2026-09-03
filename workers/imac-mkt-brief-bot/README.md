# 데이원 마케팅효율봇 (아이맥 상주)

텔레그램 방 **데이원-마케팅효율봇**에서 마케팅 성과를 물으면, 아이맥에 상주하는 이 봇이
데이터를 읽고 분석해 보고 하나를 올린다.

- 봇: `@day1_mkteff_bot`
- 방: 비공개 슈퍼그룹 `데이원-마케팅효율봇` (`chat_id = -1004350998116`)
- 아이맥 경로: `/Users/pola/day1design-mkt-bot`
- LaunchAgent: `com.day1design.mkt-brief-bot`

## 왜 이렇게 만들었나

방에서는 담당자 한 명이지만 뒤에서는 넷이 나눠 일한다.

| 단계 | 담당 | 하는 일 |
| --- | --- | --- |
| 의도 | 클로드 CLI | 질문에서 기간과 초점을 뽑는다. 실패하면 규칙 파서가 받친다 |
| 통계 | `stats.mjs` | 비율·신뢰구간·이상치·검출경계를 **직접 계산**한다 |
| 해석 | 클로드 CLI | 무슨 일이 있었고 왜인지, 무엇을 할지 초안을 만든다 |
| 감사 | 코덱스 `gpt-5.6-sol` | 그 초안이 데이터로 버티는지 따진다 |
| 종합 | 코덱스 `gpt-5.6-sol` | 넷을 받아 최종 보고 하나를 쓴다 |

- **계산을 모델에게 맡기지 않는 이유**: 검산할 때마다 값이 달라진다. 특히 기간 CTR 을
  일별 CTR 의 평균으로 내는 실수와, 접수 12건 대 15건을 "25% 개선"이라고 단정하는 실수가
  잦다. 그래서 `stats.mjs` 가 먼저 확정하고 모델은 인용만 한다.
- **해석과 감사를 나눈 이유**: 자기가 세운 가설을 자기가 검증하면 대개 통과시킨다.
- **방에 과정을 노출하지 않는 이유**: "클로드는 이렇고 코덱스는 저렇다"는 보고는 읽는
  사람에게 판단을 떠넘긴다. 담당자는 하나의 답을 들고 와야 한다.

한 단계가 죽어도 남은 것으로 답을 낸다. 침묵이 가장 나쁜 결과다.

## 기간을 말하는 대로 읽는다

"이번 주", "지난달", "지난주랑 이번 주 비교해줘" 를 그대로 알아듣는다. 의도 해석 단계가
기간과 초점을 JSON 으로 뽑고, 그 단계가 실패하면 `parsePeriod` 규칙 파서가 받친다.
해석한 기간은 분석을 시작할 때 먼저 알려 준다 — 결과를 다 읽고 나서야 다른 기간이었다는
걸 알아채면 그 시간이 통째로 버려진다.

브리프 API 는 `range=today|7|30|cur-month|prev-month|custom(start,end)` 와 `days=N` 을
받는다. 접수 집계도 그 구간으로 자르고 일자는 KST 로 끊는다.

## 보고의 뼈대 — 흐름이 어디서 꺾이는가

광고는 언제나 같은 순서로 흐른다. 돈 → 노출 → 클릭 → 접수. `stats.funnel` 이 각 단계가
직전 구간 대비 몇 배가 됐는지와 통과율을 계산하고, 가장 크게 새는 자리 하나를 병목으로
짚는다. 종합 단계는 그 판단을 보고 첫 줄에 쓴다.

실측(2026-08-29, 30일): 지출 1.33배 · 노출 3.03배 · 클릭 2.63배 · 링크클릭 3.80배 ·
Meta 집계 리드 1.13배. 병목은 링크클릭→리드이고 통과율 30% 다. 트래픽은 세 배로 샀는데
리드는 그만큼 오지 않았다는 뜻이다.

단계가 고르게 늘었으면 병목을 만들어내지 않는다. 직전 구간이 없으면 이 블록을 비운다.

## 명령

| 입력 | 동작 |
| --- | --- |
| 자유 질문 | 마케팅 범위면 분석, 아니면 안내만 |
| `/brief [기간]` | 기본 브리프. 기간을 안 쓰면 최근 30일 (`/brief 이번주`, `/brief 14`) |
| `/data [기간]` | 분석 없이 원본 숫자만 |
| `/ping` | 봇·데이터 연결 확인 |
| `/help` | 도움말 |

### 범위 게이트

이 방은 데이원디자인의 **유입 분석과 Meta 광고 분석**만 답한다. 시스템·코드·계정·일반
질문은 게이트에서 막고 안내문만 돌려준다. 게이트를 뚫려도 분석기 프롬프트에 같은 제한이
걸려 있고, 두 분석기 모두 도구가 없다(클로드는 `--disallowed-tools`, 코덱스는
`--sandbox read-only`).

입구에서 끊는 것은 **명백히 위험한 요청**(시스템·코드·계정)뿐이다. 마케팅 낱말이 없다고
막지 않는다 — 그러면 "요즘 어때?" 같은 맥락 질문까지 안내문만 받고 끝난다. 그 판단은
의도 해석 단계가 맡고, 거기서 범위 밖으로 판정되면 그때 안내한다.
`node bot.mjs --selftest` 로 게이트와 기간 파서를 함께 확인한다.

## 데이터

워커의 `GET /api/brief/marketing` 한 곳에서만 받는다(`range=` 또는 `days=`). 단계마다 따로 긁으면 호출
시점이 어긋나 같은 기간을 두고 숫자가 달라진다.

- 인증: `X-Brief-Secret` 헤더 (워커 시크릿 `BRIEF_SECRET`)
- **호스트는 `api.day1design.co.kr`** 이다. `day1design.co.kr/api/brief` 는 Vercel 이
  먼저 받아 404 를 낸다(워커는 API 호스트와 admin 호스트에서만 `/api/*` 를 처리한다).

## 통화

광고계정 통화는 **USD** 다(`act_986916453663066`, `currency: USD`). 보고에 "원"으로 적으면
대표가 환산된 금액으로 읽는다. 프롬프트에도 환산 금지를 못 박아 두었다.

## 아는 함정

- **Meta 집계 리드 ≠ 저장된 접수.** 실측(2026-08-29, 30일): Meta 188 vs D1 의 Meta 계열
  95. `stats.leadReconciliation` 이 이 격차를 항상 표면화한다. 원인은 단정하지 않는다.
- **CPC 두 가지.** Meta 화면은 링크 클릭 기준이고 전체 클릭 기준과 1.5배쯤 차이난다
  (실측 $0.90 대 $0.59). `rates.cpc` 와 `rates.costPerLinkClick` 을 함께 낸다.
- **전체 리드단가는 광고 단가가 아니다.** 전체 접수를 분모로 쓰면 홈페이지 유입까지
  광고 성과로 계산된다(실측 $28 대 Meta 단독 $39.21). `leads.metaCostPerLead` 를 쓴다.
- **접수 30건 미만이면 세분화하지 않는다.** 캠페인별로 쪼개면 대부분 잡음이다.

## 매일 아침 리포트 (물어보지 않아도 온다)

`daily-report.mjs` 가 **매일 오전 10시**에 전날 하루 성과를 흰 바탕 이미지 한 장으로
만들어 같은 방에 올린다. 물어봐야 답하는 위 파이프라인과 별개로 도는 작업이다.

- LaunchAgent: `com.day1design.mkt-daily-report` (`StartCalendarInterval` 10:00)
- 실행 스크립트: `run_daily_report.sh` — 로그를 남기고 30일 지난 이미지를 지운다
- 로그: `logs/daily-report.log`, 산출물: `report/daily-YYYYMMDD.png`

담는 것은 어제 요약 카드, 어제 캠페인별(지출·노출·클릭·CTR·리드·리드단가), 최근 7일
잠재고객 캠페인과 **다음 손** 권고다.

**권고를 7일로 내는 이유**: 하루치는 리드가 한두 건이라 단가가 두 배씩 튄다. 그 숫자로
증액을 정하면 어제 운이 좋았던 캠페인에 돈을 더 붓게 된다. 그래서 목표 이내이고 리드가
3건 이상이면 증액, 목표의 2배를 넘으면 예산 대신 새 소재를 권하고, 리드 3건에 못 미치면
판단하지 않는다.

기준은 `.env` 로 바꾼다. 코드는 손대지 않는다.

| 키 | 기본값 | 뜻 |
| --- | --- | --- |
| `DAY1_TARGET_CPL` | `30` | 목표 리드단가(USD) |
| `DAY1_CPL_ALERT_MULT` | `2` | 목표의 몇 배부터 새 소재를 권하는가 |

### 텔레그램 전송만 curl 로 하는 이유

이 맥에서는 **node 의 `fetch` 가 텔레그램 주소로 못 나간다.** IPv4 는 `ETIMEDOUT`,
IPv6 는 `EHOSTUNREACH` 로 둘 다 막히는데(2026-09-03 실측) 같은 순간 `curl` 은 붙는다.
그래서 전송은 `curl --config -` 에 맡긴다. 토큰을 명령행 인자에 두면 `ps` 에 그대로
뜨므로 표준입력으로 넘겨 인자에는 남기지 않는다. 브리프 API 호출은 `fetch` 로 잘 나가서
그대로 둔다.

```bash
node daily-report.mjs                 # 만들어서 보낸다
node daily-report.mjs --no-send       # 이미지까지만
node daily-report.mjs --from-dir DIR  # DIR 의 brief_yday.json·brief_7d.json 으로 시험
```

## 배포

```bash
scp bot.mjs stats.mjs run_bot.sh pola@<아이맥>:/Users/pola/day1design-mkt-bot/
scp daily-report.mjs run_daily_report.sh pola@<아이맥>:/Users/pola/day1design-mkt-bot/
scp com.day1design.mkt-daily-report.plist pola@<아이맥>:/Users/pola/Library/LaunchAgents/
scp com.day1design.mkt-brief-bot.plist pola@<아이맥>:/Users/pola/Library/LaunchAgents/
ssh pola@<아이맥> 'bash -lc "cd ~/day1design-mkt-bot && node --check bot.mjs && node --check stats.mjs"'
ssh pola@<아이맥> 'bash -lc "launchctl kickstart -k gui/$(id -u)/com.day1design.mkt-brief-bot"'
```

문법 검사를 통과한 뒤에 재시작한다. 로그는 `logs/bot.out.log`, `logs/bot.err.log`.

## 테스트

```bash
node --test workers/imac-mkt-brief-bot/stats.test.mjs   # 통계 회귀 가드 17건
node bot.mjs --selftest                                  # 게이트 18건 + 기간 파서 10건
```

통계 테스트가 깨지면 보고의 근거가 바뀐 것이므로, 테스트를 고치지 말고 원인을 되돌린다.
