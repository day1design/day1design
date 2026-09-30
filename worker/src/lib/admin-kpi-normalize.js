import { BUDGET_RULE_VERSION, budgetTextOf, estimateBudget, parseBudget } from './estimate-budget.js';

// 예산 해석 규칙은 estimate-budget.js 한 곳에 있다. 기존 호출부를 위해 다시 내보낸다.
export { budgetTextOf, parseBudget };

// band 0~5 는 BUDGET_BANDS, 6 은 '미기재·분류 불가'. 직원이 고객카드에 직접 넣은
// 금액(EstimateAmount)이 있으면 그 값으로 센다.
export function normalizeKpiBudget(row) {
  const budget = estimateBudget(row);
  const reason = budget.kind === 'manual' ? 'manual'
    : budget.amount !== null ? 'classified'
    : budget.raw ? 'unclassified' : 'missing';
  return { raw: budget.raw, amountManwon: budget.amount, band: budget.band < 0 ? 6 : budget.band,
    version: BUDGET_RULE_VERSION, reason };
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
