import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { sendMetaCapiLead } from "../src/lib/meta-capi.js";

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

// [가드] 매칭 신호가 줄면 Meta 가 전환을 광고에 붙이지 못한다.
// 인스턴트폼 리드는 브라우저 신호(fbp·fbc·ua)가 없어서 전화번호 하나로만
// 매칭되고 있었다. 이름·이메일·접수 식별자를 같이 보내도록 넓힌 것을 지킨다.
test("[가드] CAPI 는 가진 신호를 모두 해시해 보낸다", async () => {
  const sent = captureCapi();
  const res = await sendMetaCapiLead(env, null, {
    eventId: "evt-1",
    email: "Person@Example.COM",
    phone: "010-2222-3333",
    name: "임 혜진",
    externalId: "recEstimate001",
    ip: "203.0.113.10",
    ua: "Mozilla/5.0",
    fbp: "fb.1.1.1",
    fbc: "fb.1.1.click",
  });

  assert.equal(sent.length, 1);
  const userData = sent[0].body.data[0].user_data;
  for (const key of [
    "em",
    "ph",
    "fn",
    "external_id",
    "client_ip_address",
    "client_user_agent",
    "fbp",
    "fbc",
  ]) {
    assert.ok(userData[key], `${key} 가 빠졌다`);
  }
  // 개인정보는 평문으로 나가면 안 된다 — 해시는 64자리 16진수다.
  for (const key of ["em", "ph", "fn", "external_id"]) {
    assert.match(userData[key][0], /^[0-9a-f]{64}$/);
  }
  assert.equal(res.ok, true);
});

test("[가드] 인스턴트폼 리드도 전화번호 하나로만 나가지 않는다", async () => {
  const sent = captureCapi();
  await sendMetaCapiLead(env, null, {
    actionSource: "system_generated",
    eventId: "meta-lead:821022223333:1",
    phone: "01022223333",
    name: "임혜진",
    email: "lead@example.com",
    externalId: "recMetaLead001",
  });

  const userData = sent[0].body.data[0].user_data;
  const keys = Object.keys(userData).sort();
  assert.deepEqual(keys, ["em", "external_id", "fn", "ph"]);
  // 브라우저 신호가 없는 경로라 event_source_url 은 붙이지 않는다.
  assert.equal(sent[0].body.data[0].event_source_url, undefined);
});

test("이름 정규화는 공백과 구두점을 털고 소문자로 눕힌다", async () => {
  const sent = captureCapi();
  await sendMetaCapiLead(env, null, { phone: "01011112222", name: "임 혜진" });
  const spaced = sent[0].body.data[0].user_data.fn[0];

  const sent2 = captureCapi();
  await sendMetaCapiLead(env, null, { phone: "01011112222", name: "임혜진" });
  const tight = sent2[0].body.data[0].user_data.fn[0];

  assert.equal(spaced, tight);
});

test("값이 없는 신호는 아예 넣지 않는다", async () => {
  const sent = captureCapi();
  await sendMetaCapiLead(env, null, { phone: "01011112222", name: "", email: "" });
  const userData = sent[0].body.data[0].user_data;
  assert.deepEqual(Object.keys(userData), ["ph"]);
});
