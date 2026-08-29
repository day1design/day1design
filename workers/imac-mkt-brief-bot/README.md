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
| 통계 | `stats.mjs` | 비율·신뢰구간·이상치·검출경계를 **직접 계산**한다 |
| 해석 | 클로드 CLI | 무슨 일이 있었고 왜인지, 무엇을 할지 초안을 만든다 |
| 감사 | 코덱스 `gpt-5.6-sol` | 그 초안이 데이터로 버티는지 따진다 |
| 종합 | 코덱스 `gpt-5.6-sol` | 셋을 받아 최종 보고 하나를 쓴다 |

- **계산을 모델에게 맡기지 않는 이유**: 검산할 때마다 값이 달라진다. 특히 기간 CTR 을
  일별 CTR 의 평균으로 내는 실수와, 접수 12건 대 15건을 "25% 개선"이라고 단정하는 실수가
  잦다. 그래서 `stats.mjs` 가 먼저 확정하고 모델은 인용만 한다.
- **해석과 감사를 나눈 이유**: 자기가 세운 가설을 자기가 검증하면 대개 통과시킨다.
- **방에 과정을 노출하지 않는 이유**: "클로드는 이렇고 코덱스는 저렇다"는 보고는 읽는
  사람에게 판단을 떠넘긴다. 담당자는 하나의 답을 들고 와야 한다.

한 단계가 죽어도 남은 것으로 답을 낸다. 침묵이 가장 나쁜 결과다.

## 명령

| 입력 | 동작 |
| --- | --- |
| 자유 질문 | 마케팅 범위면 분석, 아니면 안내만 |
| `/brief [일수]` | 기본 브리프 (기본 30일) |
| `/data [일수]` | 분석 없이 원본 숫자만 |
| `/ping` | 봇·데이터 연결 확인 |
| `/help` | 도움말 |

### 범위 게이트

이 방은 데이원디자인의 **유입 분석과 Meta 광고 분석**만 답한다. 시스템·코드·계정·일반
질문은 게이트에서 막고 안내문만 돌려준다. 게이트를 뚫려도 분석기 프롬프트에 같은 제한이
걸려 있고, 두 분석기 모두 도구가 없다(클로드는 `--disallowed-tools`, 코덱스는
`--sandbox read-only`).

판정 규칙은 `bot.mjs` 의 `OFF_TOPIC` → `ON_TOPIC` 순서다. 애매한 문장은 통과시키지 않는다.
`node bot.mjs --selftest` 로 게이트 판정을 확인한다.

## 데이터

워커의 `GET /api/brief/marketing?days=N` 한 곳에서만 받는다. 단계마다 따로 긁으면 호출
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

## 배포

```bash
scp bot.mjs stats.mjs run_bot.sh pola@<아이맥>:/Users/pola/day1design-mkt-bot/
scp com.day1design.mkt-brief-bot.plist pola@<아이맥>:/Users/pola/Library/LaunchAgents/
ssh pola@<아이맥> 'bash -lc "cd ~/day1design-mkt-bot && node --check bot.mjs && node --check stats.mjs"'
ssh pola@<아이맥> 'bash -lc "launchctl kickstart -k gui/$(id -u)/com.day1design.mkt-brief-bot"'
```

문법 검사를 통과한 뒤에 재시작한다. 로그는 `logs/bot.out.log`, `logs/bot.err.log`.

## 테스트

```bash
node --test workers/imac-mkt-brief-bot/stats.test.mjs   # 통계 회귀 가드 14건
node bot.mjs --selftest                                  # 범위 게이트 판정 16건
```

통계 테스트가 깨지면 보고의 근거가 바뀐 것이므로, 테스트를 고치지 말고 원인을 되돌린다.
