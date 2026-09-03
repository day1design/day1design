import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// [가드] 상담 예약(ConsultAt·ConsultBranch)이 저장되려면 세 곳이 모두 열려 있어야
// 한다. 한 곳만 빠져도 화면에서는 저장한 것처럼 보이는데 값이 조용히 사라진다.
//   1) 마이그레이션이 컬럼을 만들고
//   2) d1.js SCHEMA 화이트리스트가 컬럼을 통과시키고 (빠지면 fieldsToRow 가 버린다)
//   3) PATCH 허용 목록이 요청 필드를 받는다
const FIELDS = [
  "ConsultAt",
  "ConsultBranch",
  "ConsultCancelledAt",
  "ContractAt",
  "ContractOwner",
  "ContractAmount",
];

test("[가드] 상담 예약·계약 컬럼을 만드는 마이그레이션이 있다", async () => {
  const sql = (
    await Promise.all([
      readFile(
        new URL("../migrations/0041_consult_booking.sql", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../migrations/0042_contract_fields.sql", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../migrations/0043_consult_cancel.sql", import.meta.url),
        "utf8",
      ),
    ])
  ).join("\n");
  for (const field of FIELDS) {
    assert.match(
      sql,
      new RegExp(`ADD COLUMN ${field}\\b`),
      `${field} 컬럼을 만드는 ALTER 가 없다`,
    );
  }
});

test("[가드] d1 SCHEMA 화이트리스트가 상담 예약·계약을 통과시킨다", async () => {
  const src = await readFile(
    new URL("../src/lib/d1.js", import.meta.url),
    "utf8",
  );
  const estimates = src.slice(
    src.indexOf("Estimates:"),
    src.indexOf("Estimates:") + 3000,
  );
  for (const field of FIELDS) {
    assert.ok(
      estimates.includes(`"${field}"`),
      `${field} 가 SCHEMA 에 없어 저장 시 버려진다`,
    );
  }
});

test("[가드] PATCH 가 상담 예약·계약 필드를 받는다", async () => {
  const src = await readFile(
    new URL("../src/routes/estimates.js", import.meta.url),
    "utf8",
  );
  const start = src.indexOf("async function patchEstimate");
  assert.ok(start > 0, "patchEstimate 를 찾지 못했다");
  const allowed = src.slice(start, start + 1600);
  for (const field of FIELDS) {
    assert.ok(
      allowed.includes(`"${field}"`),
      `${field} 가 PATCH 허용 목록에 없어 요청이 무시된다`,
    );
  }
});
