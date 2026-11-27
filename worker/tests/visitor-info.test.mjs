import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { handleEstimates } from "../src/routes/estimates.js";
import {
  countVisits,
  describeAdSource,
  describeDevice,
  fetchVisitStats,
  formatVisitLine,
  groupVisits,
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
  // UA 축소의 "Android 10" 은 고정값이라 버전으로 적지 않는다(2026-11-04 오표기 수정).
  assert.equal(
    describeDevice(CHROME_ANDROID_REDUCED_UA),
    "Android 폰 (모델·버전 미표시) · Chrome",
  );
  assert.equal(
    describeDevice(SAFARI_IOS_UA),
    "iPhone (모델 미표시) · iOS 18.1 · Safari",
  );
  assert.equal(describeDevice(WINDOWS_CHROME_UA), "PC · Windows · Chrome");
  assert.equal(describeDevice(""), "");
  // 표에 없는 코드는 틀린 이름 대신 코드를 보여 주되, 코드만 있으면 기종처럼 읽히므로
  // 제품군을 붙인다.
  assert.match(
    describeDevice(IG_IOS_UA.replace("iPhone15,2", "iPhone20,9")),
    /^iPhone 신규 기종 \(iPhone20,9\) · /,
  );
});

// 2026-11-02~03 운영 접수에서 기기가 틀리게 적힌 실제 UA.
// 스레드 앱: 앞쪽은 축소된 "Android 10; K; wv", 뒤쪽 토큰에 실제 Android 17·SM-S938N.
const THREADS_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.0.0 Mobile Safari/537.36 Barcelona 453.0.0.56.79 Android (37/17; 420dpi; 1080x2340; samsung; SM-S938N; pa3q; qcom; ko_KR; 1100454133)";
const IG_IPHONE18PRO_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/24A446 Instagram 453.0.0.39.58 (iPhone19,2; iOS 27_0_1; ko_KR; ko; scale=3.00; 1206x2622; IABMV/1; 1099096960) Safari/604.1";
const SAMSUNG_REDUCED_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36";
const NAVER_APP_UA =
  "Mozilla/5.0 (Linux; Android 17; SM-S948N Build/CP2A.260605.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Whale/1.0.0.0 Crosswalk/30.140.0.14 Mobile Safari/537.36 NAVER(inapp; search; 2100; 12.24.50)";
const GENERIC_WEBVIEW_UA =
  "Mozilla/5.0 (Linux; Android 15; SM-S931N Build/AP3A.240905.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36";

test("기기: 운영에서 틀리게 적힌 UA 를 바르게 읽는다", () => {
  // 전: "갤럭시 S25 Ultra (SM-S938N) · Android 10 · Chrome"
  assert.equal(
    describeDevice(THREADS_ANDROID_UA),
    "갤럭시 S25 Ultra (SM-S938N) · Android 17 · 스레드 앱",
  );
  // 전: "iPhone19,2 · iOS 27.0 · 인스타그램 앱"
  assert.equal(
    describeDevice(IG_IPHONE18PRO_UA),
    "iPhone 18 Pro · iOS 27.0 · 인스타그램 앱",
  );
  // 전: "Android 폰 (모델 미표시) · Android 10 · 삼성 인터넷"
  assert.equal(
    describeDevice(SAMSUNG_REDUCED_UA),
    "Android 폰 (모델·버전 미표시) · 삼성 인터넷",
  );
  // 그대로 맞던 값은 유지한다.
  assert.equal(
    describeDevice(NAVER_APP_UA),
    "갤럭시 S26 Ultra (SM-S948N) · Android 17 · 네이버 앱",
  );
  // 앱 이름이 없는 WebView 는 크롬이 아니다.
  assert.equal(
    describeDevice(GENERIC_WEBVIEW_UA),
    "갤럭시 S25 (SM-S931N) · Android 15 · 앱 내 브라우저",
  );
});

test("플랫폼: 스레드 앱은 Threads, UA 단서가 첫 방문 추정보다 먼저다", () => {
  assert.equal(metaPlatformFromUa(THREADS_ANDROID_UA), "Threads");
  assert.equal(metaPlatformFromUa(IG_IPHONE18PRO_UA, "facebook-app"), "Instagram");
  assert.equal(metaPlatformFromUa("", "facebook-app"), "Facebook");
});

test("광고 출처: 접수카드용 describeAdSource", () => {
  // 랜딩 접수(2026-11-03 실제 칸 값)
  assert.deepEqual(
    describeAdSource({
      Source: "meta",
      Platform: "Meta",
      Campaign: "lp-gn",
      UtmCampaign: "lp-gn",
      MetaCampaign: "lp-gn",
      MetaAdset: "s2",
      MetaAd: "52583047314269",
      UserAgent: IG_IPHONE18PRO_UA,
      FirstInflowApp: "instagram-app",
    }),
    {
      channel: "랜딩",
      platform: "Instagram",
      campaign: "서울 랜딩 (lp-gn)",
      creative: "S-2",
    },
  );
  assert.equal(
    describeAdSource({
      Source: "meta",
      UtmCampaign: "lp-bd",
      MetaAdset: "p1",
      UserAgent: THREADS_ANDROID_UA,
    }).platform,
    "Threads",
  );
  // 앱 밖 브라우저로 연 랜딩 = 플랫폼 미상("")
  assert.equal(
    describeAdSource({
      Source: "meta",
      UtmCampaign: "lp-bd",
      UserAgent: SAFARI_IOS_UA,
    }).platform,
    "",
  );
  // Meta 입력양식 리드 — 광고 이름이 캠페인과 같으면 소재 칸은 비운다.
  assert.deepEqual(
    describeAdSource({
      Source: "meta",
      MetaLeadId: "1234567890",
      Platform: "instagram",
      Campaign: "261020_잠재고객 캠페인(서울 타겟팅)",
      MetaCampaign: "261020_잠재고객 캠페인(서울 타겟팅)",
      MetaAd: "261020_잠재고객 캠페인(서울 타겟팅)",
    }),
    {
      channel: "입력양식",
      platform: "Instagram",
      campaign: "261020_잠재고객 캠페인(서울 타겟팅)",
      creative: "",
    },
  );
  assert.equal(
    describeAdSource({
      Source: "meta",
      MetaLeadId: "1",
      Platform: "facebook",
      MetaCampaign: "C",
      MetaAd: "광고 A",
    }).creative,
    "광고 A",
  );
  // Meta 가 아니면 null
  assert.equal(describeAdSource({ Source: "naver" }), null);
  assert.equal(describeAdSource(null), null);
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

async function submit({ fields, ua, pageViews, env: extraEnv = {}, graph = null }) {
  const telegram = [];
  const mails = [];
  const created = [];
  const tasks = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("api.telegram.org")) {
      telegram.push(JSON.parse(init.body).text);
    } else if (graph && href.includes("graph.facebook.com")) {
      return Response.json(graph);
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
      ...extraEnv,
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
  assert.ok(lead.includes("└ 광고명: P-3"));
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

test("일반 견적 폼 접수: 랜딩과 같은 트리 형식(유입정보 블록) + 방문정보, D1 에도 저장", async () => {
  const { res, telegram, mails, created } = await submit({
    fields: { ...BASE_FIELDS, branch: "강남점" },
    ua: SAFARI_IOS_UA,
    pageViews: [],
  });
  assert.equal(res.status, 200);
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  assert.ok(lead);
  assert.equal(
    lead,
    [
      "<b>[day1design/estimates]</b> 🔔 <b>신규 상담 신청</b>",
      "🟢 홈페이지 견적문의",
      "",
      "👤 <b>고객정보</b>",
      "├ 이름: 임혜진",
      "├ 연락처: 010-6624-6615",
      "└ 지역: 판교 원마을 12단지",
      "",
      "🏘 <b>공간/일정</b>",
      "├ 유형: 아파트",
      "├ 면적: 40평대",
      "├ 지점: 강남점",
      "├ 시공예정: 3~6개월 후",
      "└ 가용예산: 1억~1억5천",
      "",
      "📢 <b>유입정보</b>",
      "└ 출처: Homepage",
      "",
      "🧭 <b>방문정보</b>",
      "├ 방문횟수: 1회 (첫 방문)",
      "├ IP: 203.0.113.77",
      "└ 기기: iPhone (모델 미표시) · iOS 18.1 · Safari",
    ].join("\n"),
  );
  assert.ok(!lead.includes("새 상담신청"), "예전 홈페이지 형식이 남았다");
  assert.ok(!lead.includes("광고정보"), "랜딩 광고정보 블록이 섞였다");
  const internal = mails.find((m) => m.includes("To: internal@example.com"));
  assert.ok(internal.includes("Visits"));
  assert.ok(!internal.includes("<b>방문정보</b>"), "메일 text 에 태그가 남았다");
  assert.equal(created[0].VisitCount, 1);
  assert.equal(created[0].IsRevisit, 0);
  assert.equal(created[0].DeviceInfo, "iPhone (모델 미표시) · iOS 18.1 · Safari");
});

test("이탈 팝업 접수 알림에도 방문정보(방문횟수·IP·기기) 블록이 붙는다", async () => {
  const { res, telegram, created } = await submit({
    fields: { name: "임혜진", phone: "010-6624-6615", privacy_agreed: "true", form_type: "exit_guard", session_id: BASE_FIELDS.session_id },
    ua: IG_IOS_UA,
    pageViews: [{ CreatedAt: new Date(Date.now() - 60_000).toISOString(), EventType: "page_view" }],
  });
  assert.equal(res.status, 200);
  const guard = telegram.find((t) => t.includes("이탈 팝업 접수 (작성중)"));
  assert.ok(guard, "이탈 팝업 알림이 없다");
  assert.ok(
    guard.endsWith(
      "\n\n🧭 <b>방문정보</b>\n├ 방문횟수: 1회 (첫 방문)\n├ IP: 203.0.113.77\n└ 기기: iPhone 14 Pro · iOS 26.6 · 인스타그램 앱",
    ),
    guard,
  );
  assert.equal(created[0].Status, "작성중");
  assert.equal(created[0].IP, "203.0.113.77");
});

test("검증 실패 '오류' 카드에도 IP·기기·방문 정보가 남고 차단감지 알림에 기기 줄이 붙는다", async () => {
  const { budget, ...withoutBudget } = BASE_FIELDS;
  const { res, telegram, created } = await submit({
    fields: withoutBudget,
    ua: SAFARI_IOS_UA,
    pageViews: [{ CreatedAt: new Date(Date.now() - 60_000).toISOString(), EventType: "page_view" }],
  });
  assert.equal(res.status, 400);
  assert.equal(created.length, 1);
  const card = created[0];
  assert.equal(card.Status, "오류");
  assert.equal(card.IP, "203.0.113.77");
  assert.equal(card.UserAgent, SAFARI_IOS_UA);
  assert.equal(card.DeviceInfo, "iPhone (모델 미표시) · iOS 18.1 · Safari");
  assert.equal(card.VisitCount, 1);
  assert.equal(card.IsRevisit, 0);
  const blocked = telegram.find((t) => t.includes("차단감지"));
  assert.ok(blocked, "차단감지 알림이 없다");
  assert.ok(blocked.includes("IP: 203.0.113.77"));
  assert.ok(blocked.includes("기기: iPhone (모델 미표시) · iOS 18.1 · Safari"));
});

test("접수 목록 API: 카드용 AdSource 를 싣고 기기는 UA 원문으로 다시 읽는다", async () => {
  const { sign: signJwt } = await import("../src/lib/jwt.js");
  const secret = "test-secret";
  const token = await signJwt({ sub: "admin" }, secret);
  const services = {
    estimates: {
      async listAll() {
        return [
          {
            id: "recLanding",
            fields: {
              Status: "접수대기",
              Source: "meta",
              Platform: "Meta",
              UtmCampaign: "lp-gn",
              MetaAdset: "s2",
              UserAgent: IG_IPHONE18PRO_UA,
              FirstInflowApp: "instagram-app",
              // 옛 기종 표로 저장된 값 — 목록에서는 새 표로 고쳐서 내려간다.
              DeviceInfo: "iPhone19,2 · iOS 27.0 · 인스타그램 앱",
            },
          },
          {
            id: "recHome",
            fields: { Status: "접수대기", Source: "naver", DeviceInfo: "" },
          },
        ];
      },
    },
  };
  const res = await handleEstimates(
    new Request("https://api.day1design.co.kr/api/estimates", {
      headers: { authorization: `Bearer ${token}` },
    }),
    { JWT_SECRET: secret },
    { waitUntil() {} },
    services,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const [landing, home] = body.records;
  assert.equal(landing.DeviceInfo, "iPhone 18 Pro · iOS 27.0 · 인스타그램 앱");
  assert.deepEqual(landing.AdSource, {
    channel: "랜딩",
    platform: "Instagram",
    campaign: "서울 랜딩 (lp-gn)",
    creative: "S-2",
  });
  assert.equal(home.AdSource, null);
  assert.equal(home.DeviceInfo, "");
});

test("플랫폼: 광고 URL 의 site_source_name(utm_term) — 앱 밖 브라우저에서도 구분, 인앱 UA 가 먼저", async () => {
  const { metaPlatformFromSite } = await import("../src/lib/visitor-info.js");
  assert.equal(metaPlatformFromSite("ig"), "Instagram");
  assert.equal(metaPlatformFromSite("FB"), "Facebook");
  assert.equal(metaPlatformFromSite("msg"), "Messenger");
  assert.equal(metaPlatformFromSite("an"), "Audience Network");
  // 예전 접수의 MetaAd(Meta 자동 광고세트 ID)·치환 안 된 매크로는 무시한다.
  assert.equal(metaPlatformFromSite("52583047314269"), "");
  assert.equal(metaPlatformFromSite("{{site_source_name}}"), "");
  // 앱 밖 사파리 + utm_term=fb → Facebook
  assert.equal(metaPlatformFromUa(SAFARI_IOS_UA, "", "fb"), "Facebook");
  // 인스타그램 앱 안에서 열었으면 UA 가 직접 증거다.
  assert.equal(metaPlatformFromUa(IG_IOS_UA, "", "fb"), "Instagram");
  // 접수카드: 사파리로 연 랜딩도 MetaAd(=utm_term) 로 플랫폼이 나온다.
  assert.equal(
    describeAdSource({
      Source: "meta",
      UtmCampaign: "lp-gn",
      MetaAdset: "s1",
      MetaAd: "ig",
      UserAgent: SAFARI_IOS_UA,
    }).platform,
    "Instagram",
  );
});

test("랜딩 접수 알림: 앱 밖 브라우저로 열어도 utm_term(site_source_name)으로 플랫폼을 적는다", async () => {
  const { res, telegram, created } = await submit({
    fields: {
      ...BASE_FIELDS,
      utm_source: "meta",
      utm_medium: "paid",
      utm_campaign: "lp-gn",
      _fb_source: "meta",
      _fb_campaign: "lp-gn",
      _fb_adset: "s2",
      _fb_ad: "fb",
    },
    ua: SAFARI_IOS_UA,
    pageViews: [],
  });
  assert.equal(res.status, 200);
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  assert.ok(lead.includes("├ 플랫폼: Facebook"), lead);
  assert.ok(lead.includes("└ 광고명: S-2"));
  assert.equal(created[0].MetaAd, "fb");
});

// 2026-11-18 사용자 지시: 텔레그램 출처에 utm 축약어 대신 실제 캠페인·광고 이름
const LP_ALL_FIELDS = {
  ...BASE_FIELDS,
  utm_source: "meta",
  utm_medium: "paid",
  utm_campaign: "lp-all",
  _fb_source: "meta",
  _fb_campaign: "lp-all",
  _fb_adset: "p1",
  _fb_ad: "ig",
  _fb_adid: "52584375569269",
};

test("랜딩 접수 알림: 캠페인·광고명은 Meta 의 실제 이름으로 적는다", async () => {
  const { res, telegram, mails } = await submit({
    fields: LP_ALL_FIELDS,
    ua: IG_IOS_UA,
    pageViews: [],
    env: { META_AD_ACCESS_TOKEN: "tok" },
    graph: {
      name: "261107_랜딩전환(통합·유사10%)",
      ads: {
        data: [
          { name: "261107_C_P1_내 삶의 가장 큰 결심" },
          { name: "261107_C_P3_같은 견적이라도 데이원은 다릅니다" },
          { name: "261107_C_S2_시간의 흐름에도 변치 않는 설렘" },
        ],
      },
    },
  });
  assert.equal(res.status, 200);
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  assert.ok(lead.includes("├ 캠페인: 261107_랜딩전환(통합·유사10%)"), lead);
  assert.ok(lead.includes("└ 광고명: 261107_C_P1_내 삶의 가장 큰 결심"), lead);
  const internal = mails.find((m) => m.includes("To: internal@example.com")) || "";
  assert.ok(internal.length > 0, "내부 알림 메일이 없다");
});

test("랜딩 접수 알림: 이름 조회가 실패하면 랜딩 표기와 소재 코드로 보낸다", async () => {
  const { res, telegram } = await submit({
    fields: LP_ALL_FIELDS,
    ua: IG_IOS_UA,
    pageViews: [],
    env: { META_AD_ACCESS_TOKEN: "tok" },
    graph: { error: { message: "Invalid OAuth access token" } },
  });
  assert.equal(res.status, 200);
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  assert.ok(lead.includes("├ 캠페인: 통합 랜딩 (lp-all)"), lead);
  assert.ok(lead.includes("└ 광고명: P-1"), lead);
});

test("랜딩 접수 알림: 같은 소재 코드가 여러 광고에 있으면 광고명을 고르지 않는다", async () => {
  const { telegram } = await submit({
    fields: LP_ALL_FIELDS,
    ua: IG_IOS_UA,
    pageViews: [],
    env: { META_AD_ACCESS_TOKEN: "tok" },
    graph: {
      name: "261119_랜딩전환(신규)",
      ads: { data: [{ name: "261119_P1_가" }, { name: "261119_P1_나" }] },
    },
  });
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  assert.ok(lead.includes("├ 캠페인: 261119_랜딩전환(신규)"), lead);
  assert.ok(lead.includes("└ 광고명: P-1"), lead);
});

// ─── 방문 경로(여러 번 온 접수자) ─────────────────────────
// 2026-11-21 실제 접수 건의 방문 기록 모양: Meta 광고로 랜딩에 두 번 들어왔다가
// 인스타 마케팅 계정 프로필 링크로 다시 와서 접수했다.

test("방문 경로: 30분 공백으로 회차를 나누고 진입 단서·페이지 순서를 남긴다", () => {
  const now = Date.parse("2026-11-21T04:22:54Z");
  const visits = groupVisits(
    [
      { CreatedAt: "2026-11-21T04:20:36Z", Page: "/pages/estimates" },
      { CreatedAt: "2026-11-21T04:19:27Z", Page: "/pages/about" },
      { CreatedAt: "2026-11-21T04:19:25Z", Page: "/", UtmSource: "instagram-marketing", UtmMedium: "organic", UtmCampaign: "ig-mkt-main" },
      { CreatedAt: "2026-11-10T04:24:34Z", Page: "/lp/all", Referrer: "m.facebook.com", UtmSource: "meta", UtmMedium: "paid", UtmCampaign: "lp-all" },
      { CreatedAt: "2026-11-03T04:58:11Z", Page: "/lp/bundang", Referrer: "m.facebook.com", UtmSource: "meta", UtmMedium: "paid", UtmCampaign: "lp-bd" },
      { CreatedAt: "2026-11-03T04:31:50Z", Page: "/lp/gangnam", Referrer: "instagram.com", UtmSource: "meta", UtmMedium: "paid", UtmCampaign: "lp-gn" },
      { CreatedAt: "2026-11-03T04:31:45Z", Page: "/lp/gangnam", Referrer: "instagram.com", UtmSource: "meta", UtmMedium: "paid", UtmCampaign: "lp-gn" },
      { CreatedAt: "2026-10-01T00:00:00Z", Page: "/" },
    ],
    now,
  );
  assert.equal(visits.length, 3, "30일 밖 방문은 빼고 세 회차로 묶는다");
  assert.deepEqual(visits[0].pages, ["/lp/gangnam", "/lp/bundang"]);
  assert.equal(visits[0].utmCampaign, "lp-gn", "진입 단서는 회차의 첫 출처 행이다");
  assert.equal(visits[0].current, false);
  assert.equal(visits[1].utmCampaign, "lp-all");
  assert.equal(visits[2].utmSource, "instagram-marketing");
  assert.deepEqual(visits[2].pages, ["/", "/pages/about", "/pages/estimates"]);
  assert.equal(visits[2].current, true, "마지막 기록이 30분 안이면 이번 방문이다");
});

test("여러 번 온 접수자는 알림에 방문 경로(회차·진입·본 페이지)가 붙는다", async () => {
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  const day = 24 * 60 * 60_000;
  const ad = (campaign, referrer) => ({ Referrer: referrer, UtmSource: "meta", UtmMedium: "paid", UtmCampaign: campaign });
  const { res, telegram } = await submit({
    fields: {
      ...BASE_FIELDS,
      utm_source: "instagram-marketing",
      utm_medium: "organic",
      utm_campaign: "ig-mkt-main",
    },
    ua: IG_ANDROID_UA,
    pageViews: [
      { CreatedAt: iso(60_000), EventType: "page_view", Page: "/pages/estimates" },
      { CreatedAt: iso(2 * 60_000), EventType: "page_view", Page: "/pages/about" },
      { CreatedAt: iso(3 * 60_000), EventType: "page_view", Page: "/", UtmSource: "instagram-marketing", UtmMedium: "organic", UtmCampaign: "ig-mkt-main" },
      { CreatedAt: iso(11 * day), EventType: "page_view", Page: "/lp/all", ...ad("lp-all", "m.facebook.com") },
      { CreatedAt: iso(18 * day - 26 * 60_000), EventType: "page_view", Page: "/lp/bundang", ...ad("lp-bd", "m.facebook.com") },
      { CreatedAt: iso(18 * day), EventType: "page_view", Page: "/lp/gangnam", ...ad("lp-gn", "instagram.com") },
    ],
  });
  assert.equal(res.status, 200);
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  assert.ok(lead.includes("├ 방문횟수: 3회 (재방문 · 첫 방문"));
  const block = lead.split("🛤 <b>방문 경로</b>\n")[1];
  assert.ok(block, "방문 경로 블록이 없다");
  const rows = block.split("\n");
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^├ 1회차 \d+\/\d+ \d{2}:\d{2} · Meta 광고 · 서울 랜딩 \(lp-gn\) · 서울 랜딩 → 판교 랜딩$/);
  assert.match(rows[1], /^├ 2회차 \d+\/\d+ \d{2}:\d{2} · Meta 광고 · 통합 랜딩 \(lp-all\) · 통합 랜딩$/);
  assert.match(rows[2], /^└ 3회차\(이번\) \d+\/\d+ \d{2}:\d{2} · IG마케팅 \(ig-mkt-main\) · 홈 → 회사소개 → 견적문의$/);
  assert.ok(lead.indexOf("🧭 <b>방문정보</b>") < lead.indexOf("🛤 <b>방문 경로</b>"), "방문정보 다음에 온다");
});

test("방문 경로: 페이지가 많으면 앞 3개·뒤 3개만, 회차가 많으면 첫 회차와 최근 회차만", async () => {
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  const hour = 60 * 60_000;
  const many = ["/", "/pages/about", "/pages/portfolio", "/pages/project-flow", "/pages/community", "/pages/about", "/pages/portfolio", "/pages/project-flow", "/pages/estimates"];
  const current = many.map((Page, i) => ({ CreatedAt: iso((many.length - i) * 60_000), EventType: "page_view", Page }));
  const earlier = Array.from({ length: 7 }, (_, i) => ({ CreatedAt: iso((i + 1) * 5 * hour), EventType: "page_view", Page: "/" }));
  const { telegram } = await submit({ fields: { ...BASE_FIELDS }, ua: SAFARI_IOS_UA, pageViews: [...current, ...earlier] });
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  const rows = lead.split("🛤 <b>방문 경로</b>\n")[1].split("\n");
  assert.equal(rows.length, 6, "첫 회차 + 생략 줄 + 최근 4회차");
  assert.match(rows[0], /^├ 1회차 /);
  assert.equal(rows[1], "├ … 3회 생략");
  assert.match(rows[5], /^└ 8회차\(이번\) .* · 직접 방문 · 홈 → 회사소개 → 포트폴리오 → …3쪽 → 포트폴리오 → 진행절차 → 견적문의$/);
});

// ─── 바이럴 채널(매거진 랜딩) ─────────────────────────
// 2026-11-21: 바이럴 링크는 utm_source 를 정확히 viral-blog·viral-insta·viral-thread 로 싣고
// /lp/mag(utm_campaign gn-mag)로 들어온다. 인스타·스레드·네이버 블로그 안에서 눌러 리퍼러가
// 그쪽이어도 접수 Source·FirstSource 는 바이럴 키여야 한다.

test("바이럴 utm_source 3종은 리퍼러가 인스타·스레드·네이버 블로그여도 접수 출처가 바이럴이다", async () => {
  const cases = [
    ["viral-blog", "m.blog.naver.com", "viral_blog", "바이럴 블로그"],
    ["viral-insta", "instagram.com", "viral_insta", "바이럴 인스타"],
    ["viral-thread", "www.threads.com", "viral_threads", "바이럴 스레드"],
  ];
  for (const [utmSource, referrer, key, label] of cases) {
    const { res, created } = await submit({
      fields: { ...BASE_FIELDS, utm_source: utmSource, utm_medium: "viral", utm_campaign: "gn-mag" },
      ua: IG_IOS_UA,
      pageViews: [
        {
          CreatedAt: new Date(Date.now() - 60_000).toISOString(),
          EventType: "page_view",
          Page: "/lp/mag",
          Referrer: referrer,
          UtmSource: utmSource,
          UtmMedium: "viral",
          UtmCampaign: "gn-mag",
        },
      ],
    });
    assert.equal(res.status, 200);
    assert.equal(created[0].Source, key, `${utmSource} 끝 출처`);
    assert.equal(created[0].Platform, label);
    assert.equal(created[0].FirstSource, key, `${utmSource} 첫 출처`);
    assert.equal(created[0].FirstPlatform, label);
  }
});

test("utm_source 가 없거나 바이럴 값과 다르면 인스타·스레드·네이버 블로그는 예전대로 Meta·Naver 다", async () => {
  const cases = [
    ["m.blog.naver.com", "naver"],
    ["instagram.com", "meta"],
    ["www.threads.com", "meta"],
  ];
  for (const [referrer, key] of cases) {
    const { created } = await submit({
      fields: { ...BASE_FIELDS },
      ua: SAFARI_IOS_UA,
      pageViews: [
        { CreatedAt: new Date(Date.now() - 60_000).toISOString(), EventType: "page_view", Page: "/lp/mag", Referrer: referrer },
      ],
    });
    assert.equal(created[0].Source, "homepage", referrer);
    assert.equal(created[0].FirstSource, key, referrer);
  }
  // 정확히 같지 않으면 바이럴이 아니다
  const { created } = await submit({
    fields: { ...BASE_FIELDS, utm_source: "viral-instagram", utm_campaign: "gn-mag" },
    ua: SAFARI_IOS_UA,
    pageViews: [],
  });
  assert.equal(created[0].Source, "meta");
});

test("방문 경로: 바이럴 링크로 온 회차는 '바이럴 ○○ (gn-mag) · 매거진 랜딩'으로 적는다", async () => {
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  const day = 24 * 60 * 60_000;
  const viral = (utmSource, referrer) => ({ Page: "/lp/mag", Referrer: referrer, UtmSource: utmSource, UtmMedium: "viral", UtmCampaign: "gn-mag" });
  const { telegram } = await submit({
    fields: { ...BASE_FIELDS },
    ua: SAFARI_IOS_UA,
    pageViews: [
      { CreatedAt: iso(60_000), EventType: "page_view", Page: "/pages/estimates" },
      { CreatedAt: iso(2 * 60_000), EventType: "page_view", Page: "/" },
      { CreatedAt: iso(2 * day), EventType: "page_view", ...viral("viral-thread", "www.threads.com") },
      { CreatedAt: iso(5 * day), EventType: "page_view", ...viral("viral-blog", "m.blog.naver.com") },
    ],
  });
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  const block = lead.split("🛤 <b>방문 경로</b>\n")[1];
  assert.ok(block, "방문 경로 블록이 없다");
  const rows = block.split("\n");
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^├ 1회차 \d+\/\d+ \d{2}:\d{2} · 바이럴 블로그 \(gn-mag\) · 매거진 랜딩$/);
  assert.match(rows[1], /^├ 2회차 \d+\/\d+ \d{2}:\d{2} · 바이럴 스레드 \(gn-mag\) · 매거진 랜딩$/);
  assert.match(rows[2], /^└ 3회차\(이번\) \d+\/\d+ \d{2}:\d{2} · 직접 방문 · 홈 → 견적문의$/);
});

// ─── 네이버 GFA 광고(통합 랜딩) ─────────────────────────
// 2026-11-26: 네이버 성과형 디스플레이 광고는 /lp/all 로 보내고 utm_source 를 정확히 naver-gfa 로
// 싣는다(utm_medium paid, utm_campaign gfa-conv). naver 가 들어 있어도 검색·블로그(naver)와
// 합치지 않고 접수 Source·FirstSource 를 naver_gfa 로 남긴다.

test("utm_source naver-gfa 는 리퍼러가 네이버여도 접수 출처가 네이버 GFA 다", async () => {
  const { res, created, telegram } = await submit({
    fields: {
      ...BASE_FIELDS,
      address: "",
      form_type: "lp_all",
      utm_source: "naver-gfa",
      utm_medium: "paid",
      utm_campaign: "gfa-conv",
    },
    ua: SAFARI_IOS_UA,
    pageViews: [
      {
        CreatedAt: new Date(Date.now() - 60_000).toISOString(),
        EventType: "page_view",
        Page: "/lp/all",
        Referrer: "m.naver.com",
        UtmSource: "naver-gfa",
        UtmMedium: "paid",
        UtmCampaign: "gfa-conv",
      },
    ],
  });
  assert.equal(res.status, 200);
  assert.equal(created[0].Source, "naver_gfa", "끝 출처");
  assert.equal(created[0].Platform, "네이버 GFA");
  assert.equal(created[0].Campaign, "gfa-conv");
  assert.equal(created[0].FirstSource, "naver_gfa", "첫 출처");
  assert.equal(created[0].FirstPlatform, "네이버 GFA");
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  assert.match(lead, /출처: 네이버 GFA/);
  assert.match(lead, /캠페인: gfa-conv/);
  assert.doesNotMatch(lead, /Meta 광고/);
});

test("utm_source 가 naver-gfa 와 정확히 같지 않거나 없으면 네이버 유입은 예전대로 Naver 다", async () => {
  // 비슷해도 정확히 같지 않으면 네이버 GFA 가 아니다
  for (const utmSource of ["naver", "naver-gfa-x"]) {
    const { created } = await submit({
      fields: { ...BASE_FIELDS, utm_source: utmSource, utm_medium: "paid", utm_campaign: "gfa-conv" },
      ua: SAFARI_IOS_UA,
      pageViews: [],
    });
    assert.equal(created[0].Source, "naver", utmSource);
    assert.equal(created[0].Platform, "Naver", utmSource);
  }
  // utm_source 없이 네이버에서 넘어온 방문은 끝 출처 homepage · 첫 출처 naver 그대로다
  const { created } = await submit({
    fields: { ...BASE_FIELDS },
    ua: SAFARI_IOS_UA,
    pageViews: [
      { CreatedAt: new Date(Date.now() - 60_000).toISOString(), EventType: "page_view", Page: "/lp/all", Referrer: "m.search.naver.com" },
    ],
  });
  assert.equal(created[0].Source, "homepage");
  assert.equal(created[0].FirstSource, "naver");
});

test("방문 경로: 네이버 GFA 광고로 온 회차는 '네이버 GFA (gfa-conv) · 통합 랜딩'으로 적는다", async () => {
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  const day = 24 * 60 * 60_000;
  const { telegram } = await submit({
    fields: { ...BASE_FIELDS },
    ua: SAFARI_IOS_UA,
    pageViews: [
      { CreatedAt: iso(60_000), EventType: "page_view", Page: "/pages/estimates" },
      { CreatedAt: iso(2 * 60_000), EventType: "page_view", Page: "/" },
      {
        CreatedAt: iso(3 * day),
        EventType: "page_view",
        Page: "/lp/all",
        Referrer: "m.naver.com",
        UtmSource: "naver-gfa",
        UtmMedium: "paid",
        UtmCampaign: "gfa-conv",
      },
    ],
  });
  const lead = telegram.find((t) => t.includes("신규 상담 신청"));
  const block = lead.split("🛤 <b>방문 경로</b>\n")[1];
  assert.ok(block, "방문 경로 블록이 없다");
  const rows = block.split("\n");
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^├ 1회차 \d+\/\d+ \d{2}:\d{2} · 네이버 GFA \(gfa-conv\) · 통합 랜딩$/);
  assert.match(rows[1], /^└ 2회차\(이번\) \d+\/\d+ \d{2}:\d{2} · 직접 방문 · 홈 → 견적문의$/);
});
