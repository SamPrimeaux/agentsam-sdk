/**
 * Shared CMS host helpers — Sites hub paths → Local Studio panels.
 * buildCmsPath returns `/cms/media?site=` (path segment), not always `?panel=`.
 */

export type CmsPanel =
  | "hub"
  | "pages"
  | "sections"
  | "templates"
  | "imports"
  | "theme"
  | "theme-editor"
  | "media"
  | "online-store";

export function parseCmsNavigatePath(
  path: string,
  fallbackSite: string,
): { site: string; panel: CmsPanel; page?: string; view?: "hub" | "editor" } {
  const url = new URL(path, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  // /cms | /cms/media | /cms/pages/...
  const cmsIdx = parts.indexOf("cms");
  const after = cmsIdx >= 0 ? parts.slice(cmsIdx + 1) : parts;

  let panel = (url.searchParams.get("panel") as CmsPanel | null) || undefined;
  if (!panel && after[0]) {
    const seg = after[0];
    if (
      seg === "media" ||
      seg === "pages" ||
      seg === "sections" ||
      seg === "templates" ||
      seg === "imports" ||
      seg === "theme" ||
      seg === "theme-editor" ||
      seg === "online-store" ||
      seg === "settings" ||
      seg === "hub"
    ) {
      panel = seg === "settings" ? "hub" : (seg as CmsPanel);
    }
  }

  const page =
    url.searchParams.get("page") ||
    (after[0] === "pages" && after[1] ? after[1] : undefined) ||
    undefined;

  const site = url.searchParams.get("site") || fallbackSite;
  const resolved: CmsPanel = panel || (page ? "pages" : "sections");

  return {
    site,
    panel: resolved,
    page,
    view: resolved === "hub" ? "hub" : "editor",
  };
}
