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
  hasSharp,
  hasSquooshBinary,
} from './core/derivatives.js';
export {
  discoverProcessors,
  listProcessors,
  getProcessor,
  resolveProcessor,
  encodeWithScheduler,
  optimizeWithScheduler,
  PROCESSOR_CAPABILITIES,
  REJECTED_PROCESSORS,
  planProcessorOrder,
} from './core/processors/index.js';
export {
  optimizeBrandAsset,
  optimizePolicyForRole,
} from './core/optimize.js';
export {
  slugifySegment,
  buildSemanticSlug,
  buildDerivativeFilename,
  validateDeliveryName,
  applySemanticNaming,
} from './core/naming.js';
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
  CANONICAL_PNG_DELIVERY_POLICY_TYPES,
  AGENTSAM_IMAGES_DELIVERY_POLICY_TYPES,
} from './adapters/cloudflare-images.js';
export { D1BrandRegistryAdapter } from './adapters/d1-registry.js';

export {
  FORMAT_CAPABILITIES,
  FORMAT_FAMILIES,
  formatCapabilities,
  canResizeFormat,
  familyCapabilities,
  INGEST_EXTENSIONS,
} from './core/capabilities.js';
export {
  sniffImageBuffer,
  readStdinImage,
  scanDropFolder,
  waitForDrop,
  resolveSourceInput,
  expandHome,
  isImagePath,
} from './core/ingest.js';
export {
  buildBrandPack,
  buildGalleryHtml,
  writeZipArchive,
} from './core/pack.js';
export {
  previewBrandPack,
  resolvePackRoot,
} from './core/preview.js';

// BrandPack v2 — brand.pack.json is source of truth
export {
  BRAND_PACK_SCHEMA,
  BRAND_PACK_SCHEMA_URL,
  BRAND_PACK_FILENAME,
  createEmptyBrandPack,
  normalizeBrandPack,
  normalizeAssetNode,
  touchProvenance,
  findAssetsByRole,
} from './core/v2/schema.js';
export {
  ASSET_ROLES,
  ROLE_CANVAS,
  listAssetRoles,
  getAssetRole,
  classifyAssetRole,
} from './core/v2/roles.js';
export {
  RESPONSIVE_WIDTH_LADDER,
  planSemanticDerivatives,
  materializedToSharpDerivatives,
  pickResponsiveWidths,
  defaultLogoUsage,
} from './core/v2/derivatives-semantic.js';
export {
  ingestBrandSources,
  extractArchive,
  extractFromCode,
  loadBrandPack,
  saveBrandPack,
  isArchivePath,
  isIngestiblePath,
} from './core/v2/ingest-graph.js';
export {
  buildBrandPackFromGraph,
} from './core/v2/compile.js';
export {
  BRAND_TEMPLATES,
  listBrandTemplates,
  getBrandTemplate,
  applyBrandTemplate,
  createPackFromTemplate,
} from './core/v2/templates.js';

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
  'brand.optimize': { id: 'brand.optimize', deterministic: true, model_required: false, side_effects: 'filesystem' },
  'brand.ingest': { id: 'brand.ingest', deterministic: true, model_required: false, side_effects: 'filesystem' },
  'brand.build': { id: 'brand.build', deterministic: true, model_required: false, side_effects: 'filesystem' },
  'brand.pack': { id: 'brand.pack', deterministic: true, model_required: false, side_effects: 'filesystem' },
  'brand.preview': { id: 'brand.preview', deterministic: true, model_required: false, side_effects: 'localhost' },
  'brand.promote': { id: 'brand.promote', deterministic: true, model_required: false, side_effects: 'storage-optional' },
  'brand.publish': { id: 'brand.publish', deterministic: true, model_required: false, side_effects: 'storage-adapter' },
  'brand.verify': { id: 'brand.verify', deterministic: true, model_required: false, side_effects: 'none' },
});
