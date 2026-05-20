import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import {
  safeFileName,
  datePrefix,
  randomId,
} from "../lib/r2.js";
import { createServices } from "../lib/services.js";
import { assertUploadPolicy, fileExt } from "../lib/upload-policy.js";
import {
  edgeCacheGet,
  edgeCachePut,
  edgeCacheDelete,
} from "../lib/edge-cache.js";

const MAX_IMG_BYTES = 10 * 1024 * 1024;
const CACHE_NS = "hero:slides";
const CACHE_TTL = 60;

export async function handleHero(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/hero/, "");

  if (path === "/slides" && request.method === "GET") {
    return getSlides(env, ctx, services);
  }
  if (path === "/slides" && request.method === "PUT") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return putSlides(request, env, ctx, services);
  }
  if (path === "/upload" && request.method === "POST") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return uploadImage(request, env, services);
  }
  return jsonError(404, "Not Found");
}

async function getSlides(env, ctx, services) {
  const cached = await edgeCacheGet(CACHE_NS);
  if (cached) return jsonOk(cached);

  const records = await services.heroSlides.listAll({
    sort: [{ field: "Order", direction: "asc" }],
  });
  const slides = records
    .filter((r) => r.fields.Active !== false)
    .map((r) => ({
      id: r.id,
      image: r.fields.Image || "",
      href: r.fields.Href || "",
      alt: r.fields.Alt || "",
      order: r.fields.Order ?? 0,
    }));
  const payload = {
    config: { maxSlides: 10, autoPlayMs: 6000 },
    slides,
  };
  await edgeCachePut(CACHE_NS, payload, CACHE_TTL, ctx);
  return jsonOk(payload);
}

/** 전체 배열 교체: D1 ReplaceAll (DELETE + batch INSERT) */
async function putSlides(request, env, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const slides = Array.isArray(body?.slides) ? body.slides : null;
  if (!slides) return jsonError(400, "slides[] required");
  if (slides.length > 10) return jsonError(400, "Max 10 slides");

  const existing = await services.heroSlides.listAll();
  const oldUrls = existing.map((r) => r.fields.Image).filter(Boolean);
  const newUrls = new Set(slides.map((s) => s.image).filter(Boolean));
  const orphanUrls = oldUrls.filter((u) => !newUrls.has(u));

  const newRecords = slides
    .filter((s) => s.image)
    .map((s, i) => ({
      Image: s.image,
      Href: s.href || "",
      Alt: s.alt || "",
      Order: i,
      Active: true,
    }));
  const created = await services.heroSlides.replaceAll(newRecords);

  // 고아 이미지 R2 삭제 (응답 지연 방지: waitUntil)
  if (orphanUrls.length > 0) {
    const task = services.media.deleteMany(orphanUrls);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }

  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk({ saved: created.length, cleaned: orphanUrls.length });
}

async function uploadImage(request, env, services) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return jsonError(400, "file required");
  if (file.size > MAX_IMG_BYTES) return jsonError(413, "File too large");
  try {
    assertUploadPolicy(file);
  } catch (e) {
    return jsonError(e.status || 415, e.message);
  }
  const ext = fileExt(file.name) || "webp";
  const key = `hero/${datePrefix()}-${randomId()}/${safeFileName(file.name.replace(/\.[^.]+$/, ""))}.${ext}`;
  const url = await services.media.upload(key, await file.arrayBuffer(), {
    contentType: "image/webp",
  });
  return jsonOk({ url });
}
