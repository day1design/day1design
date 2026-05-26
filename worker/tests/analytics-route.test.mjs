import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { handleAnalytics } from "../src/routes/analytics.js";
import { sign as signJwt } from "../src/lib/jwt.js";

const JWT_SECRET = "test-secret";

async function adminCookie() {
  const jwt = await signJwt({ sub: "admin" }, JWT_SECRET, 3600);
  return `day1_admin=${encodeURIComponent(jwt)}`;
}

const originalFetch = globalThis.fetch;
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
  globalThis.fetch = originalFetch;
  globalThis.caches = originalCaches;
});

function createServices() {
  const snapshots = [];
  const raw = [];
  return {
    snapshots,
    raw,
    analyticsSnapshots: {
      async list({ where }) {
        return {
          records: snapshots.filter(
            (record) =>
              record.fields.RangeKey === where.RangeKey &&
              record.fields.StartDate === where.StartDate &&
              record.fields.EndDate === where.EndDate &&
              record.fields.Source === where.Source,
          ),
        };
      },
      async create(fields) {
        const record = { id: "recAnalytics0001", fields };
        snapshots.unshift(record);
        return record;
      },
    },
    analyticsRaw: {
      async putJson(key, data) {
        raw.push({ key, data });
        return key;
      },
    },
  };
}

function createVisitorDb() {
  const events = [];
  const seen = new Set();
  const hourly = new Map();
  const seenKey = (hourKey, locationKey, ipHash) =>
    `${hourKey}|${locationKey}|${ipHash}`;
  const hourlyKey = (hourKey, locationKey) => `${hourKey}|${locationKey}`;
  const eventsInRange = (start, end) =>
    events.filter((row) => row.DayKey >= start && row.DayKey <= end);

  return {
    events,
    hourly,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (
                sql.includes("FROM VisitorIpEvents") &&
                sql.includes("COUNT(DISTINCT LocationKey)")
              ) {
                const rows = eventsInRange(args[0], args[1]);
                return {
                  Visits: rows.length,
                  UniqueIps: new Set(rows.map((row) => row.IpHash)).size,
                  Locations: new Set(rows.map((row) => row.LocationKey)).size,
                  FirstSeenAt: rows
                    .map((row) => row.EventAt)
                    .sort((a, b) => a.localeCompare(b))[0] || "",
                  LastSeenAt: rows
                    .map((row) => row.EventAt)
                    .sort((a, b) => b.localeCompare(a))[0] || "",
                };
              }
              if (sql.includes("FROM VisitorLocationIpHourly")) {
                return seen.has(seenKey(args[0], args[1], args[2]))
                  ? { ok: 1 }
                  : null;
              }
              if (sql.includes("substr(HourKey")) {
                const [start, end, locationKey] = args;
                const rows = Array.from(hourly.values())
                  .filter(
                    (row) =>
                      row.DayKey >= start &&
                      row.DayKey <= end &&
                      row.LocationKey === locationKey,
                  )
                  .reduce((map, row) => {
                    const hour = row.HourKey.slice(11, 13);
                    map.set(hour, (map.get(hour) || 0) + row.Visits);
                    return map;
                  }, new Map());
                const best = Array.from(rows.entries()).sort(
                  (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
                )[0];
                return best ? { Hour: best[0], Visits: best[1] } : null;
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO VisitorIpEvents")) {
                events.push({
                  id: args[0],
                  EventAt: args[1],
                  DayKey: args[2],
                  HourKey: args[3],
                  IpHash: args[4],
                  IpPrefix: args[5],
                  Country: args[6],
                  Region: args[7],
                  City: args[8],
                  Timezone: args[9],
                  Latitude: args[10],
                  Longitude: args[11],
                  LocationKey: args[12],
                  Path: args[13],
                  ReferrerHost: args[14],
                  UserAgentHash: args[15],
                  RawR2Key: args[16],
                  CreatedAt: args[17],
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO VisitorLocationIpHourly")) {
                seen.add(seenKey(args[0], args[1], args[2]));
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO VisitorLocationHourly")) {
                const key = hourlyKey(args[0], args[1]);
                const current = hourly.get(key) || {
                  HourKey: args[0],
                  LocationKey: args[1],
                  DayKey: args[2],
                  Country: args[3],
                  Region: args[4],
                  City: args[5],
                  Timezone: args[6],
                  Visits: 0,
                  UniqueIps: 0,
                  UpdatedAt: args[8],
                };
                current.Visits += 1;
                current.UniqueIps += Number(args[7] || 0);
                current.UpdatedAt = args[8];
                hourly.set(key, current);
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async all() {
              if (
                sql.includes("FROM VisitorIpEvents") &&
                sql.includes("GROUP BY LocationKey")
              ) {
                const [start, end, limit] = args;
                const grouped = new Map();
                for (const row of eventsInRange(start, end)) {
                  const current = grouped.get(row.LocationKey) || {
                    LocationKey: row.LocationKey,
                    Country: row.Country,
                    Region: row.Region,
                    City: row.City,
                    Timezone: row.Timezone,
                    Visits: 0,
                    ips: new Set(),
                    LastSeenAt: "",
                  };
                  current.Visits += 1;
                  current.ips.add(row.IpHash);
                  if (row.EventAt > current.LastSeenAt) {
                    current.LastSeenAt = row.EventAt;
                  }
                  grouped.set(row.LocationKey, current);
                }
                return {
                  results: Array.from(grouped.values())
                    .map((row) => ({
                      ...row,
                      UniqueIps: row.ips.size,
                      ips: undefined,
                    }))
                    .sort(
                      (a, b) =>
                        b.Visits - a.Visits ||
                        b.UniqueIps - a.UniqueIps ||
                        b.LastSeenAt.localeCompare(a.LastSeenAt),
                    )
                    .slice(0, Number(limit || 5)),
                };
              }
              if (
                sql.includes("FROM VisitorIpEvents") &&
                sql.includes("GROUP BY substr(DayKey")
              ) {
                const [start, end, limit] = args;
                const grouped = new Map();
                for (const row of eventsInRange(start, end)) {
                  const monthKey = row.DayKey.slice(0, 7);
                  const current = grouped.get(monthKey) || {
                    MonthKey: monthKey,
                    Visits: 0,
                    ips: new Set(),
                    locations: new Set(),
                  };
                  current.Visits += 1;
                  current.ips.add(row.IpHash);
                  current.locations.add(row.LocationKey);
                  grouped.set(monthKey, current);
                }
                return {
                  results: Array.from(grouped.values())
                    .map((row) => ({
                      MonthKey: row.MonthKey,
                      Visits: row.Visits,
                      UniqueIps: row.ips.size,
                      Locations: row.locations.size,
                    }))
                    .sort((a, b) => b.MonthKey.localeCompare(a.MonthKey))
                    .slice(0, Number(limit || 36)),
                };
              }
              if (
                sql.includes("FROM VisitorIpEvents") &&
                sql.includes("GROUP BY DayKey")
              ) {
                const [start, end, limit] = args;
                const grouped = new Map();
                for (const row of eventsInRange(start, end)) {
                  const current = grouped.get(row.DayKey) || {
                    MonthKey: row.DayKey.slice(0, 7),
                    DayKey: row.DayKey,
                    Visits: 0,
                    ips: new Set(),
                    locations: new Set(),
                  };
                  current.Visits += 1;
                  current.ips.add(row.IpHash);
                  current.locations.add(row.LocationKey);
                  grouped.set(row.DayKey, current);
                }
                return {
                  results: Array.from(grouped.values())
                    .map((row) => ({
                      MonthKey: row.MonthKey,
                      DayKey: row.DayKey,
                      Visits: row.Visits,
                      UniqueIps: row.ips.size,
                      Locations: row.locations.size,
                    }))
                    .sort((a, b) => b.DayKey.localeCompare(a.DayKey))
                    .slice(0, Number(limit || 370)),
                };
              }
              if (
                sql.includes("FROM VisitorIpEvents") &&
                sql.includes("ORDER BY EventAt DESC")
              ) {
                const [start, end, limit] = args;
                return {
                  results: eventsInRange(start, end)
                    .sort((a, b) => b.EventAt.localeCompare(a.EventAt))
                    .slice(0, Number(limit || 80)),
                };
              }
              if (sql.includes("GROUP BY LocationKey")) {
                const [start, end, limit] = args;
                const grouped = new Map();
                for (const row of hourly.values()) {
                  if (row.DayKey < start || row.DayKey > end) continue;
                  const current = grouped.get(row.LocationKey) || {
                    LocationKey: row.LocationKey,
                    Country: row.Country,
                    Region: row.Region,
                    City: row.City,
                    Timezone: row.Timezone,
                    Visits: 0,
                    UniqueIps: 0,
                    LastSeenAt: "",
                  };
                  current.Visits += row.Visits;
                  current.UniqueIps += row.UniqueIps;
                  if (row.UpdatedAt > current.LastSeenAt) {
                    current.LastSeenAt = row.UpdatedAt;
                  }
                  grouped.set(row.LocationKey, current);
                }
                return {
                  results: Array.from(grouped.values())
                    .sort(
                      (a, b) =>
                        b.Visits - a.Visits ||
                        b.UniqueIps - a.UniqueIps ||
                        b.LastSeenAt.localeCompare(a.LastSeenAt),
                    )
                    .slice(0, Number(limit || 5)),
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function visitorRequest(city, ip = "203.0.113.42") {
  const request = new Request("https://api.example.test/api/analytics/visit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": ip,
      "user-agent": "node-test",
    },
    body: JSON.stringify({
      path: "/pages/about.html",
      referrer: "https://google.com/search?q=dayone",
    }),
  });
  Object.defineProperty(request, "cf", {
    value: {
      country: "KR",
      region: city,
      city,
      timezone: "Asia/Seoul",
    },
  });
  return request;
}

test("analytics summary refresh stores GA4 payload in D1 and R2", async () => {
  const services = createServices();
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const href = String(url);
    calls.push(href);
    if (href === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "access-token" });
    }
    const body = JSON.parse(opts.body || "{}");
    if (!body.dimensions) {
      return Response.json({
        rows: [
          {
            metricValues: [
              { value: "12" },
              { value: "34" },
              { value: "56" },
              { value: "0.12" },
              { value: "20" },
            ],
          },
        ],
      });
    }
    const dim = body.dimensions[0].name;
    if (dim === "date") {
      return Response.json({
        rows: [
          {
            dimensionValues: [{ value: "20260512" }],
            metricValues: [{ value: "12" }, { value: "34" }],
          },
        ],
      });
    }
    if (dim === "pagePath") {
      return Response.json({
        rows: [
          {
            dimensionValues: [{ value: "/" }],
            metricValues: [{ value: "34" }, { value: "12" }],
          },
        ],
      });
    }
    if (dim === "sessionSource") {
      return Response.json({
        rows: [
          {
            dimensionValues: [
              { value: "google" },
              { value: "organic" },
              { value: "Organic Search" },
            ],
            metricValues: [{ value: "11" }, { value: "7" }],
          },
          {
            dimensionValues: [
              { value: "l.facebook.com" },
              { value: "referral" },
              { value: "Organic Social" },
            ],
            metricValues: [{ value: "9" }, { value: "5" }],
          },
        ],
      });
    }
    return Response.json({
      rows: [
        {
          dimensionValues: [{ value: "Organic Search" }],
          metricValues: [{ value: "20" }],
        },
      ],
    });
  };

  const res = await handleAnalytics(
    new Request("https://api.example.test/api/analytics/summary?range=30&refresh=1", {
      headers: { cookie: await adminCookie() },
    }),
    {
      JWT_SECRET,
      GA4_PROPERTY_ID: "537274300",
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      GA4_REFRESH_TOKEN: "refresh",
    },
    {},
    services,
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.summary.visitors, 12);
  assert.equal(body.topPages[0].path, "/");
  assert.deepEqual(
    body.sources.map((source) => ({
      key: source.key,
      name: source.name,
      sessions: source.sessions,
      visitors: source.visitors,
    })),
    [
      { key: "google", name: "Google", sessions: 11, visitors: 7 },
      { key: "facebook", name: "FB", sessions: 9, visitors: 5 },
    ],
  );
  assert.equal(services.snapshots.length, 1);
  assert.equal(services.raw.length, 1);
  assert.match(services.raw[0].key, /^analytics\/snapshots\//);
  assert.equal(calls.filter((url) => url.includes("analyticsdata.googleapis.com")).length, 4);
});

test("analytics summary falls back to latest D1 snapshot when Google is unavailable", async () => {
  const services = createServices();
  services.snapshots.push({
    id: "recPersisted",
    fields: {
      RangeKey: "custom",
      StartDate: "2026-04-13",
      EndDate: "2026-05-12",
      Source: "google",
      Payload: JSON.stringify({
        ok: true,
        summary: { visitors: 3, pageviews: 5 },
        range: { key: "custom", startDate: "2026-04-13", endDate: "2026-05-12" },
      }),
      RawR2Key: "analytics/snapshots/demo.json",
      CreatedAt: "2026-05-12T00:00:00.000Z",
    },
  });
  globalThis.fetch = async () => new Response("fail", { status: 500 });

  const res = await handleAnalytics(
    new Request("https://api.example.test/api/analytics/summary?range=custom&start=2026-04-13&end=2026-05-12&refresh=1", {
      headers: { cookie: await adminCookie() },
    }),
    {
      JWT_SECRET,
      GA4_PROPERTY_ID: "537274300",
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      GA4_REFRESH_TOKEN: "refresh",
    },
    {},
    services,
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.cached, true);
  assert.equal(body.stale, true);
  assert.equal(body.summary.visitors, 3);
  assert.equal(services.raw.length, 0);
});

test("analytics visit stores IP-derived location in D1 and R2 archive", async () => {
  const db = createVisitorDb();
  const services = createServices();
  const waitUntil = [];
  const res = await handleAnalytics(
    visitorRequest("Seoul", "203.0.113.45"),
    { DB: db, JWT_SECRET },
    { waitUntil: (task) => waitUntil.push(task) },
    services,
  );
  const body = await res.json();
  await Promise.all(waitUntil);

  assert.equal(res.status, 200);
  assert.equal(body.tracked, true);
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].City, "Seoul");
  assert.equal(db.events[0].IpPrefix, "203.0.113.0/24");
  assert.notEqual(db.events[0].IpHash, "");
  assert.equal(db.events[0].IP, undefined);
  assert.equal(services.raw.length, 1);
  assert.match(services.raw[0].key, /^analytics\/ip-checks\//);
  assert.equal(services.raw[0].data.location.city, "Seoul");
  assert.equal(services.raw[0].data.ipPrefix, "203.0.113.0/24");
});

test("visitor locations endpoint returns only the top five locations", async () => {
  const db = createVisitorDb();
  const services = createServices();
  const counts = [
    ["Seoul", 6],
    ["Busan", 5],
    ["Incheon", 4],
    ["Daegu", 3],
    ["Daejeon", 2],
    ["Jeju", 1],
  ];

  for (let cityIndex = 0; cityIndex < counts.length; cityIndex++) {
    const [city, count] = counts[cityIndex];
    for (let i = 0; i < count; i++) {
      await handleAnalytics(
        visitorRequest(city, `203.0.${cityIndex}.${i + 1}`),
        { DB: db, JWT_SECRET },
        { waitUntil() {} },
        services,
      );
    }
  }

  const res = await handleAnalytics(
    new Request("https://api.example.test/api/analytics/visitor-locations?range=all", {
      headers: { cookie: await adminCookie() },
    }),
    { DB: db, JWT_SECRET },
    {},
    services,
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.topLocations.length, 5);
  assert.deepEqual(
    body.topLocations.map((row) => row.city),
    ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon"],
  );
  assert.equal(body.topLocations.some((row) => row.city === "Jeju"), false);
  assert.equal(body.topLocations[0].visits, 6);
  assert.match(body.topLocations[0].peakHourLabel, /시$/);
});

test("visitor location detail returns cumulative, monthly daily, and masked event logs", async () => {
  const db = createVisitorDb();
  const services = createServices();

  await handleAnalytics(
    visitorRequest("Seoul", "203.0.113.42"),
    { DB: db, JWT_SECRET },
    { waitUntil() {} },
    services,
  );
  await handleAnalytics(
    visitorRequest("Busan", "203.0.114.10"),
    { DB: db, JWT_SECRET },
    { waitUntil() {} },
    services,
  );

  const res = await handleAnalytics(
    new Request(
      "https://api.example.test/api/analytics/visitor-locations/detail?range=all",
      { headers: { cookie: await adminCookie() } },
    ),
    { DB: db, JWT_SECRET },
    {},
    services,
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.configured, true);
  assert.equal(body.cumulative.visits, 2);
  assert.equal(body.cumulative.uniqueIps, 2);
  assert.equal(body.cumulative.locations, 2);
  assert.equal(body.topLocations.length, 2);
  assert.equal(body.months.length, 1);
  assert.equal(body.months[0].days[0].visits, 2);
  assert.equal(body.recentEvents.length, 2);
  assert.match(body.recentEvents[0].ipPrefix, /^203\.0\.\d+\.0\/24$/);
  assert.equal(body.recentEvents[0].ipHash, undefined);
});
