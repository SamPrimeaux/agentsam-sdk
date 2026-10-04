import {
  LoadingSceneController,
  computationalHyperspace,
  type LoadingSceneSemantic,
} from '@inneranimalmedia/agentsam-loading-scene';

export interface AbsRuntimeScene {
  controller: LoadingSceneController;
  preset: typeof computationalHyperspace;
  begin(operationId: string, label?: string): void;
  activity(operationId: string, semantic: LoadingSceneSemantic, label?: string): void;
  context(operationId: string, label?: string): void;
  streaming(operationId: string, label?: string): void;
  asset(operationId: string, label?: string): void;
  waiting(operationId: string, label?: string): void;
  complete(operationId: string): void;
  fail(operationId: string, detail?: string): void;
  reset(): void;
}

export function createAbsRuntimeScene(): AbsRuntimeScene {
  const controller = new LoadingSceneController(computationalHyperspace);

  return {
    controller,
    preset: computationalHyperspace,

    begin(operationId, label = 'Building the experience') {
      controller.start({
        operationId,
        scope: 'build',
        semantic: 'build',
        label,
      });
    },

    activity(operationId, semantic, label) {
      controller.activity({ operationId, semantic, label });
    },

    context(operationId, label = 'Reading the current page') {
      controller.activity({
        operationId,
        semantic: 'context_loading',
        label,
      });
    },

    streaming(operationId, label = 'Building the interface') {
      controller.activity({
        operationId,
        semantic: 'build',
        label,
      });
    },

    asset(operationId, label = 'Generating visual assets') {
      controller.activity({
        operationId,
        semantic: 'asset_generation',
        label,
      });
    },

    waiting(operationId, label = 'Waiting for an external service') {
      controller.activity({
        operationId,
        semantic: 'waiting_external',
        label,
      });
    },

    complete(operationId) {
      controller.complete(operationId);
    },

    fail(operationId, detail) {
      controller.fail(operationId, detail);
    },

    reset() {
      controller.reset();
    },
  };
}
