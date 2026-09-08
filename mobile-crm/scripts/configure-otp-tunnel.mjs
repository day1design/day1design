import { readFileSync, writeFileSync } from 'node:fs';

// Credentials remain in project-local files and are never logged.
const values = {};
for (const line of readFileSync(new URL('../../site/.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*(\w+)\s*=\s*(.*?)\s*$/);
  if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
const account = values.CLOUDFLARE_ACCOUNT_ID;
if (!account || !values.CLOUDFLARE_EMAIL || !values.CLOUDFLARE_API_KEY) throw new Error('Missing project Cloudflare authority');
const hostname = 'crm-otp.day1design.co.kr';
const name = 'day1design-crm-otp';
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'X-Auth-Email': values.CLOUDFLARE_EMAIL, 'X-Auth-Key': values.CLOUDFLARE_API_KEY, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare ${response.status}: ${data.errors?.map(error => error.code).join(',')}`);
  return data.result;
}
const zones = await api('/zones?name=day1design.co.kr');
const zone = zones.find(item => item.account.id === account);
if (!zone) throw new Error('Project zone/account mismatch');
const base = `/accounts/${account}/cfd_tunnel`;
const tunnels = await api(`${base}?is_deleted=false&name=${name}`);
const records = await api(`/zones/${zone.id}/dns_records?name=${hostname}`);
if (tunnels.length > 1 || records.length > 1) throw new Error('Ambiguous existing tunnel or DNS');
let tunnel = tunnels[0];
if (tunnel && (tunnel.name !== name || !tunnel.remote_config)) throw new Error('Existing tunnel ownership/configuration mismatch');
if (records.length && (!tunnel || records[0].type !== 'CNAME' || records[0].content !== `${tunnel.id}.cfargotunnel.com`)) throw new Error('Existing DNS belongs to another service');
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ dryRun: true, account, hostname, tunnel: tunnel?.id || 'new', dns: records.length ? 'existing' : 'new' }));
} else {
  tunnel ||= await api(base, 'POST', { name, config_src: 'cloudflare' });
  // Only OTP requests reach the loopback service; every other path is rejected.
  await api(`${base}/${tunnel.id}/configurations`, 'PUT', { config: { ingress: [
    { hostname, path: '^/crm/otp$', service: 'http://127.0.0.1:18893', originRequest: {} },
    { service: 'http_status:404' },
  ] } });
  if (!records.length) await api(`/zones/${zone.id}/dns_records`, 'POST', { type: 'CNAME', name: hostname, content: `${tunnel.id}.cfargotunnel.com`, proxied: true, ttl: 1 });
  const token = tunnel.token || await api(`${base}/${tunnel.id}/token`);
  writeFileSync(new URL('../.tools/otp-relay-stage/tunnel-token', import.meta.url), token, { mode: 0o600 });
  writeFileSync(new URL('../.tools/production/tunnel-status.json', import.meta.url), JSON.stringify({ id: tunnel.id, hostname, account, configuredAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ configured: true, tunnelId: tunnel.id, hostname }));
}
