import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

import {
  enqueueMeetingNotifications,
  cancelStaleMeetingNotifications,
  meetingNotificationDueAt,
  planMeetingNotifications,
  renderMeetingTemplate,
  runAdminMeetingReminders,
  sendCalendarTelegram,
  validateMeetingNotificationSettings,
} from "../src/lib/admin-meeting-notifications.js";

const START = "2026-09-20T01:00:00.000Z";
const MEETING = {
  id: "a-1", tenantId: "day1design", version: 3, startsAt: START,
  durationMinutes: 120, bufferMinutes: 60, meetingName: "이니셜미팅",
  typeMarker: "blue", customerName: "홍길동", assignee: "담당자", location: "강남점",
};
const SETTINGS = {
  created: { enabled: true, template: "<b>새 {{meeting_name}}</b> {{date}}" },
  day: { enabled: true, template: "내일 {{meeting_name}} {{date}}" },
  hour: { enabled: true, template: "{{meeting_name}} {{date}} {{start_time}}-{{end_time}} ({{buffer_end}}) {{customer_name}} {{type_marker}}" },
};

let originalFetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("template variables render in KST and escape customer supplied HTML", () => {
  const text = renderMeetingTemplate("<b>{{meeting_name}}</b> {{date}} {{start_time}} {{end_time}} {{buffer_end}} {{customer_name}}", { ...MEETING, customerName: "<고객>" });
  assert.match(text, /이니셜미팅/);
  assert.match(text, /2026\. 09\. 20\. \(일\)/);
  assert.match(text, /10:00 12:00 13:00/);
  assert.match(text, /&lt;고객&gt;/);
  assert.match(text, /&lt;b&gt;이니셜미팅&lt;\/b&gt;/);
});

test("unknown template variables and unknown settings keys are rejected", () => {
  assert.equal(validateMeetingNotificationSettings({}).ok, false);
  assert.equal(validateMeetingNotificationSettings({ ...SETTINGS, extra: true }).ok, false);
  const result = validateMeetingNotificationSettings({ ...SETTINGS, hour: { enabled: true, template: "{{password}}" } });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unknown_template_variable:password"));
});

test("past reminder deadlines are skipped while created is immediate", () => {
  const now = Date.parse("2026-09-20T00:00:00.000Z");
  const plans = planMeetingNotifications({ meeting: MEETING, settings: SETTINGS, now });
  assert.deepEqual(plans.map((p) => p.type), ["created"]);
  assert.equal(meetingNotificationDueAt("hour", START, now), null);
});

test("enqueue creates versioned idempotency keys without sending", async () => {
  const statements = [];
  const db = { prepare(sql) { return { bind(...args) { return { async run() { statements.push({ sql, args }); return { meta: { changes: 1 } }; } }; } }; } };
  const plans = await enqueueMeetingNotifications(db, { meeting: MEETING, settings: SETTINGS, now: Date.parse("2026-09-18T00:00:00.000Z") });
  assert.equal(statements.length, 3);
  assert.equal(plans[0].idempotencyKey, "day1design:a-1:3:telegram:created");
  assert.ok(statements.every((statement) => statement.sql.includes("INSERT OR IGNORE")));
});

test("Telegram sender only accepts an explicit successful API receipt", async () => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 200 });
  assert.equal((await sendCalendarTelegram({ CALENDAR_BOT_TOKEN: "t", CALENDAR_CHAT_ID: "c" }, "x")).accepted, false);
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 });
  const receipt = await sendCalendarTelegram({ CALENDAR_BOT_TOKEN: "t", CALENDAR_CHAT_ID: "c" }, "x");
  assert.deepEqual(receipt, { accepted: true, status: 200, messageId: 7 });
});

function makeSqlite() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE Estimates (id TEXT PRIMARY KEY, CrmTenantId TEXT, ContractAmount INTEGER DEFAULT 0, ContractAt TEXT DEFAULT '', Address TEXT, AddressDetail TEXT, SubmittedAt TEXT, ConsultAt TEXT DEFAULT '', ConsultCancelledAt TEXT DEFAULT '')");
  sqlite.exec(readFileSync(new URL("../migrations/0091_admin_meetings_contracts.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0092_admin_meeting_outbox.sql", import.meta.url), "utf8"));
  const prepare = (sql) => ({ bind(...args) { return { first: async () => sqlite.prepare(sql).get(...args), all: async () => ({ results: sqlite.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes || 0) } }) }; } });
  return { sqlite, DB: { prepare } };
}

test("SQLite outbox claims, deduplicates, cancels stale versions, and dispatches only current enabled rows", async () => {
  const env = makeSqlite();
  env.sqlite.prepare("UPDATE AdminMeetingSettings SET notifications_json=? WHERE id='day1design'").run(JSON.stringify(SETTINGS));
  const now = Date.parse("2026-09-18T00:00:00.000Z");
  await enqueueMeetingNotifications(env.DB, { meeting: MEETING, settings: SETTINGS, now });
  await enqueueMeetingNotifications(env.DB, { meeting: MEETING, settings: SETTINGS, now });
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) n FROM AdminMeetingOutbox").get().n, 3);
  await cancelStaleMeetingNotifications(env.DB, { tenantId: "day1design", meetingId: "a-1", currentVersion: 4, at: now });
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) n FROM AdminMeetingOutbox WHERE status='cancelled'").get().n, 3);
  const sent = [];
  const result = await runAdminMeetingReminders(env, now, { transport: async (text) => { sent.push(text); return { accepted: true }; }, resolveMeeting: async () => ({ ...MEETING, version: 4 }) });
  assert.equal(result.sent, 0);
  assert.equal(sent.length, 0);
});

test("dispatcher retries determinate failures with backoff and blocks unknown delivery outcome", async () => {
  const env = makeSqlite();
  const one = { ...SETTINGS, day: { enabled: false, template: "" }, hour: { enabled: false, template: "" } };
  env.sqlite.prepare("UPDATE AdminMeetingSettings SET notifications_json=? WHERE id='day1design'").run(JSON.stringify(one));
  const now = Date.parse("2026-09-18T00:00:00.000Z");
  await enqueueMeetingNotifications(env.DB, { meeting: MEETING, settings: one, now });
  let calls = 0;
  let result = await runAdminMeetingReminders(env, now, { transport: async () => { calls++; return { accepted: false, reason: "telegram_rejected" }; }, resolveMeeting: async () => MEETING });
  assert.equal(result.retried, 1);
  const next = env.sqlite.prepare("SELECT next_attempt_at FROM AdminMeetingOutbox WHERE status='queued'").get().next_attempt_at;
  result = await runAdminMeetingReminders(env, Date.parse(next) + 1, { transport: async () => ({ accepted: false, reason: "telegram_rejected" }), resolveMeeting: async () => MEETING });
  assert.equal(result.retried, 1);
  const next2 = env.sqlite.prepare("SELECT next_attempt_at FROM AdminMeetingOutbox WHERE status='queued'").get().next_attempt_at;
  result = await runAdminMeetingReminders(env, Date.parse(next2) + 1, { transport: async () => ({ accepted: false, reason: "telegram_rejected" }), resolveMeeting: async () => MEETING });
  assert.equal(result.blocked, 1);
  assert.equal(calls, 1);
  env.sqlite.prepare("UPDATE AdminMeetingOutbox SET status='queued',attempts=0,next_attempt_at=NULL, due_at=? WHERE id=(SELECT id FROM AdminMeetingOutbox LIMIT 1)").run(new Date(now).toISOString());
  result = await runAdminMeetingReminders(env, now, { transport: async () => ({ accepted: false, reason: "delivery_unknown" }), resolveMeeting: async () => MEETING });
  assert.equal(result.blocked, 1);
  assert.equal(env.sqlite.prepare("SELECT status FROM AdminMeetingOutbox WHERE attempts=0 OR last_error='delivery_unknown'").get().status, "blocked");
});
