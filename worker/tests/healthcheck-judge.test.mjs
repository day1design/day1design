// 헬스 판정식 가드 — "조용한 정상" 오보를 막는다.
//  - 접수: 옛 판정식은 오류 건수만 봐서 폼이 완전히 죽어도 ok 였다(사각지대).
//  - 문자: 자격증명만 보던 것을 실제 발송 결과로 판정한다.
//  - 폴러: 아이맥이 꺼지면 리드 0건과 구분되지 않으므로 하트비트 신선도로 본다.
//  - 채널: 헬스 리포트는 인프라봇으로 일원화(고객 접수 알림은 기존 채널 유지).
import assert from "node:assert/strict";
import test from "node:test";

import {
  healthReportTarget,
  judgeIntakeGap,
  judgePollerFreshness,
  judgeSmsDelivery,
} from "../src/lib/healthcheck.js";

test("접수 — 평소 유입이 있는데 하루 넘게 끊기면 경고, 이틀이면 오류", () => {
  assert.equal(judgeIntakeGap({ dailyAvg: 4.4, gapHours: 3, err: 0 }), "ok");
  assert.equal(judgeIntakeGap({ dailyAvg: 4.4, gapHours: 26, err: 0 }), "warn");
  assert.equal(judgeIntakeGap({ dailyAvg: 4.4, gapHours: 50, err: 0 }), "fail");
});

test("접수 — 원래 유입이 드문 계정의 무접수는 오탐하지 않는다", () => {
  assert.equal(judgeIntakeGap({ dailyAvg: 0.2, gapHours: 200, err: 0 }), "ok");
});

test("접수 — '오류' 레코드가 있으면 경고", () => {
  assert.equal(judgeIntakeGap({ dailyAvg: 4.4, gapHours: 1, err: 2 }), "warn");
});

test("문자 — 접수는 있는데 발송 0건이면 전면 중단(fail)", () => {
  assert.equal(judgeSmsDelivery({ intake: 12, ok: 0, fail: 0, skip: 0 }), "fail");
});

test("문자 — 실패/건너뜀이 섞이면 경고, 전건 정상이면 ok", () => {
  assert.equal(judgeSmsDelivery({ intake: 12, ok: 11, fail: 1, skip: 0 }), "warn");
  assert.equal(judgeSmsDelivery({ intake: 12, ok: 11, fail: 0, skip: 1 }), "warn");
  assert.equal(judgeSmsDelivery({ intake: 12, ok: 12, fail: 0, skip: 0 }), "ok");
});

test("문자 — 접수 자체가 없으면 발송 0 이어도 정상", () => {
  assert.equal(judgeSmsDelivery({ intake: 0, ok: 0, fail: 0, skip: 0 }), "ok");
});

const NOW = Date.parse("2026-07-25T04:00:00.000Z");

test("폴러 — 하트비트가 없으면 폴링 미도입으로 보고 오탐하지 않는다", () => {
  const j = judgePollerFreshness({ lastAt: "", lastStatus: "", nowMs: NOW });
  assert.equal(j.adopted, false);
  assert.equal(j.status, "ok");
});

test("폴러 — 20분 주기 정상 신호는 ok, 90분 초과 침묵은 fail", () => {
  assert.equal(
    judgePollerFreshness({
      lastAt: "2026-07-25T03:45:00.000Z",
      lastStatus: "ok",
      nowMs: NOW,
    }).status,
    "ok",
  );
  assert.equal(
    judgePollerFreshness({
      lastAt: "2026-07-25T02:00:00.000Z",
      lastStatus: "ok",
      nowMs: NOW,
    }).status,
    "fail",
  );
});

test("폴러 — 마지막 보고가 실패면 신선해도 fail", () => {
  assert.equal(
    judgePollerFreshness({
      lastAt: "2026-07-25T03:55:00.000Z",
      lastStatus: "fail",
      nowMs: NOW,
    }).status,
    "fail",
  );
});

test("헬스 리포트 채널 — 인프라봇 우선, 미설정 시에만 폴백", () => {
  assert.deepEqual(
    healthReportTarget({
      INFRA_BOT_TOKEN: "infra",
      INFRA_CHAT_ID: "-100448",
      HEALTHCHECK_BOT_TOKEN: "hc",
      HEALTHCHECK_CHAT_ID: "-3855",
    }),
    { botToken: "infra", chatId: "-100448" },
  );
  assert.deepEqual(
    healthReportTarget({ HEALTHCHECK_BOT_TOKEN: "hc", HEALTHCHECK_CHAT_ID: "-3855" }),
    { botToken: "hc", chatId: "-3855" },
  );
  assert.deepEqual(
    healthReportTarget({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_ADMIN_CHAT_ID: "-1" }),
    { botToken: "t", chatId: "-1" },
  );
  assert.equal(healthReportTarget({}), null);
});
