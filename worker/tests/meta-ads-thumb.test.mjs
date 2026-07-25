// 광고 썸네일 가드
//
// Meta 의 thumbnail_url 은 서명 URL(oe=만료, 발급 ~7일)이라 D1 에 박아두면
// 일주일 뒤 어드민 미리보기가 전부 깨진다. 실측(2026-07-25): 2026-03~07 행
// 전부 만료, 최신 1일치만 유효했다. 그래서 R2 에 복사해 고정한다.
//
// ⚠ 이미지 프록시(/thumb/{id} 로 바이트 서빙)로 되돌리지 말 것.
// <img> 는 Authorization 헤더를 못 보내는데 어드민 인증은 localStorage 토큰
// 경로에 의존한다 → 이미지 요청만 401 로 떨어져 아무것도 안 보인다.
// URL 은 인증되는 fetch 로 받고, 이미지는 R2 공개 버킷에서 읽는 구조를 유지한다.

import assert from "node:assert/strict";
import test from "node:test";

import { handleMetaAds } from "../src/routes/meta-ads.js";
import { sign as signJwt } from "../src/lib/jwt.js";

const JWT_SECRET = "test-secret";
const R2_PUBLIC_BASE = "https://pub-test.r2.dev";
const CID = "1354604863175101";

async function adminCookie() {
  const jwt = await signJwt({ sub: "admin" }, JWT_SECRET, 3600);
  return `day1_admin=${encodeURIComponent(jwt)}`;
}

function req(qs, cookie) {
  return new Request(`https://api.example.test/api/meta-ads/thumbs${qs}`, {
    method: "GET",
    headers: cookie ? { cookie } : {},
  });
}

const ctx = {
  waitUntil(p) {
    return p;
  },
};

function r2Stub(existingKeys = []) {
  const have = new Set(existingKeys);
  const puts = [];
  return {
    puts,
    have,
    bucket: {
      async head(key) {
        return have.has(key) ? { key } : null;
      },
      async put(key, body, opts) {
        have.add(key);
        puts.push({ key, body, opts });
      },
    },
  };
}

function envWith(r2) {
  return {
    JWT_SECRET,
    IMAGES: r2.bucket,
    R2_PUBLIC_BASE,
    META_AD_ACCESS_TOKEN: "tok",
  };
}

test("이미 R2 에 있으면 외부 호출 없이 공개 URL 만 돌려준다", async () => {
  const r2 = r2Stub([`meta-ads/thumbs/${CID}`]);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("R2 히트인데 외부 호출이 일어나면 안 된다");
  };
  try {
    const res = await handleMetaAds(
      req(`?ids=${CID}`, await adminCookie()),
      envWith(r2),
      ctx,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.urls[CID], `${R2_PUBLIC_BASE}/meta-ads/thumbs/${CID}`);
    assert.equal(r2.puts.length, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("없으면 Graph 로 현재 URL 을 받아 R2 에 복사하고 공개 URL 을 준다", async () => {
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
      req(`?ids=${CID}`, await adminCookie()),
      envWith(r2),
      ctx,
    );
    const body = await res.json();
    assert.equal(body.urls[CID], `${R2_PUBLIC_BASE}/meta-ads/thumbs/${CID}`);
    assert.equal(calls.length, 2); // graph + 원본 이미지
    assert.equal(r2.puts.length, 1);
    assert.equal(r2.puts[0].key, `meta-ads/thumbs/${CID}`);
    assert.equal(r2.puts[0].opts.httpMetadata.contentType, "image/jpeg");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("이미지가 아닌 content-type 은 image/jpeg 로 정규화해 보관한다", async () => {
  const r2 = r2Stub();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes("graph.facebook.com")
      ? new Response(
          JSON.stringify({ image_url: "https://scontent.xx.fbcdn.net/x.jpg" }),
          { headers: { "content-type": "application/json" } },
        )
      : new Response("<script>alert(1)</script>", {
          headers: { "content-type": "text/html" },
        });
  try {
    await handleMetaAds(req(`?ids=${CID}`, await adminCookie()), envWith(r2), ctx);
    assert.equal(r2.puts[0].opts.httpMetadata.contentType, "image/jpeg");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Graph 가 URL 을 못 주면 null — 어드민은 폴백 아이콘을 유지한다", async () => {
  const r2 = r2Stub();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "gone" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  try {
    const res = await handleMetaAds(
      req(`?ids=${CID}`, await adminCookie()),
      envWith(r2),
      ctx,
    );
    const body = await res.json();
    assert.equal(body.urls[CID], null);
    assert.equal(r2.puts.length, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("[guard] 한 번에 받아오는 미스는 15건까지 — subrequest 50 한도 보호", async () => {
  const r2 = r2Stub();
  let imageFetches = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("graph.facebook.com")) {
      return new Response(
        JSON.stringify({ thumbnail_url: "https://scontent.xx.fbcdn.net/a.jpg" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    imageFetches += 1;
    return new Response(new Uint8Array([1]), {
      headers: { "content-type": "image/jpeg" },
    });
  };
  try {
    const ids = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const res = await handleMetaAds(
      req(`?ids=${ids.join(",")}`, await adminCookie()),
      envWith(r2),
      ctx,
    );
    const body = await res.json();
    assert.equal(imageFetches, 15, "미스 처리는 15건으로 끊어야 한다");
    assert.equal(r2.puts.length, 15);
    // 나머지는 null 로 돌려주고 다음 호출에서 채운다
    assert.equal(Object.values(body.urls).filter((v) => v === null).length, 15);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("잘못된 형식의 id 는 무시한다 (경로 주입 차단)", async () => {
  const r2 = r2Stub();
  const res = await handleMetaAds(
    req(`?ids=${encodeURIComponent("../secret,ok_1,a/b")}`, await adminCookie()),
    envWith(r2),
    ctx,
  );
  const body = await res.json();
  assert.deepEqual(Object.keys(body.urls), ["ok_1"]);
});

test("인증 없으면 401", async () => {
  const res = await handleMetaAds(req(`?ids=${CID}`), envWith(r2Stub()), ctx);
  assert.equal(res.status, 401);
});
