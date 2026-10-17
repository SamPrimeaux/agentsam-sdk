/** Theme identity and tokens resolve from the installed CMS theme registry. */
export type ThemeId = string;
export type ThemeVariant = "light" | "tint" | "dark" | "brand";
export interface InstalledThemeReference {
  /** cms_themes.id; do not resolve by display name or family alone. */
  themeId: ThemeId;
  /** Exact tenant scope, null denotes a system/global theme. */
  tenantId: string | null;
  /** Optional section appearance, not a separate theme row. */
  variant?: ThemeVariant;
  /** Optional overrides validated against the selected theme token contract. */
  tokenOverrides?: Record<string, string>;
}
export interface ThemeRegistryEntry {
  id: ThemeId;
  tenantId: string | null;
  slug: string;
  family: string;
  status: string;
  visibility: string;
  aliasOfThemeId: ThemeId | null;
  tokens: Record<string, unknown>;
  cssVariables: Record<string, unknown>;
  brand: Record<string, unknown>;
  typography: Record<string, unknown>;
  layout: Record<string, unknown>;
  components: Record<string, unknown>;
  motion: Record<string, unknown>;
}
export interface ResolvedTheme {
  id: ThemeId;
  rootThemeId: ThemeId;
  lineage: ThemeId[];
  tokenValues: Record<string, unknown>;
  provenance: "cms_themes";
}
/** Pure resolver: caller must filter rows by authorized tenant before invoking. */
export function resolveTheme(themeId: ThemeId, authorized: readonly ThemeRegistryEntry[]): ResolvedTheme {
  const byId = new Map(authorized.map(row => [row.id,row]));
  const lineage: ThemeRegistryEntry[] = [];
  const seen = new Set<string>();
  let id: string | null = themeId;
  while(id) {
    if(seen.has(id)) throw new Error("Theme alias cycle: " + id);
    seen.add(id);
    const row=byId.get(id);
    if(!row)throw new Error("Missing or unauthorized theme reference: " + id);
    lineage.unshift(row);
    id=row.aliasOfThemeId;
  }
  if(lineage.some(t=>t.status!=="active"))throw new Error("Inactive theme in alias lineage");
  const tokenValues=Object.assign({},...lineage.map(t=>({...t.tokens,...t.cssVariables})));
  return {id:themeId,rootThemeId:lineage[0].id,lineage:lineage.map(t=>t.id),tokenValues,provenance:"cms_themes"};
}
