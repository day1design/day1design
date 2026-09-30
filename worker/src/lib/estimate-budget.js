// 가용예산 해석 — 금액은 전부 만원 단위다.
//
// 고객은 예산을 자유롭게 쓴다('3~5천만원'·'1억3천'·'평당 300'·'1.5'). 워커는
// 그 답을 `가용예산: <답>` 한 줄로 Detail 에 이어 붙이므로 여기서 다시 읽는다.
// 원칙은 하나다: 금액을 적었으면 그 금액을 통계에 넣고, 금액 표시가 전혀 없는
// 것만 미기재로 센다. 직원이 고객카드에 직접 넣은 금액(EstimateAmount, 원 단위)이
// 있으면 그 값이 고객 문구보다 먼저다.
//
// 🔴 같은 규칙이 site/admin/estimates.js 에 한 벌 더 있다(관리자 페이지는 번들러
// 없는 정적 스크립트라 이 파일을 import 할 수 없다). 규칙을 고치면 두 곳을 같이
// 고치고 BUDGET_RULE_VERSION 을 올린다 — tests/estimate-budget.test.mjs 가 같은
// 문구표로 두 벌을 함께 돌려 어긋나면 실패하고, 버전이 오르면 KPI 저장 집계가
// 옛 규칙으로 센 날짜를 스스로 다시 센다(admin-kpi-refresh.js).

export const BUDGET_RULE_VERSION = 2;

export const BUDGET_BANDS = Object.freeze([
  { max: 3000, label: "3천만원 미만", key: "b1" },
  { max: 5000, label: "3~5천만원", key: "b2" },
  { max: 7000, label: "5~7천만원", key: "b3" },
  { max: 10000, label: "7천~1억", key: "b4" },
  { max: 15000, label: "1억~1억5천", key: "b5" },
  { max: Infinity, label: "1억5천 이상", key: "b6" },
]);

const HANGUL_DIGIT = {
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
const PER_PYEONG = /평당|(^|[^0-9])1평|한평/;
const UNIT_AMOUNT =
  /(\d+(?:\.\d+)?)억(?:(\d+(?:\.\d+)?)(천|백|만)?(?![\d.]*억))?|(\d+(?:\.\d+)?)천(?:(\d+)백)?|(\d+(?:\.\d+)?)백|(\d+(?:\.\d+)?)만/;
// 금액 뒤 '미만·이하·안에서·내' 또는 앞 '최대·맥스' 는 상한이다. '내외·안팎' 은
// '그 정도'라는 뜻이라 상한으로 보지 않는다.
const UPPER_BOUND = /^(미만|이하|이내|까지|안(?!팎)|내(?!외)|아래|밑)/;
const UPPER_PREFIX = /(최대|맥스|max)[^0-9]{0,8}$/i;
// 숫자만 적은 답('1.5'·'5')의 단위를 고를 때 기준으로 삼는 평당 금액(만원).
// 2026-09-30 라이브 접수 중 금액과 면적이 모두 있는 693건의 평당 금액 중앙값이다
// (p25 100 · p75 233).
const TYPICAL_PER_PYEONG = 150;
const DEFAULT_AREA = 30;

export function budgetTextOf(row) {
  // 값이 비어 있으면 다음 줄로 넘어가 읽지 않는다(다른 항목을 예산으로 오인).
  const m = /가용\s*예산[^\S\r\n]*[:：][^\S\r\n]*([^\n\r]*)/.exec(
    String(row?.Detail || ""),
  );
  return m ? m[1].trim() : "";
}

// '20~30평'·'50평 이상'·'60평_이상' → 앞 숫자(평)
export function spaceSizePyeong(value) {
  const m = String(value || "").match(/\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return n >= 5 && n <= 500 ? n : null;
}

function rowAreaPyeong(row) {
  const fromSize = spaceSizePyeong(row?.SpaceSize);
  if (fromSize) return fromSize;
  const m = /면적[^\S\r\n]*[:：][^\S\r\n]*([^\n\r]*)/.exec(
    String(row?.Detail || ""),
  );
  return m ? spaceSizePyeong(m[1]) : null;
}

function normalizeText(raw) {
  let t = String(raw || "")
    .normalize("NFC")
    .replace(/[,\s]/g, "")
    .replace(/[∼〜～]/g, "~");
  for (const [k, v] of Object.entries(HANGUL_DIGIT)) {
    for (const unit of ["억", "천", "백"]) t = t.split(k + unit).join(v + unit);
  }
  // '2.~3억'·'1.억' 처럼 단위 앞에 남은 점, '천만원'·'억대' 처럼 앞 숫자가 빠진 단위.
  // 단위 글자가 단어 속에 있을 때('천장'·'백색')는 금액으로 읽지 않는다.
  return t
    .replace(/\.(?=[억천백만~\-])/g, "")
    .replace(
      /(^|[^0-9.])억(?=$|[0-9]|원|대|만|천|이상|이하|미만|정도|내외|~|-)/g,
      "$11억",
    )
    .replace(
      /(^|[^0-9.])천(?=$|[0-9]|만|원|대|이상|이하|미만|정도|내외|~|-)/g,
      "$11천",
    )
    .replace(/(^|[^0-9.])백(?=만|원)/g, "$11백");
}

function amountOf(t) {
  const m = UNIT_AMOUNT.exec(t);
  if (m) {
    let value;
    if (m[1]) {
      value = Number(m[1]) * 10000;
      if (m[2]) {
        const n = Number(m[2]);
        // '1억5' 는 1억5천이다. 단위 없이 네 자리면 만원('1억5000').
        value +=
          m[3] === "천"
            ? n * 1000
            : m[3] === "백"
              ? n * 100
              : m[3] === "만" || n >= 10
                ? n
                : n * 1000;
      }
    } else if (m[4]) {
      value = Number(m[4]) * 1000 + (m[5] ? Number(m[5]) * 100 : 0);
      // '4000천만원' 은 4000만원을 적다 '천'이 더 붙은 것이다.
      if (Number(m[4]) >= 100 && t[m.index + m[0].length] === "만") {
        value = Number(m[4]);
      }
    } else if (m[6]) {
      value = Number(m[6]) * 100;
    } else {
      value = Number(m[7]);
    }
    value = Math.round(value);
    if (!(value > 0 && value <= 200000)) return null;
    return { value, upper: isUpperBound(t, m.index, m[0].length) };
  }
  const bare = t.match(/\d{3,}/);
  if (!bare) return null;
  let n = Number(bare[0]);
  if (n >= 1000000) n = Math.floor(n / 10000); // 원 단위로 적은 것
  if (!(n >= 100 && n <= 200000)) return null;
  return { value: n, upper: isUpperBound(t, bare.index, bare[0].length) };
}

function isUpperBound(t, index, length) {
  const rest = t.slice(index + length).replace(/^만?원?/, "");
  return UPPER_BOUND.test(rest) || UPPER_PREFIX.test(t.slice(0, index));
}

// 범위는 앞 값을 쓴다. 앞쪽 단위를 생략한 '3~5천'·'1~2억' 은 뒤 단위를 빌리고,
// '6-7000' 처럼 앞이 짧으면 뒤 자릿수에 맞춘다. '9000~1억' 은 앞 값 그대로다.
function rangeFront(t) {
  const parts = t.split(/[~\-–—]/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  const [front, back] = parts;
  const fa = front.match(/\d+(?:\.\d+)?/);
  const fb = back.match(/\d+(?:\.\d+)?/);
  if (!fa || !fb || /[억천백만]/.test(front)) return front;
  const unit =
    back.slice(fb.index + fb[0].length).match(/^[억천백만]/)?.[0] || "";
  if (unit && unit !== "만")
    return Number(fa[0]) <= Number(fb[0]) ? fa[0] + unit : front;
  if (
    !fa[0].includes(".") &&
    !fb[0].includes(".") &&
    fa[0].length < fb[0].length
  ) {
    return (
      fa[0] +
      "0".repeat(fb[0].length - fa[0].length) +
      back.slice(fb.index + fb[0].length)
    );
  }
  if (unit === "만" && Number(fa[0]) <= Number(fb[0])) return `${fa[0]}만`;
  return front;
}

function readAmount(t) {
  const upperOpen = /^~/.test(t) && !/~$/.test(t);
  const front = rangeFront(t);
  const found = amountOf(front) || (front !== t ? amountOf(t) : null);
  if (!found) return null;
  return { value: found.value, upper: found.upper || upperOpen };
}

// 숫자만 적은 답. 소수('1.5'·'0.8')는 억으로 적는 것이 보통이라 억으로 읽는다
// (1,500만원이면 '1500'·'천오백'으로 적는다). 정수('5')는 억과 천만원 중 평당 금액이
// 보통 수준에 가까운 쪽을 고른다: 20평에 '5' → 5천만원, 30평에 '1' → 1억.
function inferBareUnit(n, area, decimal) {
  if (decimal) return Math.round(n * 10000);
  const a = area || DEFAULT_AREA;
  const distance = (value) =>
    Math.abs(Math.log(value / a / TYPICAL_PER_PYEONG));
  const eok = n * 10000;
  const cheon = n * 1000;
  return distance(eok) < distance(cheon) ? eok : cheon;
}

function perPyeong(t, area) {
  const textArea = t.match(/(\d+(?:\.\d+)?)평(?!당)/);
  const areaInText =
    textArea && Number(textArea[1]) >= 5 ? Number(textArea[1]) : null;
  const priceText = t
    .replace(/(\d+(?:\.\d+)?)평(?!당)/g, "")
    .replace(/한평당|1평당|평당|한평|1평/g, "");
  let price = readAmount(priceText)?.value ?? null;
  if (price === null) {
    const m = priceText.match(/\d+(?:\.\d+)?/);
    const n = m ? Number(m[0]) : NaN;
    price = n >= 10 && n <= 2000 ? n : null;
  }
  if (price !== null && price > 2000) price = null; // 평당 2천만원 넘는 값은 총액을 잘못 넣은 것
  const useArea = areaInText || area;
  if (price === null || !useArea)
    return { amount: null, kind: "unclear", upper: false };
  return { amount: Math.round(price * useArea), kind: "pyeong", upper: false };
}

/**
 * 고객이 적은 예산 문구 하나를 읽는다.
 * kind: amount(적은 금액) · pyeong(평당×면적) · inferred(숫자만 적어 단위 추정)
 *       · unclear(금액은 적었으나 읽지 못함) · none(금액 표시 없음)
 */
export function readBudget(raw, { area = null } = {}) {
  const t = normalizeText(raw);
  const none = { amount: null, kind: "none", upper: false };
  if (!/\d/.test(t)) return none; // '미정'·'상담 후 결정'·빈칸
  // 인코딩이 깨진 답('5õ����')은 금액을 적었을 수 있으니 미기재로 버리지 않는다.
  if (/�/.test(t)) return { amount: null, kind: "unclear", upper: false };
  if (/^01\d{8,9}$/.test(t.replace(/[-.]/g, ""))) return none; // 연락처를 잘못 넣은 것
  if (PER_PYEONG.test(t)) return perPyeong(t, area);
  const bare = t.match(/^~?(\d+(?:\.\d+)?)(원)?~?$/);
  if (bare && Number(bare[1]) < 100) {
    const n = Number(bare[1]);
    if (n <= 0) return none;
    if (n < 10)
      return { amount: inferBareUnit(n, area, bare[1].includes(".")), kind: "inferred", upper: false };
    return { amount: null, kind: "unclear", upper: false };
  }
  const found = readAmount(t);
  if (found) return { amount: found.value, kind: "amount", upper: found.upper };
  // 숫자는 있어도 금액 단위·자릿수가 없으면(면적·날짜·문의 문장) 금액 표시가 없는 것이다.
  return /\d(억|천|백|만|원)|\d{3,}/.test(t.replace(/\d+평/g, ""))
    ? { amount: null, kind: "unclear", upper: false }
    : none;
}

export function parseBudget(raw, opts) {
  return readBudget(raw, opts).amount;
}

// '3천만원 미만'·'5천 이하' 처럼 상한으로 적은 금액은 그 값을 넘지 않는 구간에 넣는다.
export function budgetBandIndex(amount, upper = false) {
  if (
    amount === null ||
    amount === undefined ||
    !Number.isFinite(Number(amount))
  )
    return -1;
  return BUDGET_BANDS.findIndex((band) =>
    upper ? amount <= band.max : amount < band.max,
  );
}

/**
 * 접수 한 건의 예산. 직원이 직접 넣은 금액 → 고객 문구 순서로 본다.
 * band 는 BUDGET_BANDS 인덱스, 금액이 없으면 -1.
 */
export function estimateBudget(row = {}) {
  const raw = budgetTextOf(row);
  const manual = Number(row?.EstimateAmount);
  if (Number.isFinite(manual) && manual > 0) {
    // 구간 경계에서 어긋나지 않게 반올림하지 않는다(2,999만9,999원은 3천만원 미만).
    const amount = manual / 10000;
    return {
      raw,
      amount,
      kind: "manual",
      upper: false,
      band: budgetBandIndex(amount),
    };
  }
  const read = readBudget(raw, { area: rowAreaPyeong(row) });
  return { raw, ...read, band: budgetBandIndex(read.amount, read.upper) };
}
