import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";

import { handlePortfolio } from "../src/routes/portfolio.js";
import { sign as signJwt } from "../src/lib/jwt.js";

let previousCaches;
const JWT_SECRET = "test-secret";

beforeEach(() => {
  previousCaches = globalThis.caches;
  globalThis.caches = {
    default: {
      async match() {
        return null;
      },
      async put() {},
      async delete() {
        return true;
      },
    },
  };
});

afterEach(() => {
  globalThis.caches = previousCaches;
});

function createCtx() {
  const tasks = [];
  return {
    tasks,
    waitUntil(task) {
      tasks.push(Promise.resolve(task));
    },
  };
}

async function adminCookie() {
  const jwt = await signJwt({ sub: "admin" }, JWT_SECRET, 3600);
  return `day1_admin=${encodeURIComponent(jwt)}`;
}

test("portfolio GET reads records through injected D1 repository", async () => {
  const services = {
    portfolio: {
      // 목록은 페이지 단위로 읽는다(limit + 1 로 다음 페이지 유무 판단).
      async list() {
        return {
          records: [
            {
              id: "recPortfolio001",
              fields: {
                Name: "Sample House",
                Folder: "sample-house",
                Count: 2,
                Category: "HOUSE",
                Order: 1,
                Images: JSON.stringify(["https://assets.example.test/a.webp"]),
              },
            },
          ],
        };
      },
    },
    media: {
      async deleteMany() {
        throw new Error("deleteMany should not run on GET");
      },
    },
  };

  const res = await handlePortfolio(
    new Request("https://api.example.test/api/portfolio"),
    {},
    createCtx(),
    services,
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.records.length, 1);
  assert.equal(body.records[0].folder, "sample-house");
  assert.deepEqual(body.records[0].images, ["https://assets.example.test/a.webp"]);
});

test("portfolio DELETE removes D1 record and orphaned R2 URLs through injected services", async () => {
  const deleted = [];
  const mediaDeleted = [];
  const services = {
    portfolio: {
      async get(id) {
        assert.equal(id, "recDeleteMe");
        return {
          id,
          fields: {
            Name: "Delete Me",
            Folder: "delete-me",
            Count: 1,
            Category: "HOUSE",
            Order: 1,
            ThumbAfter: "https://assets.example.test/thumb-after.webp",
            ThumbBefore: "https://assets.example.test/thumb-before.webp",
            Images: JSON.stringify(["https://assets.example.test/image.webp"]),
          },
        };
      },
      async delete(id) {
        deleted.push(id);
      },
    },
    media: {
      async deleteMany(urls) {
        mediaDeleted.push(...urls);
      },
    },
  };
  const ctx = createCtx();

  const res = await handlePortfolio(
    new Request("https://api.example.test/api/portfolio/recDeleteMe", {
      method: "DELETE",
      headers: { cookie: await adminCookie() },
    }),
    { JWT_SECRET },
    ctx,
    services,
  );
  await Promise.all(ctx.tasks);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(deleted, ["recDeleteMe"]);
  assert.equal(body.cleaned, 3);
  assert.deepEqual(mediaDeleted.sort(), [
    "https://assets.example.test/image.webp",
    "https://assets.example.test/thumb-after.webp",
    "https://assets.example.test/thumb-before.webp",
  ].sort());
});
