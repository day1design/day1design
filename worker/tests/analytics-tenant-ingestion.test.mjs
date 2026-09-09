import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdStmt,
  buildBreakdownStmt,
  buildDailyStmt,
} from "../src/routes/meta-ads.js";

function capture() {
  const calls = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...values) {
              calls.push({ sql, values });
              return { sql, values };
            },
          };
        },
      },
    },
  };
}

test("Meta ingestion builders bind the server tenant and match placeholders", () => {
  const fields = {
    Date: "2026-09-09",
    Level: "account",
    EntityId: "account-1",
    AdId: "ad-1",
    Dimension: "platform",
    DimensionValue: "facebook",
    DimensionSub: "",
    CrmTenantId: "other",
  };
  for (const builder of [buildDailyStmt, buildAdStmt, buildBreakdownStmt]) {
    const stub = capture();
    builder(stub.env, fields);
    assert.equal(stub.calls.length, 1);
    const { sql, values } = stub.calls[0];
    assert.match(sql, /CrmTenantId/);
    assert.equal(values[1], "day1design");
    assert.equal((sql.match(/\?/g) || []).length, values.length);
  }
});
