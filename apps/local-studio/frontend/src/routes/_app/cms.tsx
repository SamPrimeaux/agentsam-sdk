import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CmsEditor } from "@inneranimalmedia/agentsam-cms-frontend";
import "@inneranimalmedia/agentsam-cms-frontend/styles/studio.css";

interface CmsSearchParams {
  site?: string;
  project?: string;
  project_slug?: string;
  page?: string;
  panel?: "pages" | "sections" | "templates" | "imports" | "theme";
}

export const Route = createFileRoute("/_app/cms")({
  validateSearch: (search: Record<string, unknown>): CmsSearchParams => {
    return {
      site: typeof search.site === "string" ? search.site : undefined,
      project: typeof search.project === "string" ? search.project : undefined,
      project_slug: typeof search.project_slug === "string" ? search.project_slug : undefined,
      page: typeof search.page === "string" ? search.page : undefined,
      panel: (search.panel as CmsSearchParams["panel"]) || undefined,
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
    { slug: "agentsam-sdk", name: "Agent Sam SDK", domain: "agentsam.inneranimalmedia.com" },
    { slug: "inneranimalmedia", name: "Inner Animal Media", domain: "inneranimalmedia.com" },
    { slug: "fuelnfreetime", name: "Fuel & Free Time", domain: "fuelnfreetime.com" },
    { slug: "meauxbility", name: "Meauxbility", domain: "meauxbility.org" },
  ];

  return (
    <div className="size-full overflow-hidden">
      <CmsEditor
        projectSlug={siteSlug}
        initialPageId={search.page || null}
        initialPanel={search.panel || "sections"}
        siteCatalog={siteCatalog}
        basePath="/cms"
        onSiteChange={(slug) => {
          navigate({
            to: "/cms",
            search: (prev) => ({ ...prev, site: slug }),
          });
        }}
        onNavigate={(path) => {
          navigate({ to: path });
        }}
      />
    </div>
  );
}
