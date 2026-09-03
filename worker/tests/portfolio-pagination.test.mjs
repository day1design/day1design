import assert from "node:assert/strict";
import test from "node:test";

import { handlePortfolio } from "../src/routes/portfolio.js";

// caches.default 스텁 — 라우트가 엣지 캐시를 건드려도 테스트가 죽지 않게.
const store = new Map();
globalThis.caches = {
  default: {
    async match(key) {
      const k = key?.url || String(key);
      return store.has(k) ? new Response(store.get(k)) : undefined;
    },
    async put(key, res) {
      store.set(key?.url || String(key), await res.text());
    },
    async delete(key) {
      return store.delete(key?.url || String(key));
    },
  },
};

const createCtx = () => ({ waitUntil() {} });

function makeServices(total) {
  const all = Array.from({ length: total }, (_, i) => ({
    id: `rec${String(i).padStart(3, "0")}`,
    fields: {
      Name: `프로젝트 ${i}`,
      Folder: `p-${i}`,
      Count: 1,
      Category: "HOUSE",
      Order: i,
      Images: "[]",
    },
  }));
  const calls = [];
  return {
    calls,
    services: {
      portfolio: {
        async list(opts) {
          calls.push(opts);
          const offset = opts.offset || 0;
          return { records: all.slice(offset, offset + (opts.limit || 24)) };
        },
      },
      media: { async deleteMany() {} },
    },
  };
}

async function get(url, services) {
  const res = await handlePortfolio(
    new Request(url),
    {},
    createCtx(),
    services,
  );
  return res.json();
}

// [가드] 목록을 한 번에 전량 읽으면 캐시가 만료될 때마다 D1 읽기가 전체 건수만큼
// 튄다. 2026-09-03 에 D1 무료 플랜 하루 읽기 한도가 소진돼 포트폴리오가 500 을
// 냈다. 페이지 단위로 끊어 읽는 것을 못박는다.
test("[가드] 목록은 페이지 단위로만 읽는다", async () => {
  store.clear();
  const { services, calls } = makeServices(100);
  const body = await get("https://api.example.test/api/portfolio", services);

  assert.equal(body.ok, true);
  assert.equal(body.records.length, 24, "기본 페이지 크기는 24");
  assert.equal(body.page, 1);
  assert.equal(body.hasMore, true);
  // limit + 1 로 조회해야 COUNT 쿼리 없이 다음 페이지 유무를 안다.
  assert.equal(calls[0].limit, 25);
  assert.equal(calls[0].offset, 0);
});

test("페이지·개수 파라미터로 다음 구간을 받는다", async () => {
  store.clear();
  const { services, calls } = makeServices(100);
  const body = await get(
    "https://api.example.test/api/portfolio?page=3&limit=10",
    services,
  );

  assert.equal(body.records.length, 10);
  assert.equal(body.page, 3);
  assert.equal(body.limit, 10);
  assert.equal(calls[0].offset, 20, "3페이지는 20건을 건너뛴다");
  assert.equal(body.records[0].name, "프로젝트 20");
});

test("마지막 페이지는 hasMore 가 꺼진다", async () => {
  store.clear();
  const { services } = makeServices(30);
  const body = await get(
    "https://api.example.test/api/portfolio?page=2&limit=24",
    services,
  );

  assert.equal(body.records.length, 6);
  assert.equal(body.hasMore, false);
});

test("페이지 크기는 상한을 넘지 못한다", async () => {
  store.clear();
  const { services, calls } = makeServices(500);
  await get("https://api.example.test/api/portfolio?limit=999", services);
  assert.equal(calls[0].limit, 61, "상한 60 + 1");
});

// [가드] D1 이 못 받아 줘도 공개 화면은 옛 값으로 보여야 한다.
test("[가드] D1 이 실패하면 옛 캐시로 응답한다", async () => {
  store.clear();
  const { services } = makeServices(30);
  const first = await get("https://api.example.test/api/portfolio", services);
  assert.equal(first.records.length, 24);

  const broken = {
    portfolio: {
      async list() {
        throw new Error("D1_ERROR: daily row read limit");
      },
    },
    media: { async deleteMany() {} },
  };
  const second = await get("https://api.example.test/api/portfolio", broken);
  assert.equal(second.ok, true, "옛 값이라도 내보내야 한다");
  assert.equal(second.records.length, 24);
});
