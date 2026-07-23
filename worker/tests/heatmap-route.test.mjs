import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, test } from "node:test";

import { handleHeatmap } from "../src/routes/heatmap.js";
import { buildAnalyticsRollupStatements } from "../src/lib/analytics-rollups.js";

let originalCaches;

beforeEach(() => {
  originalCaches = globalThis.caches;
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(key) {
        const cacheKey = key?.url || String(key);
        if (!store.has(cacheKey)) return null;
        return new Response(store.get(cacheKey));
      },
      async put(key, response) {
        const cacheKey = key?.url || String(key);
        store.set(cacheKey, await response.text());
      },
    },
  };
});

afterEach(() => {
  globalThis.caches = originalCaches;
});

test("page_view tracking stores raw events before durable analytics rollups", async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return { sql, args };
        },
      };
    },
    async batch(batch) {
      statements.push(...batch);
      return batch.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const request = new Request(
    "https://api.example.test/api/heatmap/track",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.50",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        events: [
          {
            type: "page_view",
            page: "/pages/about",
            device: "pc",
            session_id: "session-1",
            referrer: "https://www.google.com/search?q=dayone",
            utm: {
              source: "google",
              medium: "organic",
              campaign: "brand",
            },
          },
        ],
      }),
    },
  );
  Object.defineProperty(request, "cf", {
    value: {
      country: "KR",
      region: "Seoul",
      city: "Seoul",
    },
  });

  const response = await handleHeatmap(request, { DB: db }, {}, {});
  const body = await response.json();
  const sql = statements.map((statement) => statement.sql).join("\n");

  assert.equal(response.status, 200);
  assert.equal(body.accepted, 1);
  assert.equal(statements.length, 5);
  assert.match(sql, /INSERT INTO HeatmapEvents/);
  assert.match(sql, /INSERT OR IGNORE INTO AnalyticsEvents/);
  assert.match(sql, /INSERT INTO AnalyticsSessionDays/);
  assert.match(sql, /INSERT OR IGNORE INTO AnalyticsPageViews/);
  assert.match(sql, /INSERT INTO AnalyticsSessions/);
});

test("rollup failure does not fail or discard the raw tracking request", async () => {
  const batches = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return { sql, args };
        },
      };
    },
    async batch(batch) {
      batches.push(batch);
      if (batches.length === 2) throw new Error("rollup_unavailable");
      return batch.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const request = new Request(
    "https://api.example.test/api/heatmap/track",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.51",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        events: [
          {
            type: "page_view",
            page: "/",
            device: "mobile",
            session_id: "session-rollup-failure",
          },
        ],
      }),
    },
  );

  const response = await handleHeatmap(request, { DB: db }, {}, {});
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, 1);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 1);
  assert.match(batches[0][0].sql, /INSERT INTO HeatmapEvents/);
});

test("rollup writes stay bounded for a full 50-event tracking batch", () => {
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return { sql, args };
        },
      };
    },
  };
  const events = Array.from({ length: 50 }, (_, index) => ({
    id: `event-${index}`,
    type: "page_view",
    page: `/page-${index}`,
    device: "pc",
    sessionId: "session-1",
    country: "KR",
    region: "Seoul",
    city: "Seoul",
    referrer: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    createdAt: "2026-07-23T01:00:00.000Z",
    isBot: false,
  }));

  const statements = buildAnalyticsRollupStatements({ DB: db }, events);

  assert.equal(statements.length, 18);
  assert.equal(statements[0].args.length, 98);
  assert.equal(Math.max(...statements.map((statement) => statement.args.length)), 98);
  assert.equal(statements.at(-1).args.length, 1);
});

test("replaying the same event ids keeps analytics rollups unchanged", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const migrationSql = readFileSync(
      new URL("../migrations/0030_analytics_rollups.sql", import.meta.url),
      "utf8",
    );
    sqlite.exec(migrationSql);
    const statementFactory = {
      prepare(sql) {
        return {
          bind(...args) {
            return { sql, args };
          },
        };
      },
    };
    const events = [
      {
        id: "event-page-1",
        type: "page_view",
        page: "/",
        device: "pc",
        sessionId: "session-replay",
        country: "KR",
        region: "Seoul",
        city: "Seoul",
        referrer: "google.com",
        utmSource: "google",
        utmMedium: "organic",
        utmCampaign: "",
        createdAt: "2026-07-23T01:00:00.000Z",
        isBot: false,
      },
      {
        id: "event-click-1",
        type: "click",
        page: "/",
        device: "pc",
        sessionId: "session-replay",
        country: "KR",
        region: "Seoul",
        city: "Seoul",
        referrer: "google.com",
        utmSource: "google",
        utmMedium: "organic",
        utmCampaign: "",
        createdAt: "2026-07-23T01:00:10.000Z",
        isBot: false,
      },
      {
        id: "event-page-2",
        type: "page_view",
        page: "/pages/about",
        device: "pc",
        sessionId: "session-replay",
        country: "KR",
        region: "Seoul",
        city: "Seoul",
        referrer: "google.com",
        utmSource: "google",
        utmMedium: "organic",
        utmCampaign: "",
        createdAt: "2026-07-23T01:00:20.000Z",
        isBot: false,
      },
    ];

    const applyRollups = () => {
      const statements = buildAnalyticsRollupStatements(
        { DB: statementFactory },
        events,
      );
      for (const statement of statements) {
        sqlite.prepare(statement.sql).run(...statement.args);
      }
    };

    applyRollups();
    applyRollups();

    const facts = sqlite
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM AnalyticsEvents) AS Events,
           (SELECT COUNT(*) FROM AnalyticsPageViews) AS Pageviews`,
      )
      .get();
    const day = sqlite
      .prepare(
        `SELECT Pageviews, EventCount
         FROM AnalyticsSessionDays
         WHERE DayKey = ? AND SessionId = ?`,
      )
      .get("2026-07-23", "session-replay");
    const session = sqlite
      .prepare(
        `SELECT ActiveDayCount, TotalPageviews
         FROM AnalyticsSessions
         WHERE SessionId = ?`,
      )
      .get("session-replay");

    assert.deepEqual(
      { events: facts.Events, pageviews: facts.Pageviews },
      { events: 3, pageviews: 2 },
    );
    assert.deepEqual(
      { pageviews: day.Pageviews, events: day.EventCount },
      { pageviews: 2, events: 3 },
    );
    assert.deepEqual(
      {
        activeDays: session.ActiveDayCount,
        totalPageviews: session.TotalPageviews,
      },
      { activeDays: 1, totalPageviews: 2 },
    );
  } finally {
    sqlite.close();
  }
});

test("a full 50-event request stays below the D1 query limit", async () => {
  const batches = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return { sql, args };
        },
      };
    },
    async batch(batch) {
      batches.push(batch);
      return batch.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const events = Array.from({ length: 50 }, (_, index) => ({
    type: "page_view",
    page: `/page-${index}`,
    device: index % 2 ? "pc" : "mobile",
    session_id: `session-${index}`,
  }));
  const request = new Request(
    "https://api.example.test/api/heatmap/track",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.52",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({ events }),
    },
  );

  const response = await handleHeatmap(request, { DB: db }, {}, {});
  const statementCount = batches.flat().length;

  assert.equal(response.status, 200);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 13);
  assert.equal(batches[1].length, 18);
  assert.ok(statementCount < 50);
  assert.ok(
    batches
      .flat()
      .every((statement) => statement.args.length <= 100),
  );
});
