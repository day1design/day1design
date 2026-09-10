import { handleWorkflow } from './workflow.js';
import { handleAuth } from './auth.js';
import { jsonError } from '../lib/response.js';

export async function routeWorkflow(request, env, ctx) {
  const path = new URL(request.url).pathname;
  const origin = request.headers.get('origin');
  const allowed = new Set(['https://day1design.co.kr', 'https://www.day1design.co.kr', 'https://admin.day1design.co.kr']);
  if (!allowed.has(origin)) return jsonError(403, 'Forbidden');
  if (request.method !== 'POST') return jsonError(405, 'Method Not Allowed');
  if (path === '/api/workflow/save') return handleWorkflow(request, env);
  if (path !== '/api/workflow/login') return jsonError(404, 'Not Found');
  const reader = request.body?.getReader();
  if (!reader) return jsonError(400, 'Invalid request body');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return jsonError(413, 'Payload Too Large'); }
      chunks.push(value);
    }
  } catch { return jsonError(400, 'Invalid request body'); }
  const url = new URL(request.url); url.pathname = '/api/auth/login';
  return handleAuth(new Request(url, { method: 'POST', headers: request.headers, body: new Blob(chunks) }), env, ctx);
}
