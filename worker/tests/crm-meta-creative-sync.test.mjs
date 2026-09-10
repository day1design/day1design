import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdStmt,
  mirrorFetchedCreativeThumbs,
  normalizeCreativeCopy,
} from "../src/routes/meta-ads.js";

function r2Mock(initial = {}) {
  const objects = new Map(Object.entries(initial));
  const head = async (key) => {
    const value = objects.get(key);
    return value ? { size: value.bytes.byteLength, httpMetadata: value.httpMetadata } : null;
  };
  return {
    objects,
    head,
    get: async (key) => {
      const value = objects.get(key);
      return value ? { body: value.bytes } : null;
    },
    put: async (key, body, options) => {
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes, httpMetadata: options.httpMetadata });
    },
  };
}

test("asset feed copy keeps independent bounded variants without index zipping", () => {
  const copy = normalizeCreativeCopy({
    asset_feed_spec: {
      titles: [{ text: "Title A" }, { text: "Title B" }],
      bodies: [{ text: "Body A" }],
      call_to_action_types: ["LEARN_MORE"],
      link_urls: [{ website_url: "https://example.test/a" }, { website_url: "https://example.test/b" }],
    },
    object_story_spec: { link_data: { name: "Should not become a representative" } },
  });

  assert.equal(copy.title, "");
  assert.equal(copy.body, "");
  assert.equal(copy.variants.length, 6);
  assert.deepEqual(copy.variants[0], {
    type: "asset_feed_spec",
    provenance: "asset_feed_spec.titles[0]",
    title: "Title A",
  });
  assert.deepEqual(copy.variants[5], {
    type: "asset_feed_spec",
    provenance: "asset_feed_spec.link_urls[1]",
    linkUrl: "https://example.test/b",
  });
  for (const variant of copy.variants) assert.equal(Object.keys(variant).filter((key) => key === "title" || key === "body" || key === "callToAction" || key === "linkUrl").length, 1);
});

test("story copy remains the representative when no asset feed exists", () => {
  assert.deepEqual(normalizeCreativeCopy({
    object_story_spec: {
      link_data: {
        name: "Story title",
        message: "Story body",
        link: "https://example.test/story",
        call_to_action: { type: "CONTACT_US" },
      },
    },
  }), {
    title: "Story title",
    body: "Story body",
    callToAction: "CONTACT_US",
    linkUrl: "https://example.test/story",
    variants: [],
  });
});

test("empty fetched copy preserves the old row unless the creative changed", () => {
  let statement;
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            statement = { sql, values };
            return statement;
          },
        };
      },
    },
  };
  buildAdStmt(env, {
    Date: "2026-09-10",
    AdId: "ad-1",
    CreativeId: "creative-new",
    CreativeTitle: "",
    CreativeBody: "",
    CreativeCallToAction: "",
    CreativeLinkUrl: "",
    CreativeVariants: "",
  });
  assert.match(statement.sql, /excluded\.CreativeId<>MetaAdsAd\.CreativeId/);
  assert.match(statement.sql, /COALESCE\(NULLIF\(excluded\.CreativeVariants,''\),MetaAdsAd\.CreativeVariants\)/);
  assert.equal(statement.values.includes(""), true);
});

test("cron thumbnail mirror is private, bounded, allowlisted, and capped per run", async () => {
  const oldFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url, options) => {
    fetched.push({ url: String(url), options });
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/webp", "content-length": "3" },
    });
  };
  try {
    const cache = r2Mock({
      "meta-ads/thumbs/already": {
        bytes: new Uint8Array([1]),
        httpMetadata: { contentType: "image/jpeg" },
      },
    });
    const rows = Array.from({ length: 17 }, (_, index) => ({ ad_id: `ad-${index}` }));
    const meta = Object.fromEntries(rows.map((row, index) => [row.ad_id, {
      creative: {
        id: index === 0 ? "already" : `creative-${index}`,
        thumbnail_url: index === 16 ? "https://evil.test/nope" : `https://scontent.fbcdn.net/${index}.jpg`,
      },
    }]));
    const copied = await mirrorFetchedCreativeThumbs({ CRM_CACHE: cache }, rows, meta);

    assert.equal(copied, 15);
    assert.equal(fetched.length, 15);
    assert.ok(fetched.every(({ url, options }) => url.includes("fbcdn.net") && options.redirect === "error" && options.method === "GET"));
    assert.equal(cache.objects.get("meta-ads/thumbs/creative-1").httpMetadata.contentType, "image/webp");
    assert.equal(cache.objects.has("meta-ads/thumbs/creative-16"), false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
