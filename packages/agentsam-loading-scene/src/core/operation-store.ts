import type {
  LoadingSceneEvent,
  LoadingSceneSemantic,
  OperationScope,
} from "./types.js";

export interface OperationRecord {
  id: string;
  parentId?: string;
  scope?: OperationScope;
  semantic: LoadingSceneSemantic;
  label?: string;
  detail?: string;
  progress: number | null;
  severity: "normal" | "warning" | "error";
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  phase: "running" | "completed" | "failed";
}

interface Pulse {
  semantic: LoadingSceneSemantic;
  at: number;
}

export interface StoreSnapshot {
  active: OperationRecord[];
  activeCount: number;
  /** Weighted semantics: operations + coalesced high-frequency pulses. */
  weights: Array<{ semantic: LoadingSceneSemantic; weight: number }>;
  latestLabel?: string;
  latestDetail?: string;
  progress: number | null;
  anyFailed: boolean;
  allSettled: boolean;
  waitingOnly: boolean;
}

const PULSE_WINDOW_MS = 1500;

/**
 * Accumulates real runtime events into an operation graph. High-frequency
 * noise (file reads etc.) arrives as operationId-less pulses and is
 * COALESCED: 19 reads in 300ms become one weighted "reading", not 19 UI
 * changes.
 */
export class OperationStore {
  private ops = new Map<string, OperationRecord>();
  private pulses: Pulse[] = [];

  handle(event: LoadingSceneEvent): void {
    if (!event.operationId) {
      this.pulses.push({ semantic: event.semantic, at: event.timestamp });
      if (this.pulses.length > 500) this.pulses.splice(0, this.pulses.length - 500);
      return;
    }
    const existing = this.ops.get(event.operationId);
    if (event.phase === "started" || !existing) {
      this.ops.set(event.operationId, {
        id: event.operationId,
        parentId: event.parentOperationId,
        scope: event.scope,
        semantic: event.semantic,
        label: event.label ?? existing?.label,
        detail: event.detail ?? existing?.detail,
        progress: event.progress ?? null,
        severity: event.severity ?? "normal",
        startedAt: existing?.startedAt ?? event.timestamp,
        updatedAt: event.timestamp,
        phase: event.phase === "failed" ? "failed" : event.phase === "completed" ? "completed" : "running",
      });
      return;
    }
    existing.semantic = event.semantic;
    existing.label = event.label ?? existing.label;
    existing.detail = event.detail ?? existing.detail;
    if (event.progress !== undefined) existing.progress = event.progress;
    if (event.severity) existing.severity = event.severity;
    existing.updatedAt = event.timestamp;
    if (event.phase === "completed") {
      existing.phase = "completed";
      existing.endedAt = event.timestamp;
    } else if (event.phase === "failed") {
      existing.phase = "failed";
      existing.severity = event.severity ?? "error";
      existing.endedAt = event.timestamp;
    }
  }

  complete(operationId: string, timestamp = Date.now()): void {
    const op = this.ops.get(operationId);
    if (op) {
      op.phase = "completed";
      op.endedAt = timestamp;
      op.updatedAt = timestamp;
    }
  }

  fail(operationId: string, detail?: string, timestamp = Date.now()): void {
    const op = this.ops.get(operationId);
    if (op) {
      op.phase = "failed";
      op.severity = "error";
      if (detail) op.detail = detail;
      op.endedAt = timestamp;
      op.updatedAt = timestamp;
    }
  }

  reset(): void {
    this.ops.clear();
    this.pulses = [];
  }

  snapshot(now = Date.now()): StoreSnapshot {
    const all = [...this.ops.values()];
    const active = all.filter((o) => o.phase === "running");
    const recentPulses = this.pulses.filter((p) => now - p.at <= PULSE_WINDOW_MS);

    const weightMap = new Map<LoadingSceneSemantic, number>();
    for (const op of active) {
      weightMap.set(op.semantic, (weightMap.get(op.semantic) ?? 0) + 1);
    }
    // Coalesced pulses contribute a bounded weight, however noisy.
    if (recentPulses.length > 0) {
      const bySemantic = new Map<LoadingSceneSemantic, number>();
      for (const p of recentPulses) bySemantic.set(p.semantic, (bySemantic.get(p.semantic) ?? 0) + 1);
      for (const [semantic, count] of bySemantic) {
        weightMap.set(semantic, (weightMap.get(semantic) ?? 0) + Math.min(1, count / 10) + 0.5);
      }
    }

    // concurrency → parallel_execution emerges from the graph, not from callers
    const toolCount = active.filter((o) => o.semantic === "tool_execution").length;
    if (toolCount > 1) {
      weightMap.delete("tool_execution");
      weightMap.set("parallel_execution", toolCount);
    }

    const latest = [...active].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const withLabel = [...active].filter((o) => o.label).sort((a, b) => b.updatedAt - a.updatedAt)[0];

    const measurable = active.filter((o) => typeof o.progress === "number");
    const progress =
      measurable.length > 0
        ? measurable.reduce((s, o) => s + (o.progress as number), 0) / measurable.length
        : null;

    const activeCount = active.length + Math.min(3, Math.ceil(recentPulses.length / 10));
    const waitingOnly =
      active.length > 0 && active.every((o) => o.semantic === "waiting_external");

    return {
      active,
      activeCount,
      weights: [...weightMap.entries()].map(([semantic, weight]) => ({ semantic, weight })),
      latestLabel: withLabel?.label ?? latest?.label,
      latestDetail: withLabel?.detail ?? latest?.detail,
      progress,
      anyFailed: all.some((o) => o.phase === "failed"),
      allSettled: all.length > 0 && active.length === 0,
      waitingOnly,
    };
  }
}
