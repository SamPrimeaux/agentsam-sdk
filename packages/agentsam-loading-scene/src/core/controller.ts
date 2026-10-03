import { OperationStore } from "./operation-store.js";
import { deriveScene, type ReducerMemory } from "./reducer.js";
import type {
  LoadingSceneEvent,
  LoadingSceneSemantic,
  OperationScope,
  SceneState,
  ScenePreset,
  MetricPointProgress,
} from "./types.js";

export type SceneListener = (scene: SceneState) => void;

/**
 * The application-facing runtime interface. The app reports truth;
 * the package determines presentation. No window globals.
 */
export class LoadingSceneController {
  private store = new OperationStore();
  private listeners = new Set<SceneListener>();
  private memory: ReducerMemory = { presentedLabel: "", labelChangedAt: 0 };
  private preset: ScenePreset;
  private now: () => number;

  constructor(preset: ScenePreset, opts: { now?: () => number } = {}) {
    this.preset = preset;
    this.now = opts.now ?? Date.now;
  }

  handle(event: LoadingSceneEvent): void {
    this.store.handle(event);
    this.notify();
  }

  start(input: {
    operationId: string;
    scope?: OperationScope;
    label?: string;
    semantic?: LoadingSceneSemantic;
    parentOperationId?: string;
    detail?: string;
    progress?: number | null;
    metricPoints?: MetricPointProgress;
  }): void {
    this.handle({
      operationId: input.operationId,
      parentOperationId: input.parentOperationId,
      scope: input.scope,
      semantic: input.semantic ?? "boot",
      phase: "started",
      label: input.label,
      detail: input.detail,
      progress: input.progress,
      metricPoints: input.metricPoints,
      timestamp: this.now(),
    });
  }

  activity(input: {
    operationId?: string;
    parentOperationId?: string;
    semantic: LoadingSceneSemantic;
    label?: string;
    detail?: string;
    progress?: number | null;
    metricPoints?: MetricPointProgress;
  }): void {
    this.handle({
      ...input,
      phase: input.operationId ? "progress" : "started",
      timestamp: this.now(),
    });
  }

  complete(operationId: string): void {
    this.store.complete(operationId, this.now());
    this.notify();
  }

  fail(operationId: string, detail?: string): void {
    this.store.fail(operationId, detail, this.now());
    this.notify();
  }

  reset(): void {
    this.store.reset();
    this.memory = { presentedLabel: "", labelChangedAt: 0 };
    this.notify();
  }

  getScene(): SceneState {
    return deriveScene(this.store.snapshot(this.now()), this.memory, this.preset, this.now());
  }

  subscribe(listener: SceneListener): () => void {
    this.listeners.add(listener);
    listener(this.getScene());
    return () => this.listeners.delete(listener);
  }

  /** Dev/debug only: force a semantic without inventing fake production events. */
  debugSet(semantic: LoadingSceneSemantic, label?: string): void {
    this.reset();
    if (semantic === "idle") return;
    this.handle({
      operationId: "debug",
      semantic: semantic === "success" || semantic === "error" ? "tool_execution" : semantic,
      phase: "started",
      label,
      timestamp: this.now(),
    });
    if (semantic === "success") this.complete("debug");
    if (semantic === "error") this.fail("debug", label);
  }

  private notify(): void {
    const scene = this.getScene();
    for (const l of this.listeners) l(scene);
  }
}
