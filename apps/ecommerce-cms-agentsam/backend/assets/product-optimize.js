/**
 * Worker-facing surface of the asset pipeline (planning, jobs, storage bootstrap).
 * Raster transforms run in-Worker via @jsquash; CLI can also drain with Sharp.
 */
export {
  planProductAssetOptimization,
  planAssetIngest,
} from "./worker-hook.js";
export {
  buildAssetTags,
  inferProductContextFromKey,
} from "./tags.js";
export {
  ASSET_DEFAULTS,
  assetStorage,
  publicUrlsForKey,
  deliveryUrlForKey,
  mediaPathForKey,
} from "./config.js";
export {
  classifyMediaAsset,
  routePipelineWorkflow,
  guessMimeFromKey,
  canonicalKeyForPromotion,
} from "./classify.js";
export {
  buildDeterministicSuggestions,
  applyAcceptedSuggestions,
} from "./suggestions.js";
export {
  createAssetJob,
  enqueueAssetJob,
  newJobId,
  getAssetJob,
} from "./jobs.js";
export {
  processAssetJobById,
  drainAssetJobs,
  finalizeMediaAsset,
} from "./process-job.js";
export { ensureAssetStorage } from "./runtime.js";
