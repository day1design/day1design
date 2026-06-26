const TELEGRAM_MAX_TEXT_LENGTH = 3900;

function splitTelegramText(text) {
  const value = String(text || "");
  if (value.length <= TELEGRAM_MAX_TEXT_LENGTH) return value ? [value] : [];

  const chunks = [];
  let remaining = value;

  while (remaining.length > TELEGRAM_MAX_TEXT_LENGTH) {
    let splitAt = remaining.lastIndexOf("\n\n", TELEGRAM_MAX_TEXT_LENGTH);
    if (splitAt < TELEGRAM_MAX_TEXT_LENGTH * 0.6) {
      splitAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_TEXT_LENGTH);
    }
    if (splitAt < TELEGRAM_MAX_TEXT_LENGTH * 0.6) {
      splitAt = remaining.lastIndexOf(" ", TELEGRAM_MAX_TEXT_LENGTH);
    }
    if (splitAt <= 0) splitAt = TELEGRAM_MAX_TEXT_LENGTH;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function telegramChatIds(env) {
  return [
    ...new Set(
      [env.TELEGRAM_CHAT_ID, env.TELEGRAM_ADMIN_CHAT_ID]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

// 인프라/보안 특이사항(로그인공격·500 에러·봇 급증) 전용 채널.
// INFRA_BOT_TOKEN/INFRA_CHAT_ID 미설정 시 기본 관리자 채널로 폴백(알림 유실 금지).
export async function notifyInfra(env, text) {
  const botToken = String(env.INFRA_BOT_TOKEN || "").trim();
  const chatId = String(env.INFRA_CHAT_ID || "").trim();
  if (botToken && chatId) {
    return notifyTelegram(env, text, { botToken, chatId });
  }
  return notifyTelegram(env, text);
}

export async function notifyTelegram(env, text, opts = {}) {
  // opts: { botToken?: string, chatId?: string | string[] }
  // override 안 하면 env.TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID/ADMIN_CHAT_ID
  const botToken = String(opts.botToken || env.TELEGRAM_BOT_TOKEN || "").trim();
  let chatIds;
  if (opts.chatId) {
    chatIds = (Array.isArray(opts.chatId) ? opts.chatId : [opts.chatId])
      .map((v) => String(v || "").trim())
      .filter(Boolean);
  } else {
    chatIds = telegramChatIds(env);
  }
  if (!botToken || !chatIds.length) return;
  try {
    const chunks = splitTelegramText(text);
    for (const chatId of chatIds) {
      for (const chunk of chunks) {
        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: chunk,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
          },
        );
        if (!res.ok) {
          const body = await res.text();
          console.error(
            "telegram:",
            `Telegram API ${res.status}: ${body.slice(0, 200)}`,
          );
        }
      }
    }
  } catch (e) {
    console.error("telegram:", e);
  }
}
