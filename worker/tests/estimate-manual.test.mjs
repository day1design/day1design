import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { sign as signJwt } from "../src/lib/jwt.js";
import { handleEstimates } from "../src/routes/estimates.js";

// [가드] 관리자 수기 등록(POST /api/estimates/manual).
// 공개 접수(POST /api/estimates)와 분리된 관리자 전용 경로다. 인증 없이 열리거나
// 저장 전에 성공을 돌려주면 안 된다.

const ENV = { JWT_SECRET: "jwt-secret", ADMIN_ORIGINS: "https://admin.day1design.co.kr" };
let previousCaches;

beforeEach(() => {
  previousCaches = globalThis.caches;
  globalThis.caches = { default: { async match() { return null; }, async put() {}, async delete() { return true; } } };
});
afterEach(() => {
  globalThis.caches = previousCaches;
});

function services(fail = false) {
  const created = [];
  return {
    created,
    estimates: {
      async create(fields) {
        if (fail) throw new Error("d1 down");
        created.push(fields);
        return { id: "rec00000000000001", fields };
      },
      async get() { return { id: "x", fields: {} }; },
      async update(id, fields) { return { id, fields }; },
    },
    media: { async deleteMany() {} },
  };
}

async function post(body, { auth = true, svc = services(), headers = {} } = {}) {
  const jwt = await signJwt({ sub: "admin" }, "jwt-secret", 3600);
  const tasks = [];
  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates/manual", {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { cookie: `day1_admin=${encodeURIComponent(jwt)}` } : {}), ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ENV,
    { waitUntil(task) { tasks.push(task); } },
    svc,
  );
  return { res, svc, data: await res.json().catch(() => null) };
}

test("[가드] 수기 등록은 관리자 인증 없이 열리지 않는다", async () => {
  const { res, svc } = await post({ name: "김고객", phone: "010-1234-5678" }, { auth: false });
  assert.equal(res.status, 401);
  assert.equal(svc.created.length, 0);
});

test("[가드] 수기 등록 카드는 직접 등록 출처로 저장되고 저장 뒤에만 성공을 돌려준다", async () => {
  const { res, svc, data } = await post({
    name: "김고객", phone: "010-1234-5678", route: "전화 문의", estimateAmount: 70000000,
    spaceSize: "30~40평", detail: "주방·욕실\n전화 상담", submittedAt: "2026-09-29T01:00:00.000Z",
  });
  assert.equal(res.status, 200);
  const saved = svc.created[0];
  assert.equal(saved.Source, "manual");
  assert.equal(saved.FormType, "manual");
  assert.equal(saved.Status, "접수대기");
  assert.equal(saved.Referral, "전화 문의");
  assert.equal(saved.EstimateAmount, 70000000);
  assert.equal(saved.SubmittedAt, "2026-09-29T01:00:00.000Z");
  assert.equal(saved.Detail, "주방·욕실\n전화 상담");
  assert.equal(data.id, "rec00000000000001");
  assert.equal(data.record.Source, "manual");
});

test("[가드] 저장이 실패하면 성공을 돌려주지 않는다", async () => {
  const { res } = await post({ name: "김고객", phone: "010-1234-5678" }, { svc: services(true) });
  assert.equal(res.status, 500);
});

test("[가드] 이름·연락처·금액·일시가 잘못되면 저장하지 않는다", async () => {
  const future = new Date(Date.now() + 3600e3).toISOString();
  for (const body of [
    { phone: "010-1234-5678" },
    { name: "김고객", phone: "12" },
    { name: "김고객", phone: "010-1234-5678", email: "not-mail" },
    { name: "김고객", phone: "010-1234-5678", estimateAmount: -1 },
    { name: "김고객", phone: "010-1234-5678", estimateAmount: "5천" },
    { name: "김고객", phone: "010-1234-5678", submittedAt: future },
  ]) {
    const { res, svc } = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(svc.created.length, 0);
  }
  assert.equal((await post("{", {})).res.status, 400);
  assert.equal((await post({ name: "김고객", phone: "010-1234-5678" }, { headers: { "content-type": "text/plain" } })).res.status, 415);
});

test("[가드] 알 수 없는 접수 경로는 기타로 둔다", async () => {
  const { svc } = await post({ name: "김고객", phone: "01012345678", route: "<script>" });
  assert.equal(svc.created[0].Referral, "기타");
});
