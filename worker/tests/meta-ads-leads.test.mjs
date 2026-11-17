import assert from "node:assert/strict";
import test from "node:test";

import {
  mapInsight,
  completeAccountInsightDays,
  fetchInsights,
} from "../src/routes/meta-ads.js";

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

test("Meta lead total wins over the form-only alias", () => {
  // 2026-11-13 계정 행 원문: 양식 1건 + 랜딩 픽셀 4건 = lead 5건. 양식 이름만 집으면 1건이 된다.
  const mapped = mapInsight({
    actions: [
      { action_type: "offsite_complete_registration_add_meta_leads", value: "1" },
      { action_type: "offsite_search_add_meta_leads", value: "1" },
      { action_type: "onsite_web_lead", value: "4" },
      { action_type: "lead", value: "5" },
      { action_type: "offsite_content_view_add_meta_leads", value: "2" },
      { action_type: "onsite_conversion.lead_grouped", value: "1" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "4" },
    ],
  });
  assert.equal(mapped.Leads, 5);
});

test("Meta lead falls back to the form alias only without a lead total", () => {
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

 test("successful account insights preserve delivery and fill only omitted days", () => {
   const delivered={date_start:"2026-03-02",spend:"9.50",impressions:"340",actions:[{action_type:"lead",value:"1"}]};
   const rows=completeAccountInsightDays([delivered],"2026-03-01","2026-03-02");
   assert.equal(rows.length,2); assert.equal(mapInsight(rows[0]).Spend,0); assert.equal(mapInsight(rows[0]).Leads,0);
   assert.equal(rows[1],delivered); assert.equal(mapInsight(rows[1]).Spend,9.5);
 });
test("zero delivery filling requires a successful rows array and bounded date range", () => {
   assert.throws(()=>completeAccountInsightDays(null,"2026-03-01","2026-03-02"));
   assert.throws(()=>completeAccountInsightDays([],"2026-03-02","2026-03-01"));
   assert.throws(()=>completeAccountInsightDays([],"2020-01-01","2026-03-01"));
 });

test("insights rejects a successful response without a data array", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ paging: {} }), { status: 200 });
  try {
    await assert.rejects(
      fetchInsights("token", "account", "2026-03-01", "2026-03-01", "account"),
      error => error?.code === "meta_insights_invalid_response",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("insights rejects a pagination cursor that remains after the page cap", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ data: [], paging: { next: `https://graph.facebook.com/page/${calls + 1}` } }),
      { status: 200 },
    );
  };
  try {
    await assert.rejects(
      fetchInsights("token", "account", "2026-03-01", "2026-03-01", "account"),
      error => error?.code === "meta_insights_pagination_cap",
    );
    assert.equal(calls, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
