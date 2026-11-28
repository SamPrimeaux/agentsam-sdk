export type BrandColor = { name: string; value: string; usage: string; sourceValue: string };
export type BrandWorkspaceEntry = {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  status: string;
  contractStatus: string;
  parentBrandId: string;
  architectureModel: string;
  tagline: string;
  description: string;
  mission: string;
  domain: string;
  assetCount: number;
  contract: Record<string, unknown>;
  contractRevision: Record<string, unknown>;
  contractRevisions: unknown[];
  colors: unknown;
  assets: unknown;
  sources: unknown;
  themes: unknown;
  metadata: Record<string, unknown>;
  lastChange?: string;
};
export type BrandWorkspaceReadModel = {
  workspaceId: string;
  brands: BrandWorkspaceEntry[];
  connections: unknown[];
  activeBrandId: string | null;
  activeBrandSlug: string | null;
  unmatchedAssetSlugs: unknown[];
  warnings: string[];
  source: "authorized_brand_workspace";
};
export declare function normalizeBrandWorkspace(raw: unknown): BrandWorkspaceReadModel;
export declare function brandColors(source: unknown, themeId?: string): BrandColor[];
export declare function brandContrast(a: string, b: string): number | null;
export declare function renderBrandCoverSvg(args?: {
  id?: string; name?: string; tagline?: string; colors?: unknown; themeId?: string;
}): string | null;
export declare function renderCreationTileSvg(args?: {
  type?: "slides" | "design" | "code" | "system" | "whiteboard";
  tint?: string; ink?: string; seed?: string;
}): string | null;
