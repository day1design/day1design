// 통계 계층 회귀 가드.
//
// 이 봇의 신뢰는 "숫자를 지어내지 않는다"에 걸려 있다. 비율·구간·경계를 손대면
// 대표에게 나가는 보고의 근거가 통째로 바뀌므로, 손댄 자리가 어디인지 여기서 걸린다.

import test from "node:test";
import assert from "node:assert/strict";
import { analyze, wilson, mde, zeroUpperBound, anomalies } from "./stats.mjs";

test("Wilson 구간은 0 아래로 내려가지 않는다", () => {
  // 정규근사를 쓰면 여기서 하한이 음수가 된다. 접수 전환율이 늘 이 구간에 있다
  const r = wilson(1, 500);
  assert.ok(r.lo >= 0, `하한이 음수: ${r.lo}`);
  assert.ok(r.hi > r.p, "상한이 점추정보다 커야 한다");
  assert.equal(r.n, 500);
});

test("Wilson 구간은 표본이 커질수록 좁아진다", () => {
  const small = wilson(20, 100);
  const big = wilson(200, 1000);
  const w = (r) => r.hi - r.lo;
  assert.ok(w(big) < w(small), "표본이 10배인데 구간이 좁아지지 않았다");
});

test("표본이 없으면 구간을 만들지 않는다", () => {
  assert.equal(wilson(0, 0), null);
  assert.equal(mde(0.02, 0), null);
  assert.equal(zeroUpperBound(0), null);
});

test("검출경계는 표본이 작을수록 커진다", () => {
  const few = mde(0.03, 100);
  const many = mde(0.03, 10000);
  assert.ok(few > many, "표본이 100배인데 검출경계가 줄지 않았다");
});

test("0건이어도 상한을 말한다", () => {
  // 0건을 '효과 없음'으로 보고하면 안 된다. 95% 상한은 3/n 근사다
  const b = zeroUpperBound(300);
  assert.ok(b > 0 && b < 0.02, `상한이 이상하다: ${b}`);
});

test("이상치는 7일 미만이면 판정하지 않는다", () => {
  const r = anomalies([
    { day: "2026-08-01", n: 3 },
    { day: "2026-08-02", n: 4 },
  ]);
  assert.equal(r.available, false);
});

test("이상치는 튀는 날만 잡는다", () => {
  const days = [];
  for (let i = 1; i <= 20; i++) {
    days.push({ day: `2026-08-${String(i).padStart(2, "0")}`, n: 5 });
  }
  days.push({ day: "2026-08-21", n: 400 });
  const r = anomalies(days);
  assert.equal(r.available, true);
  assert.equal(r.rows.length, 1, "튄 하루만 잡혀야 한다");
  assert.equal(r.rows[0].day, "2026-08-21");
});

test("광고 비율은 합계를 나눈 값이다", () => {
  // 일별 비율의 평균으로 내면 노출이 적은 날이 같은 무게를 갖는다
  const data = {
    ads: {
      summary: { impressions: 1000, clicks: 20, linkClicks: 10, spend: 40, leads: 5 },
    },
    leads: { total: 4, bySource: [{ source: "meta", n: 3 }], daily: [] },
  };
  const s = analyze(data);
  assert.equal(s.rates.ctr, 0.02);
  assert.equal(s.rates.cpc, 2);
  assert.equal(s.rates.costPerLinkClick, 4, "Meta 화면 기준(링크클릭)도 같이 내야 한다");
  assert.equal(s.rates.cpm, 40);
});

test("Meta 단독 리드 단가는 Meta 계열 접수만 분모로 쓴다", () => {
  const data = {
    ads: { summary: { impressions: 1000, clicks: 20, spend: 100, leads: 9 } },
    leads: {
      total: 10,
      bySource: [
        { source: "meta", n: 4 },
        { source: "instagram_mkt", n: 1 },
        { source: "homepage", n: 5 },
      ],
      daily: [],
    },
  };
  const s = analyze(data);
  assert.equal(s.leads.metaLeads, 5, "instagram 계열도 Meta 로 센다");
  assert.equal(s.leads.metaCostPerLead, 20, "100 / 5 = 20");
});

test("Meta 집계 리드와 저장 접수의 격차를 드러낸다", () => {
  // 이 격차를 숨기면 어느 숫자를 인용했느냐에 따라 단가가 두 배 달라진다
  const data = {
    ads: { summary: { impressions: 100, clicks: 10, spend: 50, leads: 20 } },
    leads: { total: 12, bySource: [{ source: "meta", n: 8 }], daily: [] },
  };
  const s = analyze(data);
  assert.equal(s.leadReconciliation.metaReportedLeads, 20);
  assert.equal(s.leadReconciliation.storedLeadsFromMeta, 8);
  assert.equal(s.leadReconciliation.gap, 12);
});

test("접수가 30건 미만이면 세분화 경고를 붙인다", () => {
  const data = {
    ads: { summary: { impressions: 100, clicks: 10, spend: 50 } },
    leads: { total: 12, bySource: [], daily: [] },
  };
  const s = analyze(data);
  assert.ok(s.leads.smallSampleWarning.includes("부족"));
});

test("직전 구간 합계가 없으면 비교하지 않는다", () => {
  // previous 는 날짜 범위이고 합계는 prevTotals 다. 날짜를 합계로 착각하면
  // 비교가 통째로 '판정 불가'가 된다
  const data = {
    ads: {
      summary: { impressions: 1000, clicks: 20, spend: 40 },
      efficiency: { previous: { startDate: "2026-07-01", endDate: "2026-07-30" } },
    },
    leads: { total: 5, bySource: [], daily: [] },
  };
  const s = analyze(data);
  assert.equal(s.periodCompare.available, false);
});

test("전기 대비 변화가 검출경계 아래면 단정하지 않는다", () => {
  const data = {
    ads: {
      summary: { impressions: 100000, clicks: 2000, spend: 500 },
      efficiency: {
        current: { impressions: 100000, clicks: 2000, spend: 500 },
        prevTotals: { impressions: 100000, clicks: 2005, spend: 500 },
      },
    },
    leads: { total: 40, bySource: [], daily: [] },
  };
  const s = analyze(data);
  assert.equal(s.periodCompare.available, true);
  assert.ok(
    s.periodCompare.ctrVerdict.includes("잡음"),
    `미세한 차이를 유의하다고 판정했다: ${s.periodCompare.ctrVerdict}`,
  );
});

test("통화는 USD 로 못 박는다", () => {
  // 광고계정 통화가 달러다. '원'으로 읽히면 보고 전체가 어긋난다
  const s = analyze({ ads: { summary: {} }, leads: { total: 0, bySource: [], daily: [] } });
  assert.equal(s.currency, "USD");
});

test("광고 흐름은 어느 단계에서 꺾였는지 짚는다", () => {
  // 돈은 1.3배 늘렸는데 노출은 3배가 됐고 접수는 제자리인 상황.
  // 이때 할 말은 "노출을 샀는데 접수로 오지 않았다" 하나다
  const data = {
    ads: {
      summary: { impressions: 300000, clicks: 6000, spend: 3900, leads: 190 },
      efficiency: {
        current: {
          spend: 3900,
          impressions: 300000,
          clicks: 6000,
          linkClicks: 4000,
          leads: 190,
        },
        prevTotals: {
          spend: 3000,
          impressions: 100000,
          clicks: 2400,
          linkClicks: 1100,
          leads: 180,
        },
      },
    },
    leads: { total: 130, bySource: [{ source: "meta", n: 90 }], daily: [] },
  };
  const s = analyze(data);
  assert.equal(s.funnel.available, true);
  assert.ok(s.funnel.bottleneck, "병목을 찾지 못했다");
  assert.equal(s.funnel.bottleneck.at, "Meta 집계 리드");
  assert.ok(
    s.funnel.verdict.includes("멈춘다"),
    `판단 문장이 비었다: ${s.funnel.verdict}`,
  );
});

test("단계가 고르게 움직이면 병목을 만들어내지 않는다", () => {
  const data = {
    ads: {
      summary: { impressions: 200000, clicks: 4000, spend: 2000 },
      efficiency: {
        current: { spend: 2000, impressions: 200000, clicks: 4000, leads: 100 },
        prevTotals: { spend: 1000, impressions: 100000, clicks: 2000, leads: 50 },
      },
    },
    leads: { total: 40, bySource: [], daily: [] },
  };
  const s = analyze(data);
  assert.equal(s.funnel.bottleneck, null, "고르게 늘었는데 병목을 잡았다");
});

test("직전 구간이 없으면 흐름 변화를 말하지 않는다", () => {
  const s = analyze({
    ads: { summary: { impressions: 100, clicks: 5, spend: 10 } },
    leads: { total: 2, bySource: [], daily: [] },
  });
  assert.equal(s.funnel.available, false);
});

test("캠페인별 단가를 이름으로 붙이고 격차를 짚는다", () => {
  // 총계 CPL 하나로는 "어느 캠페인에 돈을 더 넣을지" 말할 수 없다
  const data = {
    ads: {
      summary: { impressions: 1000, clicks: 50, spend: 600 },
      campaigns: [
        { name: "260812 신규 잠재고객 캠페인(전환형)", spend: 300, clicks: 30 },
        { name: "260824 잠재고객 캠페인 신규", spend: 200, clicks: 15 },
        { name: "260727 신규 트래픽 캠페인", spend: 100, clicks: 5 },
      ],
    },
    leads: {
      total: 32,
      bySource: [{ source: "meta", n: 32 }],
      daily: [],
      byCampaign: [
        { campaign: "260812 신규 잠재고객 캠페인(전환형)", platform: "instagram", n: 26 },
        { campaign: "260824 잠재고객 캠페인 신규", platform: "instagram", n: 4 },
        { campaign: "인스타그램 마케팅 - 오가닉 - 견적문의", platform: "IG마케팅", n: 2 },
      ],
    },
  };
  const s = analyze(data);
  assert.equal(s.campaigns.available, true);
  const best = s.campaigns.best;
  assert.equal(best.campaign, "260812 신규 잠재고객 캠페인(전환형)");
  assert.ok(Math.abs(best.costPerLead - 300 / 26) < 0.01);
  assert.equal(s.campaigns.worst.campaign, "260824 잠재고객 캠페인 신규");
  // 지출이 있는데 접수가 0건인 캠페인을 놓치면 안 된다
  assert.equal(s.campaigns.zeroLeadSpenders[0].campaign, "260727 신규 트래픽 캠페인");
  // 광고 목록에 없는 오가닉 접수는 버리지 않고 따로 남긴다
  assert.equal(s.campaigns.unmatched.length, 1);
});

test("캠페인 이름의 공백·밑줄 차이는 같은 것으로 본다", () => {
  const data = {
    ads: {
      summary: { spend: 100 },
      campaigns: [{ name: "260805_잠재고객(전환형 광고)", spend: 100 }],
    },
    leads: {
      total: 13,
      bySource: [],
      daily: [],
      byCampaign: [
        { campaign: "260805 잠재고객(전환형광고)", platform: "instagram", n: 13 },
      ],
    },
  };
  const s = analyze(data);
  assert.equal(s.campaigns.rows[0].leads, 13, "표기 차이로 접수를 놓쳤다");
});

test("캠페인 접수가 없으면 단가를 지어내지 않는다", () => {
  const s = analyze({
    ads: { summary: { spend: 100 }, campaigns: [{ name: "A", spend: 100 }] },
    leads: { total: 0, bySource: [], daily: [], byCampaign: [] },
  });
  assert.equal(s.campaigns.available, false);
});
