import type { SourceAssetDescriptor, TransformOperation } from "../index.js";

export interface NodeTransformCapabilities {
  raster_normalizer: boolean;
  format_converter: boolean;
  vector_rasterizer: boolean;
  vector_tracer: boolean;
  svg_normalizer: boolean;
  vector_normalizer: boolean;
  text_outliner: boolean;
  tools: Readonly<Record<string, boolean>>;
}

export function inspectRaster(
  input: Buffer | Uint8Array | string,
  options?: { sharp?: unknown },
): Promise<Readonly<SourceAssetDescriptor>>;

export function normalizeRaster(
  input: Buffer | Uint8Array | string,
  options?: {
    operations?: readonly (string | TransformOperation)[];
    format?: string;
    sharp?: unknown;
  },
): Promise<Readonly<{
  buffer: Buffer;
  info: Readonly<Record<string, unknown>>;
  descriptor: Readonly<SourceAssetDescriptor>;
  operations: readonly string[];
}>>;

export function detectNodeTransformCapabilities(): Promise<Readonly<NodeTransformCapabilities>>;

export function traceRasterToSvg(
  input: Buffer | Uint8Array,
  options?: {
    tracer?: "auto" | "potrace" | "vtracer";
    threshold?: number;
    turdSize?: number;
    sharp?: unknown;
  },
): Promise<Readonly<{
  svg: string;
  tracer: string;
  descriptor: Readonly<SourceAssetDescriptor & { boundaryIntegrity: number }>;
  metrics: Readonly<{ boundaryIntegrity: number; width: number; height: number }>;
}>>;

export function normalizeSvgWithSvgo(
  svg: string,
  options?: { multipass?: boolean },
): Promise<Readonly<{
  svg: string;
  hasExplicitViewBox: boolean;
  hasLiveText: boolean;
  note: string;
}>>;
