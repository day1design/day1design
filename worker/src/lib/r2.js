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

/**
 * R2 public URL → bucket key 추출.
 * publicBase prefix가 맞지 않으면 null (외부 URL로 간주, 삭제 안 함).
 */
export function urlToKey(url, publicBase) {
  if (!url || typeof url !== "string") return null;
  const base = String(
    publicBase || "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev",
  ).replace(/\/$/, "");
  if (!url.startsWith(base + "/")) return null;
  return decodeURIComponent(url.slice(base.length + 1));
}

/**
 * R2에서 URL 기준으로 단일 파일 삭제. 외부 URL/무효 URL은 무음 skip.
 */
export async function r2DeleteByUrl(bucket, url, publicBase) {
  const key = urlToKey(url, publicBase);
  if (!key || !bucket) return false;
  try {
    await bucket.delete(key);
    return true;
  } catch (e) {
    console.warn("[r2] delete failed:", key, e?.message);
    return false;
  }
}

/** 여러 URL을 병렬로 삭제. 실패는 무음 skip. */
export async function r2DeleteMany(bucket, urls, publicBase) {
  const list = (urls || []).filter((u) => typeof u === "string" && u);
  if (!list.length) return;
  await Promise.all(list.map((u) => r2DeleteByUrl(bucket, u, publicBase)));
}
