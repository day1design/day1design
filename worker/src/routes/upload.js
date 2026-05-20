import { jsonOk, jsonError } from "../lib/response.js";
import { verifyAdmin } from "../lib/auth.js";
import { safeFileName, datePrefix, randomId } from "../lib/r2.js";
import { createServices } from "../lib/services.js";
import { assertUploadPolicy, fileExt } from "../lib/upload-policy.js";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/upload/image — 관리자 전용, 단일 이미지 업로드
 * multipart/form-data:
 *   file: File (필수)
 *   folder: string (선택, 기본 "uploads")
 *   name: string (선택, 파일명 힌트)
 * 응답: { url }
 */
export async function handleUpload(
  request,
  env,
  ctx,
  services = createServices(env),
) {
  if (!(await verifyAdmin(request, env))) return jsonError(401, "Unauthorized");
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/upload/, "");

  if (path === "/image" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string")
      return jsonError(400, "file required");
    if (file.size > MAX_BYTES) return jsonError(413, "File too large");
    try {
      assertUploadPolicy(file);
    } catch (e) {
      return jsonError(e.status || 415, e.message);
    }

    const folder = String(form.get("folder") || "uploads").replace(
      /[^\w/-]/g,
      "",
    );
    const name = String(form.get("name") || file.name);
    const ext = fileExt(name) || "bin";
    const contentType = String(file.type || "").trim() || "image/webp";
    const key = `${folder}/${datePrefix()}-${randomId()}/${safeFileName(name.replace(/\.[^.]+$/, ""))}.${ext}`;
    const uploadedUrl = await services.media.upload(
      key,
      await file.arrayBuffer(),
      { contentType },
    );
    return jsonOk({ url: uploadedUrl, key });
  }

  return jsonError(404, "Not Found");
}
