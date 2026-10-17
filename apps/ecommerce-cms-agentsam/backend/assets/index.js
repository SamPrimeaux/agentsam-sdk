export {
  ASSET_DEFAULTS,
  assetStorage,
  configureAssetStorage,
  createAssetStorage,
  isAssetStorageConfigured,
  publicUrlsForKey,
  deliveryUrlForKey,
  mediaPathForKey,
} from "./config.js";
export { listR2Objects, downloadObjectToFile, putObjectFromFile, deleteR2Object } from "./r2-client.js";
export { buildAssetTags, inferProductContextFromKey } from "./tags.js";
export {
  classifyMediaAsset,
  routePipelineWorkflow,
  guessMimeFromKey,
  extensionOf,
  canonicalKeyForPromotion,
} from "./classify.js";
export {
  buildDeterministicSuggestions,
  applyAcceptedSuggestions,
} from "./suggestions.js";
export { isImageKey, optimizeImageObject } from "./image-optimize.js";
export { runImageOptimizePipeline } from "./pipeline.js";
export { optimizeProductAsset, optimizeProductPrefixes, discoverChildPrefixes } from "./completeful-product-assets.js";
export { planProductAssetOptimization, planAssetIngest } from "./worker-hook.js";
export {
  createAssetJob,
  enqueueAssetJob,
  newJobId,
  getAssetJob,
  listQueuedJobs,
  listStaleAssetJobs,
} from "./jobs.js";
export { processAssetJobById, drainAssetJobs, finalizeMediaAsset } from "./process-job.js";
// worker-image is Worker-runtime only; import via process-job dynamic import.
