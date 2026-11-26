/**
 * Local storage discovery candidates.
 *
 * This module inspects explicit local development configuration only. It is
 * not the production storage router, does not persist mappings, and must never
 * guess an account's provider connection or selected bucket.
 */

export type StorageProviderKind = "r2" | "local" | "s3";

export type StorageCapabilityName = "list" | "read" | "write" | "delete" | "deliver";

export interface StorageCandidate {
  provider: StorageProviderKind;
  /** Worker binding name, when the store is bound into a Worker. */
  binding?: string;
  bucket?: string;
  /** Local filesystem root, for provider "local". */
  path?: string;
  accountId?: string;
  publicBaseUrl?: string;
  capabilities: StorageCapabilityName[];
  /** 0..n, higher is a better guess. Deterministic; see scoreStorageCandidate. */
  confidence: number;
  /** Where this candidate was found (e.g. "wrangler.jsonc"). */
  source?: string;
}

export interface StorageDiscoveryHints {
  /** Explicit bindings already declared by the local application. */
  knownBindings?: string[];
  /** Number of current local development records pointing at this store. */
  recordCount?: number;
}

/** Simple, explainable scoring. No magic; callers still confirm with the user. */
export function scoreStorageCandidate(
  c: Omit<StorageCandidate, "confidence">,
  hints: StorageDiscoveryHints = {},
): number {
  let score = 0;
  if (c.binding && hints.knownBindings?.includes(c.binding)) score += 90;
  if ((hints.recordCount ?? 0) > 0) score += 70;
  if (c.publicBaseUrl) score += 50;
  return score;
}

export function rankStorageCandidates(
  candidates: Array<Omit<StorageCandidate, "confidence"> & { confidence?: number }>,
  hints: StorageDiscoveryHints = {},
): StorageCandidate[] {
  return candidates
    .map((c) => ({ ...c, confidence: scoreStorageCandidate(c, hints) }) as StorageCandidate)
    .sort((a, b) => b.confidence - a.confidence);
}

