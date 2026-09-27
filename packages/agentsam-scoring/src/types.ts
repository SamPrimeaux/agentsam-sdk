/**
 * Generic ScoreCard contract — independent score families.
 * Raw evidence is SSOT; scores are versioned derived views.
 */

export type ScoreKind =
  | "theme-similarity"
  | "brand-affinity"
  | "template-similarity"
  | "section-reuse"
  | "token-consistency"
  | "portability"
  | "package-readiness"
  | "drift"
  | "confidence"
  | "structural-similarity"
  | "reuse";

export interface ScoreComponent {
  raw: number;
  /** 0..1 after clamp/normalize. */
  normalized: number;
  weight: number;
  /** weight * normalized * 100 (pre-penalty contribution toward 0..100 score). */
  contribution: number;
}

export interface ScoreCard {
  id: string;
  kind: ScoreKind;
  /** 0..100 after weights and penalties. */
  score: number;
  /** 0..1 confidence in this derived view. */
  confidence: number;
  algorithm: string;
  weightsVersion: string;
  components: Record<string, ScoreComponent>;
  penalties: Record<string, number>;
  evidenceRefs: string[];
  computedAt: string;
}

export interface WeightComponentDef {
  weight: number;
  label?: string;
}

export interface WeightConfig {
  id: string;
  version: string;
  weightsVersion: string;
  algorithm: string;
  description?: string;
  components: Record<string, WeightComponentDef>;
  penalties?: Record<string, number>;
}

/** Raw component input before weighting. Prefer 0..1; values outside are clamped. */
export type ComponentRaws = Record<string, number>;

export interface ComputeScoreInput {
  id: string;
  kind: ScoreKind;
  weights: WeightConfig;
  raws: ComponentRaws;
  /** Active penalty keys (from weights.penalties) or explicit { key: points }. */
  activePenalties?: string[] | Record<string, number>;
  evidenceRefs?: string[];
  /** Optional override; default = coverage of non-zero raws / declared components. */
  confidence?: number;
  computedAt?: string;
  algorithm?: string;
}

export interface ScoreExplanation {
  scoreCard: ScoreCard;
  rankedComponents: Array<{ key: string; contribution: number; weight: number; normalized: number }>;
  totalPenalty: number;
  formula: string;
}
