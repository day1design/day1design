import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { createOtpRelay, createSmtpSender } from "./otp-relay.mjs";

const now = 1_900_000_000_000;
const config = { token: "relay-token", secret: "relay-secret", fromEmail: "mkt@polarad.co.kr", replyTo: "mkt@polarad.co.kr", smtpHost: "smtp.worksmobile.com", smtpPort: 587, smtpUser: "mkt@polarad.co.kr", smtpPass: "test-only", smtpFromName: "폴라애드" };

function signed(body, timestamp = now) {
  return { authorization: "Bearer relay-token", "x-crm-otp-timestamp": String(timestamp), "x-crm-otp-signature": createHmac("sha256", config.secret).update(`${timestamp}.${body}`).digest("hex") };
}

function body(id = "otp-1") {
  return JSON.stringify({ kind: "crm_otp", idempotency_key: id, to: "owner@example.com", from: "mkt@polarad.co.kr", reply_to: "mkt@polarad.co.kr", subject: "로그인 인증번호", text: "인증번호는 123456입니다.", html: "<p>123456</p>", expires_at: new Date(now + 300_000).toISOString() });
}

test("relay authenticates HMAC requests and sends once per OTP id", async () => {
  const sent = [];
  const relay = createOtpRelay({ config, now: () => now, sendMail: async (message) => { sent.push(message); return { accepted: true }; } });
  const first = body();
  assert.deepEqual((await relay({ path: "/crm/otp", headers: signed(first), body: first })).status, 200);
  assert.deepEqual((await relay({ path: "/crm/otp", headers: signed(first), body: first })).body, JSON.stringify({ accepted: true, duplicate: true }));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, "mkt@polarad.co.kr");
  assert.equal(sent[0].replyTo, "mkt@polarad.co.kr");
});

test("relay rejects bad auth, stale timestamps and sender changes", async () => {
  const relay = createOtpRelay({ config, now: () => now, sendMail: async () => ({ accepted: true }) });
  const value = body("otp-2");
  assert.equal((await relay({ path: "/crm/otp", headers: { ...signed(value), authorization: "Bearer wrong" }, body: value })).status, 401);
  assert.equal((await relay({ path: "/crm/otp", headers: signed(value, now - 300_001), body: value })).status, 401);
  const changed = value.replace("mkt@polarad.co.kr", "attacker@example.com");
  assert.equal((await relay({ path: "/crm/otp", headers: signed(changed), body: changed })).status, 400);
});

test("relay requires SMTP identity configuration and accepted delivery", async () => {
  let called = false;
  const relay = createOtpRelay({ config: { ...config, smtpHost: "smtp.example.test" }, now: () => now, sendMail: async () => { called = true; return { accepted: true }; } });
  const value = body("otp-3");
  assert.equal((await relay({ path: "/crm/otp", headers: signed(value), body: value })).status, 503);
  assert.equal(called, false);
});

test("concurrent duplicate also fails when the shared SMTP receipt is rejected", async () => {
  const relay = createOtpRelay({ config, now: () => now, sendMail: async () => ({ accepted: false }) });
  const value = body("otp-rejected");
  const responses = await Promise.all([
    relay({ path: "/crm/otp", headers: signed(value), body: value }),
    relay({ path: "/crm/otp", headers: signed(value), body: value }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [503, 503]);
});

test("SMTP sender keeps the established NAVER WORKS identity", async () => {
  let transportOptions;
  let mail;
  const sender = createSmtpSender(config, { nodemailer: {
    createTransport(options) {
      transportOptions = options;
      return { sendMail(value) { mail = value; return { accepted: [value.to] }; } };
    },
  } });
  await sender({ to: "owner@example.com", from: "mkt@polarad.co.kr", replyTo: "mkt@polarad.co.kr", subject: "OTP", text: "123456", html: "<b>123456</b>" });
  assert.deepEqual(transportOptions, { host: "smtp.worksmobile.com", port: 587, secure: false, requireTLS: true, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 8_000, auth: { user: "mkt@polarad.co.kr", pass: "test-only" } });
  assert.equal(mail.from, "폴라애드 <mkt@polarad.co.kr>");
  assert.equal(mail.replyTo, "mkt@polarad.co.kr");
});
