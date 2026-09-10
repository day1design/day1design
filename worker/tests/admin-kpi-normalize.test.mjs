import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKpiBudget, classifyKpiOrganic } from '../src/lib/admin-kpi-normalize.js';
test('budget reads only intake budget field and follows existing range rules', () => {
  for (const [text, band, amount] of [['2999만원',0,2999],['3천만원',1,3000],['5천만원',2,5000],
    ['7천만원',3,7000],['1억',4,10000],['1억5천',5,15000],['6-7000',2,6000],
    ['50000000원',2,5000],['9000~1억',3,9000],['평당 200만원',6,null],['미정',6,null]]) {
    const result = normalizeKpiBudget({ Detail: `연락처: 01012345678\n가용예산: ${text}\n상세: 20평` });
    assert.equal(result.band, band, text); assert.equal(result.amountManwon, amount, text);
  }
  assert.equal(normalizeKpiBudget({ Detail: '연락처: 01012345678' }).band, 6);
});
test('organic admits only identified Naver Google or ChatGPT submission evidence', () => {
  for (const [ref, expected] of [['https://search.naver.com/search.naver', 'naver'],
    ['https://www.google.com/search?q=design', 'google'], ['https://chatgpt.com/', 'chatgpt'],
    ['https://chat.openai.com/', 'chatgpt'], ['https://claude.ai/', null],
    ['https://perplexity.ai/', null], ['https://blog.naver.com/a', null],
    ['https://google.com.attacker.test/', null]])
    assert.equal(classifyKpiOrganic({ Source: 'homepage', FirstReferrer: ref }), expected, ref);
  assert.equal(classifyKpiOrganic({ FirstUtmSource: 'google', FirstUtmMedium: 'organic' }), 'google');
});
test('paid social conflicting and unknown first-touch evidence remain excluded', () => {
  const organic = { FirstReferrer: 'https://www.google.com/search' };
  for (const extra of [{ FirstUtmMedium: 'cpc' }, { Fbclid: 'fixture' }, { Source: 'Instagram' },
    { FirstUtmSource: 'naver' }, { FirstReferrer: 'https://unknown.test/', Referrer: 'https://chatgpt.com/' },
    { FirstReferrer: 'https://www.google.com/?gclid=fixture' }])
    assert.equal(classifyKpiOrganic({ ...organic, ...extra }), null);
});
