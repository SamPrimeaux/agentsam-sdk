export declare const COPRO_MEDIA_ASSET_SCHEMA: "copro.media.asset.v1";

export type CoProMediaSource = {
  provider: string;
  locator: Record<string, unknown>;
  status?: string;
  observedAt?: string | null;
};

export type CoProMediaAsset = {
  schema: "copro.media.asset.v1";
  id: string;
  kind: "video" | "audio" | "image" | "caption" | "document" | "generated";
  name: string;
  mimeType?: string;
  durationUs?: number;
  width?: number;
  height?: number;
  provenance: Record<string, unknown>;
  sources: CoProMediaSource[];
  metadata: Record<string, unknown>;
};

export declare function createMediaAsset(input: {
  id: string;
  kind: CoProMediaAsset["kind"];
  name: string;
  mimeType?: string;
  durationUs?: number;
  width?: number;
  height?: number;
  provenance?: Record<string, unknown>;
  sources?: CoProMediaSource[];
  metadata?: Record<string, unknown>;
}): CoProMediaAsset;

export declare function addMediaSource(
  asset: CoProMediaAsset,
  source: CoProMediaSource
): CoProMediaAsset;

export declare class MemoryMediaRepository {
  put(asset: CoProMediaAsset): CoProMediaAsset;
  get(id: string): CoProMediaAsset | null;
  list(): CoProMediaAsset[];
  delete(id: string): boolean;
}

export declare function computeWaveformEnvelope(
  channelData: ArrayLike<number>,
  sampleCount?: number
): number[];

export declare function extractBrowserAudioWaveform(
  blob: Blob,
  sampleCount?: number
): Promise<
  | { ok: true; durationUs: number; samples: number[] }
  | { ok: false; reason: string; samples: number[] }
>;
