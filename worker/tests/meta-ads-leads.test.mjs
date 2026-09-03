import assert from "node:assert/strict";
import test from "node:test";

import { mapInsight } from "../src/routes/meta-ads.js";

test("Meta lead aliases are counted once", () => {
  const mapped = mapInsight({
    spend: "90",
    actions: [
      { action_type: "lead", value: "3" },
      {
        action_type: "offsite_complete_registration_add_meta_leads",
        value: "3",
      },
    ],
  });

  assert.equal(mapped.Leads, 3);
  assert.equal(mapped.Spend / mapped.Leads, 30);
});

test("Meta lead uses generic alias only as fallback", () => {
  assert.equal(
    mapInsight({ actions: [{ action_type: "lead", value: "4" }] }).Leads,
    4,
  );
  assert.equal(
    mapInsight({
      actions: [
        {
          action_type: "offsite_complete_registration_add_meta_leads",
          value: "5",
        },
      ],
    }).Leads,
    5,
  );
});

test("Meta lead treats invalid values as zero", () => {
  assert.equal(
    mapInsight({ actions: [{ action_type: "lead", value: null }] }).Leads,
    0,
  );
  assert.equal(
    mapInsight({ actions: [{ action_type: "lead", value: "not-a-number" }] })
      .Leads,
    0,
  );
});
