/** TypeScript declarations for PrimeTech creative-production builders. */
export interface CreativeOperationResult { ok: true; [key: string]: unknown; }
export type IconColorwayId = 'technical-slate' | 'lagoon' | 'industrial-ember' | 'alloy-blue' | 'prime-electric' | 'prime-spectrum' | 'reverse' | 'core-mono';
export interface IconColorway {
  id: IconColorwayId;
  foreground: string;
  background: string;
  sourceColorMap?: Record<string, string>;
  markInset?: number;
}
export interface IconFamilyOutput {
  path: string;
  contentType: 'image/svg+xml' | 'image/png';
  bytes: number;
  sha256: string;
  colorway: IconColorwayId;
  shape: 'bare' | 'circle' | 'squircle';
  size?: number;
  quality?: { transparentCorners: boolean; visiblePixelCount: number };
}
export interface IconFamilyResult extends CreativeOperationResult {
  schema: 'primetech.icon-family.v1';
  outputDir: string;
  variantCount: number;
  outputCount: number;
  sourceSha256: string;
  manifestPath: string;
  manifestSha256: string;
  outputs: IconFamilyOutput[];
}
export interface BuildIconFamilyOptions {
  projectRoot: string;
  sourceSvgPath: string;
  outputDir?: string;
  colorways: IconColorway[];
  sizes?: number[];
}
export interface BuildTypefacePackageOptions {
  projectRoot: string;
  sourcePath: string;
  outputDir?: string;
  licenseText?: string | null;
  specimenText?: string | null;
}
export interface TypefacePackageResult extends CreativeOperationResult {
  schema: 'agentsam.typeface-package.v1';
  family: string;
  style: string;
  glyphCount: number;
  format: 'ttf';
  variableFont: false;
  fontPath: string;
  packagePath: string;
  packageBytes: number;
  packageSha256: string;
  manifestPath: string;
  license: 'included' | 'not-supplied';
}
export interface BuildSpriteAtlasOptions {
  projectRoot: string;
  framePaths: string[];
  outputDir?: string;
  columns?: number | null;
  cellWidth?: number | null;
  cellHeight?: number | null;
  padding?: number;
  fps?: number;
  loop?: boolean;
  pivot?: [number, number];
}
export interface SpriteAtlasResult extends CreativeOperationResult {
  schema: string;
  frameCount: number;
  fps: number;
  atlasPath: string;
  atlasSha256: string;
  manifestPath: string;
  previewPath: string;
  width: number;
  height: number;
  quality: Record<string, unknown>;
}
export interface CompareVisualsOptions {
  projectRoot: string;
  referencePath: string;
  renderedPath: string;
  outputDir?: string;
  pixelThreshold?: number;
  maxMeanAbsoluteError?: number;
  maxChangedPixelRatio?: number;
}
export interface VisualComparisonResult extends CreativeOperationResult {
  status: string;
  metrics: Record<string, number>;
  reportPath: string;
  diffPath: string;
  overlayPath: string;
  report: Record<string, unknown>;
}
export interface BuildDesignSystemPackageOptions {
  projectRoot: string;
  tokensPath: string;
  outputDir?: string;
  projectName?: string;
}
export interface DesignSystemPackageResult extends CreativeOperationResult {
  status: string;
  outputDir: string;
  tokenCount: number;
  warnings: string[];
  cssPath: string;
  normalizedPath: string;
  tailwindPath: string;
  manifestPath: string;
}
export interface CreativeDeliveryFile { path: string; archivePath?: string; role?: string; }
export interface PackageCreativeAssetsOptions {
  projectRoot: string;
  name: string;
  files: CreativeDeliveryFile[];
  outputDir?: string;
  metadata?: Record<string, unknown>;
  includeReadme?: boolean;
}
export interface CreativeAssetPackageResult extends CreativeOperationResult {
  packageName: string;
  fileCount: number;
  totalBytes: number;
  packagePath: string;
  packageBytes: number;
  packageSha256: string;
  manifestPath: string;
  files: Array<Record<string, unknown>>;
}
export interface BuildEpubPackageOptions { projectRoot: string; sourcePath: string; outputDir?: string; }
export interface EpubPackageResult extends CreativeOperationResult {
  format: 'epub-3';
  title: string;
  author: string;
  chapterCount: number;
  epubPath: string;
  epubBytes: number;
  epubSha256: string;
  previewPath: string;
  manifestPath: string;
  validation: { mimetype: true; container: boolean; packageDocument: true; navigation: true };
}
export const PRIMETECH_ICON_COLORWAY_IDS: readonly IconColorwayId[];
export const PRIMETECH_ICON_SHAPES: readonly ('bare' | 'circle' | 'squircle')[];
export const PRIMETECH_ICON_SIZES: readonly number[];
export function buildIconFamily(options: BuildIconFamilyOptions): Promise<IconFamilyResult>;
export function buildTypefacePackage(options: BuildTypefacePackageOptions): Promise<TypefacePackageResult>;
export function buildSpriteAtlas(options: BuildSpriteAtlasOptions): Promise<SpriteAtlasResult>;
export function compareVisuals(options: CompareVisualsOptions): Promise<VisualComparisonResult>;
export function buildDesignSystemPackage(options: BuildDesignSystemPackageOptions): Promise<DesignSystemPackageResult>;
export function packageCreativeAssets(options: PackageCreativeAssetsOptions): Promise<CreativeAssetPackageResult>;
export function buildEpubPackage(options: BuildEpubPackageOptions): Promise<EpubPackageResult>;
