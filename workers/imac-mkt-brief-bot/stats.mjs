// 통계 전처리 — 숫자는 여기서 계산하고, 언어 모델에게는 해석만 맡긴다.
//
// 비율과 신뢰구간을 모델에게 시키면 그럴듯한 값이 나오는데 검산하면 틀려 있다.
// 특히 자주 틀리는 것 두 가지가 있다.
//   · 기간 CTR 을 일별 CTR 의 평균으로 낸다(합계의 비율로 내야 한다).
//   · 접수 12건과 15건의 차이를 "25% 개선"이라고 단정한다(그 표본에서는 잡음과
//     구분되지 않는다).
// 그래서 이 파일이 먼저 계산하고, 프롬프트에는 계산된 값과 "말할 수 있는 범위"를 함께 싣는다.
//
// 근거로 삼은 규칙은 gpt-5.6-sol 조사 결과를 따랐다.
// Wilson 구간, MAD 기반 robust z(|z*|>3.5), 두 비율의 대략적 검출경계
// MDE ≈ 2.8·√(2p(1−p)/n), 0건일 때 95% 상한 ≈ 3/n.

const Z95 = 1.959964;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round(v, d = 4) {
  if (!Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// 비율의 95% 신뢰구간. 정규근사(p ± 1.96·se)는 p 가 0 에 가깝거나 n 이 작으면
// 구간이 음수로 내려간다. 접수 전환율은 늘 그 구간에 있으므로 Wilson 을 쓴다.
export function wilson(k, n, z = Z95) {
  const K = num(k);
  const N = num(n);
  if (N <= 0) return null;
  const p = K / N;
  const d = 1 + (z * z) / N;
  const c = p + (z * z) / (2 * N);
  const s = z * Math.sqrt((p * (1 - p)) / N + (z * z) / (4 * N * N));
  return {
    p: round(p, 6),
    lo: round(Math.max(0, (c - s) / d), 6),
    hi: round(Math.min(1, (c + s) / d), 6),
    k: K,
    n: N,
  };
}

// 이 표본에서 실제로 잡아낼 수 있는 최소 차이. 이보다 작은 변화를 두고
// "개선됐다"고 말하면 잡음을 성과로 보고하는 것이다.
export function mde(p, n) {
  const P = num(p);
  const N = num(n);
  if (N <= 0) return null;
  return round(2.8 * Math.sqrt((2 * P * (1 - P)) / N), 6);
}

// 사건이 0건이라고 효과가 0인 것은 아니다. 상한을 함께 말해야 한다
export function zeroUpperBound(n) {
  const N = num(n);
  return N > 0 ? round(3 / N, 6) : null;
}

// 일별 시계열의 이상치. log1p 로 눌러 큰 값이 분산을 지배하지 못하게 하고,
// 평균·표준편차 대신 중앙값·MAD 를 쓴다 — 이상치를 찾는 통계가 이상치에
// 휘둘리면 안 되기 때문이다.
export function anomalies(series, { threshold = 3.5, minValue = 0 } = {}) {
  const rows = (series || [])
    .map((r) => ({ day: r.day || r.date || r.DayKey || "", v: num(r.n ?? r.value ?? r.count) }))
    .filter((r) => r.day);
  if (rows.length < 7) {
    return { available: false, reason: "7일 미만이라 이상치를 판정하지 않음", rows: [] };
  }
  const logs = rows.map((r) => Math.log1p(Math.max(0, r.v)));
  const med = median(logs);
  const mad = median(logs.map((x) => Math.abs(x - med)));

  // MAD 는 절반 넘는 날이 같은 값이면 0 이 된다. 접수처럼 하루 몇 건짜리 지표에서
  // 흔히 그렇게 되는데, 그때 판정을 포기하면 "20일 내내 5건이다가 하루 400건" 같은
  // 가장 잡아야 할 급증을 놓친다. 그래서 평균절대편차로 한 번 더 시도한다.
  let sigma = mad / 0.6745;
  let scale = "MAD";
  if (!sigma) {
    const meanAd =
      logs.reduce((a, x) => a + Math.abs(x - med), 0) / (logs.length || 1);
    sigma = meanAd / 0.7979;
    scale = "MeanAD";
  }
  if (!sigma) {
    return { available: false, reason: "변동이 전혀 없어 판정 불가", rows: [] };
  }

  const flagged = rows
    .map((r, i) => ({ ...r, z: round((logs[i] - med) / sigma, 2) }))
    .filter((r) => Math.abs(r.z) > threshold && r.v >= minValue);
  return {
    available: true,
    scale,
    note:
      "요일 효과는 보정하지 않았다. 주중·주말 차이가 큰 지표에서는 과탐지가 있을 수 있다" +
      (scale === "MeanAD"
        ? ". 값이 거의 일정해 MAD 가 0 이라 평균절대편차로 대체했다"
        : ""),
    rows: flagged,
  };
}

// 광고 지표는 합계로 먼저 묶고 그다음 나눈다.
// 일별 CTR 을 평균 내면 노출이 적은 날이 노출이 많은 날과 같은 무게를 갖는다
function rateBlock(sum) {
  const impressions = num(sum?.impressions);
  const clicks = num(sum?.clicks);
  const linkClicks = num(sum?.linkClicks);
  const spend = num(sum?.spend);
  return {
    impressions,
    clicks,
    linkClicks,
    spend: round(spend, 2),
    ctr: impressions > 0 ? round(clicks / impressions, 6) : null,
    linkCtr: impressions > 0 ? round(linkClicks / impressions, 6) : null,
    cpc: clicks > 0 ? round(spend / clicks, 4) : null,
    // Meta 화면의 CPC 는 전체 클릭이 아니라 링크 클릭 기준이다. 두 값을 함께 둬야
    // 대표가 광고 관리자와 대조할 때 "숫자가 다르다"는 말이 안 나온다
    costPerLinkClick: linkClicks > 0 ? round(spend / linkClicks, 4) : null,
    cpm: impressions > 0 ? round((spend / impressions) * 1000, 4) : null,
    ctrCI: wilson(clicks, impressions),
    method:
      "기간 합계로 묶은 뒤 나눈 값이다. 일별 비율의 평균이 아니다. " +
      "cpc 는 전체 클릭 기준, costPerLinkClick 이 Meta 화면과 같은 기준이다",
  };
}

// 전기 대비. 같은 길이의 직전 구간과만 비교한다
function comparePeriods(current, previous) {
  if (!current || !previous) {
    return { available: false, reason: "직전 구간 데이터가 없어 비교하지 않음" };
  }
  const cur = rateBlock(current);
  const prev = rateBlock(previous);
  const delta = (a, b) => {
    if (a === null || b === null) return null;
    return { abs: round(a - b, 6), pct: b ? round(((a - b) / b) * 100, 2) : null };
  };
  const ctrMde = mde(prev.ctr ?? 0, prev.impressions);
  const ctrDiff = cur.ctr !== null && prev.ctr !== null ? Math.abs(cur.ctr - prev.ctr) : null;
  return {
    available: true,
    current: cur,
    previous: prev,
    delta: {
      spend: delta(cur.spend, prev.spend),
      impressions: delta(cur.impressions, prev.impressions),
      clicks: delta(cur.clicks, prev.clicks),
      ctr: delta(cur.ctr, prev.ctr),
      cpc: delta(cur.cpc, prev.cpc),
    },
    ctrVerdict:
      ctrDiff === null || ctrMde === null
        ? "판정 불가"
        : ctrDiff >= ctrMde
          ? "CTR 변화가 이 표본에서 잡아낼 수 있는 크기다"
          : `CTR 변화(${round(ctrDiff, 5)})가 검출경계(${ctrMde}) 아래라 잡음과 구분되지 않는다`,
  };
}

// 접수는 표본이 작다. 여기서 무엇을 말할 수 있는지 못 박아 둔다
function leadBlock(leads, ads) {
  const total = num(leads?.total);
  const clicks = num(ads?.clicks);
  const linkClicks = num(ads?.linkClicks);
  const denom = linkClicks || clicks;
  const bySource = (leads?.bySource || []).map((r) => ({
    source: r.source,
    n: num(r.n),
    share: total > 0 ? round(num(r.n) / total, 4) : null,
  }));

  // Meta 계열만 따로 센다. 전체 접수로 낸 리드단가는 광고 성과가 아니다
  const metaRe = /(meta|페이스북|facebook|인스타|instagram|fb|ig)/i;
  const metaLeads = bySource
    .filter((r) => metaRe.test(String(r.source)))
    .reduce((a, r) => a + r.n, 0);

  return {
    total,
    bySource,
    metaLeads,
    metaCostPerLead:
      metaLeads > 0 && ads?.spend ? round(num(ads.spend) / metaLeads, 2) : null,
    metaCostPerLeadNote:
      metaLeads > 0
        ? "Meta 계열 접수만 분모로 쓴 값이다. 이것이 광고 단가에 가깝다"
        : "Meta 계열로 분류된 접수가 없어 광고 단독 단가를 낼 수 없다",
    clickToLead: denom > 0 ? wilson(total, denom) : null,
    zeroBound: total === 0 ? zeroUpperBound(denom) : null,
    smallSampleWarning:
      total < 30
        ? `접수 ${total}건은 세분화해서 순위를 매기기에 부족하다. 캠페인별로 쪼개면 대부분 잡음이다`
        : "",
  };
}

// Meta 가 세는 리드와 우리 DB 에 남은 접수는 다른 숫자다.
// Meta 는 폼 제출을 세고, 우리는 실제로 저장된 접수를 센다. 두 숫자를 나란히 두지 않으면
// 어느 쪽을 인용했느냐에 따라 리드 단가가 두 배 가까이 달라진다.
function reconcileLeads(ads, leads) {
  const metaReported = num(ads?.leads);
  const stored = num(leads?.total);
  const metaRe = /(meta|페이스북|facebook|인스타|instagram|fb|ig)/i;
  const storedMeta = (leads?.bySource || [])
    .filter((r) => metaRe.test(String(r.source)))
    .reduce((a, r) => a + num(r.n), 0);

  const gap = metaReported - storedMeta;
  return {
    metaReportedLeads: metaReported,
    storedLeadsTotal: stored,
    storedLeadsFromMeta: storedMeta,
    gap,
    gapRatio: metaReported > 0 ? round(gap / metaReported, 4) : null,
    note:
      metaReported > 0 && gap > 0
        ? "Meta 집계가 저장된 Meta 접수보다 많다. 폼 제출 후 저장까지의 유실이거나 집계 시점 차이다. 원인을 단정하지 말 것"
        : "Meta 집계와 저장 접수의 차이가 없거나 역전됐다. 기간 경계 때문일 수 있다",
  };
}

// 광고 흐름이 어디서 꺾이는가 — 이 봇 보고의 뼈대다.
//
// 숫자를 나열하면 읽는 사람이 스스로 이야기를 만들어야 한다. 그런데 광고는 언제나
// 같은 순서로 흐른다. 돈을 쓰면 노출이 되고, 노출에서 클릭이 나오고, 클릭에서 접수가 된다.
// 그래서 각 단계가 전기 대비 몇 배가 됐는지 나란히 놓으면 이야기가 저절로 드러난다.
//
// 지출 1.3배 · 노출 3.0배 · 클릭 2.6배 · 접수 1.1배 라면 할 말은 하나다.
// "노출은 샀는데 접수로 오지 않았다." 그 문장이 보고에 남아야 할 핵심이다.
//
// 통과율(passThrough)은 그 단계 배율을 직전 단계 배율로 나눈 값이다. 1 이면 앞 단계가
// 늘어난 만큼 따라온 것이고, 0.5 면 절반만 따라온 것이다. 가장 크게 새는 자리가 병목이다.
// 받침에 따라 조사를 고른다. "리드은" 처럼 나가면 판단 문장이 우스워져
// 정작 읽어야 할 내용이 눈에 안 들어온다
function josa(word, withFinal, withoutFinal) {
  const s = String(word || "");
  if (!s) return withFinal;
  const code = s.charCodeAt(s.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return withFinal;
  return (code - 0xac00) % 28 === 0 ? withoutFinal : withFinal;
}

function funnelShift(ads) {
  const cur = ads?.efficiency?.current;
  const prev = ads?.efficiency?.prevTotals;
  if (!cur || !prev) {
    return {
      available: false,
      reason: "직전 구간이 없어 흐름 변화를 볼 수 없다",
    };
  }

  const step = (label, c, p) => {
    const C = num(c);
    const P = num(p);
    return {
      label,
      current: round(C, 2),
      previous: round(P, 2),
      x: P > 0 ? round(C / P, 3) : null,
      pct: P > 0 ? round((C / P - 1) * 100, 1) : null,
    };
  };

  const steps = [
    step("지출", cur.spend, prev.spend),
    step("노출", cur.impressions, prev.impressions),
    step("클릭", cur.clicks, prev.clicks),
    step("링크클릭", cur.linkClicks, prev.linkClicks),
    step("Meta 집계 리드", cur.leads, prev.leads),
  ].filter((s) => s.x !== null);

  let bottleneck = null;
  for (let i = 1; i < steps.length; i++) {
    const before = steps[i - 1].x;
    const drop = before > 0 ? steps[i].x / before : null;
    steps[i].passThrough = drop === null ? null : round(drop, 3);
    // 앞 단계가 늘어난 만큼 따라오지 못한 자리를 찾는다. 가장 크게 새는 곳 하나만 짚는다
    if (drop !== null && drop < 0.85 && (!bottleneck || drop < bottleneck.passThrough)) {
      bottleneck = {
        from: steps[i - 1].label,
        at: steps[i].label,
        passThrough: round(drop, 3),
      };
    }
  }

  const first = steps[0];
  const last = steps[steps.length - 1];
  let verdict = "";
  if (bottleneck) {
    verdict =
      `${first.label}${josa(first.label, "은", "는")} ${first.x}배가 됐고 ` +
      `${bottleneck.from}까지 따라왔지만, ${bottleneck.at}${josa(bottleneck.at, "은", "는")} ` +
      `그 증가분의 ${Math.round(bottleneck.passThrough * 100)}%만 받았다. ` +
      `돈이 ${bottleneck.at} 바로 앞에서 멈춘다`;
  } else if (first.x && last.x) {
    verdict =
      last.x >= first.x
        ? `${first.label} ${first.x}배에 ${last.label} ${last.x}배로, 쓴 만큼 이상 따라왔다`
        : `단계마다 큰 누수 없이 ${first.label} ${first.x}배에 ${last.label} ${last.x}배로 움직였다`;
  }

  return {
    available: true,
    steps,
    bottleneck,
    verdict,
    note: "배율은 직전 동일 길이 구간 대비다. 대조군이 없으므로 인과가 아니라 동시 변화다",
  };
}

// 캠페인별 진짜 리드 단가 — 이 봇이 총계만 읊지 않게 하는 축.
//
// 총계 CPL 은 "광고가 잘 되고 있는가"에만 답한다. 정작 알아야 할 것은 "어느 캠페인에
// 돈을 더 넣고 어느 것을 끄는가"인데, 그건 캠페인마다 지출과 접수를 붙여야 나온다.
// 다행히 접수 레코드의 Campaign 에 광고 캠페인명이 그대로 들어와 있어 이름으로 붙는다.
//
// 이름이 안 맞는 것은 억지로 맞추지 않고 unmatched 로 남긴다. 잘못 붙인 한 건이
// 캠페인 순위를 통째로 뒤집을 수 있어서, 틀리느니 비워 두는 편이 낫다.
function normalizeName(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[_·・]/g, "")
    .toLowerCase();
}

function campaignEfficiency(ads, leads) {
  const rows = Array.isArray(ads?.campaigns) ? ads.campaigns : [];
  const leadRows = Array.isArray(leads?.byCampaign) ? leads.byCampaign : [];
  if (!rows.length || !leadRows.length) {
    return {
      available: false,
      reason: "캠페인별 광고 지표나 접수가 없어 캠페인 단가를 낼 수 없다",
    };
  }

  // 같은 캠페인이 플랫폼별로 나뉘어 있으므로 이름 기준으로 먼저 합친다
  const leadByName = new Map();
  for (const r of leadRows) {
    const key = normalizeName(r.campaign);
    if (!key || key === normalizeName("(캠페인 없음)")) continue;
    const cur = leadByName.get(key) || { n: 0, platforms: {}, raw: r.campaign };
    cur.n += num(r.n);
    cur.platforms[r.platform || "미상"] =
      (cur.platforms[r.platform || "미상"] || 0) + num(r.n);
    leadByName.set(key, cur);
  }

  const matched = [];
  const usedKeys = new Set();
  for (const c of rows) {
    const name = c.name || c.campaignName || c.campaign_name || "";
    const key = normalizeName(name);
    const spend = num(c.spend);
    const hit = leadByName.get(key);
    if (hit) usedKeys.add(key);
    const n = hit ? hit.n : 0;
    matched.push({
      campaign: name,
      status: c.status || "",
      spend: round(spend, 2),
      clicks: num(c.clicks),
      linkClicks: num(c.linkClicks),
      leads: n,
      costPerLead: n > 0 ? round(spend / n, 2) : null,
      platforms: hit ? hit.platforms : null,
      note: n === 0 && spend > 0 ? "지출은 있는데 접수가 붙지 않았다" : "",
    });
  }

  // 광고 목록에 없는 접수(끝난 캠페인, 오가닉 등)는 버리지 않고 따로 보여 준다
  const unmatched = [];
  for (const [key, v] of leadByName) {
    if (!usedKeys.has(key)) unmatched.push({ campaign: v.raw, leads: v.n });
  }

  const withLeads = matched.filter((m) => m.costPerLead !== null);
  const spending = matched.filter((m) => m.spend > 0);
  const best = withLeads.length
    ? [...withLeads].sort((a, b) => a.costPerLead - b.costPerLead)[0]
    : null;
  const worst = withLeads.length
    ? [...withLeads].sort((a, b) => b.costPerLead - a.costPerLead)[0]
    : null;
  const dead = spending
    .filter((m) => m.leads === 0)
    .sort((a, b) => b.spend - a.spend);

  let verdict = "";
  if (best && worst && best.campaign !== worst.campaign) {
    const gap = worst.costPerLead / best.costPerLead;
    verdict =
      `캠페인별 단가가 최저 $${best.costPerLead}(${best.campaign})에서 ` +
      `최고 $${worst.costPerLead}(${worst.campaign})까지 ${round(gap, 1)}배 벌어져 있다`;
  } else if (best) {
    verdict = `접수가 붙은 캠페인이 하나뿐이라 비교할 대상이 없다`;
  }
  if (dead.length) {
    verdict +=
      `${verdict ? ". " : ""}지출이 있는데 접수가 0건인 캠페인이 ${dead.length}개 있다` +
      `(가장 큰 것 ${dead[0].campaign} $${dead[0].spend})`;
  }

  return {
    available: true,
    rows: matched.sort((a, b) => b.spend - a.spend),
    unmatched,
    best,
    worst,
    zeroLeadSpenders: dead.slice(0, 5),
    verdict,
    note:
      "접수는 마지막 접점 기준이라 기여도이지 증분이 아니다. " +
      "이름이 맞지 않은 접수는 unmatched 로 뺐다",
  };
}

export function analyze(data) {
  const ads = data?.ads?.summary || null;
  const eff = data?.ads?.efficiency || null;
  const leads = data?.leads || null;

  const out = {
    basis: "이 블록의 수치는 봇이 직접 계산했다. 모델이 추정한 값이 아니다",
    currency: "USD",
    // 보고의 첫 문장은 여기서 나온다. 다른 블록보다 앞에 둔다
    funnel: funnelShift(data?.ads),
    // 총계만 보면 "광고가 잘 되나"까지만 말할 수 있다. 돈을 어디로 옮길지는 여기서 나온다
    campaigns: campaignEfficiency(data?.ads, leads),
    rates: ads ? rateBlock(ads) : { available: false },
    // previous 는 직전 구간의 날짜 범위이고, 합계는 prevTotals 에 들어 있다.
    // previous 를 합계로 착각해 넣으면 비교가 통째로 '판정 불가'로 떨어진다
    periodCompare: comparePeriods(eff?.current || ads, eff?.prevTotals),
    previousRange: eff?.previous || null,
    leadAnomalies: anomalies(leads?.daily),
    leads: leadBlock(leads, ads),
    leadReconciliation: reconcileLeads(ads, leads),
    boundaries: [
      "30일 표본에서는 집계 지표와 큰 폭의 이상만 말할 수 있다. 일 단위 계절성과 세분화 순위는 말할 수 없다",
      "대조군이 없으므로 어떤 비교도 인과가 아니다. 상관과 시점 일치까지만 말한다",
      "유입 경로별 접수는 마지막 접점 기준이라 기여도이지 증분이 아니다",
    ],
  };
  return out;
}
