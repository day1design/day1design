const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"]);
const DOCUMENT_EXTS = new Set(["pdf", "zip"]);

export function fileExt(name) {
  return String(name || "")
    .split(".")
    .pop()
    .toLowerCase()
    .slice(0, 12);
}

export function isImageUpload(file) {
  const type = String(file?.type || "").toLowerCase();
  const ext = fileExt(file?.name);
  return type.startsWith("image/") || IMAGE_EXTS.has(ext);
}

export function isWebpImageUpload(file) {
  return (
    isImageUpload(file) &&
    String(file?.type || "").toLowerCase() === "image/webp" &&
    fileExt(file?.name) === "webp"
  );
}

export function isAllowedDocumentUpload(file) {
  const type = String(file?.type || "").toLowerCase();
  const ext = fileExt(file?.name);
  if (!DOCUMENT_EXTS.has(ext)) return false;
  if (ext === "pdf") return type === "application/pdf";
  return [
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
  ].includes(type);
}

export function uploadPolicyError(file, { allowDocuments = false } = {}) {
  if (isImageUpload(file)) return null;
  if (allowDocuments && isAllowedDocumentUpload(file)) return null;
  return allowDocuments
    ? "Only image files, PDF files, or ZIP files are allowed"
    : "Only image files are allowed";
}

export function assertUploadPolicy(file, opts = {}) {
  const message = uploadPolicyError(file, opts);
  if (!message) return;
  const err = new Error(message);
  err.status = 415;
  throw err;
}
