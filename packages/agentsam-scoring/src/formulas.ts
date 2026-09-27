import type { ComponentRaws, ScoreCard } from "./types.js";
import { computeScoreCard } from "./compute.js";
import { BRAND_AFFINITY_V1, PACKAGE_READINESS_V1 } from "./weights.js";

export { BRAND_AFFINITY_V1, PACKAGE_READINESS_V1 };

export interface BrandAffinityInput {
  id: string;
  raws: ComponentRaws;
  activePenalties?: string[] | Record<string, number>;
  evidenceRefs?: string[];
  confidence?: number;
  computedAt?: string;
}

/**
 * brand_affinity v1:
 * 0.30 known-asset + 0.20 logo/mark + 0.15 names/domains/metadata
 * + 0.10 palette + 0.10 typography + 0.10 imagery-style + 0.05 contextual usage
 */
export function computeBrandAffinity(input: BrandAffinityInput): ScoreCard {
  return computeScoreCard({
    id: input.id,
    kind: "brand-affinity",
    weights: BRAND_AFFINITY_V1,
    raws: input.raws,
    activePenalties: input.activePenalties,
    evidenceRefs: input.evidenceRefs,
    confidence: input.confidence,
    computedAt: input.computedAt,
  });
}

export interface PackageReadinessInput {
  id: string;
  raws: ComponentRaws;
  activePenalties?: string[] | Record<string, number>;
  evidenceRefs?: string[];
  confidence?: number;
  computedAt?: string;
}

/**
 * package_readiness v1:
 * 0.22 recurrence + 0.18 structural + 0.16 portability + 0.14 token coverage
 * + 0.10 responsive + 0.08 stability + 0.07 framework independence
 * + 0.05 testability − penalties
 */
export function computePackageReadiness(input: PackageReadinessInput): ScoreCard {
  return computeScoreCard({
    id: input.id,
    kind: "package-readiness",
    weights: PACKAGE_READINESS_V1,
    raws: input.raws,
    activePenalties: input.activePenalties,
    evidenceRefs: input.evidenceRefs,
    confidence: input.confidence,
    computedAt: input.computedAt,
  });
}
