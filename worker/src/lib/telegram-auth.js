// 텔레그램 로그인 코드 생성 + 발송
// 6자리 코드는 혼동 문자(0/O/1/I) 제외한 base32-like 문자집합
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;
const ID_LEN = 16; // 32 hex chars

export function generateCode() {
  const buf = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < CODE_LEN; i++)
    s += CODE_CHARS[buf[i] % CODE_CHARS.length];
  return s;
}

export function generateCodeId() {
  const bytes = new Uint8Array(ID_LEN);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendLoginCode(env, code, ip) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_ADMIN_CHAT_ID || env.TELEGRAM_CHAT_ID;
  if (!token || !chat) throw new Error("Telegram not configured");

  const text =
    `🔐 <b>DAYONE 관리자 로그인 코드</b>\n\n` +
    `<code>${escapeHtml(code)}</code>\n\n` +
    `• 유효: 5분\n` +
    `• 요청 IP: ${escapeHtml(ip)}\n\n` +
    `본인이 요청한 것이 아니라면 무시하세요.`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Telegram API ${res.status}: ${t.slice(0, 200)}`);
  }
}
