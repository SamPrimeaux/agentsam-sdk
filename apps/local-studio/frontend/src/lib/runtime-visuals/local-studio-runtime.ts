import {
  LoadingSceneController,
  adaptAgentSamEvent,
  computationalHyperspace,
  type LoadingSceneSemantic,
  type RawRuntimeEvent,
} from "@inneranimalmedia/agentsam-loading-scene";

const WORKSPACE_BOOT_OPERATION = "local-studio:workspace-boot";

export function createLocalStudioRuntimeVisuals() {
  const controller = new LoadingSceneController(computationalHyperspace);
  let bootActive = false;

  return {
    controller,

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
    ) {
      controller.start({
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
    ) {
      controller.activity({
        operationId,
        semantic: "thinking",
        label,
        detail,
      });
    },

    completeAgentTurn(operationId: string) {
      controller.complete(operationId);
    },

    failAgentTurn(operationId: string, detail?: string) {
      controller.fail(operationId, detail);
    },

    activity(
      operationId: string,
      semantic: LoadingSceneSemantic,
      label?: string,
      progress?: number | null,
    ) {
      controller.activity({ operationId, semantic, label, progress });
    },
  };
}

export const localStudioRuntimeVisuals = createLocalStudioRuntimeVisuals();
