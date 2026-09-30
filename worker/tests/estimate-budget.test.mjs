import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  BUDGET_BANDS,
  budgetBandIndex,
  estimateBudget,
  readBudget,
} from "../src/lib/estimate-budget.js";

const band = (label) => BUDGET_BANDS.findIndex((b) => b.label === label);

// 2026-09-30 라이브 접수 829건을 전수 검수하며 고른 문구. [답, 면적(평), 금액(만원), kind, 구간]
const CASES = [
  // 적은 그대로
  ["5000만원", 30, 5000, "amount", "5~7천만원"],
  ["3천", 30, 3000, "amount", "3~5천만원"],
  ["1억3천", 30, 13000, "amount", "1억~1억5천"],
  ["일억 삼천", 30, 13000, "amount", "1억~1억5천"],
  ["칠천만원", 30, 7000, "amount", "7천~1억"],
  ["오천 정도예산", 30, 5000, "amount", "5~7천만원"],
  ["4천5백만", 30, 4500, "amount", "3~5천만원"],
  ["3백만원", 30, 300, "amount", "3천만원 미만"],
  ["천만원대", 30, 1000, "amount", "3천만원 미만"],
  ["50,000,000", 30, 5000, "amount", "5~7천만원"],
  ["20000000krw", 30, 2000, "amount", "3천만원 미만"],
  ["2000원", 30, 2000, "amount", "3천만원 미만"],
  ["1.5억", 30, 15000, "amount", "1억5천 이상"],
  ["1억 5천", 30, 15000, "amount", "1억5천 이상"],
  ["1억+@", 30, 10000, "amount", "1억~1억5천"],
  ["2억  3억", 60, 20000, "amount", "1억5천 이상"],
  ["4000천만원", 25, 4000, "amount", "3~5천만원"],
  ["5000만우ㅜㄴ", 30, 5000, "amount", "5~7천만원"],
  ["예산은 9천만원정도입니다 27년된 구축아파트", 30, 9000, "amount", "7천~1억"],
  ["단독주택입니다 연면적 47평 예산 2억(내부외부)", 47, 20000, "amount", "1억5천 이상"],
  ["17평(전용13평) 구축아파트임, 약 1200만원", 17, 1200, "amount", "3천만원 미만"],
  // 범위는 앞 값. 앞쪽 단위를 생략해도 뒤 단위를 빌린다
  ["3~5천만원", 30, 3000, "amount", "3~5천만원"],
  ["1~2억", 30, 10000, "amount", "1억~1억5천"],
  ["3-4천", 30, 3000, "amount", "3~5천만원"],
  ["6-7천", 30, 6000, "amount", "5~7천만원"],
  ["8~9천", 30, 8000, "amount", "7천~1억"],
  ["1.0~1.5억원", 30, 10000, "amount", "1억~1억5천"],
  ["1-1.5억원", 60, 10000, "amount", "1억~1억5천"],
  ["1.5~2억", 40, 15000, "amount", "1억5천 이상"],
  ["2.~3억", 40, 20000, "amount", "1억5천 이상"],
  ["6-7000", 30, 6000, "amount", "5~7천만원"],
  ["6-7000만원", 30, 6000, "amount", "5~7천만원"],
  ["7-8000천만원", 40, 7000, "amount", "7천~1억"],
  ["9000~1억", 30, 9000, "amount", "7천~1억"],
  ["7천~1억", 30, 7000, "amount", "7천~1억"],
  ["300-500만원", 30, 300, "amount", "3천만원 미만"],
  ["~3000만원~", 30, 3000, "amount", "3~5천만원"],
  ["6-7천 최대한 6천 안으로", 30, 6000, "amount", "5~7천만원"],
  ["1억~1억5천이하", 30, 10000, "amount", "1억~1억5천"],
  // 상한 표현은 그 값을 넘지 않는 구간
  ["3천만원 미만", 30, 3000, "amount", "3천만원 미만"],
  ["3,000만원 이하", 30, 3000, "amount", "3천만원 미만"],
  ["5천만원 이하", 30, 5000, "amount", "3~5천만원"],
  ["1억 미만", 30, 10000, "amount", "7천~1억"],
  ["1.5억 이내", 30, 15000, "amount", "1억~1억5천"],
  ["3000안", 20, 3000, "amount", "3천만원 미만"],
  ["5천만원 안에서", 30, 5000, "amount", "3~5천만원"],
  ["5000만원내", 30, 5000, "amount", "3~5천만원"],
  ["최대 5천만원", 30, 5000, "amount", "3~5천만원"],
  ["맥스 6,000만원", 30, 6000, "amount", "5~7천만원"],
  ["최대 1억", 30, 10000, "amount", "7천~1억"],
  // '그 정도'는 상한이 아니다
  ["3000만원 내외", 30, 3000, "amount", "3~5천만원"],
  ["1억내외", 30, 10000, "amount", "1억~1억5천"],
  ["5천 안팎", 30, 5000, "amount", "5~7천만원"],
  ["1억원 이상", 30, 10000, "amount", "1억~1억5천"],
  // 평당 단가 × 면적(접수 면적의 앞 숫자)
  ["평당300", 30, 9000, "pyeong", "7천~1억"],
  ["250-300평당", 40, 10000, "pyeong", "1억~1억5천"],
  ["철거 제외 평당 100", 20, 2000, "pyeong", "3천만원 미만"],
  ["상담 후 결정하지만 평당 120만원 생각 하고 있습니다.", 60, 7200, "pyeong", "7천~1억"],
  ["33평 평당 200", 20, 6600, "pyeong", "5~7천만원"],
  ["평당 200만원", null, null, "unclear", null],
  // 숫자만 적은 답: 평당 금액이 보통 수준에 가까운 단위
  ["1.5", 60, 15000, "inferred", "1억5천 이상"],
  ["5", 30, 5000, "inferred", "5~7천만원"],
  ["1", 30, 10000, "inferred", "1억~1억5천"],
  ["1.5", 20, 15000, "inferred", "1억5천 이상"],
  ["0.8", 30, 8000, "inferred", "7천~1억"],
  ["5", 20, 5000, "inferred", "5~7천만원"],
  ["2", 20, 2000, "inferred", "3천만원 미만"],
  // 금액은 적었으나 읽을 수 없음 → 확인 필요
  ["48", 30, null, "unclear", null],
  ["5���", 30, null, "unclear", null],
  // 금액 표시가 없음 → 미기재
  ["", 30, null, "none", null],
  ["미정", 30, null, "none", null],
  ["상담 후 결정", 30, null, "none", null],
  ["0", 30, null, "none", null],
  ["48평", 30, null, "none", null],
  ["010-0000-0000", 30, null, "none", null],
  ["01000000000", 30, null, "none", null],
  ["신축 마이너스옵션 철거없고 벽 천장 기본 보드 다 되어있음", 30, null, "none", null],
  ["1-3안이 있어 비용은 달라질 듯하나 가능한 가성비 있는 공사를 원합니다.", 30, null, "none", null],
  ["14평 구축 빌라 샷시, 도배, 장판, 주방 리뉴얼 견적", 30, null, "none", null],
  ["상계주공 21평 1. 욕실 1개 공사 4. 벽은 디아망 천정은 일반 실크 10월 중순 예정", 30, null, "none", null],
];

test("budget rules read every amount the customer wrote and leave only amount-less answers unrecorded", () => {
  for (const [text, area, amount, kind, label] of CASES) {
    const result = readBudget(text, { area });
    assert.equal(result.amount, amount, `${text} amount`);
    assert.equal(result.kind, kind, `${text} kind`);
    const index = budgetBandIndex(result.amount, result.upper);
    assert.equal(index, label === null ? -1 : band(label), `${text} band`);
  }
});

test("a budget typed into the customer card wins over the customer's wording", () => {
  const detail = "공간유형: 아파트\n가용예산: 미정";
  assert.deepEqual(
    [estimateBudget({ Detail: detail, EstimateAmount: 70000000 })].map((r) => [r.kind, r.amount, r.band]),
    [["manual", 7000, band("7천~1억")]],
  );
  const parsed = estimateBudget({ Detail: "가용예산: 3천만원 미만", EstimateAmount: 120000000 });
  assert.equal(parsed.kind, "manual");
  assert.equal(parsed.band, band("1억~1억5천"));
  // 구간 경계는 반올림 전 금액으로 판정한다
  assert.equal(estimateBudget({ EstimateAmount: 29999999 }).band, band("3천만원 미만"));
  assert.equal(estimateBudget({ EstimateAmount: 30000000 }).band, band("3~5천만원"));
  // 0·빈 값은 직접 입력이 없는 것이다
  assert.equal(estimateBudget({ Detail: "가용예산: 5천", EstimateAmount: 0 }).kind, "amount");
  assert.equal(estimateBudget({ Detail: "가용예산: 5천", EstimateAmount: null }).kind, "amount");
});

test("row budget uses SpaceSize, then the Detail area line, for per-pyeong answers", () => {
  assert.equal(estimateBudget({ Detail: "가용예산: 평당 300", SpaceSize: "30~40평" }).amount, 9000);
  assert.equal(estimateBudget({ Detail: "면적: 20평~30평\n가용예산: 평당 300" }).amount, 6000);
  assert.equal(estimateBudget({ Detail: "가용예산: 평당 300" }).kind, "unclear");
});

test("budget label is read only on its own line", () => {
  assert.equal(estimateBudget({ Detail: "가용예산: \n거실 5000" }).kind, "none");
  assert.equal(estimateBudget({ Detail: "가용 예산 : 2천만원" }).amount, 2000);
  assert.equal(estimateBudget({ Detail: "가용예산：7천" }).amount, 7000);
});

// 관리자 페이지(site/admin/estimates.js)의 사본이 워커 규칙과 한 글자도 다르게
// 판정하면 안 된다. BEGIN~END 구간만 떼어 격리된 VM 에서 돌린다.
// VM 안에서 만든 값은 프로토타입이 달라 값만 꺼내 비교한다.
const plain = (value) => JSON.parse(JSON.stringify(value, (_, v) => (v === Infinity ? "Infinity" : v)));

function loadAdminCopy() {
  const source = readFileSync(new URL("../../site/admin/estimates.js", import.meta.url), "utf8");
  const begin = source.indexOf("// BUDGET-RULES:BEGIN");
  const end = source.indexOf("// BUDGET-RULES:END");
  assert.ok(begin >= 0 && end > begin, "admin budget block markers");
  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(begin, end)}\nthis.api = { readBudget, estimateBudget, budgetBandIndex, BUDGET_BANDS };`,
    context,
  );
  return context.api;
}

test("admin page copy of the budget rules matches the worker rules", () => {
  const admin = loadAdminCopy();
  assert.deepEqual(
    plain(admin.BUDGET_BANDS),
    plain(BUDGET_BANDS),
  );
  const extra = ["1억2천", "천", "억대", "3천후반", "2천대", "5천, 최대 6천", "1억 5천~8천", "~5천", "5천~", "1000-1500만", "10평/1200만원", "평당 3000000원", "1평에 300", "2009", "70만원"];
  for (const [text, area] of [...CASES.map((c) => [c[0], c[1]]), ...extra.map((t) => [t, 30])]) {
    assert.deepEqual(plain(admin.readBudget(text, { area })), plain(readBudget(text, { area })), text);
  }
  for (const row of [
    { Detail: "가용예산: 미정", EstimateAmount: 70000000 },
    { Detail: "가용예산: 평당 300", SpaceSize: "30~40평" },
    { Detail: "면적: 20평~30평\n가용예산: 5" },
    { Detail: "가용예산: 3천만원 미만" },
    { Detail: "가용예산: 미정", EstimateAmount: 29999999 },
  ]) {
    assert.deepEqual(plain(admin.estimateBudget(row)), plain(estimateBudget(row)), JSON.stringify(row));
  }
});
