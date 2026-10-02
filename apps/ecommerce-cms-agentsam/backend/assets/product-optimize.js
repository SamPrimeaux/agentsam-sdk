/**
 * Re-export Worker-safe asset planning + job runner into the ecommerce Worker tree.
 * Raster transforms run in-Worker via @jsquash; CLI can also drain with Sharp.
 */
export {
  planProductAssetOptimization,
  planAssetIngest,
} from "../../shared/assets/worker-hook.js";
export {
  buildAssetTags,
  inferProductContextFromKey,
} from "../../shared/assets/tags.js";
export {
  ASSET_STORAGE,
  publicUrlsForKey,
  deliveryUrlForKey,
  mediaPathForKey,
} from "../../shared/assets/config.js";
export {
  classifyMediaAsset,
  routePipelineWorkflow,
  guessMimeFromKey,
  canonicalKeyForPromotion,
} from "../../shared/assets/classify.js";
export {
  buildDeterministicSuggestions,
  applyAcceptedSuggestions,
} from "../../shared/assets/suggestions.js";
export {
  createAssetJob,
  enqueueAssetJob,
  newJobId,
  getAssetJob,
} from "../../shared/assets/jobs.js";
export {
  processAssetJobById,
  drainAssetJobs,
  finalizeMediaAsset,
} from "../../shared/assets/process-job.js";
