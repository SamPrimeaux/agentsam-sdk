import type { ContentKind } from "../core/asset.js";

export interface ProbeResult {
  kind?: ContentKind;
  mime?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  hasAlpha?: boolean;
  bytes: number;
  ext?: Record<string, unknown>;
}

export interface ContentProcessor {
  readonly kind: ContentKind;
  /** Cheap, deterministic, no-LLM inspection of raw bytes. */
  probe(bytes: Uint8Array): ProbeResult | null;
}

export function readU32BE(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
export function readU32LE(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}
export function readU16BE(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}
export function readU16LE(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
export function ascii(b: Uint8Array, o: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[o + i]!);
  return s;
}
