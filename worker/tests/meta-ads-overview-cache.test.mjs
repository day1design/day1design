// Meta 개요 캐시 가드
//
// 2026-11-21 아침 보고가 11/20 지출을 $250.63 대신 $17.2 로 보냈다. 11/20 04:00 동기화 직후
// 「오늘」로 미리 계산된 개요(그날 새벽분만 담김)가 24시간 캐시에 남아 다음 날 「어제」 요청에
// 그대로 나갔기 때문이다. 캐시 키에 마지막 동기화 완료 시각이 들어가서, 동기화가 끝나면
// 이전 계산을 쓰지 않아야 한다.

import assert from "node:assert/strict";
import test from "node:test";

import { briefOverview } from "../src/routes/meta-ads.js";

function memoryCache() {
  const store = new Map();
  return {
    async match(key) {
      const body = store.get(String(key));
      return body === undefined ? undefined : new Response(body);
    },
    async put(key, res) {
      store.set(String(key), await res.text());
    },
  };
}

// 계정 합계와 마지막 동기화 시각만 값을 돌려주고 나머지 조회는 빈 결과로 둔다
function dbStub(state) {
  const stmt = (sql) => ({
    bind() {
      return this;
    },
    async first() {
      if (/FROM MetaSyncLog/.test(sql)) return { CompletedAt: state.syncedAt };
      if (/SUM\(Spend\)/.test(sql) && /Level = 'account'/.test(sql)) {
        return { Spend: state.spend, Impressions: 100, Clicks: 1, Days: 1 };
      }
      return null;
    },
    async all() {
      return { results: [] };
    },
    async run() {
      return { success: true };
    },
  });
  return { prepare: stmt, batch: async (list) => list.map(() => ({ results: [] })) };
}

const ctx = { waitUntil() {} };
const req = () =>
  new Request(
    "https://api.example.test/api/meta-ads/overview?range=custom&start=2026-11-20&end=2026-11-20",
  );
const spendOf = async (res) => {
  const j = await res.json();
  const s = j.summary?.summary ?? j.summary;
  return Number(s?.spend);
};

test("동기화가 새로 끝나면 이전 동기화 때 계산한 개요를 쓰지 않는다", async () => {
  const original = globalThis.caches;
  globalThis.caches = { default: memoryCache() };
  try {
    const state = { syncedAt: "2026-11-19T19:01:20.000Z", spend: 17.2 };
    const env = { DB: dbStub(state) };

    assert.equal(await spendOf(await briefOverview(req(), env, ctx)), 17.2);

    // 같은 동기화 안에서는 캐시를 그대로 쓴다(30분 신선 구간)
    state.spend = 250.63;
    assert.equal(await spendOf(await briefOverview(req(), env, ctx)), 17.2);

    // 다음 날 04:00 동기화가 끝나면 새로 계산한다
    state.syncedAt = "2026-11-20T19:01:19.716Z";
    assert.equal(await spendOf(await briefOverview(req(), env, ctx)), 250.63);
  } finally {
    globalThis.caches = original;
  }
});
