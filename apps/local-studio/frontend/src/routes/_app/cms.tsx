import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CmsEditor, CmsHubPage } from "@inneranimalmedia/agentsam-cms-frontend";
import "@inneranimalmedia/agentsam-cms-frontend/styles/studio.css";

interface CmsSearchParams {
  site?: string;
  project?: string;
  project_slug?: string;
  page?: string;
  panel?: "hub" | "pages" | "sections" | "templates" | "imports" | "theme" | "theme-editor" | "media" | "online-store";
  view?: "hub" | "editor";
}

export const Route = createFileRoute("/_app/cms")({
  validateSearch: (search: Record<string, unknown>): CmsSearchParams => {
    return {
      site: typeof search.site === "string" ? search.site : undefined,
      project: typeof search.project === "string" ? search.project : undefined,
      project_slug: typeof search.project_slug === "string" ? search.project_slug : undefined,
      page: typeof search.page === "string" ? search.page : undefined,
      panel: (search.panel as CmsSearchParams["panel"]) || undefined,
      view: (search.view as CmsSearchParams["view"]) || undefined,
    };
  },
  component: CmsPage,
});

function CmsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  // Strict tenant default: "agentsam-sdk" (never inneranimalmedia)
  const siteSlug = (search.site || search.project_slug || search.project || "agentsam-sdk").trim();

  const siteCatalog = [
    { slug: "agentsam-sdk", name: "Agent Sam SDK", domain: "agentsam.inneranimalmedia.com", hub_priority: 100 },
    { slug: "inneranimalmedia", name: "Inner Animal Media", domain: "inneranimalmedia.com", hub_priority: 90 },
    { slug: "fuelnfreetime", name: "Fuel & Free Time", domain: "fuelnfreetime.com", hub_priority: 80 },
    { slug: "meauxbility", name: "Meauxbility", domain: "meauxbility.org", hub_priority: 70 },
  ];

  const isEditorView = Boolean(
    search.page ||
      (search.panel && search.panel !== "hub") ||
      search.view === "editor"
  );

  if (!isEditorView) {
    return (
      <div className="size-full overflow-y-auto">
        <CmsHubPage
          sites={siteCatalog}
          activeSiteSlug={siteSlug}
          onSelectSite={(slug) => {
            navigate({
              to: "/cms",
              search: (prev) => ({ ...prev, site: slug, panel: undefined, page: undefined }),
            });
          }}
          onNavigate={(path) => {
            if (path.startsWith("/cms")) {
              const url = new URL(path, "http://localhost");
              const panel = url.searchParams.get("panel") as CmsSearchParams["panel"];
              const page = url.searchParams.get("page") || undefined;
              const site = url.searchParams.get("site") || siteSlug;
              navigate({
                to: "/cms",
                search: { site, panel: panel || "sections", page, view: "editor" },
              });
            } else {
              window.location.href = path;
            }
          }}
        />
      </div>
    );
  }

  const editorPanel =
    (["pages", "sections", "templates", "imports", "theme"] as const).find(
      (p) => p === search.panel
    ) || "sections";

  return (
    <div className="size-full overflow-hidden">
      <CmsEditor
        projectSlug={siteSlug}
        initialPageId={search.page || null}
        initialPanel={editorPanel}
        siteCatalog={siteCatalog}
        basePath="/cms"
        onSiteChange={(slug) => {
          navigate({
            to: "/cms",
            search: (prev) => ({ ...prev, site: slug }),
          });
        }}
        onNavigate={(path) => {
          if (path === "/cms" || path === "/cms?panel=hub") {
            navigate({
              to: "/cms",
              search: { site: siteSlug, panel: undefined, page: undefined, view: undefined },
            });
          } else {
            navigate({ to: path });
          }
        }}
      />
    </div>
  );
}

