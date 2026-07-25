import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import worker from "../src/index.js";

const env = {
  ALLOWED_ORIGINS:
    "https://day1design.co.kr,https://www.day1design.co.kr,https://admin.day1design.co.kr",
  MAIN_ORIGINS: "https://day1design.co.kr,https://www.day1design.co.kr",
  ADMIN_ORIGINS: "https://admin.day1design.co.kr",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "secret-pass",
  JWT_SECRET: "jwt-secret",
  ASSETS: {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/index.html") {
        return new Response("<!doctype html><title>DAYONE</title>", {
          headers: { "content-type": "text/html" },
        });
      }
      if (path === "/admin/login.html") {
        return new Response("<!doctype html><title>ADMIN</title>", {
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  },
};

let previousCaches;

beforeEach(() => {
  previousCaches = globalThis.caches;
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
});

afterEach(() => {
  globalThis.caches = previousCaches;
});

function ctx() {
  return { waitUntil() {} };
}

test("worker blocks direct no-origin public API access before route handling", async () => {
  const res = await worker.fetch(
    new Request("https://api.example.test/api/community"),
    env,
    ctx(),
  );
  const body = await res.json();

  assert.equal(res.status, 403);
  assert.equal(body.code, "origin_required");
});

test("worker blocks main site origin from admin API routes", async () => {
  const res = await worker.fetch(
    new Request("https://api.example.test/api/auth/login", {
      method: "POST",
      headers: { origin: "https://day1design.co.kr" },
    }),
    env,
    ctx(),
  );
  const body = await res.json();

  assert.equal(res.status, 403);
  assert.equal(body.code, "admin_origin_required");
});

test("worker allows allowed main origin to reach the lightweight API status", async () => {
  const res = await worker.fetch(
    new Request("https://day1design-api.day1design-co.workers.dev/api", {
      headers: { origin: "https://day1design.co.kr" },
    }),
    env,
    ctx(),
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true });
});

test("worker accepts admin password login from the admin origin", async () => {
  const res = await worker.fetch(
    new Request("https://api.example.test/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://admin.day1design.co.kr",
        "content-type": "application/json",
      },
      body: JSON.stringify({ username: "admin", password: "secret-pass" }),
    }),
    env,
    ctx(),
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.loggedIn, true);
  assert.match(res.headers.get("set-cookie") || "", /day1_admin=/);
});

test("worker rejects incorrect admin password login", async () => {
  const res = await worker.fetch(
    new Request("https://api.example.test/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://admin.day1design.co.kr",
        "content-type": "application/json",
      },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    }),
    env,
    ctx(),
  );
  const body = await res.json();

  assert.equal(res.status, 401);
  assert.equal(body.error, "Invalid credentials");
  assert.equal(res.headers.get("set-cookie"), null);
});

test("worker keeps OTP auth endpoints closed", async () => {
  const res = await worker.fetch(
    new Request("https://api.example.test/api/auth/request", {
      method: "POST",
      headers: {
        origin: "https://admin.day1design.co.kr",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }),
    env,
    ctx(),
  );
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.equal(body.error, "Not Found");
});

test("worker serves the public site from Cloudflare assets on the main host", async () => {
  const res = await worker.fetch(
    new Request("https://day1design.co.kr/"),
    env,
    ctx(),
  );

  assert.equal(res.status, 200);
  assert.match(await res.text(), /DAYONE/);
});

test("worker serves admin login from Cloudflare assets on the admin host", async () => {
  const res = await worker.fetch(
    new Request("https://admin.day1design.co.kr/"),
    env,
    ctx(),
  );

  assert.equal(res.status, 200);
  assert.match(await res.text(), /ADMIN/);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("worker does not expose API routes on the public site host", async () => {
  const res = await worker.fetch(
    new Request("https://day1design.co.kr/api/community", {
      headers: { origin: "https://day1design.co.kr" },
    }),
    env,
    ctx(),
  );
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.equal(body.error, "Not Found");
});
