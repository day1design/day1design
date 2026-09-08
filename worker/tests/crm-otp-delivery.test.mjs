import assert from "node:assert/strict";
import test from "node:test";
import { deliverCrmOtp, isCrmOtpDeliveryConfigured } from "../src/lib/crm-otp-delivery.js";
import { createOtpRelay } from "../../mobile-crm/server/otp-relay.mjs";

const baseEnv = {
  CRM_OTP_RELAY_URL: "https://relay.example.test/crm/otp",
  CRM_OTP_RELAY_TOKEN: "relay-token",
  CRM_OTP_RELAY_SECRET: "relay-secret",
  CRM_OTP_FROM_EMAIL: "mkt@polarad.co.kr",
  CRM_OTP_REPLY_TO: "mkt@polarad.co.kr",
};

test("OTP relay requires the POLARAD business sender and all relay credentials", () => {
  assert.equal(isCrmOtpDeliveryConfigured(baseEnv), true);
  assert.equal(isCrmOtpDeliveryConfigured({ ...baseEnv, CRM_OTP_FROM_EMAIL: "other@example.com" }), false);
  assert.equal(isCrmOtpDeliveryConfigured({ ...baseEnv, CRM_OTP_RELAY_SECRET: "" }), false);
  assert.equal(isCrmOtpDeliveryConfigured({ ...baseEnv, CRM_OTP_RELAY_URL: "http://relay.example.test" }), false);
});

test("OTP relay sends authenticated, sender-pinned payload and requires acceptance receipt", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return Response.json({ accepted: true });
  };
  try {
    const result = await deliverCrmOtp(baseEnv, { email: "owner@example.com", code: "123456", expires_at: "2030-01-01T00:00:00.000Z", otp_id: "otp-test-1" });
    assert.deepEqual(result, { accepted: true });
    assert.equal(request.url, baseEnv.CRM_OTP_RELAY_URL);
    assert.equal(request.init.headers.authorization, "Bearer relay-token");
    assert.match(request.init.headers["x-crm-otp-signature"], /^[0-9a-f]{64}$/);
    const body = JSON.parse(request.init.body);
    assert.deepEqual({ to: body.to, from: body.from, reply_to: body.reply_to, kind: body.kind }, {
      to: "owner@example.com", from: "mkt@polarad.co.kr", reply_to: "mkt@polarad.co.kr", kind: "crm_otp",
    });
    assert.match(body.text, /123456/);
    await assert.rejects(() => deliverCrmOtp(baseEnv, { email: "owner@example.com", code: "12345", otp_id: "otp-test-2", expires_at: "2030-01-01T00:00:00.000Z" }), /payload invalid/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OTP relay does not treat a non-acceptance response as delivered", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ accepted: false });
  try {
    await assert.rejects(() => deliverCrmOtp(baseEnv, { email: "owner@example.com", code: "123456", otp_id: "otp-test-3", expires_at: "2030-01-01T00:00:00.000Z" }), /did not accept/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Worker OTP delivery is accepted by the real relay handler contract", async () => {
  const sent = [];
  const relayConfig = { token: "relay-token", secret: "relay-secret", fromEmail: "mkt@polarad.co.kr", replyTo: "mkt@polarad.co.kr", smtpHost: "smtp.worksmobile.com", smtpPort: 587, smtpUser: "mkt@polarad.co.kr", smtpPass: "test-only", smtpFromName: "폴라애드" };
  const relay = createOtpRelay({ config: relayConfig, sendMail: async (message) => { sent.push(message); return { accepted: true }; } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const headers = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers;
    const result = await relay({ method: "POST", path: new URL(url).pathname, headers, body: init.body });
    return new Response(result.body, { status: result.status, headers: result.headers });
  };
  try {
    const result = await deliverCrmOtp({
      CRM_OTP_RELAY_URL: "https://relay.example.test/crm/otp",
      CRM_OTP_RELAY_TOKEN: "relay-token",
      CRM_OTP_RELAY_SECRET: "relay-secret",
      CRM_OTP_FROM_EMAIL: "mkt@polarad.co.kr",
      CRM_OTP_REPLY_TO: "mkt@polarad.co.kr",
    }, { email: "owner@example.com", code: "654321", expires_at: new Date(Date.now() + 300_000).toISOString(), otp_id: "otp-integrated-1" });
    assert.deepEqual(result, { accepted: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "owner@example.com");
    assert.equal(sent[0].from, "mkt@polarad.co.kr");
    assert.match(sent[0].text, /654321/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
