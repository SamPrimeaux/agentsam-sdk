import type {
  ComponentRaws,
  ComputeScoreInput,
  ScoreCard,
  ScoreComponent,
  ScoreExplanation,
  WeightConfig,
} from "./types.js";

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.round(n * 1000) / 1000;
}

function resolvePenalties(
  weights: WeightConfig,
  active?: string[] | Record<string, number>,
): Record<string, number> {
  if (!active) return {};
  const catalog = weights.penalties ?? {};
  if (Array.isArray(active)) {
    const out: Record<string, number> = {};
    for (const key of active) {
      const pts = catalog[key];
      if (typeof pts === "number" && pts > 0) out[key] = pts;
    }
    return out;
  }
  return { ...active };
}

function defaultConfidence(raws: ComponentRaws, weights: WeightConfig): number {
  const keys = Object.keys(weights.components);
  if (keys.length === 0) return 0;
  let present = 0;
  for (const key of keys) {
    const v = raws[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) present += 1;
  }
  return clamp01(present / keys.length);
}

/**
 * Deterministic weighted ScoreCard. Embeddings/LLM belong in adapters that
 * supply raws — this function never calls models.
 */
export function computeScoreCard(input: ComputeScoreInput): ScoreCard {
  const components: Record<string, ScoreComponent> = {};
  let weighted = 0;

  for (const [key, def] of Object.entries(input.weights.components)) {
    const raw = input.raws[key] ?? 0;
    const normalized = clamp01(raw);
    const weight = def.weight;
    const contribution = weight * normalized * 100;
    components[key] = { raw, normalized, weight, contribution };
    weighted += contribution;
  }

  const penalties = resolvePenalties(input.weights, input.activePenalties);
  const totalPenalty = Object.values(penalties).reduce((a, b) => a + b, 0);
  const score = clampScore(weighted - totalPenalty);
  const confidence =
    typeof input.confidence === "number"
      ? clamp01(input.confidence)
      : defaultConfidence(input.raws, input.weights);

  return {
    id: input.id,
    kind: input.kind,
    score,
    confidence,
    algorithm: input.algorithm ?? input.weights.algorithm,
    weightsVersion: input.weights.weightsVersion,
    components,
    penalties,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    computedAt: input.computedAt ?? new Date().toISOString(),
  };
}

/** Explainability helper for UI / receipts / tests. */
export function explainScoreCard(card: ScoreCard): ScoreExplanation {
  const rankedComponents = Object.entries(card.components)
    .map(([key, c]) => ({
      key,
      contribution: c.contribution,
      weight: c.weight,
      normalized: c.normalized,
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const totalPenalty = Object.values(card.penalties).reduce((a, b) => a + b, 0);
  const parts = rankedComponents
    .filter((c) => c.contribution > 0)
    .map((c) => `${c.key}(${(c.weight * 100).toFixed(0)}%×${c.normalized.toFixed(2)}=${c.contribution.toFixed(1)})`);
  const penaltyKeys = Object.keys(card.penalties);
  const formula =
    parts.length === 0 && totalPenalty === 0
      ? `${card.kind}: 0`
      : `${card.kind}: ${parts.join(" + ") || "0"}${
          totalPenalty > 0 ? ` − penalties[${penaltyKeys.join(",")}=${totalPenalty}]` : ""
        } → ${card.score}`;

  return { scoreCard: card, rankedComponents, totalPenalty, formula };
}

export function assertWeightSum(
  weights: WeightConfig,
  opts?: { tolerance?: number },
): { ok: boolean; sum: number } {
  const sum = Object.values(weights.components).reduce((a, c) => a + c.weight, 0);
  const tolerance = opts?.tolerance ?? 0.001;
  return { ok: Math.abs(sum - 1) <= tolerance, sum };
}
