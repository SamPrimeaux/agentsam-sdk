/** Deliberately small visual vocabulary. Richer runtime detail stays upstream. */
export type LoadingSceneSemantic =
  | "idle"
  | "boot"
  | "reading"
  | "thinking"
  | "tool_execution"
  | "parallel_execution"
  | "context_loading"
  | "indexing"
  | "verification"
  | "compaction"
  | "asset_generation"
  | "asset_ingest"
  | "preflight"
  | "vectorization"
  | "color_normalization"
  | "manufacturing_compile"
  | "digitization_handoff"
  | "receipt_persistence"
  | "workspace_cleanup"
  | "build"
  | "deployment"
  | "waiting_external"
  | "success"
  | "error";

export type OperationScope = "workspace" | "site" | "page" | "asset" | "build" | "publish";

export type OperationPhase = "started" | "progress" | "completed" | "failed";

export interface MetricPointProgress {
  completed: number;
  total: number;
  basis?: "plan-points" | "phase-points" | "steps" | "provider" | "unknown";
}

export interface LoadingSceneEvent {
  operationId?: string;
  parentOperationId?: string;
  scope?: OperationScope;
  semantic: LoadingSceneSemantic;
  phase: OperationPhase;
  /** What the user cares about — independent of visual state. */
  label?: string;
  detail?: string;
  /** Real measurable progress only. Never fabricated. */
  progress?: number | null;
  /** Optional weighted metric-point projection for the current run/plan. */
  metricPoints?: MetricPointProgress;
  activeCount?: number;
  severity?: "normal" | "warning" | "error";
  timestamp: number;
}

/**
 * The blended visual intent vector. States are not scenes — they are
 * target physics for ONE persistent world.
 */
export interface VisualIntent {
  forwardMotion: number;
  branching: number;
  layerLift: number;
  structure: number;
  generation: number;
  convergence: number;
  verification: number;
  fracture: number;
  signalActivity: number;
  luminance: number;
}

export type SceneStatus = "idle" | "running" | "waiting" | "success" | "error";

export interface SceneState {
  status: SceneStatus;
  intent: VisualIntent;
  label: string;
  /** Task-specific commentary supplied by the runtime. Never fabricated by the renderer. */
  detail?: string;
  /** Small system metadata such as concurrency/waiting state. */
  secondary?: string;
  activeCount: number;
  /** Known progress 0..1 or null when unknowable. */
  progress: number | null;
  /** Weighted metric-point projection when the runtime can provide one. */
  metricPoints?: MetricPointProgress;
  dominantSemantic: LoadingSceneSemantic;
}

export interface PalettePreset {
  canvas: string;
  line: string;
  accents: string[]; // muted violet / indigo / dusty rose / amber / steel
  warning: string;
  text: string;
}

export interface ScenePreset {
  id: string;
  palette: PalettePreset;
  /** Per-semantic intent targets; blended, never scene-switched. */
  semanticIntents: Record<LoadingSceneSemantic, Partial<VisualIntent>>;
  geometry: { pathCount: number; signalCount: number; layerCount: number; topologyCount: number };
  transition: { easing: number; settleMs: number };
  reducedMotion: { signalActivity: number; forwardMotion: number };
}

export const ZERO_INTENT: VisualIntent = {
  forwardMotion: 0,
  branching: 0,
  layerLift: 0,
  structure: 0,
  generation: 0,
  convergence: 0,
  verification: 0,
  fracture: 0,
  signalActivity: 0,
  luminance: 0.12,
};

export const INTENT_KEYS = Object.keys(ZERO_INTENT) as Array<keyof VisualIntent>;
