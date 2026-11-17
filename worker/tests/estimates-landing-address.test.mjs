// 랜딩 v3(2026-11-17): 지역 랜딩(/lp/*) 신청서에는 아파트 단지명 칸이 없다.
// 랜딩이 보내는 form_type(lp_all 등)일 때만 주소 없이 접수되고, 견적문의 폼은 지금처럼 주소가 필수다.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { handleEstimates } from "../src/routes/estimates.js";

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

async function submit(extra) {
  const puts = [];
  const created = [];
  const tasks = [];
  const form = new FormData();
  form.append("name", "랜딩고객");
  form.append("phone", "010-1234-5678");
  form.append("privacy_agreed", "true");
  form.append("space_size", "40평대");
  form.append("address", "");
  form.append("schedule", "2027년 3월");
  form.append("branch", "강남점");
  form.append("budget", "1억~1억5천");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.40" },
    }),
    {
      IMAGES: {
        put(key, body) {
          puts.push({ key, body });
          return Promise.resolve();
        },
      },
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_CHAT_ID: "-100",
    },
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
          return { id: "recLanding000001", fields };
        },
      },
    },
  );
  const body = await res.json();
  await Promise.allSettled(tasks);
  return { res, body, created };
}

test("landing form without an apartment name is accepted as a normal intake", async () => {
  const { res, body, created } = await submit({ form_type: "lp_all", utm_campaign: "lp-all" });
  assert.equal(res.status, 200);
  assert.equal(body.received, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].Status, "접수대기");
  assert.equal(created[0].Address, "");
  assert.equal(created[0].FormType, "", "랜딩 표시는 저장되는 접수 종류를 바꾸지 않는다");
});

test("landing visit without UTM tags is still accepted (form_type decides)", async () => {
  const { res, created } = await submit({ form_type: "lp_gangnam" });
  assert.equal(res.status, 200);
  assert.equal(created[0].Status, "접수대기");
});

test("estimate form without an address still fails validation (D1 오류 card kept)", async () => {
  const { res, body, created } = await submit({});
  assert.equal(res.status, 400);
  assert.ok(body.errors.includes("address"));
  assert.equal(created.length, 1);
  assert.equal(created[0].Status, "오류");
});

test("an unknown form_type does not skip the address check", async () => {
  const { res, body } = await submit({ form_type: "lp_all<script>" });
  assert.equal(res.status, 400);
  assert.ok(body.errors.includes("address"));
});
