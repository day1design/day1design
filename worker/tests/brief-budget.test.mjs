// 마케팅 브리프의 접수 금액별 집계와 일자별 접수 날짜 가드(2026-11-04).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeBudgets } from "../src/routes/brief.js";

const band = (r, key) => r.bands.find((b) => b.key === key);

test("금액별 집계는 관리자 KPI 구간을 쓰고 고객카드 직접 입력 금액이 먼저다", () => {
  const r = summarizeBudgets([
    { Source: "meta", Detail: "가용 예산: 1억~1억5천" },
    { Source: "homepage", Detail: "가용 예산: 7천만원~1억" },
    { Source: "meta", Detail: "가용 예산: 7천만원~1억", EstimateAmount: 200000000 },
    { Source: "meta", Status: "작성중", Detail: "" },
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.truncated, false);
  assert.equal(band(r, "b5").n, 1);
  assert.equal(band(r, "b5").meta, 1);
  assert.equal(band(r, "b6").n, 1, "직접 입력 2억이 고객 문구(7천~1억)보다 먼저");
  assert.equal(band(r, "b4").n, 1);
  assert.equal(band(r, "b4").meta, 0);
  assert.equal(band(r, "none").n, 1, "작성 중 접수는 미기재");
  assert.equal(r.highBudget.n, 2);
  assert.equal(r.highBudget.shareOfClassified, 0.667);
  assert.equal(r.bands.reduce((a, b) => a + b.n, 0), r.total, "모든 접수가 한 칸에 들어간다");
});

test("빈 기간은 0건이고 비율은 null", () => {
  const r = summarizeBudgets([]);
  assert.equal(r.total, 0);
  assert.equal(r.highBudget.n, 0);
  assert.equal(r.highBudget.shareOfClassified, null);
});

test("상한을 넘으면 잘랐다고 알린다", () => {
  const rows = Array.from({ length: 2001 }, () => ({ Source: "meta", Detail: "가용 예산: 2억 이상" }));
  const r = summarizeBudgets(rows);
  assert.equal(r.truncated, true);
  assert.equal(r.total, 2000);
});

test("일자별 접수는 Meta created_time(+0000) 형식도 날짜로 읽는다", () => {
  // datetime('2026-10-29T10:12:33+0000') 은 SQLite 에서 NULL 이라 그 리드가 일자별에서 빠졌다
  const src = readFileSync(new URL("../src/routes/brief.js", import.meta.url), "utf8");
  assert.match(src, /datetime\(substr\(SubmittedAt, 1, 19\), '\+9 hours'\)/);
  assert.doesNotMatch(src, /datetime\(SubmittedAt, '\+9 hours'\)/);
});
