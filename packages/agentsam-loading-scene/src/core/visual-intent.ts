import {
  INTENT_KEYS,
  ZERO_INTENT,
  type LoadingSceneSemantic,
  type VisualIntent,
} from "./types.js";

/** Default physics targets per semantic. Presets may override. */
export const DEFAULT_SEMANTIC_INTENTS: Record<LoadingSceneSemantic, Partial<VisualIntent>> = {
  idle: { luminance: 0.12, signalActivity: 0.02, forwardMotion: 0.01 },
  boot: { luminance: 0.35, forwardMotion: 0.15, structure: 0.12, signalActivity: 0.18 },
  reading: { luminance: 0.4, signalActivity: 0.35, forwardMotion: 0.2 },
  thinking: { luminance: 0.45, branching: 0.5, signalActivity: 0.3, forwardMotion: 0.12 },
  tool_execution: { luminance: 0.55, forwardMotion: 0.5, signalActivity: 0.6, branching: 0.15 },
  parallel_execution: { luminance: 0.6, branching: 0.72, signalActivity: 0.7, forwardMotion: 0.45 },
  context_loading: { luminance: 0.5, layerLift: 0.65, signalActivity: 0.35, forwardMotion: 0.15 },
  indexing: { luminance: 0.55, structure: 0.7, layerLift: 0.3, signalActivity: 0.5 },
  verification: { luminance: 0.5, verification: 0.8, structure: 0.6, signalActivity: 0.3, forwardMotion: 0.12 },
  compaction: { luminance: 0.45, convergence: 0.72, signalActivity: 0.35, forwardMotion: 0.18 },
  asset_generation: { luminance: 0.6, generation: 0.9, branching: 0.4, signalActivity: 0.7, forwardMotion: 0.25 },
  build: { luminance: 0.6, structure: 0.75, forwardMotion: 0.5, convergence: 0.3, signalActivity: 0.6 },
  deployment: { luminance: 0.65, forwardMotion: 0.85, convergence: 0.7, signalActivity: 0.6 },
  waiting_external: { luminance: 0.3, signalActivity: 0.06, forwardMotion: 0.04 },
  success: { luminance: 0.4, convergence: 0.4, verification: 0.6, structure: 0.5, forwardMotion: 0.05, signalActivity: 0.08 },
  error: { luminance: 0.35, fracture: 0.8, signalActivity: 0.12, forwardMotion: 0.05 },
};

/**
 * Blend weighted semantics into one intent vector:
 * "parallel tools + asset generation" is a blend, not a scene conflict.
 * Fracture and generation take the max so they are never diluted away.
 */
export function blendIntents(
  weighted: Array<{ semantic: LoadingSceneSemantic; weight: number }>,
  overrides?: Partial<Record<LoadingSceneSemantic, Partial<VisualIntent>>>,
): VisualIntent {
  if (weighted.length === 0) return { ...ZERO_INTENT };
  const total = weighted.reduce((s, w) => s + w.weight, 0) || 1;
  const out: VisualIntent = { ...ZERO_INTENT };
  const MAX_KEYS: Array<keyof VisualIntent> = ["fracture", "generation", "luminance"];

  for (const key of INTENT_KEYS) {
    let acc = 0;
    let max = 0;
    for (const { semantic, weight } of weighted) {
      const base = { ...DEFAULT_SEMANTIC_INTENTS[semantic], ...overrides?.[semantic] };
      const v = (base[key] ?? ZERO_INTENT[key]) as number;
      acc += v * (weight / total);
      if (v > max) max = v;
    }
    out[key] = clamp01(MAX_KEYS.includes(key) ? max : acc);
  }
  return out;
}

/** Concurrency widens branching instead of spawning extra loaders. */
export function applyConcurrency(intent: VisualIntent, activeCount: number): VisualIntent {
  if (activeCount <= 1) return intent;
  return {
    ...intent,
    branching: clamp01(intent.branching + Math.min(0.25, (activeCount - 1) * 0.07)),
    signalActivity: clamp01(intent.signalActivity + Math.min(0.2, (activeCount - 1) * 0.05)),
  };
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
