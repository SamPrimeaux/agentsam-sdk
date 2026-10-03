import type {
  LoadingSceneController,
  LoadingSceneSemantic,
  MetricPointProgress,
} from '@inneranimalmedia/agentsam-loading-scene';

export type ManufacturingLoadingState =
  | 'UPLOADING'
  | 'PREFLIGHT_CHECK'
  | 'NORMALIZING_COLOR'
  | 'VECTORIZING'
  | 'COMPILING_MANUFACTURING'
  | 'DIGITIZATION_HANDOFF';

export type ReceiptLoadingState =
  | 'VERIFYING_HASHES'
  | 'PERSISTING_RECEIPT'
  | 'CLEANING_WORKSPACE';

interface PipelineStateConfig {
  semantic: LoadingSceneSemantic;
  label: string;
  detail: string;
}

const MANUFACTURING_STATES: Record<ManufacturingLoadingState, PipelineStateConfig> = {
  UPLOADING: {
    semantic: 'asset_ingest',
    label: 'Ingesting master artwork',
    detail: 'Raster/vector parser',
  },
  PREFLIGHT_CHECK: {
    semantic: 'preflight',
    label: 'Evaluating physical print resolution',
    detail: 'Calculating effective PPI from placement geometry',
  },
  NORMALIZING_COLOR: {
    semantic: 'color_normalization',
    label: 'Normalizing production color',
    detail: 'Color profile and transparency normalization',
  },
  VECTORIZING: {
    semantic: 'vectorization',
    label: 'Tracing production paths',
    detail: 'Raster boundary to monochrome vector',
  },
  COMPILING_MANUFACTURING: {
    semantic: 'manufacturing_compile',
    label: 'Compiling manufacturing derivative',
    detail: 'Provider profile validation and export',
  },
  DIGITIZATION_HANDOFF: {
    semantic: 'digitization_handoff',
    label: 'Preparing digitization handoff',
    detail: 'Embroidery source is prepared, not yet a stitch file',
  },
};

const RECEIPT_STATES: Record<ReceiptLoadingState, PipelineStateConfig> = {
  VERIFYING_HASHES: {
    semantic: 'verification',
    label: 'Verifying snapshot integrity',
    detail: 'Pre/post hashes and stale-write evidence',
  },
  PERSISTING_RECEIPT: {
    semantic: 'receipt_persistence',
    label: 'Persisting receipt envelope',
    detail: 'agentsam.receipt.v1 to durable catalog storage',
  },
  CLEANING_WORKSPACE: {
    semantic: 'workspace_cleanup',
    label: 'Cleaning ephemeral workspace',
    detail: 'Reclaiming local temporary storage',
  },
};

export interface PipelineTransitionOptions {
  label?: string;
  detail?: string;
  progress?: number | null;
  metricPoints?: MetricPointProgress;
}

function createController<TState extends string>(
  controller: LoadingSceneController,
  states: Record<TState, PipelineStateConfig>,
  operationId: string,
) {
  let started = false;
  let completed = false;

  function transitionTo(state: TState, options: PipelineTransitionOptions = {}) {
    const config = states[state];
    if (!config || completed) return;

    const payload = {
      operationId,
      semantic: config.semantic,
      label: options.label || config.label,
      detail: options.detail || config.detail,
      progress: options.progress,
      metricPoints: options.metricPoints,
    };

    if (!started) {
      controller.start({ ...payload, scope: 'asset' });
      started = true;
      return;
    }

    controller.activity(payload);
  }

  return {
    transitionTo,
    complete() {
      if (!started || completed) return;
      completed = true;
      controller.complete(operationId);
    },
    fail(detail?: string) {
      if (!started || completed) return;
      completed = true;
      controller.fail(operationId, detail);
    },
    destroy() {
      if (started && !completed) controller.complete(operationId);
      completed = true;
    },
  };
}

export function createManufacturingLoadingController(
  controller: LoadingSceneController,
  { operationId = 'manufacturing-preflight' }: { operationId?: string } = {},
) {
  return createController(controller, MANUFACTURING_STATES, operationId);
}

export function createReceiptPipelineLoadingController(
  controller: LoadingSceneController,
  { operationId = 'receipt-pipeline' }: { operationId?: string } = {},
) {
  return createController(controller, RECEIPT_STATES, operationId);
}

export { MANUFACTURING_STATES, RECEIPT_STATES };
