import assert from "node:assert/strict";
import test from "node:test";

import { createServices } from "../src/lib/services.js";

test("createServices exposes D1 repositories and R2 media store", () => {
  const services = createServices({
    DB: {},
    IMAGES: {
      put() {},
      delete() {},
    },
    R2_PUBLIC_BASE: "https://assets.example.test",
  });

  for (const name of [
    "estimates",
    "estimateMemos",
    "heroSlides",
    "portfolio",
    "community",
    "analyticsSnapshots",
  ]) {
    assert.equal(typeof services[name].listAll, "function");
    assert.equal(typeof services[name].create, "function");
    assert.equal(typeof services[name].update, "function");
    assert.equal(typeof services[name].delete, "function");
  }

  assert.equal(typeof services.media.upload, "function");
  assert.equal(typeof services.media.deleteMany, "function");
  assert.equal(typeof services.analyticsRaw.putJson, "function");
});

test("analytics raw store persists JSON to R2 without exposing a public URL", async () => {
  const puts = [];
  const services = createServices({
    DB: {},
    IMAGES: {
      async put(key, body, opts) {
        puts.push({ key, body, opts });
      },
      async delete() {},
    },
  });

  const key = await services.analyticsRaw.putJson("analytics/demo.json", {
    ok: true,
  });

  assert.equal(key, "analytics/demo.json");
  assert.deepEqual(puts, [
    {
      key: "analytics/demo.json",
      body: JSON.stringify({ ok: true }),
      opts: {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      },
    },
  ]);
});

test("media store uploads to R2 and returns public URL", async () => {
  const puts = [];
  const services = createServices({
    DB: {},
    IMAGES: {
      async put(key, body, opts) {
        puts.push({ key, body, opts });
      },
      async delete() {},
    },
    R2_PUBLIC_BASE: "https://assets.example.test/root/",
  });

  const url = await services.media.upload("images/demo.webp", "body", {
    contentType: "image/webp",
  });

  assert.equal(url, "https://assets.example.test/root/images/demo.webp");
  assert.deepEqual(puts, [
    {
      key: "images/demo.webp",
      body: "body",
      opts: { httpMetadata: { contentType: "image/webp" } },
    },
  ]);
});
