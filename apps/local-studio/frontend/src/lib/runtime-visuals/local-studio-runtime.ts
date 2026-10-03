import {
  LoadingSceneController,
  adaptAgentSamActivity,
  adaptAgentSamEvent,
  computationalHyperspace,
  type AgentSamActivityEvent,
  type LoadingSceneSemantic,
  type RawRuntimeEvent,
} from "@inneranimalmedia/agentsam-loading-scene";

const WORKSPACE_BOOT_OPERATION = "local-studio:workspace-boot";

export function createLocalStudioRuntimeVisuals() {
  const controller = new LoadingSceneController(computationalHyperspace);
  const surfaces = new Map<string, LoadingSceneController>();
  let bootActive = false;

  const controllerFor = (surfaceId?: string) => {
    if (!surfaceId) return controller;
    let surface = surfaces.get(surfaceId);
    if (!surface) {
      surface = new LoadingSceneController(computationalHyperspace);
      surfaces.set(surfaceId, surface);
    }
    return surface;
  };

  return {
    /** Workspace-level controller: boot/global shell activity only. */
    controller,

    /** Per-thread / per-co-worker controller for in-surface runtime scenes. */
    controllerFor,

    releaseSurface(surfaceId: string) {
      surfaces.delete(surfaceId);
    },

    startWorkspaceBoot(label = "Opening workspace") {
      if (bootActive) return;
      bootActive = true;
      controller.start({
        operationId: WORKSPACE_BOOT_OPERATION,
        scope: "workspace",
        semantic: "boot",
        label,
      });
    },

    completeWorkspaceBoot() {
      if (!bootActive) return;
      bootActive = false;
      controller.complete(WORKSPACE_BOOT_OPERATION);
    },

    startAgentTurn(
      operationId: string,
      label = "Understanding your request",
      detail?: string,
      surfaceId?: string,
    ) {
      controllerFor(surfaceId).start({
        operationId,
        scope: "workspace",
        semantic: "thinking",
        label,
        detail,
      });
    },

    markAgentTurnStreaming(
      operationId: string,
      label = "Writing response",
      detail?: string,
      surfaceId?: string,
    ) {
      controllerFor(surfaceId).activity({
        operationId,
        semantic: "thinking",
        label,
        detail,
      });
    },

    completeAgentTurn(operationId: string, surfaceId?: string) {
      controllerFor(surfaceId).complete(operationId);
    },

    failAgentTurn(operationId: string, detail?: string, surfaceId?: string) {
      controllerFor(surfaceId).fail(operationId, detail);
    },

    activity(
      operationId: string,
      semantic: LoadingSceneSemantic,
      label?: string,
      progress?: number | null,
      detail?: string,
      surfaceId?: string,
    ) {
      controllerFor(surfaceId).activity({ operationId, semantic, label, progress, detail });
    },

    progressPoints(
      operationId: string,
      semantic: LoadingSceneSemantic,
      label: string,
      completed: number,
      total: number,
      detail?: string,
      basis: "plan-points" | "phase-points" | "steps" | "provider" | "unknown" = "phase-points",
      surfaceId?: string,
    ) {
      controllerFor(surfaceId).activity({
        operationId,
        semantic,
        label,
        detail,
        metricPoints: { completed, total, basis },
        progress: total > 0 ? Math.max(0, Math.min(1, completed / total)) : null,
      });
    },

    reportRuntimeEvent(event: RawRuntimeEvent, surfaceId?: string) {
      controllerFor(surfaceId).handle(adaptAgentSamEvent(event));
    },

    reportActivityEvent(event: AgentSamActivityEvent, surfaceId?: string) {
      controllerFor(surfaceId).handle(adaptAgentSamActivity(event));
    },
  };
}

export const localStudioRuntimeVisuals = createLocalStudioRuntimeVisuals();
