import { test } from "node:test";
import assert from "node:assert/strict";
import { withPublicCache } from "../src/lib/public-cache.js";

const SITE = "https://day1design.co.kr";
const ADMIN = "https://admin.day1design.co.kr";

function req(path, { method = "GET", origin = SITE } = {}) {
  const headers = origin ? { origin } : {};
  return new Request(`https://api.test${path}`, { method, headers });
}
const ok = () => new Response("{}", { status: 200 });
const cacheOf = (res) => res.headers.get("cache-control");

test("공개 사이트의 공개 조회는 30초 캐시", () => {
  for (const path of [
    "/api/hero/slides",
    "/api/popups",
    "/api/portfolio",
    "/api/community",
    "/api/community/170198572",
  ]) {
    assert.equal(cacheOf(withPublicCache(ok(), req(path), path)), "public, max-age=30", path);
  }
  const www = req("/api/portfolio", { origin: "https://www.day1design.co.kr" });
  assert.equal(cacheOf(withPublicCache(ok(), www, "/api/portfolio")), "public, max-age=30");
});

test("관리자 화면·출처 없는 요청은 캐시하지 않는다(관리자 편집 화면이 항상 최신을 받아야 함)", () => {
  assert.equal(cacheOf(withPublicCache(ok(), req("/api/portfolio", { origin: ADMIN }), "/api/portfolio")), null);
  assert.equal(cacheOf(withPublicCache(ok(), req("/api/portfolio", { origin: null }), "/api/portfolio")), null);
});

test("관리자용 조회·쓰기·오류 응답은 캐시하지 않는다", () => {
  assert.equal(cacheOf(withPublicCache(ok(), req("/api/popups/all"), "/api/popups/all")), null);
  assert.equal(cacheOf(withPublicCache(ok(), req("/api/estimates"), "/api/estimates")), null);
  assert.equal(cacheOf(withPublicCache(ok(), req("/api/portfolio", { method: "POST" }), "/api/portfolio")), null);
  const notFound = new Response("{}", { status: 404 });
  assert.equal(cacheOf(withPublicCache(notFound, req("/api/community/x"), "/api/community/x")), null);
});

test("이미 cache-control 을 정한 응답은 덮어쓰지 않는다", () => {
  const res = new Response("{}", { status: 200, headers: { "cache-control": "no-store" } });
  assert.equal(cacheOf(withPublicCache(res, req("/api/hero/slides"), "/api/hero/slides")), "no-store");
});
