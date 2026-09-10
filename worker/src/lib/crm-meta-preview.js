const META_THUMB_PREFIX = "meta-ads/thumbs/";
const CREATIVE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function metaCreativeThumbKey(creativeId) {
  const value = String(creativeId || "");
  if (!CREATIVE_ID_RE.test(value)) throw new Error("meta_preview_id_invalid");
  return `${META_THUMB_PREFIX}${value}`;
}

export const CRM_META_PREVIEW_CONTRACT = Object.freeze({
  keyPrefix: META_THUMB_PREFIX,
  idPattern: CREATIVE_ID_RE.source,
  access: "authenticated-owner-route",
  source: "private-R2-mirror",
});
