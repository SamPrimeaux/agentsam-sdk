import type { LoadingSceneEvent, LoadingSceneSemantic, MetricPointProgress } from "../core/types.js";

/**
 * Converts raw AgentSam/CMS runtime events into the small visual
 * vocabulary. Providers (Completeful, Cloudflare, image models, tools)
 * NEVER leak into the renderer — new integrations only need a mapping
 * here or in the app's own adapter.
 */
export interface RawRuntimeEvent {
  type: string;
  operationId?: string;
  parentOperationId?: string;
  label?: string;
  detail?: string;
  progress?: number | null;
  metricPoints?: MetricPointProgress;
  activeCount?: number;
  timestamp?: number;
  error?: boolean;
}

const RULES: Array<[RegExp, LoadingSceneSemantic]> = [
  [/session|agent\.start|boot/i, "boot"],
  [/content\.asset\.generated|image|artwork|media\.gen|asset\.gen/i, "asset_generation"],
  [/read|fetch\.file|file\.open|catalog\.fetch/i, "reading"],
  [/inference|planning|plan\b|model\.|think/i, "thinking"],
  [/context/i, "context_loading"],
  [/index/i, "indexing"],
  [/verify|check|test|audit/i, "verification"],
  [/compact|compress/i, "compaction"],
  [/deploy|publish/i, "deployment"],
  [/build/i, "build"],
  [/wait|external|provider\.pending|poll/i, "waiting_external"],
  [/complete|success|done/i, "success"],
  [/error|fail|exception/i, "error"],
  [/tool|mcp|invoke/i, "tool_execution"],
];

export function mapRuntimeEventType(type: string): LoadingSceneSemantic {
  for (const [re, semantic] of RULES) {
    if (re.test(type)) return semantic;
  }
  // Unknown events must not crash and must not invent drama.
  return "thinking";
}

export function adaptAgentSamEvent(raw: RawRuntimeEvent): LoadingSceneEvent {
  const semantic = mapRuntimeEventType(raw.type);
  const failed = semantic === "error" || raw.error === true || /error|fail|exception/i.test(raw.type);
  const phase: LoadingSceneEvent["phase"] = failed
    ? "failed"
    : semantic === "success" || /complete|done/i.test(raw.type)
      ? "completed"
      : raw.operationId
        ? "progress"
        : "started";
  return {
    operationId: raw.operationId,
    parentOperationId: raw.parentOperationId,
    semantic: semantic === "success" ? "verification" : semantic,
    phase,
    label: raw.label,
    detail: raw.detail,
    progress: raw.metricPoints && raw.metricPoints.total > 0
      ? Math.max(0, Math.min(1, raw.metricPoints.completed / raw.metricPoints.total))
      : raw.progress,
    metricPoints: raw.metricPoints,
    activeCount: raw.activeCount,
    severity: phase === "failed" ? "error" : "normal",
    timestamp: raw.timestamp ?? Date.now(),
  };
}


export interface AgentSamActivityEvent {
  schema: "agentsam.activity.v1";
  run_id: string;
  seq?: number;
  timestamp?: string | number;
  phase:
    | "boot"
    | "observe"
    | "context"
    | "plan"
    | "execute"
    | "verify"
    | "compact"
    | "waiting"
    | "recover"
    | "complete";
  event:
    | "run.started"
    | "phase.changed"
    | "step.started"
    | "step.progress"
    | "step.completed"
    | "decision.made"
    | "tool.started"
    | "tool.completed"
    | "artifact.created"
    | "file.changed"
    | "approval.required"
    | "input.required"
    | "verification.completed"
    | "run.failed"
    | "run.completed";
  step_id?: string | null;
  parent_id?: string | null;
  label?: string;
  detail?: string | null;
  progress?: { current: number; total: number } | null;
  source?: { kind?: string; name?: string | null } | null;
  evidence?: Record<string, unknown> | null;
}

const ACTIVITY_PHASE_SEMANTICS: Record<AgentSamActivityEvent["phase"], LoadingSceneSemantic> = {
  boot: "boot",
  observe: "reading",
  context: "context_loading",
  plan: "thinking",
  execute: "tool_execution",
  verify: "verification",
  compact: "compaction",
  waiting: "waiting_external",
  recover: "thinking",
  complete: "verification",
};

function semanticForActivity(event: AgentSamActivityEvent): LoadingSceneSemantic {
  if (event.event === "run.failed") return "error";
  if (event.event === "approval.required" || event.event === "input.required") return "waiting_external";
  if (event.event === "artifact.created") return "asset_generation";
  if (event.event === "file.changed") return "build";
  if (event.event === "tool.started" || event.event === "tool.completed") return "tool_execution";
  if (event.event === "verification.completed") return "verification";
  return ACTIVITY_PHASE_SEMANTICS[event.phase];
}

/**
 * Direct adapter for the canonical agentsam.activity.v1 contract.
 *
 * Progress.current/total is treated as deterministic metric points. The
 * renderer does not estimate time or invent intermediate percentages.
 */
export function adaptAgentSamActivity(event: AgentSamActivityEvent): LoadingSceneEvent {
  const semantic = semanticForActivity(event);
  const completed =
    event.event === "step.completed" ||
    event.event === "tool.completed" ||
    event.event === "verification.completed" ||
    event.event === "run.completed";
  const failed = event.event === "run.failed";
  const metricPoints =
    event.progress && event.progress.total > 0
      ? {
          completed: event.progress.current,
          total: event.progress.total,
          basis: "plan-points" as const,
        }
      : undefined;
  const rawTimestamp =
    typeof event.timestamp === "number"
      ? event.timestamp
      : event.timestamp
        ? Date.parse(event.timestamp)
        : Date.now();

  return {
    operationId: event.step_id || event.run_id,
    parentOperationId: event.parent_id || (event.step_id ? event.run_id : undefined),
    semantic: semantic === "error" ? "error" : semantic,
    phase: failed ? "failed" : completed ? "completed" : event.event === "run.started" ? "started" : "progress",
    label: event.label || undefined,
    detail: event.detail || undefined,
    progress:
      metricPoints && metricPoints.total > 0
        ? Math.max(0, Math.min(1, metricPoints.completed / metricPoints.total))
        : null,
    metricPoints,
    severity: failed ? "error" : "normal",
    timestamp: Number.isFinite(rawTimestamp) ? rawTimestamp : Date.now(),
  };
}
