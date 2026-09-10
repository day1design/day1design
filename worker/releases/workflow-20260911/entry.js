import baseline from "./baseline.mjs";
import { routeWorkflow } from "../../src/routes/workflow-router.js";
export default { ...baseline, async fetch(request, env, ctx) {
  if (new URL(request.url).pathname.startsWith("/api/workflow/")) return routeWorkflow(request, env, ctx);
  return baseline.fetch(request, env, ctx);
}};
