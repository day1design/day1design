import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { atListAll, atCreate, atUpdate, atDelete } from "../lib/airtable.js";
import { r2Upload, safeFileName, datePrefix, randomId } from "../lib/r2.js";

const TABLE = "HeroSlides";
const MAX_IMG_BYTES = 10 * 1024 * 1024;

export async function handleHero(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/hero/, "");

  if (path === "/slides" && request.method === "GET") {
    return getSlides(env);
  }
  if (path === "/slides" && request.method === "PUT") {
    if (!verifyAdmin(request, env)) return jsonError(401, "Unauthorized");
    return putSlides(request, env);
  }
  if (path === "/upload" && request.method === "POST") {
    if (!verifyAdmin(request, env)) return jsonError(401, "Unauthorized");
    return uploadImage(request, env);
  }
  return jsonError(404, "Not Found");
}

async function getSlides(env) {
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
  return jsonOk({
    config: { maxSlides: 10, autoPlayMs: 6000 },
    slides,
  });
}

/** 전체 배열 교체: 기존 삭제 → 새로 생성. Airtable에는 bulk replace가 없으니 diff보다 이게 단순함 */
async function putSlides(request, env) {
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
  return jsonOk({ saved: created.length });
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
