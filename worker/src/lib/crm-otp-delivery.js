const FROM_EMAIL = "mkt@polarad.co.kr";
const DEFAULT_REPLY_TO = FROM_EMAIL;
const encoder = new TextEncoder();

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function htmlEscape(value) {
  return clean(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signature(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function relayUrl(env) {
  const value = clean(env.CRM_OTP_RELAY_URL);
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("CRM_OTP_RELAY_URL invalid"); }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !local) throw new Error("CRM_OTP_RELAY_URL must use HTTPS");
  return parsed.toString();
}

export function isCrmOtpDeliveryConfigured(env) {
  try {
    return Boolean(
      relayUrl(env) &&
      clean(env.CRM_OTP_RELAY_TOKEN) &&
      clean(env.CRM_OTP_RELAY_SECRET) &&
      clean(env.CRM_OTP_FROM_EMAIL) === FROM_EMAIL &&
      (clean(env.CRM_OTP_REPLY_TO) || DEFAULT_REPLY_TO) === FROM_EMAIL,
    );
  } catch {
    return false;
  }
}

function otpMessage(payload) {
  const code = clean(payload?.code);
  const expiresAt = clean(payload?.expires_at);
  const subject = "POLARAD CRM 모바일 로그인 인증번호";
  const text = `POLARAD CRM 모바일 로그인 인증번호는 ${code}입니다.\n5분 이내에 입력해 주세요.\n만료 시각: ${expiresAt}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#222"><p>POLARAD CRM 모바일 로그인 인증번호입니다.</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${htmlEscape(code)}</p><p>5분 이내에 입력해 주세요.</p><p style="color:#777;font-size:12px">만료 시각: ${htmlEscape(expiresAt)}</p></div>`;
  return { subject, text, html };
}

export async function deliverCrmOtp(env, payload) {
  const url = relayUrl(env);
  const token = clean(env.CRM_OTP_RELAY_TOKEN);
  const secret = clean(env.CRM_OTP_RELAY_SECRET);
  const from = clean(env.CRM_OTP_FROM_EMAIL);
  const replyTo = clean(env.CRM_OTP_REPLY_TO) || DEFAULT_REPLY_TO;
  if (!url || !token || !secret || from !== FROM_EMAIL || replyTo !== FROM_EMAIL) {
    throw new Error("CRM OTP relay configuration unavailable");
  }
  const recipient = clean(payload?.email).toLowerCase();
  const code = clean(payload?.code);
  const idempotencyKey = clean(payload?.otp_id || payload?.id);
  const expiresAt = clean(payload?.expires_at);
  if (!recipient || !/^\d{6}$/.test(code) || !idempotencyKey || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) throw new Error("CRM OTP payload invalid");
  const message = otpMessage(payload);
  const body = JSON.stringify({
    kind: "crm_otp",
    idempotency_key: idempotencyKey,
    expires_at: expiresAt,
    to: recipient,
    from: FROM_EMAIL,
    reply_to: FROM_EMAIL,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  const timestamp = String(Date.now());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-crm-otp-timestamp": timestamp,
        "x-crm-otp-signature": await signature(`${timestamp}.${body}`, secret),
      },
      body,
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error(`CRM OTP relay HTTP ${response.status}`);
    let result;
    try { result = await response.json(); } catch { throw new Error("CRM OTP relay receipt invalid"); }
    if (result?.accepted !== true) throw new Error("CRM OTP relay did not accept message");
    return { accepted: true };
  } finally {
    clearTimeout(timeout);
  }
}
