import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// [가드] 백필은 기간을 잘라서 받아야 한다.
// 전 기간을 한 번에 요청하면 응답이 수십 페이지가 되어 Cloudflare subrequest
// 한도에 걸리고, 한 번 실패하면 통째로 날아간다. 남은 구간은 다음 cron 이
// 이어받아 스스로 끝까지 채운다.
const SRC = new URL("../src/routes/meta-ads.js", import.meta.url);

test("[가드] insights 조회가 페이지를 끝까지 따라간다", async () => {
  const src = await readFile(SRC, "utf8");
  const start = src.indexOf("async function fetchInsights");
  assert.ok(start > 0, "fetchInsights 를 찾지 못했다");
  const body = src.slice(start, start + 1400);
  // limit=500 은 한 페이지 크기일 뿐이라 paging.next 를 따라가지 않으면
  // ad 레벨(일수 × 광고 수)이 첫 500 행에서 잘린다.
  assert.match(body, /paging\?\.next/, "paging.next 를 따라가지 않는다");
  assert.match(body, /MAX_PAGES/, "페이지 상한이 없다");
});

test("[가드] breakdown 조회도 페이지를 따라간다", async () => {
  const src = await readFile(SRC, "utf8");
  const start = src.indexOf("async function fetchBreakdown");
  assert.ok(start > 0, "fetchBreakdown 을 찾지 못했다");
  const body = src.slice(start, start + 1400);
  assert.match(body, /paging\?\.next/);
});

test("[가드] 백필은 한 번에 한 구간만 받는다", async () => {
  const src = await readFile(SRC, "utf8");
  // 구간을 만드는 함수와 이어받기 진입점이 살아 있어야 한다.
  assert.match(src, /function buildBackfillChunks/);
  assert.match(src, /export async function runBackfillChunk/);
  // 이미 성공한 구간은 건너뛴다(멱등) — MetaSyncLog 를 기준으로 삼는다.
  const start = src.indexOf("export async function runBackfillChunk");
  const body = src.slice(start, start + 1600);
  assert.match(body, /SyncType = \? AND Status = 'success'/);
  assert.match(body, /pending\[0\]/, "한 번에 한 구간만 처리해야 한다");
});

test("[가드] 기간을 안 주면 백필 API 도 구간 단위로 돈다", async () => {
  const src = await readFile(SRC, "utf8");
  const start = src.indexOf("async function runBackfill(");
  assert.ok(start > 0, "runBackfill 을 찾지 못했다");
  const body = src.slice(start, start + 900);
  assert.match(body, /!body\.startDate && !body\.endDate/);
  assert.match(body, /runBackfillChunk/);
});
