import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { sign as signJwt } from "../src/lib/jwt.js";
import {
  handlePixelEvents,
  handlePixelEventsAdmin,
} from "../src/routes/pixel-events.js";

function envStub() {
  const calls = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...values) {
              calls.push({ sql, values });
              return { async run() {} };
            },
          };
        },
      },
    },
  };
}

function request(event) {
  return new Request("https://api.example.test/api/pixel-events", {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "cf-connecting-ip": "203.0.113.42",
      "user-agent": "pixel-test",
    },
    body: JSON.stringify(event),
  });
}

test("form funnel events retain diagnostic and inquiry linkage", async () => {
  const stub = envStub();
  const response = await handlePixelEvents(
    request({
      event_name: "ValidationError",
      ga4_name: "form_validation_error",
      event_detail: "email_format",
      estimate_id: "rec123",
      campaign: "Autumn Campaign",
      ad_id: "ad-303",
    }),
    stub.env,
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(stub.calls.length, 1);
  assert.match(stub.calls[0].sql, /event_detail, estimate_id/);
  assert.ok(stub.calls[0].values.includes("ValidationError"));
  assert.ok(stub.calls[0].values.includes("email_format"));
  assert.ok(stub.calls[0].values.includes("rec123"));
});

test("browser beacon cannot create Lead records", async () => {
  const stub = envStub();
  const response = await handlePixelEvents(
    request({ event_name: "Lead" }),
    stub.env,
    {},
  );

  assert.deepEqual(await response.json(), { ok: true, skipped: true });
  assert.equal(stub.calls.length, 0);
});

test("admin analytics connects form stages to consultation outcomes", async () => {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of [
    "../migrations/0001_init.sql",
    "../migrations/0022_pixel_events.sql",
    "../migrations/0040_conversion_attribution.sql",
    "../migrations/0041_consult_booking.sql",
    "../migrations/0042_contract_fields.sql",
  ]) {
    sqlite.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  }
  sqlite
    .prepare(
      `INSERT INTO pixel_events
       (id, created_at, event_name, ga4_name, channel, event_id, page_path, source, session_id,
        campaign, adset, ad, ad_id, fbclid, event_detail, estimate_id, capi_status, matched_fields, ip, ua)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, 'pixel', '', '/estimates', 'meta', '',
               'Autumn Campaign', 'Gangnam 30s', 'Wood Creative', 'ad-303', '', ?, ?, '', '', '', '')`,
    )
    .run(
      "event-1",
      "ValidationError",
      "form_validation_error",
      "email_format",
      "recOutcome000001",
    );
  sqlite
    .prepare(
      `INSERT INTO Estimates
       (id, Name, SubmittedAt, Status, EstimateAmount, Campaign, MetaCampaign, MetaAd, MetaAdId, ContactedAt)
       VALUES (?, '계약고객', strftime('%Y-%m-%dT%H:%M:%fZ','now'), '계약완료', 12000000,
               'Wood Creative', 'Autumn Campaign', 'Wood Creative', 'ad-303', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    )
    .run("recOutcome000001");

  const DB = {
    prepare(sql) {
      return {
        async all() {
          return { results: sqlite.prepare(sql).all() };
        },
        async first() {
          return sqlite.prepare(sql).get() || null;
        },
      };
    },
  };
  const secret = "pixel-admin-secret";
  const token = await signJwt({ sub: "admin" }, secret, 3600);
  const response = await handlePixelEventsAdmin(
    new Request("https://api.example.test/api/admin/pixel-events?days=7", {
      headers: { cookie: `day1_admin=${encodeURIComponent(token)}` },
    }),
    { DB, JWT_SECRET: secret },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.funnel.validation_error, 1);
  assert.equal(body.outcome.inquiries, 1);
  assert.equal(body.outcome.contracted, 1);
  assert.equal(body.outcome.contractValue, 12000000);
  assert.equal(body.byOutcome[0].ad_id, "ad-303");
  sqlite.close();
});
