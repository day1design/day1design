function uniqueList(values) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64UrlUtf8(value) {
  return base64Utf8(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeHeader(value) {
  return `=?UTF-8?B?${base64Utf8(value)}?=`;
}

function safeHeaderAddress(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function htmlToText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function gmailAccessToken(env) {
  if (
    !env.GMAIL_CLIENT_ID ||
    !env.GMAIL_CLIENT_SECRET ||
    !env.GMAIL_REFRESH_TOKEN
  ) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID,
    client_secret: env.GMAIL_CLIENT_SECRET,
    refresh_token: env.GMAIL_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token || null;
}

export function isEmailConfigured(env) {
  return Boolean(
    env.GMAIL_CLIENT_ID &&
      env.GMAIL_CLIENT_SECRET &&
      env.GMAIL_REFRESH_TOKEN &&
      env.GMAIL_USER,
  );
}

export async function sendEmail(env, { to, subject, text, html } = {}) {
  if (!isEmailConfigured(env)) return;
  try {
    const accessToken = await gmailAccessToken(env);
    if (!accessToken) return;

    const from = String(env.GMAIL_USER).trim();
    const recipients = uniqueList(Array.isArray(to) ? to : [to]);
    if (!recipients.length) return;

    const bodyText = text || htmlToText(html);
    const safeSubject = encodeHeader(subject || "DAYONE 알림");
    const boundary = `dayone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const headerLines = [
      `From: DAYONE DESIGN <${safeHeaderAddress(from)}>`,
      `To: ${recipients.map(safeHeaderAddress).join(", ")}`,
      `Subject: ${safeSubject}`,
      "MIME-Version: 1.0",
    ];
    const raw = html
      ? [
          ...headerLines,
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: 8bit",
          "",
          bodyText,
          `--${boundary}`,
          "Content-Type: text/html; charset=UTF-8",
          "Content-Transfer-Encoding: 8bit",
          "",
          html,
          `--${boundary}--`,
        ].join("\r\n")
      : [
          ...headerLines,
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: 8bit",
          "",
          bodyText,
        ].join("\r\n");

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ raw: base64UrlUtf8(raw) }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gmail send ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("email:", e);
  }
}

export async function notifyEmail(env, { subject, text, html } = {}) {
  return sendEmail(env, {
    to: [env.GMAIL_NOTIFY_TO, env.NOTIFY_EMAIL_TO, env.GMAIL_USER],
    subject,
    text,
    html,
  });
}
