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


export function computeWaveformEnvelope(channelData, sampleCount = 96) {
  if (!channelData || typeof channelData.length !== "number" || channelData.length === 0) {
    return [];
  }
  const count = Math.max(8, Math.min(512, Math.round(sampleCount)));
  const blockSize = Math.max(1, Math.floor(channelData.length / count));
  const envelope = [];

  for (let index = 0; index < count; index += 1) {
    const start = index * blockSize;
    const end = index === count - 1 ? channelData.length : Math.min(channelData.length, start + blockSize);
    let peak = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      peak = Math.max(peak, Math.abs(channelData[cursor] ?? 0));
    }
    envelope.push(Number(peak.toFixed(4)));
  }

  const max = Math.max(...envelope, 0);
  if (max <= 0) return envelope;
  return envelope.map((value) => Number((value / max).toFixed(4)));
}

export async function extractBrowserAudioWaveform(blob, sampleCount = 96) {
  const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextCtor) {
    return { ok: false, reason: "audio_context_unavailable", samples: [] };
  }

  const context = new AudioContextCtor();
  try {
    const buffer = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    return {
      ok: true,
      durationUs: Math.round(decoded.duration * 1_000_000),
      samples: computeWaveformEnvelope(channel, sampleCount),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "audio_decode_failed",
      samples: [],
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}
