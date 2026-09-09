import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authenticate, requestMobileOtp, verifyMobileOtp } from "../src/lib/crm-auth.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["../migrations/0001_init.sql", "../migrations/0041_consult_booking.sql", "../migrations/0042_contract_fields.sql", "../migrations/0045_mobile_crm.sql", "../migrations/0047_crm_auth.sql", "../migrations/0054_crm_persistent_sessions.sql"]) sqlite.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  return sqlite;
}

function d1(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { return sqlite.prepare(sql).get(...values) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
            async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function request(path, value) {
  return new Request(`https://test.local${path}`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.1" }, body: JSON.stringify(value) });
}

function env(sqlite, delivered = []) {
  return { DB: d1(sqlite), CRM_OTP_SECRET: "test-secret", CRM_OTP_DELIVER: async (payload) => delivered.push(payload) };
}

test("missing delivery configuration fails before account disclosure", async () => {
  const sqlite = database();
  const response = await requestMobileOtp(request("/api/mobile/auth/request-otp", { email: "unknown@example.com" }), { DB: d1(sqlite), CRM_OTP_SECRET: "secret" });
  assert.equal(response.status, 503);
  sqlite.close();
});

test("unknown, suspended and known requests share generic response", async () => {
  const sqlite = database(); const delivered = []; const service = env(sqlite, delivered);
  const unknown = await requestMobileOtp(request("/api/mobile/auth/request-otp", { email: "unknown@example.com" }), service);
  const known = await requestMobileOtp(request("/api/mobile/auth/request-otp", { email: "gahyun.co@gmail.com" }), service);
  assert.deepEqual(await unknown.json(), { ok: true, requested: true });
  assert.deepEqual(await known.json(), { ok: true, requested: true });
  assert.equal(delivered.length, 1);
  sqlite.prepare("UPDATE CrmTenants SET suspended=1 WHERE id='day1design'").run();
  const suspended = await requestMobileOtp(request("/api/mobile/auth/request-otp", { email: "gahyun.co@gmail.com" }), service);
  assert.deepEqual(await suspended.json(), { ok: true, requested: true });
  sqlite.close();
});

test("cooldown and five-attempt limit hold under concurrent requests", async () => {
  const sqlite = database(); const delivered = []; const service = env(sqlite, delivered);
  const first = await requestMobileOtp(request("/api/mobile/auth/request-otp", { email: "gahyun.co@gmail.com" }), service); assert.equal(first.status, 200);
  const concurrent = await Promise.all([1, 2].map(() => requestMobileOtp(request("/api/mobile/auth/request-otp", { email: "gahyun.co@gmail.com" }), service)));
  assert.deepEqual(concurrent.map((response) => response.status), [200, 200]); assert.equal(delivered.length, 1);
  for (let i = 0; i < 5; i++) { const response = await verifyMobileOtp(request("/api/mobile/auth/verify-otp", { email: "gahyun.co@gmail.com", code: "000000" }), service); assert.equal(response.status, 401); }
  const correct = await verifyMobileOtp(request("/api/mobile/auth/verify-otp", { email: "gahyun.co@gmail.com", code: delivered[0].code }), service); assert.equal(correct.status, 401);
  sqlite.close();
});

test("same OTP can be consumed only once", async () => {
  const sqlite = database(); const delivered = []; const service = env(sqlite, delivered);
  await requestMobileOtp(request("/api/mobile/auth/request-otp", { email: "gahyun.co@gmail.com" }), service);
  const responses = await Promise.all([1, 2].map(() => verifyMobileOtp(request("/api/mobile/auth/verify-otp", { email: "gahyun.co@gmail.com", code: delivered[0].code }), service)));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401]);
  const body = await responses.find((response) => response.status === 200).json();
  assert.equal(body.expires_in, null);
  sqlite.prepare("UPDATE CrmSessions SET expires_at='2000-01-01T00:00:00Z'").run();
  const session = await authenticate(d1(sqlite), new Request("https://test.local/api/mobile/me", { headers: { authorization: `Bearer ${body.token}` } }));
  assert.equal(session.email, "gahyun.co@gmail.com");
  sqlite.prepare("UPDATE CrmSessions SET revoked_at='2026-09-09T00:00:00Z'").run();
  assert.equal(await authenticate(d1(sqlite), new Request("https://test.local/api/mobile/me", { headers: { authorization: `Bearer ${body.token}` } })), null);
  sqlite.close();
});
