// Parser copied from the approved existing admin budget rules; values are in 10,000 KRW.
const BUDGET_UNDECIDED = /미정|상의|협의|결정|모르|문의|추후|생각중|고민/;
const BUDGET_PER_PYEONG = /평당|평 당|1평|한평/;
const BUDGET_HANGUL = {
  일: 1,
  이: 2,
  삼: 3,
  사: 4,
  오: 5,
  육: 6,
  칠: 7,
  팔: 8,
  구: 9,
  십: 10,
};
const BUDGET_BANDS = [
  { max: 3000, label: "3천만원 미만", key: "b1" },
  { max: 5000, label: "3~5천만원", key: "b2" },
  { max: 7000, label: "5~7천만원", key: "b3" },
  { max: 10000, label: "7천~1억", key: "b4" },
  { max: 15000, label: "1억~1억5천", key: "b5" },
  { max: Infinity, label: "1억5천 이상", key: "b6" },
];

export function budgetTextOf(r) {
  const m = /가용예산\s*:\s*([^\n\r]*)/.exec(String(r?.Detail || ""));
  return m ? m[1].trim() : "";
}

export function parseBudget(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (BUDGET_PER_PYEONG.test(s)) return null; // 총액이 아니라 단가다
  if (BUDGET_UNDECIDED.test(s) && !/\d/.test(s)) return null;

  let t = s.replace(/,/g, "").replace(/\s/g, "");
  if (/^0\d{8,12}$/.test(t)) return null; // 연락처를 잘못 넣은 것

  for (const [k, v] of Object.entries(BUDGET_HANGUL)) {
    t = t.split(`${k}천`).join(`${v}천`).split(`${k}억`).join(`${v}억`);
  }
  t = t
    .replace(/(^|[^0-9])천만/g, "$11000만")
    .replace(/(^|[^0-9])천(?![만원])/g, "$11000");

  // 범위는 앞 값을 쓰되 '6-7000' 처럼 앞이 짧으면 뒤 자릿수에 맞춘다
  const parts = t.split(/[~\-–—]/);
  if (parts.length >= 2) {
    const a = parts[0].match(/\d+/);
    const b = parts[1].match(/\d+/);
    if (a && b && a[0].length < b[0].length && !parts[0].includes("억")) {
      t =
        a[0] +
        "0".repeat(b[0].length - a[0].length) +
        parts[1].slice(b.index + b[0].length);
    } else {
      t = parts[0];
    }
  }
  t = t.split(/이상|이하|정도|내외|안팎/)[0];

  let m = t.match(/(\d+(?:\.\d+)?)억\s*(\d+)?\s*(천|백)?/);
  if (m) {
    let v = parseFloat(m[1]) * 10000;
    if (m[2]) {
      const num = parseFloat(m[2]);
      v += m[3] === "천" ? num * 1000 : m[3] === "백" ? num * 100 : num;
    }
    return Math.round(v);
  }
  m = t.match(/(\d+(?:\.\d+)?)천/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  m = t.match(/(\d+)만/);
  if (m) {
    const num = Number(m[1]);
    return num <= 200000 ? num : null;
  }
  m = t.match(/(\d{3,})/);
  if (m) {
    let num = Number(m[1]);
    if (num >= 1000000) num = Math.floor(num / 10000); // 원 단위로 적은 것
    return num >= 100 && num <= 200000 ? num : null;
  }
  return null;
}

export function normalizeKpiBudget(row) {
  const raw = budgetTextOf(row);
  const amount = parseBudget(raw);
  const index = amount === null ? 6 : BUDGET_BANDS.findIndex(band => amount < band.max);
  return { raw, amountManwon: amount, band: index, version: 1,
    reason: amount === null ? (raw ? 'unclassified' : 'missing') : 'classified' };
}

function hostname(value) {
  try { return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
function hostIs(host, domain) { return host === domain || host.endsWith(`.${domain}`); }
function classifyEvidence(source, referrer) {
  const s = String(source || '').trim().toLowerCase();
  const h = hostname(referrer);
  const found = new Set();
  if (['naver', '네이버'].includes(s) || h === 'search.naver.com' || h === 'm.search.naver.com') found.add('naver');
  if (['google', '구글'].includes(s) || /^((www|search)\.)?google\.(com|co\.kr)$/.test(h)) found.add('google');
  if (s === 'chatgpt' || hostIs(h, 'chatgpt.com') || h === 'chat.openai.com') found.add('chatgpt');
  return found.size === 1 ? [...found][0] : null;
}
export function classifyKpiOrganic(row = {}) {
  // A later organic visit must not overwrite paid or conflicting first-touch evidence.
  if (['MetaLeadId', 'MetaAdId', 'Fbclid', 'Gclid', 'Gbraid', 'Wbraid'].some(k => String(row[k] || '').trim())) return null;
  const sources = [row.Source, row.FirstSource, row.UtmSource, row.FirstUtmSource].map(v => String(v || '').toLowerCase());
  const mediums = [row.UtmMedium, row.FirstUtmMedium].map(v => String(v || '').toLowerCase());
  if (sources.some(s => /instagram|facebook|meta|인스타|페이스북/.test(s)) ||
      mediums.some(s => /(^|[_\s-])(cpc|ppc|paid|ads?|display|cpm|retargeting)([_\s-]|$)/.test(s))) return null;
  for (const ref of [row.FirstReferrer, row.Referrer]) {
    const h = hostname(ref);
    if (hostIs(h, 'instagram.com') || hostIs(h, 'facebook.com')) return null;
    try {
      const params = new URL(ref).searchParams;
      if (['gclid','fbclid','n_ad','n_campaign','NaPm'].some(k => params.has(k))) return null;
    } catch {}
  }
  const firstSource = row.FirstUtmSource || row.FirstSource;
  const hasFirst = Boolean(String(firstSource || '').trim() || String(row.FirstReferrer || '').trim());
  if (hasFirst) return classifyEvidence(firstSource, row.FirstReferrer);
  return classifyEvidence(row.UtmSource || row.Source, row.Referrer);
}
