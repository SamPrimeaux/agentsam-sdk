/**
 * Route contract: the studio never hardcodes app paths. Hosts provide
 * a RouteMap; the studio asks for hrefs. IAM, Ember Supply and
 * Local Studio can all mount the same UI at different URL shapes.
 */
export interface RouteMap {
  library(view?: string): string;
  asset(assetId: string, tab?: string): string;
  upload?(): string;
  imports?(batch?: string): string;
}

export function defaultRoutes(base = "/content"): RouteMap {
  const clean = base.replace(/\/$/, "");
  return {
    library: (view) => (view && view !== "all" ? `${clean}?view=${view}` : clean),
    asset: (assetId, tab) => `${clean}/${assetId}${tab ? `/${tab}` : ""}`,
    upload: () => `${clean}/upload`,
    imports: (batch) => (batch ? `${clean}/imports/${batch}` : `${clean}/imports`),
  };
}
