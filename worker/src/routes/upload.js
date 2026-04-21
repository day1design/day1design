import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { r2Upload, safeFileName, datePrefix, randomId } from "../lib/r2.js";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/upload/image — 관리자 전용, 단일 이미지 업로드
 * multipart/form-data:
 *   file: File (필수)
 *   folder: string (선택, 기본 "uploads")
 *   name: string (선택, 파일명 힌트)
 * 응답: { url }
 */
export async function handleUpload(request, env, ctx) {
  if (!verifyAdmin(request, env)) return jsonError(401, "Unauthorized");
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/upload/, "");

  if (path === "/image" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string")
      return jsonError(400, "file required");
    if (file.size > MAX_BYTES) return jsonError(413, "File too large");
    const ct = file.type || "";
    if (!ct.startsWith("image/")) return jsonError(415, "Only images allowed");

    const folder = String(form.get("folder") || "uploads").replace(
      /[^\w/-]/g,
      "",
    );
    const name = String(form.get("name") || file.name);
    const ext = (name.split(".").pop() || "webp").toLowerCase().slice(0, 8);
    const key = `${folder}/${datePrefix()}-${randomId()}/${safeFileName(name.replace(/\.[^.]+$/, ""))}.${ext}`;
    const uploadedUrl = await r2Upload(
      env.IMAGES,
      key,
      await file.arrayBuffer(),
      {
        contentType: ct,
        publicBase: env.R2_PUBLIC_BASE,
      },
    );
    return jsonOk({ url: uploadedUrl, key });
  }

  return jsonError(404, "Not Found");
}
