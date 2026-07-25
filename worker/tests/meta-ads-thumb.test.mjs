// 광고 썸네일 프록시 가드
//
// Meta 의 thumbnail_url 은 서명 URL(oe=만료, 발급 ~7일)이라 D1 에 박아두면
// 일주일 뒤 어드민 미리보기가 전부 깨진다. 실측(2026-07-25): 2026-03~07 행
// 전부 만료, 최신 1일치만 유효했다. 그래서 R2 에 복사해 고정하고 어드민은
// /api/meta-ads/thumb/{creativeId} 로만 읽는다.
//
// ⚠ 어드민이 D1 의 fbcdn URL 을 직접 <img src> 로 쓰도록 되돌리지 말 것.

import assert from "node:assert/strict";
import test from "node:test";

import { handleMetaAds } from "../src/routes/meta-ads.js";
import { sign as signJwt } from "../src/lib/jwt.js";

const JWT_SECRET = "test-secret";
const CREATIVE_ID = "1234567890";

async function adminCookie() {
  const jwt = await signJwt({ sub: "admin" }, JWT_SECRET, 3600);
  return `day1_admin=${encodeURIComponent(jwt)}`;
}

function req(path, cookie) {
  return new Request(`https://api.example.test/api/meta-ads${path}`, {
    method: "GET",
    headers: cookie ? { cookie } : {},
  });
}

const ctx = { waitUntil(p) { return p; } };

function r2Stub({ stored = null } = {}) {
  const puts = [];
  return {
    puts,
    bucket: {
      async get(key) {
        if (!stored || stored.key !== key) return null;
        return {
          body: stored.body,
          httpMetadata: { contentType: stored.contentType },
        };
      },
      async put(key, body, opts) {
        puts.push({ key, body, opts });
      },
    },
  };
}

test("R2 에 있으면 Graph 호출 없이 R2 에서 바로 서빙한다", async () => {
  const r2 = r2Stub({
    stored: {
      key: `meta-ads/thumbs/${CREATIVE_ID}`,
      body: "cached-bytes",
      contentType: "image/jpeg",
    },
  });
  let graphCalled = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    graphCalled = true;
    throw new Error("R2 히트인데 외부 호출이 일어나면 안 된다");
  };
  try {
    const res = await handleMetaAds(
      req(`/thumb/${CREATIVE_ID}`, await adminCookie()),
      { JWT_SECRET, IMAGES: r2.bucket, META_AD_ACCESS_TOKEN: "tok" },
      ctx,
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
    assert.match(res.headers.get("cache-control") || "", /max-age=\d+/);
    assert.equal(graphCalled, false);
    assert.equal(r2.puts.length, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("캐시 미스면 Graph 로 새 URL 을 받아 R2 에 보관한 뒤 서빙한다", async () => {
  const r2 = r2Stub();
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("graph.facebook.com")) {
      return new Response(
        JSON.stringify({
          thumbnail_url: "https://scontent.xx.fbcdn.net/v/fresh.jpg?oe=1",
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/jpeg" },
    });
  };
  try {
    const res = await handleMetaAds(
      req(`/thumb/${CREATIVE_ID}`, await adminCookie()),
      { JWT_SECRET, IMAGES: r2.bucket, META_AD_ACCESS_TOKEN: "tok" },
      ctx,
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
    assert.equal(calls.length, 2); // graph 조회 + 원본 이미지
    assert.match(calls[0], /graph\.facebook\.com/);
    assert.equal(r2.puts.length, 1);
    assert.equal(r2.puts[0].key, `meta-ads/thumbs/${CREATIVE_ID}`);
    assert.equal(r2.puts[0].opts.httpMetadata.contentType, "image/jpeg");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("이미지가 아닌 content-type 은 그대로 서빙하지 않는다", async () => {
  const r2 = r2Stub();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("graph.facebook.com")) {
      return new Response(
        JSON.stringify({ image_url: "https://scontent.xx.fbcdn.net/x.jpg" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response("<script>alert(1)</script>", {
      headers: { "content-type": "text/html" },
    });
  };
  try {
    const res = await handleMetaAds(
      req(`/thumb/${CREATIVE_ID}`, await adminCookie()),
      { JWT_SECRET, IMAGES: r2.bucket, META_AD_ACCESS_TOKEN: "tok" },
      ctx,
    );
    assert.equal(res.headers.get("content-type"), "image/jpeg");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Graph 가 URL 을 못 주면 404 (어드민은 폴백 아이콘으로 대체)", async () => {
  const r2 = r2Stub();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "gone" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  try {
    const res = await handleMetaAds(
      req(`/thumb/${CREATIVE_ID}`, await adminCookie()),
      { JWT_SECRET, IMAGES: r2.bucket, META_AD_ACCESS_TOKEN: "tok" },
      ctx,
    );
    assert.equal(res.status, 404);
    assert.equal(r2.puts.length, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("인증 없으면 401 — 썸네일도 관리자 전용이다", async () => {
  const res = await handleMetaAds(
    req(`/thumb/${CREATIVE_ID}`),
    { JWT_SECRET, IMAGES: r2Stub().bucket, META_AD_ACCESS_TOKEN: "tok" },
    ctx,
  );
  assert.equal(res.status, 401);
});

test("creativeId 형식이 어긋나면 라우트가 잡지 않는다 (경로 주입 차단)", async () => {
  const cookie = await adminCookie();
  for (const bad of ["/thumb/../secret", "/thumb/a%2Fb", "/thumb/"]) {
    const res = await handleMetaAds(
      new Request(`https://api.example.test/api/meta-ads${bad}`, {
        method: "GET",
        headers: { cookie },
      }),
      { JWT_SECRET, IMAGES: r2Stub().bucket, META_AD_ACCESS_TOKEN: "tok" },
      ctx,
    );
    assert.equal(res.status, 404, `${bad} 는 404 여야 한다`);
  }
});
