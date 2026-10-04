export const COPRO_MEDIA_ASSET_SCHEMA = "copro.media.asset.v1";

function clone(value) {
  return structuredClone(value);
}

export function createMediaAsset({
  id,
  kind,
  name,
  mimeType,
  durationUs,
  width,
  height,
  provenance = {},
  sources = [],
  metadata = {},
} = {}) {
  if (!id) throw new Error("copro_media_asset_id_required");
  if (!["video", "audio", "image", "caption", "document", "generated"].includes(kind)) {
    throw new Error("copro_media_asset_kind_invalid");
  }
  if (!name) throw new Error("copro_media_asset_name_required");

  return {
    schema: COPRO_MEDIA_ASSET_SCHEMA,
    id: String(id),
    kind,
    name: String(name),
    mimeType: mimeType ? String(mimeType) : undefined,
    durationUs: durationUs ?? undefined,
    width: width ?? undefined,
    height: height ?? undefined,
    provenance: clone(provenance),
    sources: clone(sources),
    metadata: clone(metadata),
  };
}

export function addMediaSource(asset, source) {
  if (!source?.provider || !source?.locator) throw new Error("copro_media_source_invalid");
  const next = clone(asset);
  next.sources.push({
    provider: String(source.provider),
    locator: clone(source.locator),
    status: source.status ?? "available",
    observedAt: source.observedAt ?? null,
  });
  return next;
}

export class MemoryMediaRepository {
  #assets = new Map();

  put(asset) {
    if (asset?.schema !== COPRO_MEDIA_ASSET_SCHEMA) throw new Error("copro_media_asset_invalid");
    this.#assets.set(asset.id, clone(asset));
    return clone(asset);
  }

  get(id) {
    const asset = this.#assets.get(id);
    return asset ? clone(asset) : null;
  }

  list() {
    return [...this.#assets.values()].map(clone);
  }

  delete(id) {
    return this.#assets.delete(id);
  }
}
