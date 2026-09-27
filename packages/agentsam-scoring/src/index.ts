/**
 * @inneranimalmedia/agentsam-scoring
 *
 * Independent ScoreCard families over raw evidence. Weights live in
 * versioned JSON (`weights/*.vN.json`). Deterministic first; embeddings
 * via injected adapters; LLM last. Human accept/reject calibrates
 * recommendations — never mutates deterministic evidence.
 */

export type {
  ScoreKind,
  ScoreComponent,
  ScoreCard,
  WeightComponentDef,
  WeightConfig,
  ComponentRaws,
  ComputeScoreInput,
  ScoreExplanation,
} from "./types.js";

export {
  clamp01,
  clampScore,
  computeScoreCard,
  explainScoreCard,
  assertWeightSum,
} from "./compute.js";

export {
  BRAND_AFFINITY_V1,
  PACKAGE_READINESS_V1,
  computeBrandAffinity,
  computePackageReadiness,
} from "./formulas.js";

export type { BrandAffinityInput, PackageReadinessInput } from "./formulas.js";
