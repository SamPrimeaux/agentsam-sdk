/**
 * @inneranimalmedia/agentsam-assets-core
 *
 * Canonical asset identity for AgentSam. BrandPack and Content are peer
 * domains over these records. Providers hold representations only.
 *
 * SSOT: docs/content-studio/REVISION_GATE_2026-09-27.md
 */

export type {
  AssetId,
  AssetKind,
  RepresentationProvider,
  RepresentationRole,
} from "./kinds.js";

import type { AssetId, AssetKind, RepresentationProvider, RepresentationRole } from "./kinds.js";

export interface AssetRepresentation {
  provider: RepresentationProvider;
  /** Provider-native id (R2 key, CF image id, Stream uid, Drive file id, localref_…). */
  ref: string;
  role: RepresentationRole;
  scope?: string;
  bytes?: number;
  mime?: string;
  url?: string;
  /** True only when backed by a verified provider receipt (e.g. CF Images POST result.id). */
  verified?: boolean;
  receipt?: Record<string, unknown>;
}

export interface AssetHashes {
  sha256?: string;
  /** Optional perceptual / content fingerprint for near-dupe. */
  perceptual?: string;
}

export interface AssetMachineFacts {
  hash?: string;
  mimeSniffed?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  hasAlpha?: boolean;
  bytes?: number;
  exif?: Record<string, string | number>;
  duplicateOf?: AssetId;
  computedAt?: string;
}

export interface AssetProvenanceEntry {
  at: string;
  action: string;
  actorRef?: string;
  detail?: Record<string, unknown>;
}

export interface AssetProvenance {
  generation?: {
    model?: string;
    promptHash?: string;
    prompt?: string;
    jobId?: string;
    sourceAssetIds?: AssetId[];
  };
  import?: {
    batch?: string;
    sourceUrl?: string;
    archive?: string;
  };
  derivedFrom?: AssetId;
  history: AssetProvenanceEntry[];
}

/**
 * Universal asset record. BrandPack and Content reference this by id;
 * they do not each invent a second image identity.
 */
export interface AssetRecord {
  id: AssetId;
  accountId: string;
  kind: AssetKind;
  originalName?: string;
  mime?: string;
  bytes?: number;
  hashes: AssetHashes;
  machineFacts: AssetMachineFacts;
  representations: AssetRepresentation[];
  provenance: AssetProvenance;
  createdAt: string;
  updatedAt: string;
}

export function createEmptyAssetRecord(partial: {
  id: AssetId;
  accountId: string;
  kind: AssetKind;
  originalName?: string;
  mime?: string;
  bytes?: number;
  createdAt?: string;
}): AssetRecord {
  const now = partial.createdAt ?? new Date().toISOString();
  return {
    id: partial.id,
    accountId: partial.accountId,
    kind: partial.kind,
    originalName: partial.originalName,
    mime: partial.mime,
    bytes: partial.bytes,
    hashes: {},
    machineFacts: {},
    representations: [],
    provenance: { history: [] },
    createdAt: now,
    updatedAt: now,
  };
}

export function primaryRepresentation(
  reps: AssetRepresentation[],
): AssetRepresentation | undefined {
  return (
    reps.find((r) => r.role === "delivery") ??
    reps.find((r) => r.role === "derivative") ??
    reps.find((r) => r.role === "master") ??
    reps.find((r) => r.role === "original") ??
    reps[0]
  );
}

export function masterRepresentation(
  reps: AssetRepresentation[],
): AssetRepresentation | undefined {
  return reps.find((r) => r.role === "master") ?? reps.find((r) => r.role === "original") ?? reps[0];
}

export function isAssetId(value: unknown): value is AssetId {
  return typeof value === "string" && value.startsWith("ast_");
}

export * from "./input.js";
