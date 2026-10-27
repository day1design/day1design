import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import {
  QUALIFIED_LEAD_EVENT,
  qualifiedLeadBudget,
  sendMetaCapiLead,
  sendMetaCapiQualifiedLead,
} from "../src/lib/meta-capi.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// D1 로그는 이 테스트의 관심사가 아니라 삼킨다.
const noopDb = {
  prepare() {
    return {
      bind() {
        return { async run() {} };
      },
    };
  },
};

const env = {
  META_PIXEL_ID: "977283848476177",
  META_CAPI_TOKEN: "test-token",
  DB: noopDb,
};

function captureCapi() {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ events_received: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return sent;
}

const row = (budget, SpaceSize = "") => ({
  Detail: budget ? `가용예산: ${budget}\n문의 내용` : "문의 내용",
  SpaceSize,
});

test("1억원 경계: 1억 이상만 QualifiedLead 대상이다", () => {
  for (const b of ["1억", "1억 이상", "1.5억", "1억5천", "2~3억", "1억~1억5천"]) {
    assert.ok(qualifiedLeadBudget(row(b)), `${b} 는 대상이어야 한다`);
  }
  for (const b of ["9천만원", "7천~1억", "1억 이하", "5천만원", "3천만원 미만"]) {
    assert.equal(qualifiedLeadBudget(row(b)), null, `${b} 는 대상이 아니다`);
  }
  // 금액을 적지 않은 접수는 보내지 않는다.
  assert.equal(qualifiedLeadBudget(row("")), null);
  // 직원이 고객카드에 넣은 금액(원)이 문구보다 우선한다.
  assert.ok(qualifiedLeadBudget({ ...row("5천만원"), EstimateAmount: 120000000 }));
});

test("1억원 이상이면 QualifiedLead 한 건을 해시된 매칭 정보와 함께 보낸다", async () => {
  const sent = captureCapi();
  const res = await sendMetaCapiQualifiedLead(
    env,
    {
      eventId: "evt-q1",
      email: "Person@Example.COM",
      phone: "010-2222-3333",
      name: "임혜진",
      externalId: "recEstimate001",
      ip: "203.0.113.10",
      ua: "Mozilla/5.0",
      fbp: "fb.1.1.1",
      leadSource: "homepage",
    },
    row("1.5억", "40~50평"),
  );

  assert.equal(res.ok, true);
  assert.equal(sent.length, 1);
  const event = sent[0].body.data[0];
  assert.equal(event.event_name, QUALIFIED_LEAD_EVENT);
  assert.equal(event.event_name, "QualifiedLead");
  assert.equal(event.event_id, "evt-q1");
  assert.equal(event.action_source, "website");
  assert.equal(event.custom_data.value, 150000000);
  assert.equal(event.custom_data.currency, "KRW");
  assert.equal(event.custom_data.budget_band, "1억5천 이상");
  assert.equal(event.custom_data.lead_source, "homepage");
  for (const key of ["em", "ph", "fn", "external_id"]) {
    assert.match(event.user_data[key][0], /^[0-9a-f]{64}$/);
  }
});

test("1억원 미만·미기재 접수는 아무것도 보내지 않는다", async () => {
  const sent = captureCapi();
  for (const b of ["5천만원", "7천~1억", "1억 이하", ""]) {
    const res = await sendMetaCapiQualifiedLead(
      env,
      { phone: "010-2222-3333" },
      row(b),
    );
    assert.equal(res.skipped, "below_threshold");
  }
  assert.equal(sent.length, 0);
});

test("인스턴트폼 경로는 system_generated 로 보내고 event_source_url 을 넣지 않는다", async () => {
  const sent = captureCapi();
  await sendMetaCapiQualifiedLead(
    env,
    {
      actionSource: "system_generated",
      eventId: "meta-lead:01022223333:2026-10-27T00:00:00Z",
      phone: "01022223333",
      leadSource: "meta",
    },
    row("1억 이상", "40평대"),
  );
  const event = sent[0].body.data[0];
  assert.equal(event.action_source, "system_generated");
  assert.equal(event.event_source_url, undefined);
  assert.equal(event.custom_data.lead_source, "meta");
});

test("QualifiedLead 전송 실패는 예외를 던지지 않는다", async () => {
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  const res = await sendMetaCapiQualifiedLead(
    { ...env, TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" },
    { phone: "010-2222-3333" },
    row("2억"),
  );
  assert.equal(res.ok, false);
});

// [가드] Lead 는 예산과 무관하게 모든 접수에서 나가야 한다. QualifiedLead 를
// 이유로 Lead 를 조건부로 바꾸면 Lead 로 최적화하는 광고세트가 신호를 잃는다.
test("[가드] Lead 는 1억원 미만 접수에서도 그대로 나간다", async () => {
  const sent = captureCapi();
  await sendMetaCapiLead(env, null, {
    eventId: "evt-small",
    phone: "010-2222-3333",
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.data[0].event_name, "Lead");
});

test("[가드] 두 접수 경로가 Lead 와 QualifiedLead 를 따로 호출한다", () => {
  for (const rel of ["../src/routes/estimates.js", "../src/routes/meta-lead.js"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.match(src, /sendMetaCapiLead\(/, `${rel} 에서 Lead 호출이 빠졌다`);
    assert.match(
      src,
      /sendMetaCapiQualifiedLead\(/,
      `${rel} 에서 QualifiedLead 호출이 빠졌다`,
    );
  }
});
