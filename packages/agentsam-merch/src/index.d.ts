export type MediaKind = "raster" | "vector" | "document" | "unknown";
export type CompatibilityStatus =
  | "ready"
  | "ready_with_warning"
  | "ready_with_transform"
  | "prepared_for_digitization"
  | "needs_variant"
  | "unsupported";
export type TransformPolicy = "auto" | "preserve";

export interface ResolutionPolicy {
  readyPpi: number | null;
  minimumPpi: number | null;
}

export interface AutoNormalizePolicy {
  trimAlpha: boolean;
  colorSpace: boolean;
  svgOptimize: boolean;
  outlineText: boolean;
}

export interface VectorizationPolicy {
  enabled: boolean;
  preferredTracer: string | null;
  maxAspectDrift: number;
  minBoundaryIntegrity: number;
  outputFormat: string | null;
}

export interface ManufacturingProfile {
  schemaVersion?: "agentsam.manufacturing-profile.v1" | string;
  $schema?: string;
  id: string;
  manufacturer: string;
  process: string;
  format?: string;
  preferredFormat?: string;
  colorSpace?: string | null;
  colorMode?: string | null;
  alpha?: boolean;
  requireAlpha?: boolean;
  ppi?: number | null;
  resolution?: Partial<ResolutionPolicy> | ResolutionPolicy;
  autoNormalize?: Partial<AutoNormalizePolicy> | AutoNormalizePolicy;
  vectorization?: Partial<VectorizationPolicy> | VectorizationPolicy;
  maxBytes?: number | null;
  preferredPrintWidthIn?: number | null;
  preferredPrintHeightIn?: number | null;
  allowRaster?: boolean;
  allowVector?: boolean;
  allowGradients?: boolean;
  requireClosedPaths?: boolean;
  requireViewBox?: boolean;
  outlineText?: boolean;
  match?: Record<string, unknown> | null;
  handoff?: { status?: string; reason?: string; [key: string]: unknown } | null;
  source?: { kind?: string; verified?: boolean; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface SourceAssetDescriptor {
  format?: string;
  extension?: string;
  mimeType?: string;
  mediaKind?: MediaKind;
  widthPx?: number;
  heightPx?: number;
  contentWidthPx?: number;
  contentHeightPx?: number;
  trimmedWidthPx?: number;
  trimmedHeightPx?: number;
  width?: number;
  height?: number;
  bytes?: number;
  sizeBytes?: number;
  colorSpace?: string;
  colorMode?: string;
  hasAlpha?: boolean;
  transparentBorderDetected?: boolean;
  isAlphaTrimmed?: boolean;
  hasGradients?: boolean;
  hasOpenPaths?: boolean;
  hasLiveText?: boolean;
  hasExplicitViewBox?: boolean;
  [key: string]: unknown;
}

export interface ManufacturingTarget {
  placementWidthIn?: number | null;
  placementHeightIn?: number | null;
  printWidthIn?: number | null;
  printHeightIn?: number | null;
  providerDpi?: number | null;
  [key: string]: unknown;
}

export interface CompatibilityIssue {
  status: CompatibilityStatus;
  code: string;
  message: string;
  action: string | null;
  meta?: Record<string, unknown> | null;
}

export interface EffectivePpiResult {
  effectivePpi: number | null;
  widthPpi: number | null;
  heightPpi: number | null;
  widthIn: number | null;
  heightIn: number | null;
  basis: "content_bounds" | "pixel_bounds" | null;
}

export interface ManufacturingCompatibility {
  profileId: string | null;
  manufacturer: string | null;
  process: string | null;
  status: CompatibilityStatus;
  requirementsVerified: boolean;
  productionReady: boolean;
  transformReady: boolean;
  effectivePpi: number | null;
  resolution: {
    band: "ready" | "warning" | "fail" | "unknown";
    basis: "content_bounds" | "pixel_bounds" | null;
    widthPpi: number | null;
    heightPpi: number | null;
    readyPpi: number | null;
    minimumPpi: number | null;
  };
  target: {
    format: string | null;
    ppi: number | null;
    printWidthIn: number | null;
    printHeightIn: number | null;
  };
  issues: readonly CompatibilityIssue[];
  actions: readonly string[];
  handoff: ManufacturingProfile["handoff"];
}

export interface ManufacturingProfileRegistry {
  register(profile: ManufacturingProfile, options?: { replace?: boolean }): Readonly<ManufacturingProfile>;
  get(id: string): Readonly<ManufacturingProfile> | null;
  list(filter?: { manufacturer?: string; process?: string }): Readonly<ManufacturingProfile>[];
  select(context?: Record<string, unknown>): Readonly<ManufacturingProfile> | null;
  unregister(id: string): boolean;
}

export const MANUFACTURING_PROFILE_SCHEMA: "agentsam.manufacturing-profile.v1";
export const RASTER_FORMATS: readonly string[];
export const VECTOR_FORMATS: readonly string[];
export const DOCUMENT_FORMATS: readonly string[];
export function normalizeFormat(value: unknown): string | null;
export function mediaKindForFormat(value: unknown): MediaKind;
export function normalizeResolutionPolicy(
  input?: Partial<ResolutionPolicy>,
  fallbackPpi?: number | null,
): Readonly<ResolutionPolicy>;
export function normalizeManufacturingProfile(input?: ManufacturingProfile): Readonly<ManufacturingProfile>;
export function validateManufacturingProfile(input: ManufacturingProfile): {
  ok: boolean;
  errors: readonly string[];
  profile: Readonly<ManufacturingProfile>;
};
export function createManufacturingProfileRegistry(
  profiles?: ManufacturingProfile[],
): ManufacturingProfileRegistry;

export const COMPATIBILITY_STATUS: Readonly<{
  READY: "ready";
  READY_WITH_WARNING: "ready_with_warning";
  READY_WITH_TRANSFORM: "ready_with_transform";
  PREPARED_FOR_DIGITIZATION: "prepared_for_digitization";
  NEEDS_VARIANT: "needs_variant";
  UNSUPPORTED: "unsupported";
}>;
export function calculateEffectivePpi(
  asset: SourceAssetDescriptor,
  profile: ManufacturingProfile,
  target?: ManufacturingTarget,
): Readonly<EffectivePpiResult>;
export function evaluateManufacturingCompatibility(
  asset: SourceAssetDescriptor,
  profile: ManufacturingProfile,
  target?: ManufacturingTarget,
): Readonly<ManufacturingCompatibility>;
export function evaluateCompatibleProducts(
  asset: SourceAssetDescriptor,
  products: Record<string, unknown>[],
  registry: ManufacturingProfileRegistry,
): Readonly<Record<string, unknown>>[];

export interface TransformOperation {
  id: string;
  automatic: boolean;
  requires: readonly string[];
  params: Readonly<Record<string, unknown>>;
  issueCode?: string;
  missingCapabilities?: readonly string[];
  executable?: boolean;
  note?: string;
}
export const TRANSFORM_OPERATION: Readonly<Record<string, string>>;
export function planAutomaticTransforms(input: {
  asset: SourceAssetDescriptor;
  profile: ManufacturingProfile;
  target?: ManufacturingTarget;
  capabilities?: Record<string, boolean>;
}): Readonly<{
  compatibility: ManufacturingCompatibility;
  operations: readonly TransformOperation[];
  canExecuteAutomatically: boolean;
  hasBlockingIssue: boolean;
}>;
export function verifyVectorizationResult(input: {
  source: SourceAssetDescriptor;
  result: SourceAssetDescriptor & { boundaryIntegrity?: number };
  profile: ManufacturingProfile;
}): Readonly<{
  verified: boolean;
  aspectOk: boolean;
  boundaryOk: boolean;
  aspectDrift: number | null;
  boundaryIntegrity: number | null;
  thresholds: Readonly<{ maxAspectDrift: number; minBoundaryIntegrity: number }>;
  reason: string | null;
}>;

export const DERIVATIVE_ROLE: Readonly<{
  ORIGINAL: "original/master";
  MANUFACTURING: "manufacturing";
  STOREFRONT: "storefront/gallery";
  THUMBNAIL: "thumbnail";
  SOCIAL: "social";
  MOCKUP: "mockup";
}>;
export function planMediaDerivatives(input: {
  asset: SourceAssetDescriptor;
  profile: ManufacturingProfile;
  target?: ManufacturingTarget;
  storefrontFormat?: string;
  thumbnailFormat?: string;
  socialFormat?: string;
  mockupFormat?: string;
}): Readonly<Record<string, unknown>>;
export function buildMerchPlan(input: {
  design: { asset: SourceAssetDescriptor; [key: string]: unknown };
  products?: Record<string, unknown>[];
  registry: ManufacturingProfileRegistry;
}): Readonly<Record<string, unknown>>;

export type CollectionCandidateState =
  | "concept"
  | "approved-art"
  | "production-ready"
  | "sample-ordered"
  | "sample-approved"
  | "published"
  | "retired";
export interface CollectionCandidate {
  id: string;
  designId: string;
  collectionPath: readonly string[];
  state: CollectionCandidateState;
  products: readonly Record<string, unknown>[];
  approvals: Readonly<{ artwork: boolean; wording: boolean; palette: boolean; visualIdentity: boolean }>;
  metadata: Readonly<Record<string, unknown>>;
}
export const COLLECTION_CANDIDATE_STATE: Readonly<Record<string, CollectionCandidateState>>;
export function createCollectionCandidate(
  input: Partial<CollectionCandidate> & Pick<CollectionCandidate, "id" | "designId">,
): Readonly<CollectionCandidate>;
export function canTransitionCollectionCandidate(from: CollectionCandidateState, to: CollectionCandidateState): boolean;
export function transitionCollectionCandidate(
  candidate: CollectionCandidate,
  nextState: CollectionCandidateState,
): Readonly<CollectionCandidate>;
export function approvalsComplete(candidate: CollectionCandidate): boolean;

export interface ProductConceptTarget {
  provider: string;
  profileId: string;
  priority?: number;
  enabled?: boolean;
  adapter?: string;
  metadata?: Record<string, unknown>;
}
export interface ProductConcept {
  id: string;
  label?: string;
  category?: string;
  targets: ProductConceptTarget[];
  [key: string]: unknown;
}
export function normalizeProductConcept(input: ProductConcept): Readonly<ProductConcept>;
export function createProductConceptRegistry(initial?: ProductConcept[]): Readonly<{
  register(input: ProductConcept, options?: { replace?: boolean }): Readonly<ProductConcept>;
  get(id: string): Readonly<ProductConcept> | null;
  list(): Readonly<ProductConcept>[];
}>;
export function resolveProductConceptTarget(
  concept: ProductConcept,
  input: {
    profileRegistry: ManufacturingProfileRegistry;
    availableProviders?: string[];
    preferredProvider?: string | null;
  },
): Readonly<Record<string, unknown>>;

export function completefulProfileContext(
  product?: Record<string, unknown>,
  location?: Record<string, unknown>,
): Readonly<Record<string, unknown>>;
export function completefulTarget(location?: Record<string, unknown>): Readonly<ManufacturingTarget>;
