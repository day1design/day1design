import assert from "node:assert/strict";
import test from "node:test";
import { crmOriginalAnswers, serializeHomepageAnswers } from "../src/lib/crm-original-answers.js";

test("homepage fields serialize as bounded q/a/f answers and omit blanks", () => {
  const answers = serializeHomepageAnswers({ name: "홍길동", branch: "판교", budget: "3천만", empty: "무시" });
  assert.deepEqual(answers, [
    { question: "이름", answer: "홍길동", field: "name" },
    { question: "희망 지점", answer: "판교", field: "branch" },
    { question: "가용 예산", answer: "3천만", field: "budget" },
  ]);
});

test("homepage serialization joins array values without exposing values arrays", () => {
  const [answer] = serializeHomepageAnswers({ referral: ["인스타그램", "지인"] });
  assert.deepEqual(answer, { question: "유입 경로", answer: "인스타그램, 지인", field: "referral" });
  assert.equal("values" in answer, false);
});

test("captured MetaFieldData is normalized and preferred as original answers", () => {
  const result = crmOriginalAnswers({
    MetaLeadId: "lead-1", Name: "매핑 이름", MetaFieldData: JSON.stringify([
      { q: "희망 지점", a: ["판교", "강남"], f: "branch" },
      { q: "빈 응답", a: "", f: "empty" },
    ]),
  });
  assert.equal(result.source, "captured");
  assert.deepEqual(result.answers, [
    { question: "희망 지점", answer: "판교, 강남", field: "branch" },
    { question: "빈 응답", answer: "", field: "empty" },
  ]);
});

test("homepage stored fields are labeled as stored_fields and budget detail is preserved", () => {
  const result = crmOriginalAnswers({ Name: "홈페이지 고객", Branch: "강남", Detail: "가용 예산 : 5천만원\n주방 중심", EstimateAmount: 0 });
  assert.equal(result.source, "stored_fields");
  assert.deepEqual(result.answers, [
    { question: "이름", answer: "홈페이지 고객", field: "name" },
    { question: "희망 지점", answer: "강남", field: "branch" },
    { question: "문의 내용", answer: "가용 예산 : 5천만원\n주방 중심", field: "detail" },
    { question: "가용 예산", answer: "5천만원", field: "budget" },
  ]);
});

test("Meta lead with absent original data is explicitly missing", () => {
  assert.deepEqual(crmOriginalAnswers({ MetaLeadId: "lead-2", Name: "매핑 고객", Detail: "가용 예산 : 1억원" }), { answers: [], source: "missing" });
});

test("captured answers retain all 20 fields and each value is capped at 5000 characters", () => {
  const captured = Array.from({ length: 20 }, (_, index) => ({ q: `질문${index}`, a: "x".repeat(6000), f: `f${index}` }));
  const result = crmOriginalAnswers({ MetaLeadId: "lead-3", MetaFieldData: JSON.stringify(captured) });
  assert.equal(result.answers.length, 20);
  assert.equal(result.answers[0].answer.length, 5000);
});
