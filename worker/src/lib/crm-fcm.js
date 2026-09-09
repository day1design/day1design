const encoder = new TextEncoder();
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function base64Url(value) {
  const bytes = value instanceof Uint8Array ? value : encoder.encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemBytes(pem) {
  const body = String(pem || '').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`fcm_${name}_missing`);
  return value.trim();
}

export function fcmConfig(env, tenantId) {
  if (env?.CRM_PUSH_ENABLED !== 'true') return null;
  const allowlist = String(env.CRM_PUSH_TENANTS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowlist.length || !allowlist.includes(tenantId)) throw new Error('fcm_tenant_not_allowed');
  return {
    projectId: required(env.CRM_FCM_PROJECT_ID, 'project_id'),
    clientEmail: required(env.CRM_FCM_CLIENT_EMAIL, 'client_email'),
    privateKey: required(env.CRM_FCM_PRIVATE_KEY, 'private_key').replace(/\\n/g, '\n'),
  };
}

async function signedJwt(config, now = Date.now()) {
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(config.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const issued = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({ iss: config.clientEmail, scope: FCM_SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600 }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claim}`));
  return `${header}.${claim}.${base64Url(new Uint8Array(signature))}`;
}

async function fetchWithPolicy(fetchImpl, url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...options, redirect: 'manual', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function accessToken(config, fetchImpl, now) {
  const response = await fetchWithPolicy(fetchImpl, TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signedJwt(config, now) }),
  });
  if (!response.ok) throw new Error(`fcm_oauth_${response.status}`);
  const body = await response.json();
  if (typeof body.access_token !== 'string' || body.token_type !== 'Bearer') throw new Error('fcm_oauth_invalid_response');
  return body.access_token;
}

export function genericPushMessage(token, notificationId) {
  return {
    message: {
      token,
      notification: { title: '폴라애드 알림', body: '새 알림이 도착했습니다.' },
      data: { notification_id: String(notificationId), kind: 'crm_notification' },
      android: { priority: 'high', notification: { channel_id: 'crm_default' } },
    },
  };
}

export async function sendFcmMessage(env, { tenantId, token, notificationId, fetchImpl = globalThis.fetch, now = Date.now(), beforeSend } = {}) {
  const config = fcmConfig(env, tenantId);
  if (!config) return { enabled: false, accepted: false, reason: 'push_disabled' };
  if (typeof fetchImpl !== 'function') throw new Error('fcm_fetch_missing');
  const access = await accessToken(config, fetchImpl, now);
  if (typeof beforeSend === 'function' && !(await beforeSend())) return { enabled: true, accepted: false, errorCode: 'push_authorization_changed' };
  const response = await fetchWithPolicy(fetchImpl, `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify(genericPushMessage(token, notificationId)),
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) return { enabled: true, accepted: false, status: response.status, errorCode: 'provider_rejected' };
  if (typeof body?.name !== 'string' || !body.name) return { enabled: true, accepted: false, status: response.status, errorCode: 'FCM_MESSAGE_NAME_MISSING' };
  return { enabled: true, accepted: true, messageName: body.name };
}

export const FCM_ENDPOINTS = Object.freeze({ token: TOKEN_URL, send: 'https://fcm.googleapis.com/v1/projects/{project}/messages:send' });
