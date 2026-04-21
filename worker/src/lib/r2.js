/**
 * R2에 파일 업로드 후 public URL 반환
 * @param {R2Bucket} bucket - env.IMAGES
 * @param {string} key - 저장 경로 (예: "estimates/20260421-foo/001.webp")
 * @param {ArrayBuffer|ReadableStream|Blob} body
 * @param {object} opts - { contentType, publicBase }
 */
export async function r2Upload(bucket, key, body, opts = {}) {
  const { contentType, publicBase } = opts;
  await bucket.put(key, body, {
    httpMetadata: contentType ? { contentType } : undefined,
  });
  const base =
    publicBase || "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev";
  return `${base.replace(/\/$/, "")}/${key}`;
}

/** 파일명 안전화 */
export function safeFileName(name) {
  return String(name || "file")
    .replace(/[^\w.\-ㄱ-ㅎ가-힣]/g, "_")
    .slice(0, 120);
}

/** Date-based prefix (예: "20260421") */
export function datePrefix(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export function randomId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
