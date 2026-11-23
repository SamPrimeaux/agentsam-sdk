export type BrandColor = { name: string; value: string; usage: string; sourceValue: string };
export type BrandWorkspaceEntry = {
  id: string; name: string; status: string; contract: Record<string, unknown>;
  colors: unknown; assets: unknown; sources: unknown; themes: unknown; lastChange?: string;
};
export type BrandWorkspaceReadModel = {
  workspaceId: string; brands: BrandWorkspaceEntry[]; connections: unknown[];
  activeBrandId: string | null; source: "authorized_brand_workspace";
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
