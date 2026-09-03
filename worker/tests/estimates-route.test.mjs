import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { sign as signJwt } from "../src/lib/jwt.js";
import { handleEstimates } from "../src/routes/estimates.js";

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

function decodeRawEmail(raw) {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

test("estimate submit stores WebP files and sends internal plus customer emails", async () => {
  const uploads = [];
  const created = [];
  const gmailMessages = [];
  const waitUntilTasks = [];

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "test-access-token" });
    }
    if (href === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
      gmailMessages.push(JSON.parse(init.body));
      return Response.json({ id: `msg-${gmailMessages.length}` });
    }
    return Response.json({ ok: true });
  };

  const form = new FormData();
  form.append("name", "테스트고객");
  form.append("phone", "010-1234-5678");
  form.append("email", "customer@example.com");
  form.append("privacy_agreed", "true");
  form.append("space_type", "아파트");
  form.append("space_size", "30~40평");
  form.append("address", "서울 강남구 테헤란로 1");
  form.append("schedule", "2026년 8월");
  form.append("referral", "네이버");
  form.append("budget", "3000만원");
  form.append("branch", "강남점");
  form.append("detail", "첨부 테스트");
  for (let i = 1; i <= 5; i += 1) {
    form.append(
      "concept_files",
      new File([`webp-${i}`], `concept-${i}.webp`, { type: "image/webp" }),
    );
  }

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.12" },
    }),
    {
      GMAIL_CLIENT_ID: "client-id",
      GMAIL_CLIENT_SECRET: "client-secret",
      GMAIL_REFRESH_TOKEN: "refresh-token",
      GMAIL_USER: "sender@example.com",
      GMAIL_NOTIFY_TO: "internal@example.com",
    },
    {
      waitUntil(task) {
        waitUntilTasks.push(task);
      },
    },
    {
      media: {
        async upload(key, body, opts) {
          uploads.push({ key, body, opts });
          return `https://assets.example.test/${key}`;
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "rec12345678901234", fields };
        },
      },
    },
  );

  const body = await res.json();
  await Promise.all(waitUntilTasks);
  const decodedEmails = gmailMessages.map((message) =>
    decodeRawEmail(message.raw),
  );
  const internalEmail = decodedEmails.find((email) =>
    email.includes("To: internal@example.com, sender@example.com"),
  );
  const customerEmail = decodedEmails.find((email) =>
    email.includes("To: customer@example.com"),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(body, {
    ok: true,
    id: "rec12345678901234",
    received: true,
  });
  assert.equal(uploads.length, 5);
  assert.equal(JSON.parse(created[0].ConceptFiles).length, 5);
  assert.equal(JSON.parse(created[0].FloorPlans).length, 0);
  assert.equal(created[0].Detail, "가용예산: 3000만원\n첨부 테스트");
  assert.equal(created[0].Source, "homepage");
  assert.equal(created[0].Platform, "Homepage");
  assert.equal(gmailMessages.length, 2);
  assert.ok(internalEmail);
  assert.ok(internalEmail.includes("Content-Type: multipart/alternative"));
  assert.ok(internalEmail.includes("Content-Type: text/html; charset=UTF-8"));
  assert.ok(internalEmail.includes("Consultation Alert"));
  assert.ok(internalEmail.includes("Day One Design"));
  assert.ok(internalEmail.includes("파일: 컨셉 5 / 평면도 0"));
  assert.ok(internalEmail.includes("3000만원"));
  assert.ok(internalEmail.includes("컨셉 5 / 도면 0"));
  assert.ok(internalEmail.includes("관리자 확인"));
  assert.ok(customerEmail);
  assert.ok(customerEmail.includes("Content-Type: multipart/alternative"));
  assert.ok(customerEmail.includes("Content-Type: text/html; charset=UTF-8"));
  assert.ok(customerEmail.includes("Receipt"));
  assert.ok(customerEmail.includes("DAYONE DESIGN 상담 신청이 접수되었습니다."));
  assert.ok(customerEmail.includes("문의를 남겨주셔서 감사합니다."));
  assert.ok(customerEmail.includes("지점: 강남점"));
  assert.ok(!customerEmail.includes("관리자 확인"));
  assert.ok(!customerEmail.includes("Campaign</b>"));
});

test("estimate submit stores normalized attribution source", async () => {
  const created = [];
  const waitUntilTasks = [];
  const form = new FormData();
  form.append("name", "출처고객");
  form.append("phone", "010-2222-3333");
  form.append("email", "source@example.com");
  form.append("privacy_agreed", "true");
  form.append("space_type", "아파트");
  form.append("space_size", "30평");
  form.append("address", "서울 강남구 테헤란로 2");
  form.append("schedule", "2026년 9월");
  form.append("referral", "포털검색");
  form.append("branch", "강남점");
  form.append("budget", "2500만원");
  form.append("source", "meta");
  form.append("campaign", "spring-search");
  form.append("utm_source", "facebook");
  form.append("utm_medium", "paid_social");
  form.append("utm_campaign", "autumn-interior");
  form.append("_fb_campaign", "Autumn Campaign");
  form.append("_fb_campaign_id", "cmp-101");
  form.append("_fb_adset", "Gangnam 30s");
  form.append("_fb_adset_id", "set-202");
  form.append("_fb_ad", "Wood Creative");
  form.append("_fb_adid", "ad-303");
  form.append("_fbclid", "fb-click-404");
  form.append("_fbp", "fb.1.123.456");
  form.append("_fbc", "fb.1.123.fb-click-404");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.20" },
    }),
    {},
    {
      waitUntil(task) {
        waitUntilTasks.push(task);
      },
    },
    {
      media: {
        async upload() {
          throw new Error("unexpected upload");
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recSource0000001", fields };
        },
      },
    },
  );

  await Promise.all(waitUntilTasks);
  assert.equal(res.status, 200);
  assert.equal(created[0].Source, "meta");
  assert.equal(created[0].Platform, "Meta");
  assert.equal(created[0].Campaign, "spring-search");
  assert.equal(created[0].UtmSource, "facebook");
  assert.equal(created[0].UtmMedium, "paid_social");
  assert.equal(created[0].UtmCampaign, "autumn-interior");
  assert.equal(created[0].MetaCampaign, "Autumn Campaign");
  assert.equal(created[0].MetaCampaignId, "cmp-101");
  assert.equal(created[0].MetaAdset, "Gangnam 30s");
  assert.equal(created[0].MetaAdsetId, "set-202");
  assert.equal(created[0].MetaAd, "Wood Creative");
  assert.equal(created[0].MetaAdId, "ad-303");
  assert.equal(created[0].Fbclid, "fb-click-404");
  assert.equal(created[0].Fbp, "fb.1.123.456");
  assert.equal(created[0].Fbc, "fb.1.123.fb-click-404");
});

// Meta 광고 식별자 저장을 검증하려고 위 테스트의 source 를 google 에서 meta 로
// 바꾸면서 구글 유입 정규화(google → Google) 검증이 함께 사라졌다. 그 커버리지를
// 여기서 되살린다 — 광고 칼럼이 늘어도 기존 채널 정규화는 그대로여야 한다.
test("estimate submit keeps normalizing non-Meta attribution sources", async () => {
  const created = [];
  const waitUntilTasks = [];
  const form = new FormData();
  form.append("name", "검색고객");
  form.append("phone", "010-4444-5555");
  form.append("email", "search@example.com");
  form.append("privacy_agreed", "true");
  form.append("space_type", "아파트");
  form.append("space_size", "30평");
  form.append("address", "서울 강남구 테헤란로 3");
  form.append("schedule", "2026년 9월");
  form.append("referral", "포털검색");
  form.append("branch", "강남점");
  form.append("budget", "2500만원");
  form.append("source", "google");
  form.append("campaign", "spring-search");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.21" },
    }),
    {},
    {
      waitUntil(task) {
        waitUntilTasks.push(task);
      },
    },
    {
      media: {
        async upload() {
          throw new Error("unexpected upload");
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recSource0000002", fields };
        },
      },
    },
  );

  await Promise.all(waitUntilTasks);
  assert.equal(res.status, 200);
  assert.equal(created[0].Source, "google");
  assert.equal(created[0].Platform, "Google");
  assert.equal(created[0].Campaign, "spring-search");
  // 광고 식별자가 없는 유입은 새 칼럼이 빈 문자열이어야 한다(누락이 아니라 빈값).
  assert.equal(created[0].MetaAdId, "");
  assert.equal(created[0].Fbclid, "");
});

test("estimate submit requires a project budget", async () => {
  const form = new FormData();
  form.append("name", "예산누락");
  form.append("phone", "010-1111-2222");
  form.append("email", "missing-budget@example.com");
  form.append("privacy_agreed", "true");
  form.append("space_type", "아파트");
  form.append("space_size", "30평");
  form.append("address", "서울 강남구 테헤란로 3");
  form.append("schedule", "2026년 10월");
  form.append("referral", "인스타그램");
  form.append("branch", "판교점");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.21" },
    }),
    {},
    { waitUntil() {} },
    {
      media: {
        async upload() {
          throw new Error("unexpected upload");
        },
      },
      estimates: {
        async create() {
          throw new Error("unexpected create");
        },
      },
    },
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.deepEqual(body.errors, ["budget"]);
});

test("estimate submit requires project context fields", async () => {
  const form = new FormData();
  form.append("name", "필수누락");
  form.append("phone", "010-1111-2222");
  form.append("privacy_agreed", "true");
  form.append("budget", "협의");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.22" },
    }),
    {},
    { waitUntil() {} },
    {
      media: {
        async upload() {
          throw new Error("unexpected upload");
        },
      },
      estimates: {
        async create() {
          throw new Error("unexpected create");
        },
      },
    },
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  // 간소화 폼: 공간유형·문의경로는 더 이상 필수가 아님
  assert.deepEqual(body.errors, [
    "space_size",
    "address",
    "schedule",
    "branch",
  ]);
});

test("estimate submit accepts simplified form without email/space_type/referral", async () => {
  const created = [];
  const waitUntilTasks = [];
  const telegramTexts = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("api.telegram.org")) {
      try {
        telegramTexts.push(JSON.parse(init.body));
      } catch {}
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true });
  };

  const form = new FormData();
  form.append("name", "간소화고객");
  form.append("phone", "010-6624-6615");
  form.append("privacy_agreed", "true");
  form.append("space_size", "30~40평");
  form.append("address", "서울 강남구 논현로 562");
  form.append("address_detail", "2층");
  form.append("schedule", "2026년 8월");
  form.append("branch", "강남점");
  form.append("budget", "5000만원");
  form.append("detail", "전체공사, 우드&화이트 컨셉");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.99" },
    }),
    { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-100" },
    {
      waitUntil(task) {
        waitUntilTasks.push(task);
      },
    },
    {
      media: {
        async upload() {
          throw new Error("unexpected upload");
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recSimple0000001", fields };
        },
      },
    },
  );

  const body = await res.json();
  await Promise.allSettled(waitUntilTasks);

  assert.equal(res.status, 200);
  assert.equal(body.received, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].SpaceSize, "30~40평");
  assert.equal(created[0].Branch, "강남점");
  assert.equal(created[0].Email, "");
  // 텔레그램 알림에 평형대/지점/가용예산이 포함되고 빈 이메일 줄은 없어야 함
  const tgText = telegramTexts.map((m) => m.text || "").join("\n");
  assert.ok(tgText.includes("평형대: 30~40평"));
  assert.ok(tgText.includes("지점: 강남점"));
  assert.ok(tgText.includes("가용예산: 5000만원"));
  assert.ok(!tgText.includes("이메일:"));
  assert.ok(!tgText.includes("파일:"));
});

test("estimate submit allows normal repeated checks after the rate-limit reset", async () => {
  const cacheStore = new Map();
  const created = [];
  const waitUntilTasks = [];
  globalThis.caches = {
    default: {
      async match(key) {
        const value = cacheStore.get(String(key.url || key));
        return value === undefined ? null : new Response(value);
      },
      async put(key, res) {
        cacheStore.set(String(key.url || key), await res.text());
      },
      async delete(key) {
        cacheStore.delete(String(key.url || key));
        return true;
      },
    },
  };

  for (let i = 0; i < 12; i += 1) {
    const form = new FormData();
    form.append("name", `반복고객${i}`);
    form.append("phone", `010-2222-${String(3000 + i).padStart(4, "0")}`);
    form.append("email", `repeat-${i}@example.com`);
    form.append("privacy_agreed", "true");
    form.append("space_type", "아파트");
    form.append("space_size", "30평");
    form.append("address", "서울 강남구 테헤란로 4");
    form.append("schedule", "2026년 11월");
    form.append("referral", "네이버");
    form.append("branch", "강남점");
    form.append("budget", "협의");

    const res = await handleEstimates(
      new Request("https://api.example.test/api/estimates", {
        method: "POST",
        body: form,
        headers: { "cf-connecting-ip": "203.0.113.42" },
      }),
      {},
      {
        waitUntil(task) {
          waitUntilTasks.push(task);
        },
      },
      {
        media: {
          async upload() {
            throw new Error("unexpected upload");
          },
        },
        estimates: {
          async create(fields) {
            created.push(fields);
            return { id: `recRepeat${String(i).padStart(7, "0")}`, fields };
          },
        },
      },
    );

    assert.equal(res.status, 200);
  }

  await Promise.allSettled(waitUntilTasks);
  assert.equal(created.length, 12);
});

test("estimate submit bypasses rate limit for an allowlisted IP", async () => {
  const cacheStore = new Map([
    ["https://rate-limit.internal/estimate-submit-v2:203.0.113.77", "999"],
  ]);
  const created = [];
  globalThis.caches = {
    default: {
      async match(key) {
        const value = cacheStore.get(String(key.url || key));
        return value === undefined ? null : new Response(value);
      },
      async put(key, res) {
        cacheStore.set(String(key.url || key), await res.text());
      },
      async delete(key) {
        cacheStore.delete(String(key.url || key));
        return true;
      },
    },
  };

  const form = new FormData();
  form.append("name", "허용고객");
  form.append("phone", "010-7777-7777");
  form.append("email", "allowlisted@example.com");
  form.append("privacy_agreed", "true");
  form.append("space_type", "아파트");
  form.append("space_size", "30평");
  form.append("address", "서울 강남구 테헤란로 5");
  form.append("schedule", "2026년 12월");
  form.append("referral", "지인소개");
  form.append("branch", "지점 무관");
  form.append("budget", "5000만원");

  const res = await handleEstimates(
    new Request("https://api.example.test/api/estimates", {
      method: "POST",
      body: form,
      headers: { "cf-connecting-ip": "203.0.113.77" },
    }),
    { ESTIMATE_RATE_LIMIT_ALLOWLIST: "203.0.113.77" },
    { waitUntil() {} },
    {
      media: {
        async upload() {
          throw new Error("unexpected upload");
        },
      },
      estimates: {
        async create(fields) {
          created.push(fields);
          return { id: "recAllow00000001", fields };
        },
      },
    },
  );

  assert.equal(res.status, 200);
  assert.equal(created.length, 1);
});

test("estimate delete removes stored file URLs from R2", async () => {
  const deletedUrls = [];
  const waitUntilTasks = [];
  const id = "rec12345678901234";
  const jwt = await signJwt({ sub: "admin" }, "jwt-secret", 3600);

  const res = await handleEstimates(
    new Request(`https://api.example.test/api/estimates/${id}`, {
      method: "DELETE",
      headers: { cookie: `day1_admin=${encodeURIComponent(jwt)}` },
    }),
    { JWT_SECRET: "jwt-secret" },
    {
      waitUntil(task) {
        waitUntilTasks.push(task);
      },
    },
    {
      estimates: {
        async get(recordId) {
          assert.equal(recordId, id);
          return {
            id,
            fields: {
              ConceptFiles: JSON.stringify([
                "https://assets.example.test/estimates/demo/concept-001.webp",
              ]),
              FloorPlans: JSON.stringify([
                "https://assets.example.test/estimates/demo/plan-001.webp",
              ]),
            },
          };
        },
        async delete(recordId) {
          assert.equal(recordId, id);
          return { deleted: true, id };
        },
      },
      media: {
        async deleteMany(urls) {
          deletedUrls.push(...urls);
        },
      },
    },
  );

  const body = await res.json();
  await Promise.all(waitUntilTasks);

  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, deleted: true, id });
  assert.deepEqual(deletedUrls, [
    "https://assets.example.test/estimates/demo/concept-001.webp",
    "https://assets.example.test/estimates/demo/plan-001.webp",
  ]);
});
