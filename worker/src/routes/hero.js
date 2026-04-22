import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { atListAll, atCreate, atUpdate, atDelete } from "../lib/airtable.js";
import {
  r2Upload,
  r2DeleteMany,
  safeFileName,
  datePrefix,
  randomId,
} from "../lib/r2.js";
import {
  edgeCacheGet,
  edgeCachePut,
  edgeCacheDelete,
} from "../lib/edge-cache.js";

const TABLE = "HeroSlides";
const MAX_IMG_BYTES = 10 * 1024 * 1024;
const CACHE_NS = "hero:slides";
const CACHE_TTL = 60;

export async function handleHero(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/hero/, "");

  if (path === "/slides" && request.method === "GET") {
    return getSlides(env, ctx);
  }
  if (path === "/slides" && request.method === "PUT") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return putSlides(request, env, ctx);
  }
  if (path === "/upload" && request.method === "POST") {
    if (!(await verifyAdmin(request, env)))
      return jsonError(401, "Unauthorized");
    return uploadImage(request, env);
  }
  return jsonError(404, "Not Found");
}

async function getSlides(env, ctx) {
  const cached = await edgeCacheGet(CACHE_NS);
  if (cached) return jsonOk(cached);

  const records = await atListAll(env, TABLE, {
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

/** 전체 배열 교체: 기존 삭제 → 새로 생성. Airtable에는 bulk replace가 없으니 diff보다 이게 단순함 */
async function putSlides(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const slides = Array.isArray(body?.slides) ? body.slides : null;
  if (!slides) return jsonError(400, "slides[] required");
  if (slides.length > 10) return jsonError(400, "Max 10 slides");

  const existing = await atListAll(env, TABLE);
  const oldUrls = existing.map((r) => r.fields.Image).filter(Boolean);
  const newUrls = new Set(slides.map((s) => s.image).filter(Boolean));
  const orphanUrls = oldUrls.filter((u) => !newUrls.has(u));

  for (const r of existing) {
    await atDelete(env, TABLE, r.id);
  }
  const created = [];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (!s.image) continue;
    const rec = await atCreate(env, TABLE, {
      Image: s.image,
      Href: s.href || "",
      Alt: s.alt || "",
      Order: i,
      Active: true,
    });
    created.push(rec);
  }

  // 고아 이미지 R2 삭제 (응답 지연 방지: waitUntil)
  if (orphanUrls.length > 0) {
    const task = r2DeleteMany(env.IMAGES, orphanUrls, env.R2_PUBLIC_BASE);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }

  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk({ saved: created.length, cleaned: orphanUrls.length });
}

async function uploadImage(request, env) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return jsonError(400, "file required");
  if (file.size > MAX_IMG_BYTES) return jsonError(413, "File too large");
  const ct = file.type || "image/webp";
  if (!ct.startsWith("image/")) return jsonError(415, "Only images allowed");
  const ext = (file.name.split(".").pop() || "webp").toLowerCase().slice(0, 8);
  const key = `hero/${datePrefix()}-${randomId()}/${safeFileName(file.name.replace(/\.[^.]+$/, ""))}.${ext}`;
  const url = await r2Upload(env.IMAGES, key, await file.arrayBuffer(), {
    contentType: ct,
    publicBase: env.R2_PUBLIC_BASE,
  });
  return jsonOk({ url });
}
