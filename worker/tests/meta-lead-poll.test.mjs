// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Meta 리드 폴링 전환 가드                                              ║
// ║  1) leadId 는 영구 멱등키다 — 48h 겹침 조회/재시도에도 중복 접수·중복    ║
// ║     문자 0. (Cache API 10분 dedup 은 폴링에 불충분해서 도입한 장치)      ║
// ║  2) 폴러가 보내는 Graph API 원본 field_data 를 워커가 매핑한다.          ║
// ║     매핑 안 된 질문도 Detail 에 원문 보존(유실 0).                       ║
// ║  3) D1 저장 실패 시에만 502 — 저장 안 됐는데 200 금지(불변규칙 2).       ║
// ╚══════════════════════════════════════════════════════════════════════╝
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  handleMetaLead,
  handleMetaLeadHeartbeat,
  handleMetaFormSchema,
  mapFieldData,
  matchStandardField,
  normalizeLeadPayload,
  normalizeQuestionKey,
  serializeFormFields,
} from "../src/routes/meta-lead.js";
import { isPhoneQuestion } from "../../workers/imac-meta-lead-poller/worker.mjs";

const SECRET = "test-meta-lead-secret";

let previousCaches;
let previousFetch;

beforeEach(() => {
  previousCaches = globalThis.caches;
  previousFetch = globalThis.fetch;
  const store = new Map();
  globalThis.caches = {
    async open() {
      return {
        async match(req) {
          return store.get(req.url) || null;
        },
        async put(req, res) {
          store.set(req.url, res);
        },
      };
    },
  };
  // 외부 호출(텔레그램·SENS·CAPI)은 전부 스텁 — 실발송 금지
  globalThis.fetch = async () => Response.json({ ok: true });
});

afterEach(() => {
  globalThis.caches = previousCaches;
  globalThis.fetch = previousFetch;
});

function pollerRequest(payload) {
  return new Request("https://api.example.test/api/meta-lead", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-meta-lead-secret": SECRET,
    },
    body: JSON.stringify(payload),
  });
}

function fakeServices({ created = [], existing = [] } = {}) {
  return {
    estimates: {
      async list({ where = {}, limit = 10 } = {}) {
        const records = existing
          .filter((r) =>
            Object.entries(where).every(([k, v]) => r.fields[k] === v),
          )
          .slice(0, limit);
        return { records };
      },
      async create(fields) {
        if (
          fields.MetaLeadId &&
          existing.some((r) => r.fields.MetaLeadId === fields.MetaLeadId)
        ) {
          throw new Error("D1_ERROR: UNIQUE constraint failed: Estimates.MetaLeadId");
        }
        const record = { id: `rec${created.length + 1}`, fields };
        created.push(fields);
        existing.push(record);
        return record;
      },
    },
    smsLogs: { async create() {} },
    intakeEvents: { async create() {} },
    systemHeartbeats: { async create() {} },
    metaFormSchemas: fakeFormSchemas(),
  };
}

// 폼 스키마 스냅샷 저장소 목 — 최초 등록/변경 감지 분기를 그대로 재현한다.
function fakeFormSchemas(rows = []) {
  return {
    rows,
    async list({ where = {}, limit = 10 } = {}) {
      return {
        records: rows
          .filter((r) => Object.entries(where).every(([k, v]) => r.fields[k] === v))
          .slice(0, limit),
      };
    },
    async create(fields) {
      const record = { id: `form${rows.length + 1}`, fields };
      rows.push(record);
      return record;
    },
    async update(id, fields) {
      const record = rows.find((r) => r.id === id);
      if (record) record.fields = { ...record.fields, ...fields };
      return record;
    },
  };
}

const POLLER_LEAD = {
  leadId: "1234567890",
  createdTime: "2026-07-25T02:00:00+0000",
  platform: "ig",
  campaignName: "260710_잠재고객(전환/브랜딩)",
  adName: "브랜딩용",
  fieldData: [
    { name: "성함을 입력해주세요", values: ["임혜진"] },
    { name: "연락처", values: ["010-6624-6615"] },
    { name: "지역을 선택해주세요", values: ["강남구"] },
    { name: "공간 유형", values: ["아파트"] },
    { name: "평수", values: ["30~40평"] },
    { name: "시공 예정일", values: ["2026년 9월"] },
    { name: "궁금한 점", values: ["욕실만 따로 가능한가요"] },
  ],
};

test("field_data 매핑 — 한글 질문 키를 표준 필드로, 미매핑은 extras 로 보존", () => {
  const mapped = mapFieldData(POLLER_LEAD.fieldData);
  assert.equal(mapped.name, "임혜진");
  assert.equal(mapped.phone, "010-6624-6615");
  assert.equal(mapped.location, "강남구");
  assert.equal(mapped.spaceType, "아파트");
  assert.equal(mapped.area, "30~40평");
  assert.equal(mapped.scheduledDate, "2026년 9월");
  assert.deepEqual(mapped.extras, ["궁금한 점: 욕실만 따로 가능한가요"]);
});

// 실측(2026-07-25): 페이지의 ACTIVE 폼 2개는 표준 질문 key 가 서로 다르다.
//   260428(운영중) full_name/phone_number · 260302(구형) 이름/전화번호
// 둘 다 매핑돼야 하고, 괄호 안내문은 매칭에서 제외돼야 한다.
test("[guard] 운영중 폼(260428) 실제 질문 key 전부 매핑", () => {
  const m = mapFieldData(
    [
      "공간_형태",
      "면적",
      "가용_예산(프로젝트_방향성_설정을_위해_대략적으로_기입해주세요)",
      "인테리어를_진행할_지역(시/구/동_순)",
      "인테리어_시작일정(ex:00년_00월)",
      "full_name",
      "phone_number",
    ].map((name) => ({ name, values: ["값"] })),
  );
  assert.equal(m.spaceType, "값");
  assert.equal(m.area, "값");
  assert.equal(m.budget, "값", "괄호 안내문 때문에 예산이 다른 필드로 새면 안 됨");
  assert.equal(m.location, "값");
  assert.equal(m.scheduledDate, "값");
  assert.equal(m.name, "값");
  assert.equal(m.phone, "값");
  assert.deepEqual(m.extras, []);
});

test("[guard] 구형 폼(260302) 한글 표준 key(이름·전화번호)도 매핑", () => {
  const m = mapFieldData(
    ["공간_형태", "면적", "이름", "전화번호"].map((name) => ({
      name,
      values: ["값"],
    })),
  );
  assert.equal(m.name, "값");
  assert.equal(m.phone, "값");
  assert.deepEqual(m.extras, []);
});

test("같은 스타일의 문구 변형(규모·착공·휴대폰·용도)도 매핑", () => {
  const m = mapFieldData(
    [
      "공간_용도",
      "규모(평형_기준)",
      "희망_예산대",
      "현장_주소(시/구/동)",
      "착공_희망일",
      "성함",
      "휴대폰_번호",
      "이메일_주소",
    ].map((name) => ({ name, values: ["값"] })),
  );
  for (const f of [
    "spaceType",
    "area",
    "budget",
    "location",
    "scheduledDate",
    "name",
    "phone",
    "email",
  ]) {
    assert.equal(m[f], "값", `${f} 미매핑`);
  }
});

test("자유 기입 질문은 매핑하지 않고 Detail 원문으로 남긴다", () => {
  const m = mapFieldData([
    { name: "기타_문의사항(자유_기입)", values: ["욕실만 가능한가요"] },
  ]);
  assert.deepEqual(m.extras, ["기타_문의사항(자유_기입): 욕실만 가능한가요"]);
});

test("질문 key 정규화 — 괄호 안내문 제거 + 밑줄을 공백으로", () => {
  assert.equal(
    normalizeQuestionKey("가용_예산(프로젝트_방향성_설정을_위해_기입)"),
    "가용 예산",
  );
  assert.equal(normalizeQuestionKey("full_name"), "full name");
});

test("first_name/last_name 만 있는 폼도 이름을 조립한다", () => {
  const mapped = mapFieldData([
    { name: "first_name", values: ["혜진"] },
    { name: "last_name", values: ["임"] },
    { name: "phone_number", values: ["+821066246615"] },
  ]);
  assert.equal(mapped.name, "임 혜진");
  assert.equal(mapped.phone, "+821066246615");
});

test("[guard] Campaign 컬럼은 Make 시절과 동일하게 '광고명'을 유지한다", () => {
  const lead = normalizeLeadPayload({
    adName: "260723_잠재고객(전환/브랜딩) 브랜딩용(수정)",
    campaignName: "260710_잠재고객(전환/브랜딩)",
  });
  assert.equal(lead.campaign, "260723_잠재고객(전환/브랜딩) 브랜딩용(수정)");
  assert.equal(lead.campaignName, "260710_잠재고객(전환/브랜딩)");
});

test("Make 정규화 페이로드는 그대로 우선한다(전환기 공존)", () => {
  const lead = normalizeLeadPayload({
    name: "메이크고객",
    phone: "01011112222",
    location: "판교",
    campaign: "makeCampaign",
    timestamp: "2026-07-25T01:00:00.000Z",
  });
  assert.equal(lead.leadId, "");
  assert.equal(lead.name, "메이크고객");
  assert.equal(lead.campaign, "makeCampaign");
  assert.deepEqual(lead.extras, []);
});

test("[guard] 폴러 리드 저장 — MetaLeadId 기록 + 미매핑 질문 Detail 보존", async () => {
  const created = [];
  const tasks = [];
  const res = await handleMetaLead(
    pollerRequest(POLLER_LEAD),
    { META_LEAD_SECRET: SECRET },
    { waitUntil: (t) => tasks.push(t) },
    fakeServices({ created }),
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(body.id, "rec1");
  assert.equal(created.length, 1);
  assert.equal(created[0].MetaLeadId, "1234567890");
  assert.equal(created[0].Platform, "instagram");
  assert.equal(created[0].Source, "meta");
  assert.equal(created[0].Status, "접수대기");
  assert.equal(created[0].Campaign, "브랜딩용");
  assert.match(created[0].Detail, /캠페인: 260710_잠재고객\(전환\/브랜딩\)/);
  assert.match(created[0].Detail, /궁금한 점: 욕실만 따로 가능한가요/);
});

test("[guard] 같은 leadId 재전송은 중복으로 끝난다 — 재저장·재발송 0", async () => {
  const created = [];
  const existing = [];
  const services = fakeServices({ created, existing });
  const tasks = [];
  const env = { META_LEAD_SECRET: SECRET };

  const first = await handleMetaLead(
    pollerRequest(POLLER_LEAD),
    env,
    { waitUntil: (t) => tasks.push(t) },
    services,
  );
  assert.equal(first.status, 200);

  const second = await handleMetaLead(
    pollerRequest(POLLER_LEAD),
    env,
    { waitUntil: (t) => tasks.push(t) },
    services,
  );
  const body = await second.json();
  await Promise.allSettled(tasks);

  assert.equal(second.status, 200);
  assert.equal(body.duplicate, true);
  assert.equal(created.length, 1, "중복 리드가 두 번 저장되면 안 됨");
});

test("[guard] 유니크 인덱스 충돌(동시 전송)도 중복으로 흡수한다", async () => {
  const created = [];
  const existing = [
    { id: "recPre", fields: { MetaLeadId: "1234567890", Name: "임혜진" } },
  ];
  // list 는 못 찾는데 create 에서만 충돌하는 상황(경합) 재현
  const services = fakeServices({ created, existing });
  const originalList = services.estimates.list;
  let firstCall = true;
  services.estimates.list = async (args) => {
    if (firstCall) {
      firstCall = false;
      return { records: [] };
    }
    return originalList(args);
  };

  const tasks = [];
  const res = await handleMetaLead(
    pollerRequest(POLLER_LEAD),
    { META_LEAD_SECRET: SECRET },
    { waitUntil: (t) => tasks.push(t) },
    services,
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(body.duplicate, true);
  assert.equal(body.id, "recPre");
  assert.equal(created.length, 0);
});

test("[invariant] D1 저장 실패 시 200 금지 — 502 + R2 원문 보관", async () => {
  const puts = [];
  const tasks = [];
  const services = fakeServices();
  services.estimates.create = async () => {
    throw new Error("D1_ERROR: database is locked");
  };

  const res = await handleMetaLead(
    pollerRequest(POLLER_LEAD),
    {
      META_LEAD_SECRET: SECRET,
      IMAGES: {
        put(key, body) {
          puts.push({ key, body });
          return Promise.resolve();
        },
      },
    },
    { waitUntil: (t) => tasks.push(t) },
    services,
  );
  await Promise.allSettled(tasks);

  assert.equal(res.status, 502);
  assert.equal(puts.length, 1, "저장 실패 원문이 R2 에 남아야 함");
  assert.match(puts[0].key, /estimates-attempts\/.*meta_d1_failed\.json$/);
});

// 폴러가 워커보다 좁은 규칙을 쓰면 새 폼('핸드폰번호' 등)에서 폴러만 전화를 못 읽는다.
// 폴러는 별도 배포물이라 import 로 규칙 일치를 강제한다.
// Make→Apps Script 가 보내던 Meta 리드 내부 알림 메일을 워커가 흡수했다(2026-07-25).
// Make 를 껐으므로 이게 빠지면 담당자가 Meta 리드 메일을 못 받는다.
test("[guard] Meta 리드도 내부 알림 메일을 보낸다(홈페이지와 같은 템플릿)", async () => {
  const sent = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("gmail.googleapis.com")) sent.push(init);
    if (u.includes("oauth2.googleapis.com")) {
      return Response.json({ access_token: "at" });
    }
    return Response.json({ ok: true });
  };
  const tasks = [];
  try {
    await handleMetaLead(
      pollerRequest(POLLER_LEAD),
      {
        META_LEAD_SECRET: SECRET,
        GMAIL_USER: "day1design.co@gmail.com",
        GMAIL_CLIENT_ID: "cid",
        GMAIL_CLIENT_SECRET: "csec",
        GMAIL_REFRESH_TOKEN: "rt",
        GMAIL_NOTIFY_TO: "gahyun.co@gmail.com",
      },
      { waitUntil: (t) => tasks.push(t) },
      fakeServices(),
    );
    await Promise.allSettled(tasks);
  } finally {
    globalThis.fetch = prevFetch;
  }

  assert.equal(sent.length, 1, "Meta 리드 내부 알림 메일이 나가야 함");
  const raw = Buffer.from(
    JSON.parse(sent[0].body).raw.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
  assert.match(raw, /gahyun\.co@gmail\.com/);
  assert.match(raw, /Consultation Alert/, "홈페이지와 같은 템플릿");
  assert.match(raw, /임혜진/);
});

test("[guard] 폴러와 워커의 전화 질문 인식 규칙이 일치한다", () => {
  for (const key of [
    "phone_number",
    "Phone Number",
    "전화번호",
    "연락처",
    "휴대폰_번호",
    "핸드폰번호",
    "mobile",
  ]) {
    assert.equal(
      mapFieldData([{ name: key, values: ["010-6624-6615"] }]).phone,
      "010-6624-6615",
      `워커 미인식: ${key}`,
    );
    assert.ok(isPhoneQuestion(key), `폴러 미인식: ${key}`);
  }
});

test("[invariant] 필수정보 없는 리드도 버리지 않는다 — R2 원문 + D1 '오류' 카드", async () => {
  const created = [];
  const puts = [];
  const tasks = [];
  const res = await handleMetaLead(
    pollerRequest({
      ...POLLER_LEAD,
      leadId: "noPhone1",
      fieldData: [
        { name: "성함을 입력해주세요", values: ["임혜진"] },
        { name: "연락_가능한_번호(휴대폰)", values: ["010-6624-6615"] },
        { name: "궁금한 점", values: ["욕실"] },
      ],
    }),
    {
      META_LEAD_SECRET: SECRET,
      IMAGES: {
        put(key, body) {
          puts.push({ key, body });
          return Promise.resolve();
        },
      },
    },
    { waitUntil: (t) => tasks.push(t) },
    fakeServices({ created }),
  );
  const body = await res.json();
  await Promise.allSettled(tasks);

  assert.equal(res.status, 400, "정상 접수로 위장하면 안 됨(불변규칙 2)");
  assert.equal(body.captured, true, "폴러가 재시도를 멈출 근거");
  assert.equal(puts.length, 1, "원문이 R2 에 남아야 함");
  assert.match(puts[0].key, /estimates-attempts\/.*meta_invalid\.json$/);
  assert.equal(created.length, 1, "접수관리에 '오류' 카드로 보여야 함");
  assert.equal(created[0].Status, "오류");
  assert.equal(created[0].Source, "meta");
  assert.equal(created[0].MetaLeadId, "noPhone1", "재전송돼도 카드 1장");
  assert.match(created[0].Detail, /meta_invalid/);
  assert.match(created[0].Detail, /궁금한 점: 욕실/, "원문 질문이 보존돼야 함");
});

test("[guard] 캡처된 '오류' 리드가 재전송돼도 카드는 한 장", async () => {
  const created = [];
  const existing = [];
  const services = fakeServices({ created, existing });
  const tasks = [];
  const env = { META_LEAD_SECRET: SECRET };
  const invalid = {
    ...POLLER_LEAD,
    leadId: "noPhone2",
    fieldData: [{ name: "성함", values: ["임혜진"] }],
  };

  await handleMetaLead(pollerRequest(invalid), env, {
    waitUntil: (t) => tasks.push(t),
  }, services);
  await Promise.allSettled(tasks);
  const second = await handleMetaLead(pollerRequest(invalid), env, {
    waitUntil: (t) => tasks.push(t),
  }, services);
  await Promise.allSettled(tasks);

  assert.equal((await second.json()).duplicate, true);
  assert.equal(created.length, 1);
});

test("시크릿 불일치는 403 — 저장 시도 없음", async () => {
  const created = [];
  const res = await handleMetaLead(
    new Request("https://api.example.test/api/meta-lead", {
      method: "POST",
      headers: { "content-type": "application/json", "x-meta-lead-secret": "wrong" },
      body: JSON.stringify(POLLER_LEAD),
    }),
    { META_LEAD_SECRET: SECRET },
    { waitUntil() {} },
    fakeServices({ created }),
  );
  assert.equal(res.status, 403);
  assert.equal(created.length, 0);
});

test("하트비트 — 시크릿 검증 후 SystemHeartbeats 기록", async () => {
  const rows = [];
  const tasks = [];
  const services = fakeServices();
  services.systemHeartbeats.create = async (fields) => {
    rows.push(fields);
    return { id: "recHb", fields };
  };

  const res = await handleMetaLeadHeartbeat(
    new Request("https://api.example.test/api/meta-lead/heartbeat", {
      method: "POST",
      headers: { "x-meta-lead-secret": SECRET },
      body: JSON.stringify({ status: "ok", detail: "forms=1 fetched=2 delivered=1" }),
    }),
    { META_LEAD_SECRET: SECRET, DB: { prepare: () => ({ bind: () => ({ run: async () => {} }) }) } },
    { waitUntil: (t) => tasks.push(t) },
    services,
  );
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Source, "meta-lead-poller");
  assert.equal(rows[0].Status, "ok");
});

test("하트비트 시크릿 불일치는 403", async () => {
  const res = await handleMetaLeadHeartbeat(
    new Request("https://api.example.test/api/meta-lead/heartbeat", {
      method: "POST",
      headers: { "x-meta-lead-secret": "nope" },
      body: "{}",
    }),
    { META_LEAD_SECRET: SECRET },
    { waitUntil() {} },
    fakeServices(),
  );
  assert.equal(res.status, 403);
});

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  입력폼 변경 자동대응 가드                                             ║
// ║  Meta 쪽 인스턴트폼 질문이 조정돼도 코드를 고치지 않고 상담카드·알림이   ║
// ║  따라가야 한다. 아래 4가지가 그 계약이다.                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

test("[guard] 같은 표준필드에 걸리는 질문이 둘이면 뒤엣것도 보존한다(유실 0)", () => {
  // 폼에 질문을 추가하면 흔히 생기는 상황. 예전에는 두 번째 답변이 그냥 사라졌다.
  const mapped = mapFieldData([
    { name: "가용 예산", values: ["3천만원"] },
    { name: "예산 관련 요청사항", values: ["분할 납부 가능한지"] },
  ]);
  assert.equal(mapped.budget, "3천만원");
  assert.deepEqual(mapped.extras, ["예산 관련 요청사항: 분할 납부 가능한지"]);
});

test("[guard] 폼 응답 원문(pairs)은 질문·답변·매핑필드를 그대로 보존한다", () => {
  const mapped = mapFieldData(POLLER_LEAD.fieldData);
  assert.equal(mapped.pairs.length, POLLER_LEAD.fieldData.length);
  assert.deepEqual(mapped.pairs[0], {
    q: "성함을 입력해주세요",
    a: "임혜진",
    f: "name",
  });
  // 매핑 안 된 질문은 f 가 빈 문자열 — 상담카드가 이 항목만 '폼 응답'으로 보여준다.
  const free = mapped.pairs.find((p) => p.q === "궁금한 점");
  assert.deepEqual(free, { q: "궁금한 점", a: "욕실만 따로 가능한가요", f: "" });

  // 직렬화는 값 상한을 먼저 걸어 JSON 이 깨지지 않는다.
  const json = serializeFormFields([{ q: "q".repeat(500), a: "a".repeat(900), f: "" }]);
  const parsed = JSON.parse(json);
  assert.equal(parsed[0].q.length, 200);
  assert.equal(parsed[0].a.length, 500);
  assert.equal(serializeFormFields([]), "");
});

test("[guard] 새 질문은 D1 원문(MetaFieldData)과 텔레그램 알림에 자동으로 실린다", async () => {
  const created = [];
  const tasks = [];
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.telegram.org")) {
      sent.push(JSON.parse(init?.body || "{}").text || "");
    }
    return Response.json({ ok: true });
  };

  const lead = {
    ...POLLER_LEAD,
    fieldData: [
      ...POLLER_LEAD.fieldData,
      // 폼 조정으로 새로 생긴 질문 — 워커 매핑 규칙에는 없다.
      { name: "반려동물을 키우시나요", values: ["고양이 2마리"] },
    ],
  };
  const res = await handleMetaLead(
    pollerRequest(lead),
    {
      META_LEAD_SECRET: SECRET,
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "-100123",
    },
    { waitUntil: (t) => tasks.push(t) },
    fakeServices({ created }),
  );
  await Promise.allSettled(tasks);

  assert.equal(res.status, 200);
  const pairs = JSON.parse(created[0].MetaFieldData);
  assert.ok(
    pairs.some((p) => p.q === "반려동물을 키우시나요" && p.a === "고양이 2마리"),
    "새 질문 응답이 MetaFieldData 원문에 남아야 한다",
  );
  const leadMsg = sent.find((t) => t.includes("신규 상담 신청")) || "";
  assert.match(leadMsg, /폼 응답/);
  assert.match(leadMsg, /반려동물을 키우시나요: 고양이 2마리/);
});

test("[guard] 폼 질문 변경 감지 — 최초는 조용, 변경 시에만 알린다", async () => {
  const sent = [];
  const leadChannel = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("api.telegram.org")) {
      const text = JSON.parse(init?.body || "{}").text || "";
      if (u.includes("infra-token")) sent.push(text);
      else leadChannel.push(text);
    }
    return Response.json({ ok: true });
  };
  const env = {
    META_LEAD_SECRET: SECRET,
    TELEGRAM_BOT_TOKEN: "lead-token",
    TELEGRAM_CHAT_ID: "-100123",
    INFRA_BOT_TOKEN: "infra-token",
    INFRA_CHAT_ID: "-100999",
  };
  const services = fakeServices();
  const tasks = [];
  const post = (questions) =>
    handleMetaFormSchema(
      new Request("https://api.example.test/api/meta-lead/form-schema", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-meta-lead-secret": SECRET,
        },
        body: JSON.stringify({
          formId: "9001",
          formName: "인테리어 상담",
          questions,
        }),
      }),
      env,
      { waitUntil: (t) => tasks.push(t) },
      services,
    );

  const first = await (await post(["성함", "연락처", "지역"])).json();
  await Promise.allSettled(tasks);
  assert.equal(first.first, true);
  assert.equal(sent.length, 0, "최초 스냅샷은 알리지 않는다(새 폼은 폴러가 이미 알림)");

  // 같은 질문 재보고 — 20분마다 와도 조용해야 한다
  const again = await (await post(["성함", "연락처", "지역"])).json();
  assert.equal(again.changed, false);
  assert.equal(sent.length, 0);

  // 질문 추가 + 삭제
  const changed = await (
    await post(["성함", "연락처", "반려동물을 키우시나요"])
  ).json();
  await Promise.allSettled(tasks);
  assert.equal(changed.changed, true);
  assert.equal(changed.added, 1);
  assert.equal(changed.removed, 1);
  assert.equal(changed.unmapped, 1);
  const msg = sent.join("\n");
  assert.match(msg, /입력폼 질문 변경 감지/);
  assert.match(msg, /추가: 반려동물을 키우시나요/);
  assert.match(msg, /삭제: 지역/);
  assert.match(msg, /이름·연락처 매핑 정상/);
  // 접수 알림 채널에 섞이면 신규 상담 신청이 폼 공지에 묻힌다 — 인프라봇 전용이어야 한다.
  assert.deepEqual(leadChannel, [], "폼 구조 알림이 접수 채널로 새면 안 된다");
});

test("[guard] 이름·연락처를 못 찾는 폼은 최초 보고에서도 즉시 경고한다", async () => {
  // 이 폼의 리드는 전량 '오류' 카드가 된다. 조용히 넘어가면 접수가 통째로 멈춘 걸 뒤늦게 안다.
  const sent = [];
  const leadChannel = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("api.telegram.org")) {
      const text = JSON.parse(init?.body || "{}").text || "";
      if (u.includes("infra-token")) sent.push(text);
      else leadChannel.push(text);
    }
    return Response.json({ ok: true });
  };
  const tasks = [];
  const res = await handleMetaFormSchema(
    new Request("https://api.example.test/api/meta-lead/form-schema", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-meta-lead-secret": SECRET,
      },
      body: JSON.stringify({
        formId: "9002",
        formName: "이벤트 응모",
        questions: ["닉네임", "응모 사유"],
      }),
    }),
    {
      META_LEAD_SECRET: SECRET,
      TELEGRAM_BOT_TOKEN: "lead-token",
      TELEGRAM_CHAT_ID: "-100123",
      INFRA_BOT_TOKEN: "infra-token",
      INFRA_CHAT_ID: "-100999",
    },
    { waitUntil: (t) => tasks.push(t) },
    fakeServices(),
  );
  const body = await res.json();
  await Promise.allSettled(tasks);
  assert.deepEqual(body.critical, ["name", "phone"]);
  assert.match(sent.join("\n"), /전량 '오류' 카드로 저장됩니다/);
  assert.deepEqual(leadChannel, [], "폼 구조 경고도 인프라봇 전용");
});

test("[guard] 매핑 판정은 워커 규칙 한 곳에서만 한다", () => {
  // 폼 스키마 알림과 실제 리드 매핑이 같은 함수를 쓰는지 — 어긋나면 "알림은 된다는데
  // 실제로는 안 되는" 상태가 된다.
  assert.equal(matchStandardField("성함을 입력해주세요"), "name");
  assert.equal(matchStandardField("연락처"), "phone");
  assert.equal(matchStandardField("first_name"), "name");
  assert.equal(matchStandardField("반려동물을 키우시나요"), "");
  const mapped = mapFieldData([{ name: "연락처", values: ["01066246615"] }]);
  assert.equal(mapped.pairs[0].f, matchStandardField("연락처"));
});

test("[guard] 같은 뜻의 새 문구는 표준 필드로 자동 흡수된다", () => {
  // 폼 문구를 바꿔도(질문을 다시 쓰거나 표현을 손봐도) 요약 필드가 계속 채워져야 한다.
  const mapped = mapFieldData([
    { name: "고객명을 남겨주세요", values: ["임혜진"] },
    { name: "휴대전화", values: ["010-6624-6615"] },
    { name: "언제 시공을 원하시나요", values: ["10월 중"] },
    { name: "예상 비용은 얼마정도 생각하시나요", values: ["4천"] },
    { name: "거주지가 어디신가요", values: ["분당구"] },
  ]);
  assert.equal(mapped.name, "임혜진");
  assert.equal(mapped.phone, "010-6624-6615");
  assert.equal(mapped.scheduledDate, "10월 중");
  assert.equal(mapped.budget, "4천");
  assert.equal(mapped.location, "분당구");
  assert.deepEqual(mapped.extras, [], "전부 흡수돼야 한다");
});
