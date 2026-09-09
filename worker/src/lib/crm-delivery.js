import { renderCustomerReminder } from './crm-sens.js';
import { sendNcpSens } from './sens.js';

async function fetchWithTimeout(url, init, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, redirect: 'manual', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

const text = (value) => String(value ?? '').trim();

function b64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function unb64(value) {
  const padded = String(value).replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((String(value).length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function keyFromEnv(env) {
  const raw = unb64(text(env.CRM_INTEGRATION_ENCRYPTION_KEY));
  if (raw.byteLength !== 32) throw new Error('integration_key_invalid');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptCredentials(env, credentials, tenantId = '') {
  const key = await keyFromEnv(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(credentials));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(tenantId) }, key, data);
  return `${b64(iv)}.${b64(encrypted)}`;
}

export async function decryptCredentials(env, ciphertext, tenantId = '') {
  if (!text(ciphertext)) return {};
  const [ivPart, dataPart] = String(ciphertext).split('.');
  if (!ivPart || !dataPart) throw new Error('integration_ciphertext_invalid');
  const key = await keyFromEnv(env);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivPart), additionalData: new TextEncoder().encode(tenantId) }, key, unb64(dataPart));
  return JSON.parse(new TextDecoder().decode(plain));
}

export function deliveryMissingFields(row, credentials = {}) {
  const required = row.channel === 'sms'
    ? [['access_key', credentials.accessKey], ['secret_key', credentials.secretKey], ['sms_service_id', row.sms_service_id], ['from_number', row.from_number], ['contact_phone', row.contact_phone], ['visit_body', row.visit_body], ['measurement_body', row.measurement_body]]
    : [['access_key', credentials.accessKey], ['secret_key', credentials.secretKey], ['contact_phone', row.contact_phone], ['alimtalk_service_id', row.alimtalk_service_id], ['channel_id', row.channel_id], ['visit_template_code', row.visit_template_code], ['measurement_template_code', row.measurement_template_code], ['visit_body', row.visit_body], ['measurement_body', row.measurement_body]];
  return required.filter(([, value]) => !text(value)).map(([name]) => name);
}

function mapUrl(address) {
  return text(address) ? `https://map.naver.com/p/search/${encodeURIComponent(text(address))}` : '';
}

function providerReceipt(result) {
  let body = null;
  try { body = JSON.parse(result?.body || '{}'); } catch {}
  const requestId = text(body?.requestId);
  if (result?.ok !== true || result.status !== 202 || text(body?.statusCode) !== '202' || text(body?.statusName).toLowerCase() !== 'success' || !requestId) return { accepted: false, reason: 'delivery_unknown' };
  return { accepted: true, provider: 'ncp', requestId, statusCode: '202' };
}

async function sendAlimtalk(env, config, payload, code) {
  const path = `/alimtalk/v2/services/${config.alimtalk_service_id}/messages`;
  const timestamp = String(Date.now());
  const message = `POST ${path}\n${timestamp}\n${config.accessKey}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  let signature = '';
  for (const byte of new Uint8Array(signatureBytes)) signature += String.fromCharCode(byte);
  signature = btoa(signature);
  const response = await fetchWithTimeout(`https://sens.apigw.ntruss.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-ncp-apigw-timestamp': timestamp, 'x-ncp-iam-access-key': config.accessKey, 'x-ncp-apigw-signature-v2': signature },
    body: JSON.stringify({ plusFriendId: config.channelId || config.channel_id, templateCode: code, messages: [{ to: text(payload.phone), content: payload.content }] }),
  }, 15000);
  return providerReceipt({ ok: response.ok, status: response.status, body: await response.text() });
}

export function createCrmTenantDeliveryAdapter(env, db) {
  return { async send(row) {
    const setting = await db.prepare('SELECT * FROM CrmTenantDeliverySettings WHERE tenant_id=? AND enabled=1').bind(row.tenant_id).first();
    if (!setting) return { accepted: false, reason: 'tenant_delivery_disabled' };
    let credentials;
    try { credentials = await decryptCredentials(env, setting.credentials_ciphertext, row.tenant_id); } catch { return { accepted: false, reason: 'delivery_configuration_invalid' }; }
    const missing = deliveryMissingFields(setting, credentials);
    if (missing.length) return { accepted: false, reason: 'delivery_configuration_incomplete' };
    const payload = row.payload || {};
    if (String(row.appointment_id || '').startsWith('web-visit-')) return { accepted: false, reason: 'appointment_address_unverified' };
    const address = text(payload.address);
    if (!address) return { accepted: false, reason: 'appointment_address_missing' };
    const kind = row.notification_type === 'measurement_reminder' ? 'measurement' : 'visit';
    const template = await db.prepare("SELECT body FROM CrmNotificationTemplates WHERE tenant_id=? AND kind=? AND state='approved' AND enabled=1").bind(row.tenant_id, kind).first();
    if (!template?.body) return { accepted: false, reason: 'approved_template_missing' };
    const rendered = renderCustomerReminder(template.body, { ...payload, contact_phone: payload.contact_phone || setting.contact_phone, map: payload.map || mapUrl(address), address });
    if (!rendered.ok) return { accepted: false, reason: rendered.reason };
    const message = { ...payload, content: rendered.content };
    if (setting.channel === 'sms') {
      const result = await sendNcpSens({ ...env, NCP_SENS_ACCESS_KEY: credentials.accessKey, NCP_SENS_SECRET_KEY: credentials.secretKey, NCP_SENS_SERVICE_ID: setting.sms_service_id, NCP_SENS_FROM_NUMBER: setting.from_number }, { to: payload.phone, content: message.content, subject: '예약 일정 안내', type: 'auto' });
      return providerReceipt(result);
    }
    const code = setting[row.notification_type === 'measurement_reminder' ? 'measurement_template_code' : 'visit_template_code'];
    return sendAlimtalk(env, { ...setting, ...credentials }, message, code);
  } };
}
