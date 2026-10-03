import type { StoreSnapshot } from "./operation-store.js";
import type { LoadingSceneSemantic, SceneState, ScenePreset } from "./types.js";
import { applyConcurrency, blendIntents } from "./visual-intent.js";
import { ZERO_INTENT } from "./types.js";

export interface ReducerMemory {
  presentedLabel: string;
  labelChangedAt: number;
}

const MIN_LABEL_INTERVAL_MS = 500;

/**
 * Snapshot → SceneState. Label changes are throttled so high-frequency
 * runtime noise never flickers the status copy; the geometry gets the
 * activity instead.
 */
export function deriveScene(
  snapshot: StoreSnapshot,
  memory: ReducerMemory,
  preset: ScenePreset,
  now = Date.now(),
): SceneState {
  const dominant = dominantSemantic(snapshot);

  let status: SceneState["status"] = "running";
  if (snapshot.anyFailed) status = "error";
  else if (snapshot.waitingOnly) status = "waiting";
  else if (snapshot.allSettled) status = "success";
  else if (snapshot.active.length === 0 && snapshot.weights.length === 0) status = "idle";

  const weights =
    status === "error"
      ? [...snapshot.weights, { semantic: "error" as LoadingSceneSemantic, weight: 2 }]
      : status === "success"
        ? [{ semantic: "success" as LoadingSceneSemantic, weight: 1 }]
        : snapshot.weights;

  const intent =
    weights.length === 0
      ? { ...ZERO_INTENT }
      : applyConcurrency(blendIntents(weights, preset.semanticIntents), snapshot.activeCount);

  // throttle label changes; status transitions always update immediately
  let label = snapshot.latestLabel ?? defaultLabel(status, dominant);
  const force = status === "error" || status === "success";
  if (!force && label !== memory.presentedLabel && now - memory.labelChangedAt < MIN_LABEL_INTERVAL_MS && memory.presentedLabel) {
    label = memory.presentedLabel;
  }
  if (label !== memory.presentedLabel) {
    memory.presentedLabel = label;
    memory.labelChangedAt = now;
  }

  let secondary: string | undefined;
  if (status === "waiting") secondary = "Waiting on an external service";
  else if (snapshot.activeCount > 1 && status === "running") secondary = `${snapshot.activeCount} tasks running`;

  return {
    status,
    intent,
    label,
    detail: snapshot.latestDetail && snapshot.latestDetail !== label ? snapshot.latestDetail : undefined,
    secondary,
    activeCount: snapshot.activeCount,
    progress: snapshot.progress,
    metricPoints: snapshot.metricPoints,
    dominantSemantic: dominant,
  };
}

function dominantSemantic(snapshot: StoreSnapshot): LoadingSceneSemantic {
  if (snapshot.weights.length === 0) return "idle";
  return [...snapshot.weights].sort((a, b) => b.weight - a.weight)[0]!.semantic;
}

function defaultLabel(status: SceneState["status"], semantic: LoadingSceneSemantic): string {
  if (status === "error") return "Something needs attention";
  if (status === "success") return "Ready";
  if (status === "idle") return "";
  const labels: Partial<Record<LoadingSceneSemantic, string>> = {
    boot: "Starting up",
    reading: "Understanding your project",
    thinking: "Planning",
    tool_execution: "Working",
    parallel_execution: "Working on several things",
    context_loading: "Gathering context",
    indexing: "Organizing your content",
    verification: "Checking everything",
    compaction: "Tidying up",
    asset_generation: "Generating artwork",
    build: "Building",
    deployment: "Publishing",
    waiting_external: "Waiting",
  };
  return labels[semantic] ?? "Working";
}
