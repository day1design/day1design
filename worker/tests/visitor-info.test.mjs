import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { handleEstimates } from "../src/routes/estimates.js";
import {
  countVisits,
  describeDevice,
  fetchVisitStats,
  formatVisitLine,
  metaPlatformFromUa,
  VISIT_WINDOW_MS,
} from "../src/lib/visitor-info.js";

// 2026-11-02 19:25 KST 실제 랜딩 접수 건의 User-Agent(인스타그램 앱, iPhone15,2).
const IG_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G71 Instagram 453.0.0.39.58 (iPhone15,2; iOS 26_6; ko_KR; ko; scale=3.00; 1179x2556; IABMV/1; 1099096960) Safari/604.1";
const IG_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36 Instagram 356.0.0.41.101 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 658193855)";
const IG_PIXEL_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36 Instagram 356.0.0.41.101 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; ko_KR; 658193855)";
const FB_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/485.0.0.43.109;FBBV/650000000;FBDV/iPhone17,3;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBID/phone;FBLC/ko_KR;FBOP/5;FBRV/651000000]";
const FB_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-F956N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/485.0.0.67.80;]";
const CHROME_ANDROID_REDUCED_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const SAFARI_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const SAMSUNG_BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";
const WINDOWS_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

test("기기: 인앱 브라우저 UA 에서 기종을 읽는다", () => {
  assert.equal(
    describeDevice(IG_IOS_UA),
    "iPhone 14 Pro · iOS 26.6 · 인스타그램 앱",
  );
  assert.equal(
    describeDevice(IG_ANDROID_UA),
    "갤럭시 S23 Ultra (SM-S918N) · Android 14 · 인스타그램 앱",
  );
  assert.equal(
    describeDevice(IG_PIXEL_UA),
    "Google Pixel 8 · Android 14 · 인스타그램 앱",
  );
  assert.equal(describeDevice(FB_IOS_UA), "iPhone 16 · iOS 18.1 · 페이스북 앱");
  assert.equal(
    describeDevice(FB_ANDROID_UA),
    "갤럭시 Z Fold6 (SM-F956N) · Android 14 · 페이스북 앱",
  );
  assert.equal(
    describeDevice(SAMSUNG_BROWSER_UA),
    "갤럭시 S24 Ultra (SM-S928N) · Android 14 · 삼성 인터넷",
  );
});

test("기기: 기종을 숨기는 브라우저는 '모델 미표시'로 남긴다", () => {
  assert.equal(
    describeDevice(CHROME_ANDROID_REDUCED_UA),
    "Android 폰 (모델 미표시) · Android 10 · Chrome",
  );
  assert.equal(
    describeDevice(SAFARI_IOS_UA),
    "iPhone (모델 미표시) · iOS 18.1 · Safari",
  );
  assert.equal(describeDevice(WINDOWS_CHROME_UA), "PC · Windows · Chrome");
  assert.equal(describeDevice(""), "");
  // 표에 없는 코드는 원문 코드를 그대로 보여 준다(틀린 이름보다 낫다).
  assert.match(
    describeDevice(IG_IOS_UA.replace("iPhone15,2", "iPhone19,9")),
    /^iPhone19,9 · /,
  );
});

test("플랫폼: 인앱 단서로 Instagram·Facebook 을 가른다", () => {
  assert.equal(metaPlatformFromUa(IG_IOS_UA), "Instagram");
  assert.equal(metaPlatformFromUa(FB_ANDROID_UA), "Facebook");
  assert.equal(metaPlatformFromUa(SAFARI_IOS_UA, "instagram-app"), "Instagram");
  assert.equal(metaPlatformFromUa(SAFARI_IOS_UA), "");
});

test("방문 횟수: 30분 공백으로 방문을 나누고 30일 밖은 세지 않는다", () => {
  const now = Date.parse("2026-11-02T10:25:29Z");
  const at = (ms) => new Date(now - ms).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  // 기록이 하나도 없어도 지금 접수한 방문은 1회다.
  assert.deepEqual(countVisits([], now), {
    visitCount: 1,
    isRevisit: false,
    firstVisitAt: new Date(now).toISOString(),
  });
  // 이번 방문 안의 page_view 여러 건 = 1회.
  assert.equal(
    countVisits([at(2 * 60_000), at(60_000), at(10_000)], now).visitCount,
    1,
  );
  // 10일 전·3일 전·지금 = 3회, 재방문, 첫 방문은 10일 전.
  const three = countVisits(
    [at(10 * DAY), at(10 * DAY - 60_000), at(3 * DAY), at(5 * 60_000)],
    now,
  );
  assert.equal(three.visitCount, 3);
  assert.equal(three.isRevisit, true);
  assert.equal(three.firstVisitAt, at(10 * DAY));
  // 31일 전 방문은 30일 창 밖이라 첫 방문으로 본다.
  assert.equal(countVisits([at(31 * DAY), at(60_000)], now).visitCount, 1);
  // 마지막 기록이 2시간 전이면 이번 방문은 아직 기록 전 → 더한다.
  assert.equal(countVisits([at(2 * 60 * 60_000)], now).visitCount, 2);
  assert.equal(VISIT_WINDOW_MS, 30 * DAY);
});

test("방문 표기: 첫 방문·재방문·확인 불가", () => {
  assert.equal(
    formatVisitLine({ known: true, visitCount: 1, isRevisit: false }),
    "1회 (첫 방문)",
  );
  assert.equal(
    formatVisitLine({
      known: true,
      visitCount: 3,
      isRevisit: true,
      firstVisitAt: "2026-10-23T16:30:00Z", // KST 10/24 01:30
    }),
    "3회 (재방문 · 첫 방문 10/24)",
  );
  assert.equal(
    formatVisitLine({ known: false, visitCount: 0 }),
    "확인 불가 (방문 기록 없음)",
  );
});

test("방문 조회: 방문자 ID·30일 하한·LIMIT 으로 구간만 읽는다", async () => {
  const calls = [];
  const now = Date.parse("2026-11-02T10:25:29Z");
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            calls.push({ sql, args });
            return this;
          },
          async all() {
            return {
              results: [
                { CreatedAt: "2026-11-02T10:24:12.345Z" },
                { CreatedAt: "2026-11-02T10:23:04.153Z" },
                { CreatedAt: "2026-10-28T03:00:00.000Z" },
              ],
            };
          },
        };
      },
    },
  };
  const stats = await fetchVisitStats(env, "sid-1", now);
  assert.equal(stats.known, true);
  assert.equal(stats.visitCount, 2);
  assert.equal(stats.isRevisit, true);
  assert.match(calls[0].sql, /WHERE SessionId = \? AND CreatedAt >= \?/);
  assert.match(calls[0].sql, /LIMIT \d+/);
  assert.deepEqual(calls[0].args, [
    "sid-1",
    new Date(now - VISIT_WINDOW_MS).toISOString(),
  ]);
  // 방문자 ID 가 없으면 DB 를 부르지 않는다.
  assert.equal((await fetchVisitStats(env, "", now)).known, false);
  assert.equal(calls.length, 1);
  // 조회 실패는 접수를 막지 않고 '확인 불가'로 남긴다.
  const broken = {
    DB: {
      prepare() {
        throw new Error("d1 down");
      },
    },
  };
  assert.equal((await fetchVisitStats(broken, "sid-1", now)).known, false);
});

// ─── 접수 경로 통합: 랜딩 알림 형식 + D1 저장 ─────────────────────

let previousCaches;
let previousFetch;
beforeEach(() => {
  previousCaches = globalThis.caches;
  previousFetch = globalThis.fetch;
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
  globalThis.fetch = previousFetch;
});

function fakeDb(pageViews) {
  return {
    prepare(sql) {
      return {
        bind() {
          return this;
        },
        async all() {
          if (/FROM HeatmapEvents/.test(sql)) return { results: pageViews };
          return { results: [] };
        },
        async first() {
          return null;
        },
        async run() {
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
    async batch() {
      return [];
    },
  };
}

async function submit({ fields, ua, pageViews }) {
  const telegram = [];
  const mails = [];
  const created = [];
  const tasks = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("api.telegram.org")) {
      telegram.push(JSON.parse(init.body).text);
    } else if (href === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "t" });
    } else if (href.includes("gmail.googleapis.com")) {
      mails.push(
        Buffer.from(
          JSON.parse(init.body).raw.replace(/-/g, "+").replace(/_/g, "/"),
          "base64",
        ).toString("utf8"),
      );
    }
    return Response.json({ ok: true });
  };
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.77", "user-agent": ua },
    }),
    {
      DB: fakeDb(pageViews),
      TELEGRAM_BOT_TOKEN: "test",
      TELEGRAM_CHAT_ID: "-100test",
      GMAIL_CLIENT_ID: "c",
      GMAIL_CLIENT_SECRET: "s",
      GMAIL_REFRESH_TOKEN: "r",
      GMAIL_USER: "sender@example.com",
      GMAIL_NOTIFY_TO: "internal@example.com",
    },
    { waitUntil: (t) => tasks.push(t) },
    {
      media: {
        async upload() {
          return "https://assets.example.test/x";
        },
      },
      estimates: {
        async create(x) {
          created.push(x);
          return { id: "rec12345678901234", fields: x };
        },
        async listAll() {
          return [];
        },
      },
      intakeEvents: {
        async create() {
          return { id: "ie1" };
        },
      },
    },
  );
  await Promise.allSettled(tasks);
  return { res, telegram, mails, created };
}

const BASE_FIELDS = {
  name: "임혜진",
  phone: "010-6624-6615",
  privacy_agreed: "true",
  space_type: "아파트",
  space_size: "40평대",
  address: "판교 원마을 12단지",
  schedule: "3~6개월 후",
  branch: "판교점",
  budget: "1억~1억5천",
  session_id: "119ce70c-b3f2-476a-828b-164e8c224025",
};

test("랜딩 접수: Meta 리드 알림 모양 + 방문횟수·IP·기기, D1 고객카드에도 저장", async () => {
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  const { res, telegram, mails, created } = await submit({
    fields: {
      ...BASE_FIELDS,
      utm_source: "meta",
      utm_medium: "paid",
      utm_campaign: "lp-bd",
      inflow_app: "instagram-app",
      _fb_source: "meta",
      _fb_campaign: "lp-bd",
      _fb_adset: "p3",
    },
    ua: IG_IOS_UA,
    // 5일 전 한 번 + 이번 방문 두 페이지 → 2회 재방문
    pageViews: [
      { CreatedAt: iso(60_000), EventType: "page_view" },
      { CreatedAt: iso(2 * 60_000), EventType: "page_view" },
      { CreatedAt: iso(5 * 24 * 60 * 60_000), EventType: "page_view" },
    ],
  });
  assert.equal(res.status, 200);

  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  assert.ok(lead, "랜딩 접수 알림이 없다");
  assert.ok(lead.startsWith("<b>[day1design/estimates]</b> 🔔 <b>신규 상담 신청</b>"));
  assert.ok(lead.includes("🔵 Meta 광고 · 랜딩"));
  assert.ok(lead.includes("👤 <b>고객정보</b>\n├ 이름: 임혜진\n├ 연락처: 010-6624-6615\n└ 지역: 판교 원마을 12단지"));
  assert.ok(lead.includes("├ 면적: 40평대"));
  assert.ok(lead.includes("└ 가용예산: 1억~1억5천"));
  assert.ok(lead.includes("├ 플랫폼: Instagram"));
  assert.ok(lead.includes("├ 캠페인: 판교·수지·광교·동탄 랜딩 (lp-bd)"));
  assert.ok(lead.includes("└ 소재: P-3"));
  assert.ok(lead.includes("🧭 <b>방문정보</b>\n├ 방문횟수: 2회 (재방문 · 첫 방문"));
  assert.ok(lead.includes("├ IP: 203.0.113.77"));
  assert.ok(lead.includes("└ 기기: iPhone 14 Pro · iOS 26.6 · 인스타그램 앱"));
  assert.ok(!lead.includes("새 상담신청"), "홈페이지 형식이 섞였다");

  const internal = mails.find((m) => m.includes("To: internal@example.com"));
  assert.ok(internal);
  const subject = internal
    .match(/^Subject: (.*)$/m)[1]
    .replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b) =>
      Buffer.from(b, "base64").toString("utf8"),
    );
  assert.equal(subject, "[DAYONE] 새 상담신청 (Meta)");
  assert.ok(internal.includes("Visits"));
  assert.ok(internal.includes("iPhone 14 Pro"));

  assert.equal(created[0].VisitCount, 2);
  assert.equal(created[0].IsRevisit, 1);
  assert.equal(created[0].DeviceInfo, "iPhone 14 Pro · iOS 26.6 · 인스타그램 앱");
  assert.equal(created[0].UserAgent, IG_IOS_UA);
  assert.equal(created[0].IP, "203.0.113.77");
  assert.equal(created[0].Status, "접수대기");
});

test("일반 견적 폼 접수: 알림 형식은 그대로, 방문 정보는 D1 에만 저장", async () => {
  const { res, telegram, created } = await submit({
    fields: { ...BASE_FIELDS, branch: "강남점" },
    ua: SAFARI_IOS_UA,
    pageViews: [],
  });
  assert.equal(res.status, 200);
  const lead = telegram.find((t) => t.includes("새 상담신청"));
  assert.ok(lead);
  assert.ok(lead.startsWith("[day1design/estimates] 새 상담신청"));
  assert.ok(lead.includes("평형대: 40평대"));
  assert.ok(!lead.includes("방문정보"));
  assert.equal(created[0].VisitCount, 1);
  assert.equal(created[0].IsRevisit, 0);
  assert.equal(created[0].DeviceInfo, "iPhone (모델 미표시) · iOS 18.1 · Safari");
});
