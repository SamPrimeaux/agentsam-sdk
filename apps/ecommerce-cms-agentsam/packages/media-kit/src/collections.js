export const MEDIA_COLLECTION_KINDS = Object.freeze(["album", "gallery", "campaign", "product"]);
export const MEDIA_COLLECTION_STATUSES = Object.freeze(["draft", "ready", "published", "archived"]);

const KIND_SET = new Set(MEDIA_COLLECTION_KINDS);
const STATUS_SET = new Set(MEDIA_COLLECTION_STATUSES);

export function normalizeMediaCollectionDraft(input = {}) {
  const name = String(input.name || "").trim().slice(0, 120);
  if (!name) throw new TypeError("media collection name is required");
  const kind = KIND_SET.has(String(input.kind)) ? String(input.kind) : "album";
  const status = STATUS_SET.has(String(input.status)) ? String(input.status) : "draft";
  return Object.freeze({
    name,
    description: String(input.description || "").trim().slice(0, 1000),
    kind,
    status,
    presentation: {
      layout: String(input.presentation?.layout || "grid"),
      fit: String(input.presentation?.fit || "cover")
    }
  });
}

export function collectionMetaFromDraft(input = {}) {
  const draft = normalizeMediaCollectionDraft(input);
  return Object.freeze({
    kind: draft.kind,
    status: draft.status,
    presentation: draft.presentation
  });
}

export function isPublishableCollection(collection = {}) {
  const kind = String(collection.kind || collection.meta?.kind || "album");
  return kind === "gallery" || kind === "campaign" || kind === "product";
}
