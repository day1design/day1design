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

export async function notifyTelegram(env, text) {
  const chatIds = telegramChatIds(env);
  if (!env.TELEGRAM_BOT_TOKEN || !chatIds.length) return;
  try {
    const chunks = splitTelegramText(text);
    for (const chatId of chatIds) {
      for (const chunk of chunks) {
        const res = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
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
