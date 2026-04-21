// 경량 JWT (HS256) — Web Crypto API 기반, 의존성 없음
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(buf) {
  const s =
    typeof buf === "string" ? buf : String.fromCharCode(...new Uint8Array(buf));
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const raw = atob(s);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * @param {object} payload
 * @param {string} secret
 * @param {number} expSeconds - default 12h
 */
export async function sign(payload, secret, expSeconds = 43200) {
  if (!secret) throw new Error("JWT secret required");
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expSeconds };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const data = `${h}.${p}`;
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function verify(token, secret) {
  if (!token || !secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  try {
    const key = await getKey(secret);
    const sig = b64urlDecode(s);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      enc.encode(data),
    );
    if (!valid) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(p)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
