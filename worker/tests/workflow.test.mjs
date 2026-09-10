import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { sign } from "../src/lib/jwt.js";
import { handleWorkflow, MAX_MARKDOWN_BYTES, sendWorkflowDocument } from "../src/routes/workflow.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0098_workflow_delivery.sql", import.meta.url), "utf8"));
  const db = {
    sqlite,
    prepare(sql) {
      let args = [];
      const query = { bind(...values) { args = values; return query; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
      };
      return query;
    },
    async batch(queries) {
      return queries.map((query) => {
        const original = query;
        return original.all ? original.all() : { results: [] };
      });
    },
  };
  db.prepare = (sql) => {
    let args = [];
    const query = { bind(...values) { args = values; return query; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return query;
  };
  db.batch = async (queries) => Promise.all(queries.map((query) => query.all()));
  return db;
}

async function request(body, authenticated = true) {
  const headers = { "content-type": "application/json" };
  if (authenticated) headers.authorization = `Bearer ${await sign({ sub: "admin" }, "fixture-secret")}`;
  return new Request("https://admin.day1design.co.kr/api/admin/workflow", { method: "POST", headers, body: JSON.stringify(body) });
}

const base = { markdown: "# 업무 플로우\n\n- 디자인팀 검토", revision: "r03", requestId: "11111111-1111-4111-8111-111111111111" };
const env = () => ({ DB: fixture(), JWT_SECRET: "fixture-secret", INFRA_BOT_TOKEN: "infra-token", INFRA_CHAT_ID: "-1001" });

test("requires admin auth and validates bounded workflow input", async () => {
  const e = env();
  assert.equal((await handleWorkflow(await request(base, false), e)).status, 401);
  const malformedCookie = new Request("https://admin.day1design.co.kr/api/workflow/save", { method: "POST", headers: { "content-type": "application/json", cookie: "day1_admin=%E0%A4%A" }, body: JSON.stringify(base) });
  assert.equal((await handleWorkflow(malformedCookie, e)).status, 401);
  assert.equal((await handleWorkflow(await request({ ...base, requestId: "bad" }), e)).status, 400);
  assert.equal((await handleWorkflow(await request([base]), e)).status, 400);
  assert.equal((await handleWorkflow(await request({ ...base, extra: true }), e)).status, 400);
  assert.equal((await handleWorkflow(await request({ ...base, markdown: "x".repeat(MAX_MARKDOWN_BYTES + 1) }), e)).status, 400);
  assert.equal((await handleWorkflow(await request({ ...base, revision: "v03" }), e)).status, 400);
});

test("claims once, sends a markdown document to INFRA, and returns sent message id", async () => {
  const e = env(); let calls = 0; let sent;
  const result = await handleWorkflow(await request(base), e, { sendDocument: async (_env, markdown, revision) => { calls++; sent = { markdown, revision }; return { messageId: 77 }; } });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true, status: "sent", messageId: 77 });
  assert.equal(calls, 1); assert.deepEqual(sent, { markdown: base.markdown, revision: "r03" });
  const row = e.DB.sqlite.prepare("SELECT status,message_id FROM WorkflowDeliveries WHERE request_id=?").get(base.requestId);
  assert.equal(row.status, "sent");
  assert.equal(row.message_id, 77);
});

test("duplicate sent request is idempotent and does not resend", async () => {
  const e = env(); let calls = 0; const send = async () => { calls++; return { messageId: 8 }; };
  await handleWorkflow(await request(base), e, { sendDocument: send });
  const duplicate = await handleWorkflow(await request(base), e, { sendDocument: send });
  assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).duplicate, true); assert.equal(calls, 1);
  const mismatch = await handleWorkflow(await request({ ...base, markdown: "# 다른 문서" }), e, { sendDocument: send });
  assert.equal(mismatch.status, 409); assert.equal(calls, 1);
});

test("unknown transport result is terminal and is never automatically resent", async () => {
  const e = env(); let calls = 0; const send = async () => { calls++; throw new Error("network"); };
  const first = await handleWorkflow(await request(base), e, { sendDocument: send });
  assert.equal(first.status, 503); assert.equal((await first.json()).error.includes("not be resent"), true);
  const second = await handleWorkflow(await request(base), e, { sendDocument: send });
  assert.equal(second.status, 409); assert.equal(calls, 1);
  assert.equal(e.DB.sqlite.prepare("SELECT status FROM WorkflowDeliveries WHERE request_id=?").get(base.requestId).status, "unknown");
});

test("actor and global recent delivery limits are bounded", async () => {
  const e = env(); const first = { ...base, requestId: "22222222-2222-4222-8222-222222222222" };
  await handleWorkflow(await request(first), e, { now: Date.parse("2026-09-11T00:00:00Z"), sendDocument: async () => ({ messageId: 1 }) });
  const second = await handleWorkflow(await request({ ...base, requestId: "33333333-3333-4333-8333-333333333333" }), e, { now: Date.parse("2026-09-11T00:00:01Z"), sendDocument: async () => ({ messageId: 2 }) });
  assert.equal(second.status, 429);
});

test("atomic claim permits only one of concurrent distinct requests", async () => {
  const e = env(); let calls = 0;
  const send = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 5)); return { messageId: 3 }; };
  const [first, second] = await Promise.all([
    handleWorkflow(await request({ ...base, requestId: "44444444-4444-4444-8444-444444444444" }), e, { sendDocument: send, now: Date.parse("2026-09-11T00:00:00Z") }),
    handleWorkflow(await request({ ...base, requestId: "55555555-5555-4555-8555-555555555555" }), e, { sendDocument: send, now: Date.parse("2026-09-11T00:00:00Z") }),
  ]);
  assert.equal([first.status, second.status].filter((status) => status === 200).length, 1);
  assert.equal(calls, 1);
});

test("delivery cooldown predicates use the actor and created indexes", () => {
  const e = env();
  const actorPlan = e.DB.sqlite.prepare("EXPLAIN QUERY PLAN SELECT 1 FROM WorkflowDeliveries WHERE actor_id=? AND created_at>? LIMIT 1").all("admin", "2026-09-11T00:00:00.000Z");
  const globalPlan = e.DB.sqlite.prepare("EXPLAIN QUERY PLAN SELECT 1 FROM WorkflowDeliveries WHERE created_at>? LIMIT 1").all("2026-09-11T00:00:00.000Z");
  assert.ok(actorPlan.some((row) => String(row.detail).includes("idx_workflow_delivery_actor_created")));
  assert.ok(globalPlan.some((row) => String(row.detail).includes("idx_workflow_delivery_created")));
});

test("send transport uses only INFRA credentials and multipart markdown document", async () => {
  let observed;
  const receipt = await sendWorkflowDocument(
    { INFRA_BOT_TOKEN: "infra-token", INFRA_CHAT_ID: "-1001", TELEGRAM_BOT_TOKEN: "wrong-token", TELEGRAM_CHAT_ID: "wrong-chat" },
    base.markdown,
    base.revision,
    async (url, init) => {
      observed = { url, form: init.body };
      return new Response(JSON.stringify({ ok: true, result: { message_id: 91 } }), { status: 200 });
    },
  );
  assert.deepEqual(receipt, { messageId: 91 });
  assert.match(observed.url, /botinfra-token\/sendDocument$/);
  assert.equal(observed.form.get("chat_id"), "-1001");
  assert.equal(observed.form.get("document").name, "day1workflow-r03.md");
  assert.equal(await observed.form.get("document").text(), base.markdown);
});
