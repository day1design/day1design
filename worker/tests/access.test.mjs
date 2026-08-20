import assert from "node:assert/strict";
import test from "node:test";

import { authorizeRequest, classifyAccess } from "../src/lib/access.js";

const env = {
  ALLOWED_ORIGINS:
    "https://day1design.co.kr,https://www.day1design.co.kr,https://admin.day1design.co.kr,http://localhost:3000",
  MAIN_ORIGINS: "https://day1design.co.kr,https://www.day1design.co.kr",
  ADMIN_ORIGINS: "https://admin.day1design.co.kr",
};

test("classifies public and admin API routes by method", () => {
  assert.equal(
    classifyAccess(
      new Request("https://api.example.test/api/portfolio"),
    ).role,
    "main",
  );
  assert.equal(
    classifyAccess(
      new Request("https://api.example.test/api/portfolio", {
        method: "POST",
      }),
    ).role,
    "admin",
  );
  assert.equal(
    classifyAccess(
      new Request("https://api.example.test/api/meta-lead", {
        method: "POST",
      }),
    ).role,
    "integration",
  );
  assert.equal(
    classifyAccess(
      new Request("https://api.example.test/api/analytics/summary"),
    ).role,
    "admin",
  );
  assert.equal(
    classifyAccess(
      new Request("https://api.example.test/api/analytics/visit", {
        method: "POST",
      }),
    ).role,
    "main",
  );
});

test("blocks direct no-origin access to public API data", () => {
  const access = authorizeRequest(
    new Request("https://api.example.test/api/community"),
    env,
  );
  assert.equal(access.ok, false);
  assert.equal(access.code, "origin_required");
});

test("allows main origin to call public site API only", () => {
  const publicAccess = authorizeRequest(
    new Request("https://api.example.test/api/community", {
      headers: { origin: "https://day1design.co.kr" },
    }),
    env,
  );
  const adminAccess = authorizeRequest(
    new Request("https://api.example.test/api/auth/login", {
      method: "POST",
      headers: { origin: "https://day1design.co.kr" },
    }),
    env,
  );

  assert.equal(publicAccess.ok, true);
  assert.equal(adminAccess.ok, false);
  assert.equal(adminAccess.code, "admin_origin_required");

  const analyticsAccess = authorizeRequest(
    new Request("https://api.example.test/api/analytics/summary", {
      headers: { origin: "https://day1design.co.kr" },
    }),
    env,
  );
  assert.equal(analyticsAccess.ok, false);
  assert.equal(analyticsAccess.code, "admin_origin_required");

  const visitAccess = authorizeRequest(
    new Request("https://api.example.test/api/analytics/visit", {
      method: "POST",
      headers: { origin: "https://day1design.co.kr" },
    }),
    env,
  );
  assert.equal(visitAccess.ok, true);
});

test("allows admin origin to call admin and public API routes", () => {
  const adminAccess = authorizeRequest(
    new Request("https://api.example.test/api/auth/login", {
      method: "POST",
      headers: { origin: "https://admin.day1design.co.kr" },
    }),
    env,
  );
  const publicAccess = authorizeRequest(
    new Request("https://api.example.test/api/hero/slides", {
      headers: { origin: "https://admin.day1design.co.kr" },
    }),
    env,
  );

  assert.equal(adminAccess.ok, true);
  assert.equal(publicAccess.ok, true);
});

test("keeps server-to-server integration endpoint behind its route secret", () => {
  const access = authorizeRequest(
    new Request("https://api.example.test/api/meta-lead", { method: "POST" }),
    env,
  );
  assert.equal(access.ok, true);
  assert.equal(access.rule.role, "integration");
});

test("[guard] meta-lead 하위 서버-서버 경로는 Origin 없이 통과한다", () => {
  // 폴러는 Origin 헤더가 없다. 새 하위 경로를 access.js 예외에 등록하지 않으면
  // 핸들러에 닿기도 전에 403 origin_required 로 막혀 조용히 죽는다.
  // (실제 사고: /api/meta-lead/form-schema 최초 배포분이 이 이유로 전량 403)
  for (const path of [
    "/api/meta-lead",
    "/api/meta-lead/heartbeat",
    "/api/meta-lead/form-schema",
  ]) {
    const access = authorizeRequest(
      new Request(`https://api.example.test${path}`, { method: "POST" }),
      env,
    );
    assert.equal(access.ok, true, `${path} 가 origin 가드에서 막히면 안 된다`);
    assert.equal(access.rule.role, "integration", path);
  }
});
