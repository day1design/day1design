import http from "node:http";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { timingSafeEqual, createHmac, createHash } from "node:crypto";

const FROM_EMAIL = "mkt@polarad.co.kr";
const SMTP_HOST = "smtp.worksmobile.com";
const SMTP_PORT = 587;
const MAX_BODY = 32 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function hmac(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function configFromEnv(env = process.env) {
  return {
    token: text(env.CRM_OTP_RELAY_TOKEN),
    secret: text(env.CRM_OTP_RELAY_SECRET),
    fromEmail: text(env.CRM_OTP_FROM_EMAIL),
    replyTo: text(env.CRM_OTP_REPLY_TO) || FROM_EMAIL,
    smtpHost: text(env.SMTP_HOST) || SMTP_HOST,
    smtpPort: Number(env.SMTP_PORT || SMTP_PORT),
    smtpUser: text(env.SMTP_USER) || FROM_EMAIL,
    smtpPass: text(env.SMTP_PASS),
    smtpFromName: text(env.SMTP_FROM_NAME) || "폴라애드",
    mailerRoot: text(env.POLARAD_MAILER_ROOT),
    relayHost: text(env.CRM_OTP_RELAY_HOST) || "127.0.0.1",
    relayPort: Number(env.CRM_OTP_RELAY_PORT || 18893),
  };
}

export function loadRelayConfigFile(file) {
  const value = JSON.parse(readFileSync(file, "utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("OTP relay config must be an object");
  return value;
}

export function loadRelayEnvironment({ env = process.env, file = join(process.env.POLARAD_MAILER_ROOT || "F:\\master_polarad", ".env.local") } = {}) {
  const fileValues = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
      fileValues[match[1]] = value;
    }
  }
  return { ...env, ...fileValues };
}

function validConfig(config) {
  return Boolean(
    config.token && config.secret &&
    config.fromEmail === FROM_EMAIL && config.replyTo === FROM_EMAIL &&
    config.smtpHost === SMTP_HOST && config.smtpPort === SMTP_PORT &&
    config.smtpUser === FROM_EMAIL && config.smtpPass,
  );
}

function validEmail(value) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function json(status, data) {
  return { status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(data) };
}

function validatePayload(payload, now) {
  const idempotencyKey = text(payload?.idempotency_key);
  const to = text(payload?.to).toLowerCase();
  const from = text(payload?.from);
  const replyTo = text(payload?.reply_to);
  const code = text(payload?.text).match(/\b(\d{6})\b/)?.[1] || "";
  const expiresAt = Date.parse(text(payload?.expires_at));
  if (payload?.kind !== "crm_otp" || !idempotencyKey || idempotencyKey.length > 160) throw new Error("invalid kind or idempotency");
  if (!validEmail(to) || from !== FROM_EMAIL || replyTo !== FROM_EMAIL) throw new Error("invalid sender or recipient");
  if (!/^\d{6}$/.test(code) || !text(payload?.subject) || !text(payload?.text) || !text(payload?.html)) throw new Error("invalid OTP message");
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 10 * 60 * 1000) throw new Error("invalid expiration");
  if (text(payload?.subject).length > 200 || text(payload?.text).length > 4_000 || text(payload?.html).length > 16_000) throw new Error("message too large");
  const message = { idempotencyKey, to, from, replyTo, subject: text(payload.subject), text: text(payload.text), html: text(payload.html), expiresAt };
  message.fingerprint = createHash("sha256").update(JSON.stringify(message)).digest("hex");
  return message;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createSmtpSender(config, { nodemailer } = {}) {
  return async (message) => {
    const module = nodemailer || (() => {
      const root = config.mailerRoot || process.env.POLARAD_MAILER_ROOT || "F:\\master_polarad";
      return createRequire(join(root, "package.json"))("nodemailer");
    })();
    const transporter = module.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: false, requireTLS: true, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 8_000, auth: { user: config.smtpUser, pass: config.smtpPass } });
    const result = await transporter.sendMail({
      from: `${config.smtpFromName} <${FROM_EMAIL}>`,
      replyTo: FROM_EMAIL,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const accepted = Array.isArray(result?.accepted) ? result.accepted.map((value) => String(value).toLowerCase()) : [];
    if (!accepted.includes(message.to.toLowerCase())) throw new Error("SMTP recipient was not accepted");
    return { accepted: true };
  };
}

export function createOtpRelay({ config = configFromEnv(), sendMail, now = () => Date.now() } = {}) {
  const inFlight = new Map();
  const completed = new Map();
  const sender = sendMail || createSmtpSender(config);
  return async function handle({ method = "POST", path = "/crm/otp", headers = {}, body = "" } = {}) {
    if (method !== "POST" || path !== "/crm/otp") return json(404, { error: "not found" });
    if (!validConfig(config)) return json(503, { error: "relay unavailable" });
    const timestamp = Number(text(headers["x-crm-otp-timestamp"]));
    const authorization = text(headers.authorization);
    if (!Number.isSafeInteger(timestamp) || Math.abs(now() - timestamp) > MAX_CLOCK_SKEW_MS || !constantTimeEqual(authorization, `Bearer ${config.token}`)) return json(401, { error: "unauthorized" });
    if (!constantTimeEqual(text(headers["x-crm-otp-signature"]), hmac(`${timestamp}.${body}`, config.secret))) return json(401, { error: "unauthorized" });
    let payload;
    try { payload = JSON.parse(body); } catch { return json(400, { error: "invalid request" }); }
    let message;
    try { message = validatePayload(payload, now()); } catch { return json(400, { error: "invalid request" }); }
    const current = now();
    for (const [key, value] of completed) if (value.expiresAt <= current) completed.delete(key);
    const existing = completed.get(message.idempotencyKey);
    if (existing) return existing.fingerprint === message.fingerprint
      ? json(200, { accepted: true, duplicate: true })
      : json(409, { error: "idempotency conflict" });
    if (inFlight.has(message.idempotencyKey)) {
      const entry = inFlight.get(message.idempotencyKey);
      if (entry.fingerprint !== message.fingerprint) return json(409, { error: "idempotency conflict" });
      try { await entry.promise; return json(200, { accepted: true, duplicate: true }); } catch { return json(503, { error: "delivery unavailable" }); }
    }
    const operation = Promise.resolve().then(async () => {
      const receipt = await sender(message);
      if (receipt?.accepted !== true) throw new Error("delivery receipt invalid");
      return receipt;
    });
    inFlight.set(message.idempotencyKey, { fingerprint: message.fingerprint, promise: operation });
    try {
      await operation;
      completed.set(message.idempotencyKey, { fingerprint: message.fingerprint, expiresAt: now() + 10 * 60 * 1000 });
      while (completed.size > 1_000) completed.delete(completed.keys().next().value);
      return json(200, { accepted: true });
    } catch {
      return json(503, { error: "delivery unavailable" });
    } finally {
      inFlight.delete(message.idempotencyKey);
    }
  };
}

export function startOtpRelay({ config = configFromEnv(), sendMail, host = config.relayHost || process.env.CRM_OTP_RELAY_HOST || "127.0.0.1", port = config.relayPort || Number(process.env.CRM_OTP_RELAY_PORT || 18893) } = {}) {
  const handle = createOtpRelay({ config, sendMail });
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await handle({ method: req.method, path: new URL(req.url || "/", "http://relay.local").pathname, headers: req.headers, body });
      res.writeHead(result.status, result.headers);
      res.end(result.body);
    } catch {
      res.writeHead(413, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "invalid request" }));
    }
  });
  server.listen(port, host);
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const configPath = text(process.env.CRM_OTP_RELAY_CONFIG);
  const source = configPath ? loadRelayConfigFile(configPath) : loadRelayEnvironment();
  const config = configFromEnv(source);
  if (!validConfig(config)) {
    console.error("OTP relay configuration unavailable");
    process.exitCode = 1;
  } else {
    startOtpRelay({ config });
  }
}
