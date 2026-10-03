import { useEffect } from "react";
import { AgentRuntimeField } from "@inneranimalmedia/agentsam-workbench/agent";
import { localStudioRuntimeVisuals } from "@/lib/runtime-visuals/local-studio-runtime";

export function LocalStudioRuntimeField({ blocking }: { blocking: boolean }) {
  useEffect(() => {
    if (blocking) localStudioRuntimeVisuals.startWorkspaceBoot();
    else localStudioRuntimeVisuals.completeWorkspaceBoot();
  }, [blocking]);

  return (
    <AgentRuntimeField
      controller={localStudioRuntimeVisuals.controller}
      blocking={blocking}
      className={blocking ? "z-40" : "z-20"}
      activeOpacity={1}
      passiveOpacity={0.34}
    />
  );
}
