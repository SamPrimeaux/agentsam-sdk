/**
 * @inneranimalmedia/agentsam-sdk-brand
 *
 * Brand intelligence (scan/resolve/plan) + portable brand-asset promotion SDK.
 * Product-specific assets (e.g. AgentSam icons) live outside this package.
 */

export { brandScan } from './scan.js';
export { brandResolve, parseDeclaredColor } from './resolve.js';
export { buildBrandContractDraft, writeBrandArtifacts } from './contract.js';
export { brandPlan } from './plan.js';
export {
  brandGoapActions,
  brandWorldFromPlan,
  brandGoalFromPlan,
} from './goap-actions.js';

// Core brand-asset SDK
export { BrandAssetError } from './core/errors.js';
export {
  inspectBrandAsset,
  inspectLocalAsset,
  validateSvgMark,
  isExcludedIntermediate,
  sha256File,
  sha256Buffer,
} from './core/inspect.js';
export {
  BRAND_ASSETS_SCHEMA,
  brandAssetPrefix,
  resolveKeyLayout,
} from './core/keys.js';
export {
  deriveBrandAssets,
  discoverDerivativeCapabilities,
  formatBytesKb,
  hasMagick,
} from './core/derivatives.js';
export {
  planBrandAssetPromotion,
  normalizePromotionSpec,
  parseDeriveFlag,
  createBrandAssetManifest,
} from './core/plan.js';
export {
  promoteBrandAssets,
  publishBrandAssets,
  verifyBrandAssets,
} from './core/promote.js';
export {
  listBrandAssetReceipts,
  writePromotionReceipt,
  loadPromotionReceipt,
  receiptDir,
  formatPublishReceipt,
} from './core/receipts.js';

// Adapters
export { MemoryStorageAdapter } from './adapters/memory.js';
export { FilesystemStorageAdapter } from './adapters/filesystem.js';
export { CloudflareR2StorageAdapter } from './adapters/cloudflare-r2.js';
export {
  CloudflareImagesDeliveryAdapter,
  isCloudflareImagesPublished,
  resolveCloudflareImagesConfig,
  resolveCloudflareImagesCredentials,
  cloudflareImageUrl,
  cloudflareImagesDeliveryBase,
  mayUploadToCloudflareImages,
  CLOUDFLARE_IMAGES_PLATFORM_INPUT_TYPES,
  AGENTSAM_IMAGES_DELIVERY_POLICY_TYPES,
} from './adapters/cloudflare-images.js';
export { D1BrandRegistryAdapter } from './adapters/d1-registry.js';

// Presets (format strategies — never product/customer identity)
export {
  getDerivativePreset,
  listDerivativePresets,
  DERIVATIVE_PRESETS,
} from './presets/index.js';

// CLI controller (shared by agentsam brand + agentsam-brand bin)
export { runBrandAssetCommand, parseBrandCliArgs } from './cli/controller.js';
export { runBrandPromoteWizard } from './cli/wizard.js';

/** @deprecated Prefer adapter constructors; kept for soft resolve. */
export async function resolveBrandAssetStorage(options = {}) {
  const { FilesystemStorageAdapter } = await import('./adapters/filesystem.js');
  const { MemoryStorageAdapter } = await import('./adapters/memory.js');
  if (options.kind === 'memory') return new MemoryStorageAdapter();
  return new FilesystemStorageAdapter({ rootDir: options.rootDir });
}

export const BRAND_CAPABILITY_META = Object.freeze({
  'brand.scan': { id: 'brand.scan', deterministic: true, model_required: false, side_effects: 'none' },
  'brand.resolve': { id: 'brand.resolve', deterministic: true, model_required: false, side_effects: 'none' },
  'brand.plan': { id: 'brand.plan', deterministic: true, model_required: false, side_effects: 'none' },
  'brand.inspect': { id: 'brand.inspect', deterministic: true, model_required: false, side_effects: 'none' },
  'brand.derive': { id: 'brand.derive', deterministic: true, model_required: false, side_effects: 'filesystem' },
  'brand.promote': { id: 'brand.promote', deterministic: true, model_required: false, side_effects: 'storage-optional' },
  'brand.publish': { id: 'brand.publish', deterministic: true, model_required: false, side_effects: 'storage-adapter' },
  'brand.verify': { id: 'brand.verify', deterministic: true, model_required: false, side_effects: 'none' },
});
