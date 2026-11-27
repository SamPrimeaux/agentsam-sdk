import { useEffect, useState } from "react";
import { LoadingSceneController, computationalHyperspace } from "@inneranimalmedia/agentsam-loading-scene";
import { AgentRuntimeField } from "@inneranimalmedia/agentsam-workbench/agent";
import { localStudioRuntimeVisuals } from "@/lib/runtime-visuals/local-studio-runtime";

export function LocalStudioRuntimeField({ blocking }: { blocking: boolean }) {
  useEffect(() => {
    if (blocking) localStudioRuntimeVisuals.startWorkspaceBoot();
    else localStudioRuntimeVisuals.completeWorkspaceBoot();
  }, [blocking]);

  // Startup owns the full-frame loading scene. Never mount it behind an active workspace.
  if (!blocking) return null;

  return (
    <AgentRuntimeField
      controller={localStudioRuntimeVisuals.controller}
      blocking={blocking}
      className="z-40"
      activeOpacity={1}
    />
  );
}

/** Blocking editor entry only: mounted for the actual pending state, never behind content. */
export function WorkspaceOpeningField({ label }: { label: string }) {
  const [controller] = useState(() => {
    const field = new LoadingSceneController(computationalHyperspace);
    field.start({ operationId: "editor-opening", scope: "workspace", semantic: "context_loading", label, progress: null });
    return field;
  });
  return (
    <div className="relative isolate flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-background" role="status" aria-busy="true">
      <AgentRuntimeField controller={controller} blocking narration={false} activeOpacity={0.8}
        style={{ background: "transparent", pointerEvents: "none" }} />
      <div className="relative z-10 rounded-full bg-background/80 px-4 py-2 text-sm font-medium text-foreground backdrop-blur-sm">
        {label}
      </div>
    </div>
  );
}
