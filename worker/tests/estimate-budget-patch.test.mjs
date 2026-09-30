import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { sign as signJwt } from "../src/lib/jwt.js";
import { handleEstimates } from "../src/routes/estimates.js";

// [가드] 고객카드 가용예산 직접 입력(EstimateAmount, 원 단위).
// 잘못된 값이 저장되면 접수관리·KPI·앱 통계의 예산 구간이 한꺼번에 틀어진다.

const ID = "rec12345678901ABC";
const ENV = { JWT_SECRET: "jwt-secret", ADMIN_ORIGINS: "https://admin.day1design.co.kr" };
let previousCaches;

beforeEach(() => {
  previousCaches = globalThis.caches;
  globalThis.caches = { default: { async match() { return null; }, async put() {}, async delete() { return true; } } };
});
afterEach(() => {
  globalThis.caches = previousCaches;
});

async function patch(body) {
  const saved = [];
  const services = {
    estimates: {
      async get() { return { id: ID, fields: {} }; },
      async update(id, fields) { saved.push(fields); return { id, fields }; },
    },
    media: { async deleteMany() {} },
  };
  const jwt = await signJwt({ sub: "admin" }, "jwt-secret", 3600);
  const res = await handleEstimates(
    new Request(`https://api.example.test/api/estimates/${ID}`, {
      method: "PATCH",
      headers: { cookie: `day1_admin=${encodeURIComponent(jwt)}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ENV,
    { waitUntil() {} },
    services,
  );
  return { res, saved };
}

test("[가드] 직접 입력한 예산은 원 단위 정수로 저장된다", async () => {
  const { res, saved } = await patch({ EstimateAmount: 55000000 });
  assert.equal(res.status, 200);
  assert.equal(saved[0].EstimateAmount, 55000000);
});

test("[가드] 0 은 직접 입력을 지우는 값으로 받는다", async () => {
  const { res, saved } = await patch({ EstimateAmount: 0 });
  assert.equal(res.status, 200);
  assert.equal(saved[0].EstimateAmount, 0);
});

test("[가드] 음수·소수·문자·과대 금액은 저장하지 않는다", async () => {
  for (const value of [-1, 1.5, "5천", 1e13]) {
    const { res, saved } = await patch({ EstimateAmount: value });
    assert.equal(res.status, 400, String(value));
    assert.equal(saved.length, 0, String(value));
  }
});
