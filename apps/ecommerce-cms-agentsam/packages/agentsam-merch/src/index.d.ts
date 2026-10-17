export type MediaKind = "raster" | "vector" | "document" | "unknown";
export type CompatibilityStatus =
  | "ready"
  | "ready_with_transform"
  | "needs_variant"
  | "prepared_for_digitization"
  | "unsupported";
export type TransformPolicy = "auto" | "preserve";

export interface ManufacturingProfile {
  schemaVersion?: "agentsam.manufacturing-profile.v1" | string;
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
  maxBytes?: number | null;
  preferredPrintWidthIn?: number | null;
  preferredPrintHeightIn?: number | null;
  allowRaster?: boolean;
  allowVector?: boolean;
  allowGradients?: boolean;
  requireClosedPaths?: boolean;
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
  width?: number;
  height?: number;
  bytes?: number;
  sizeBytes?: number;
  colorSpace?: string;
  colorMode?: string;
  hasAlpha?: boolean;
  hasGradients?: boolean;
  hasOpenPaths?: boolean;
  hasLiveText?: boolean;
  [key: string]: unknown;
}

export interface ManufacturingTarget {
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
  READY_WITH_TRANSFORM: "ready_with_transform";
  NEEDS_VARIANT: "needs_variant";
  PREPARED_FOR_DIGITIZATION: "prepared_for_digitization";
  UNSUPPORTED: "unsupported";
}>;
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
export function createCollectionCandidate(input: Partial<CollectionCandidate> & Pick<CollectionCandidate, "id" | "designId">): Readonly<CollectionCandidate>;
export function canTransitionCollectionCandidate(from: CollectionCandidateState, to: CollectionCandidateState): boolean;
export function transitionCollectionCandidate(candidate: CollectionCandidate, nextState: CollectionCandidateState): Readonly<CollectionCandidate>;
export function approvalsComplete(candidate: CollectionCandidate): boolean;

export function completefulProfileContext(product?: Record<string, unknown>, location?: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function completefulTarget(location?: Record<string, unknown>): Readonly<ManufacturingTarget>;

export function providerPrintSizeIn(location: {
  unit?: string | null; dpi?: number | null; file_width?: number | null; file_height?: number | null;
} | null | undefined): { width: number; height: number } | null;
export function effectiveArtworkDpi(input: {
  sourceWidthPx: number; sourceHeightPx: number; printWidthIn: number;
  printHeightIn: number; placementWidthPercent: number;
  cropWidthPx?: number; cropHeightPx?: number; placementHeightPercent?: number;
}): {
  dpi: number; exactDpi: number; dpiX: number; dpiY: number;
  printedWidthIn: number; printedHeightIn: number; fitsPrintHeight: boolean;
} | null;
