import type { LoadingSceneEvent, LoadingSceneSemantic } from "../core/types.js";

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
    progress: raw.progress,
    activeCount: raw.activeCount,
    severity: phase === "failed" ? "error" : "normal",
    timestamp: raw.timestamp ?? Date.now(),
  };
}
