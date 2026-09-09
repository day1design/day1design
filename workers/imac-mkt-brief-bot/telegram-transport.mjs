import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export const cq = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");

export async function curlTelegram({ token, chatId, method, lines }, deps = {}) {
  if (!token) throw new Error("DAY1_MKT_BOT_TOKEN 이 없다");
  if (!chatId) throw new Error("DAY1_MKT_CHAT_ID 가 없다");
  const redact = (value) => String(value).split(token).join("[REDACTED]").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]");
  const config = [
    `url = "https://api.telegram.org/bot${cq(token)}/${method}"`,
    `form = "chat_id=${cq(chatId)}"`,
    ...lines.map((line) => `form = "${line}"`),
    "silent",
    "show-error",
    "connect-timeout = 15",
    "max-time = 90",
  ].join("\n");

  for (let attempt = 1; attempt <= 3; attempt++) {
    const { code, out, err } = await new Promise((resolve, reject) => {
      const cp = (deps.spawn || spawn)("curl", ["--disable", "--config", "-"], { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      cp.stdout.on("data", (data) => (out += data));
      cp.stderr.on("data", (data) => (err += data));
      cp.on("error", (error) => reject(new Error(redact(error.message))));
      // Early curl exit can close stdin before the config write finishes.
      cp.stdin.on("error", (error) => {
        if (error.code !== "EPIPE") reject(new Error(redact(error.message)));
      });
      cp.on("close", (code) => resolve({ code, out, err }));
      cp.stdin.end(config);
    });
    // TLS handshake failure occurs before the HTTPS request is sent. Do not
    // retry timeouts/response failures: Telegram may already have sent the photo.
    if (code === 35 && attempt < 3) {
      await (deps.sleep || sleep)(attempt === 1 ? 1000 : 3000);
      continue;
    }
    if (code !== 0) {
      throw new Error(`curl 종료코드 ${code} (${attempt}회 시도): ${redact(err.trim()).slice(0, 500) || "상세 오류 없음"}`);
    }
    let result;
    try {
      result = JSON.parse(out);
    } catch {
      throw new Error("텔레그램 응답을 읽지 못했다: JSON 형식 아님");
    }
    if (!result?.ok) throw new Error(`${method} 실패: ${redact(result?.description || "알 수 없음").slice(0, 500)}`);
    return result;
  }
}
