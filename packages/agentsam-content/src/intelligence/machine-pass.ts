import { createHash } from "node:crypto";
import type { ContentAsset } from "../core/asset.js";
import type { MachineFacts } from "../core/intelligence.js";
import { probeBytes } from "../processors/index.js";

/**
 * The cheap deterministic pass. Never an LLM. Runs before any
 * semantic enrichment: hash, mime sniff, dimensions, duration,
 * alpha, size, duplicate detection.
 */
export interface MachinePassOptions {
  /** Existing assets to check for duplicates (hash equality). */
  existing?: Iterable<Pick<ContentAsset, "id" | "intelligence">>;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function runMachinePass(bytes: Uint8Array, opts: MachinePassOptions = {}): MachineFacts {
  const facts: MachineFacts = {
    bytes: bytes.byteLength,
    hash: sha256Hex(bytes),
    computedAt: new Date().toISOString(),
  };

  const probe = probeBytes(bytes);
  if (probe) {
    facts.mimeSniffed = probe.mime;
    facts.width = probe.width;
    facts.height = probe.height;
    facts.durationMs = probe.durationMs;
    facts.hasAlpha = probe.hasAlpha;
  }

  if (opts.existing) {
    for (const other of opts.existing) {
      if (other.intelligence?.machine?.hash === facts.hash) {
        facts.duplicateOf = other.id;
        break;
      }
    }
  }

  return facts;
}

/** Apply machine facts onto an asset (fills gaps, never overwrites human edits). */
export function applyMachineFacts(asset: ContentAsset, facts: MachineFacts): ContentAsset {
  return {
    ...asset,
    mime: asset.mime ?? facts.mimeSniffed,
    bytes: asset.bytes ?? facts.bytes,
    width: asset.width ?? facts.width,
    height: asset.height ?? facts.height,
    durationMs: asset.durationMs ?? facts.durationMs,
    intelligence: { ...asset.intelligence, machine: facts },
  };
}
