import assert from "node:assert/strict";
import { test } from "node:test";
import { routeWorkflow } from "../src/routes/workflow-router.js";

const origins = [
  "https://day1design.co.kr",
  "https://www.day1design.co.kr",
  "https://admin.day1design.co.kr",
];

function request(path, { origin, method = "POST", body = "{}" } = {}) {
  const headers = { "content-type": "application/json" };
  if (origin !== undefined) headers.origin = origin;
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") init.body = body;
  return new Request(`https://api.day1design.co.kr${path}`, init);
}

test("workflow router rejects missing and unapproved origins before auth", async () => {
  assert.equal((await routeWorkflow(request("/api/workflow/save"), {})).status, 403);
  assert.equal((await routeWorkflow(request("/api/workflow/save", { origin: "https://evil.example" }), {})).status, 403);
});

test("workflow save requires admin authentication on every allowed origin", async () => {
  for (const origin of origins) {
    const response = await routeWorkflow(request("/api/workflow/save", { origin }), { JWT_SECRET: "fixture-secret" });
    assert.equal(response.status, 401, origin);
  }
});

test("workflow router enforces method and route boundaries", async () => {
  assert.equal((await routeWorkflow(request("/api/workflow/save", { origin: origins[0], method: "GET" }), {})).status, 405);
  assert.equal((await routeWorkflow(request("/api/workflow/unknown", { origin: origins[0] }), {})).status, 404);
});

test("workflow login body is bounded before auth handler or network work", async () => {
  const body = JSON.stringify({ username: "admin", password: "x".repeat(4100) });
  const response = await routeWorkflow(request("/api/workflow/login", { origin: origins[0], body }), {});
  assert.equal(response.status, 413);
});
