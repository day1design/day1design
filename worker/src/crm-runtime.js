import { handleMobileCrm } from './routes/mobile-crm.js';
import { runCrmScheduled } from './lib/crm-scheduler.js';
import { authorizeRequest, accessDenied } from './lib/access.js';
import { cors, preflight } from './lib/cors.js';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path !== '/api/mobile' && !path.startsWith('/api/mobile/')) return new Response('Not Found', { status: 404 });
    if (request.method === 'OPTIONS') return preflight(request, env);
    const access = authorizeRequest(request, env);
    const response = access.ok ? await handleMobileCrm(request, env, ctx) : accessDenied(access);
    const result = cors(response, request, env);
    result.headers.set('cache-control', 'no-store');
    return result;
  },
  async scheduled(event, env, ctx) {
    if (event.cron === '* * * * *') ctx.waitUntil(runCrmScheduled(env));
  },
};
