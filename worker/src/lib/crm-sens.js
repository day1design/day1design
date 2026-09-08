import { sendNcpSens, CUSTOMER_SMS_SUBJECT } from './sens.js';

const KST = 'Asia/Seoul';
const ALLOWED_FIELDS = new Set([
  'name', 'phone', 'email', 'contact_phone', 'date', 'time', 'location', 'address', 'map',
]);

function text(value) {
  return String(value ?? '').trim();
}

function readTenantConfigs(env) {
  const raw = text(env.CRM_SENS_TENANTS_JSON);
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed).filter(([tenantId, config]) => {
      return text(tenantId) && config && typeof config === 'object' && !Array.isArray(config);
    }));
  } catch {
    return new Map();
  }
}

function kstParts(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
  };
}

export function renderCustomerReminder(template, payload = {}) {
  const source = { ...payload, ...(payload.appointment || {}) };
  const parts = kstParts(source.starts_at || source.startsAt || source.appointment_at);
  const values = {
    name: text(source.name),
    phone: text(source.phone),
    email: text(source.email),
    contact_phone: text(source.contact_phone || source.contactPhone),
    date: parts?.date || '',
    time: parts?.time || '',
    location: text(source.location),
    address: text(source.address),
    map: text(source.map || source.map_url),
  };
  const body = text(template);
  if (!body) return { ok: false, reason: 'approved_template_body_missing' };
  let unknown = null;
  let missing = null;
  const rendered = body.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, field) => {
    const key = field.toLowerCase();
    if (!ALLOWED_FIELDS.has(key)) {
      unknown = key;
      return match;
    }
    if (!text(values[key])) {
      missing = key;
      return match;
    }
    return values[key];
  });
  if (unknown) return { ok: false, reason: 'approved_template_placeholder_invalid' };
  if (missing) return { ok: false, reason: 'approved_template_value_missing' };
  if (/{{\s*[^{}]+?\s*}}/.test(rendered)) return { ok: false, reason: 'approved_template_placeholder_invalid' };
  if (!parts) return { ok: false, reason: 'appointment_datetime_missing' };
  return { ok: true, content: rendered };
}

function configForTenant(env, tenantId) {
  const config = readTenantConfigs(env).get(text(tenantId));
  if (!config) return { ok: false, reason: 'tenant_sens_config_missing' };
  const from = text(config.from || config.fromNumber);
  const serviceId = text(config.serviceId || env.NCP_SENS_SERVICE_ID);
  if (!from) return { ok: false, reason: 'tenant_sens_sender_missing' };
  if (!serviceId) return { ok: false, reason: 'tenant_sens_service_missing' };
  return { ok: true, config, from, serviceId };
}

function parseProviderReceipt(result) {
  let body;
  try { body = JSON.parse(result?.body || '{}'); } catch { body = null; }
  const requestId = text(body?.requestId);
  const statusCode = text(body?.statusCode);
  const accepted = result?.ok === true && result?.status === 202 && statusCode === '202'
    && text(body?.statusName).toLowerCase() === 'success' && Boolean(requestId);
  if (!accepted) return { accepted: false, reason: 'delivery_unknown' };
  return { accepted: true, provider: 'ncp-sens', requestId, statusCode };
}

export function createCrmSensDeliveryAdapter(env, { send = sendNcpSens } = {}) {
  return {
    async send(row) {
      const configured = configForTenant(env, row?.tenant_id);
      if (!configured.ok) return { accepted: false, reason: configured.reason };
      const payload = row?.payload || {};
      const rendered = renderCustomerReminder(payload.template_body, {
        ...payload,
        starts_at: payload.starts_at || row?.starts_at,
        contact_phone: payload.contact_phone || configured.config.contactPhone,
      });
      if (!rendered.ok) return { accepted: false, reason: rendered.reason };
      const to = text(payload.phone);
      if (!to) return { accepted: false, reason: 'customer_phone_missing' };
      const requestEnv = {
        ...env,
        NCP_SENS_FROM_NUMBER: configured.from,
        NCP_SENS_SERVICE_ID: configured.serviceId,
      };
      const result = await send(requestEnv, {
        to,
        content: rendered.content,
        subject: text(configured.config.subject) || CUSTOMER_SMS_SUBJECT,
        type: 'auto',
      });
      return parseProviderReceipt(result);
    },
  };
}
