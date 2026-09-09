import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { curlTelegram } from "./telegram-transport.mjs";

const TOKEN = "123456789:secret_token";

function makeProcess({ code = 0, out = '{"ok":true}', err = "", error, stdinError } = {}) {
  const cp = new EventEmitter();
  cp.stdout = new EventEmitter();
  cp.stderr = new EventEmitter();
  cp.stdin = new EventEmitter();
  cp.stdin.end = (config) => {
    cp.stdin.config = config;
    if (stdinError) cp.stdin.emit("error", stdinError);
    queueMicrotask(() => {
      if (out) cp.stdout.emit("data", out);
      if (err) cp.stderr.emit("data", err);
      if (error) cp.emit("error", error);
      cp.emit("close", code);
    });
  };
  return cp;
}

function depsFor(processes, calls = []) {
  const sleeps = [];
  return {
    calls,
    sleeps,
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return processes.shift();
    },
    sleep: async (delay) => sleeps.push(delay),
  };
}

test("curl 종료코드 35는 1초, 3초 후 재시도하고 세 번째 실패에서 종료한다", async () => {
  const deps = depsFor([
    makeProcess({ code: 35, err: `TLS failed for bot${TOKEN}` }),
    makeProcess({ code: 35, err: `TLS failed for bot${TOKEN}` }),
    makeProcess({ code: 35, err: `TLS failed for bot${TOKEN}` }),
  ]);

  await assert.rejects(
    curlTelegram({ token: TOKEN, chatId: "chat", method: "sendPhoto", lines: [] }, deps),
    (error) => {
      assert.match(error.message, /curl 종료코드 35 \(3회 시도\)/);
      assert.doesNotMatch(error.message, new RegExp(TOKEN));
      assert.doesNotMatch(error.message, /bot\d+:/);
      return true;
    },
  );
  assert.deepEqual(deps.sleeps, [1000, 3000]);
  assert.equal(deps.calls.length, 3);
});

test("curl 종료코드 35는 재시도 후 성공 응답을 반환한다", async () => {
  const deps = depsFor([
    makeProcess({ code: 35, err: "TLS handshake failed" }),
    makeProcess({ out: '{"ok":true,"result":{"message_id":7}}' }),
  ]);
  const result = await curlTelegram(
    { token: TOKEN, chatId: "chat", method: "sendMessage", lines: [] },
    deps,
  );
  assert.deepEqual(result, { ok: true, result: { message_id: 7 } });
  assert.deepEqual(deps.sleeps, [1000]);
  assert.equal(deps.calls.length, 2);
});

for (const code of [28, 56]) {
  test(`curl 종료코드 ${code}는 재시도하지 않는다`, async () => {
    const deps = depsFor([makeProcess({ code, err: "network failure" })]);
    await assert.rejects(
      curlTelegram({ token: TOKEN, chatId: "chat", method: "sendPhoto", lines: [] }, deps),
      new RegExp(`curl 종료코드 ${code} \\(1회 시도\\)`),
    );
    assert.equal(deps.calls.length, 1);
    assert.deepEqual(deps.sleeps, []);
  });
}

test("curl 성공이어도 Telegram API ok:false는 재시도하지 않는다", async () => {
  const deps = depsFor([makeProcess({ out: '{"ok":false,"description":"bad request"}' })]);
  await assert.rejects(
    curlTelegram({ token: TOKEN, chatId: "chat", method: "sendMessage", lines: [] }, deps),
    /sendMessage 실패: bad request/,
  );
  assert.equal(deps.calls.length, 1);
  assert.deepEqual(deps.sleeps, []);
});

test("잘못된 JSON은 응답 원문을 오류에 포함하지 않는다", async () => {
  const body = `not-json ${TOKEN}`;
  const deps = depsFor([makeProcess({ out: body })]);
  await assert.rejects(
    curlTelegram({ token: TOKEN, chatId: "chat", method: "sendMessage", lines: [] }, deps),
    (error) => {
      assert.equal(error.message, "텔레그램 응답을 읽지 못했다: JSON 형식 아님");
      assert.doesNotMatch(error.message, /not-json/);
      assert.doesNotMatch(error.message, new RegExp(TOKEN));
      return true;
    },
  );
});

test("stderr와 API 설명에서 봇 토큰을 마스킹한다", async () => {
  const deps = depsFor([
    makeProcess({ code: 56, err: `failed bot${TOKEN} and ${TOKEN}` }),
  ]);
  await assert.rejects(
    curlTelegram({ token: TOKEN, chatId: "chat", method: "sendMessage", lines: [] }, deps),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(TOKEN));
      assert.doesNotMatch(error.message, /bot\d+:/);
      assert.match(error.message, /\[REDACTED\]/);
      return true;
    },
  );

  const apiDeps = depsFor([
    makeProcess({ out: JSON.stringify({ ok: false, description: `denied bot${TOKEN}` }) }),
  ]);
  await assert.rejects(
    curlTelegram({ token: TOKEN, chatId: "chat", method: "sendMessage", lines: [] }, apiDeps),
    (error) => {
      assert.match(error.message, /sendMessage 실패: denied/);
      assert.doesNotMatch(error.message, new RegExp(TOKEN));
      assert.doesNotMatch(error.message, /bot\d+:/);
      return true;
    },
  );
});

test("토큰은 curl 인자가 아니라 stdin config로만 전달한다", async () => {
  const process = makeProcess();
  const processes = [process];
  const deps = depsFor(processes);
  await curlTelegram({ token: TOKEN, chatId: "chat", method: "sendMessage", lines: ["form = \"text=hello\""] }, deps);
  assert.deepEqual(deps.calls[0].args, ["--disable", "--config", "-"]);
  assert.equal(deps.calls[0].options.stdio.join(","), "pipe,pipe,pipe");
  assert.match(process.stdin.config, new RegExp(`https://api\\.telegram\\.org/bot${TOKEN}/sendMessage`));
});

test("필수 credential이 없으면 spawn하지 않는다", async () => {
  const deps = depsFor([]);
  await assert.rejects(curlTelegram({ token: "", chatId: "chat", method: "sendMessage", lines: [] }, deps), /DAY1_MKT_BOT_TOKEN/);
  await assert.rejects(curlTelegram({ token: TOKEN, chatId: "", method: "sendMessage", lines: [] }, deps), /DAY1_MKT_CHAT_ID/);
  assert.equal(deps.calls.length, 0);
});

test("spawn error를 redaction하고 stdin EPIPE는 정상적인 조기 종료로 무시한다", async () => {
  const spawnError = new Error(`spawn failed for bot${TOKEN}`);
  const deps = depsFor([
    makeProcess({ stdinError: Object.assign(new Error("closed"), { code: "EPIPE" }), error: spawnError }),
  ]);
  await assert.rejects(
    curlTelegram({ token: TOKEN, chatId: "chat", method: "sendMessage", lines: [] }, deps),
    (error) => {
      assert.match(error.message, /spawn failed/);
      assert.doesNotMatch(error.message, new RegExp(TOKEN));
      return true;
    },
  );

  const epipeOnly = depsFor([makeProcess({ stdinError: Object.assign(new Error("closed"), { code: "EPIPE" }) })]);
  await curlTelegram({ token: TOKEN, chatId: "chat", method: "sendMessage", lines: [] }, epipeOnly);
  assert.equal(epipeOnly.calls.length, 1);
});
