// ╔══════════════════════════════════════════════════════════════════════╗
// ║  이탈 방지 팝업(exit guard) 접수 회귀 가드                              ║
// ║                                                                       ║
// ║  팝업은 이름·연락처만 받아 Status='작성중' 으로 먼저 저장하고, 견적 폼   ║
// ║  제출이 같은 LeadKey 를 실어 오면 새 카드를 만들지 않고 그 레코드를      ║
// ║  '접수대기' 로 승격한다. 이 대조가 깨지면 같은 고객이 카드 두 장으로     ║
// ║  갈라져 담당자가 두 번 전화한다.                                        ║
// ║                                                                       ║
// ║  기존 견적 폼의 필수 검증(평형대·주소·일정·지점·예산)은 이 경로에서만    ║
// ║  면제된다. 정규 폼에서 면제되면 빈 접수가 그대로 통과하므로 함께 지킨다. ║
// ╚══════════════════════════════════════════════════════════════════════╝
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { handleEstimates } from "../src/routes/estimates.js";
import { sign as signJwt } from "../src/lib/jwt.js";

let previousCaches;
let previousFetch;

beforeEach(() => {
  previousCaches = globalThis.caches;
  previousFetch = globalThis.fetch;
  globalThis.caches = {
    default: {
      async match() {
        return null;
      },
      async put() {},
      async delete() {
        return true;
      },
    },
  };
  globalThis.fetch = async () => Response.json({ ok: true });
});

afterEach(() => {
  globalThis.caches = previousCaches;
  globalThis.fetch = previousFetch;
});

function makeR2(puts) {
  return {
    put(key, body) {
      puts.push({ key, body });
      return Promise.resolve();
    },
  };
}

function r2Outcomes(puts) {
  return puts.map((p) => {
    try {
      return JSON.parse(p.body).outcome;
    } catch {
      return null;
    }
  });
}

function guardForm(extra = {}) {
  const form = new FormData();
  form.append("name", "이탈고객");
  form.append("phone", "010-4444-5555");
  form.append("privacy_agreed", "true");
  form.append("form_type", "exit_guard");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

function post(form, ip = "203.0.113.40") {
  return new Request("https://api.example.test/api/estimates", {
    method: "POST",
    body: form,
    headers: { "cf-connecting-ip": ip },
  });
}

// (1) 팝업 접수 — 상세 항목이 없어도 통과하고 '작성중' 으로 저장된다.
test("[invariant] exit_guard 접수는 상세 항목 없이도 '작성중' 으로 저장된다", async () => {
  const puts = [];
  const created = [];
  const tasks = [];

  const res = await handleEstimates(
    post(guardForm()),
    { IMAGES: makeR2(puts) },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: {
        async upload() {
          throw new Error("no upload expected");
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recGuard00000001", fields };
        },
        async listAll() {
          return [];
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(body.received, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].Status, "작성중");
  assert.equal(created[0].FormType, "exit_guard");
  assert.ok(created[0].LeadKey, "승격에 쓸 LeadKey 가 발급되어야 함");
  assert.equal(body.leadKey, created[0].LeadKey, "발급 키를 응답으로 돌려줘야 함");
  assert.ok(
    r2Outcomes(puts).includes("accepted"),
    "팝업 접수도 R2 원문이 보관되어야 함 (안전망 동일 적용)",
  );
});

// (2) 필수 검증 면제는 exit_guard 에만 적용된다 — 정규 폼은 그대로 400.
test("[invariant] 정규 폼은 상세 항목이 빠지면 여전히 거부된다", async () => {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "정규폼고객");
  form.append("phone", "010-6666-7777");
  form.append("privacy_agreed", "true");
  // form_type 없음 → 평형대·주소·일정·지점·예산 필수

  const res = await handleEstimates(
    post(form, "203.0.113.41"),
    {
      IMAGES: makeR2(puts),
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_CHAT_ID: "-100",
    },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: {
        async upload() {
          throw new Error("no upload expected");
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recReject00000001", fields };
        },
        async listAll() {
          return [];
        },
      },
    },
  );
  await Promise.allSettled(tasks);

  assert.equal(res.status, 400, "정규 폼의 필수 검증이 약화되면 안 된다");
  assert.ok(
    r2Outcomes(puts).includes("validation_failed"),
    "거부건도 R2 원문이 남아야 함",
  );
});

// (3) 승격 — 같은 LeadKey 로 폼이 들어오면 새 카드를 만들지 않고 갱신한다.
test("[invariant] 같은 LeadKey 의 폼 제출은 새 카드가 아니라 승격이다", async () => {
  const puts = [];
  const created = [];
  const updated = [];
  const tasks = [];

  const form = new FormData();
  form.append("name", "이탈고객");
  form.append("phone", "010-4444-5555");
  form.append("privacy_agreed", "true");
  form.append("space_size", "30~40평");
  form.append("address", "서울 강남구 논현로 562");
  form.append("schedule", "2026년 10월");
  form.append("branch", "강남점");
  form.append("budget", "6000만원");
  form.append("lead_key", "20260825-abc123");

  const res = await handleEstimates(
    post(form, "203.0.113.42"),
    { IMAGES: makeR2(puts) },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: {
        async upload() {
          return "https://x/y";
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recShouldNotCreate", fields };
        },
        async update(id, fields) {
          updated.push({ id, fields });
          return { id, fields };
        },
        async listAll({ where } = {}) {
          if (where && where.LeadKey === "20260825-abc123") {
            return [{ id: "recGuard00000001", fields: { Status: "작성중" } }];
          }
          return [];
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(body.received, true);
  assert.equal(created.length, 0, "승격 대상이 있으면 새 카드를 만들면 안 된다");
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "recGuard00000001");
  assert.equal(updated[0].fields.Status, "접수대기", "완주 시 승격되어야 함");
  assert.equal(updated[0].fields.LeadKey, "20260825-abc123");
});

// (4) 승격 대상 조회가 실패해도 접수 자체는 막히지 않는다.
test("[invariant] LeadKey 조회 실패는 접수를 막지 않는다 (새 레코드로 저장)", async () => {
  const puts = [];
  const created = [];
  const tasks = [];

  const form = new FormData();
  form.append("name", "조회실패고객");
  form.append("phone", "010-8888-9999");
  form.append("privacy_agreed", "true");
  form.append("space_size", "20~30평");
  form.append("address", "서울 강남구 테헤란로 2");
  form.append("schedule", "협의 가능");
  form.append("branch", "판교점");
  form.append("budget", "3000만원");
  form.append("lead_key", "20260825-broken");

  const res = await handleEstimates(
    post(form, "203.0.113.43"),
    { IMAGES: makeR2(puts) },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: {
        async upload() {
          return "https://x/y";
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recFallback00001", fields };
        },
        async listAll() {
          throw new Error("d1 down");
        },
      },
    },
  );
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(created.length, 1, "승격을 못 해도 접수는 저장되어야 한다");
  assert.equal(created[0].Status, "접수대기");
});

// (5) 접수관리 기본 목록에는 '작성중' 이 섞이지 않는다.
test("[invariant] 목록 API 기본 조회에서 '작성중' 은 제외된다", async () => {
  const rows = [
    { id: "a", fields: { Status: "접수대기", SubmittedAt: "2026-08-25" } },
    { id: "b", fields: { Status: "작성중", SubmittedAt: "2026-08-25" } },
  ];
  const secret = "test-secret";
  const token = await signJwt({ sub: "admin" }, secret);
  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "GET",
      headers: {
        "cf-connecting-ip": "203.0.113.44",
        authorization: `Bearer ${token}`,
      },
    }),
    { IMAGES: makeR2([]), JWT_SECRET: secret },
    { waitUntil() {} },
    {
      estimates: {
        async listAll({ where } = {}) {
          if (where && where.Status) {
            return rows.filter((r) => r.fields.Status === where.Status);
          }
          return rows;
        },
      },
    },
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(
    body.records.map((r) => r.id),
    ["a"],
    "미완성 '작성중' 건이 상담 카드 목록을 오염시키면 안 된다",
  );
});
