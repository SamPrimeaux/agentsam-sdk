import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CmsEditor,
  CmsHubPage,
  createHttpCmsAdapter,
  type CmsHttpRequest,
} from "@inneranimalmedia/agentsam-cms-frontend";
import "@inneranimalmedia/agentsam-cms-frontend/styles/studio.css";
import { ContentStudioPage } from "@/components/content/ContentStudioPage";
import {
  invokeStudioService,
  isPackagedDesktop,
  resolveDesktopStudioAccountId,
} from "@/lib/desktop/tauri";
import {
  parseCmsNavigatePath,
  type CmsPanel,
} from "@/lib/cms/parseCmsNavigatePath";

interface CmsSearchParams {
  site?: string;
  project?: string;
  project_slug?: string;
  page?: string;
  panel?: CmsPanel;
  view?: "hub" | "editor";
}

export const Route = createFileRoute("/(apps)/cms")({
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

const SITE_CATALOG = [
  { slug: "agentsam-sdk", name: "Agent Sam SDK", domain: "agentsam.inneranimalmedia.com", hub_priority: 100 },
  { slug: "inneranimalmedia", name: "Inner Animal Media", domain: "inneranimalmedia.com", hub_priority: 90 },
  { slug: "fuelnfreetime", name: "Fuel & Free Time", domain: "fuelnfreetime.com", hub_priority: 80 },
  { slug: "meauxbility", name: "Meauxbility", domain: "meauxbility.org", hub_priority: 70 },
];

async function desktopCmsTransport(request: CmsHttpRequest): Promise<unknown> {
  const accountId = await resolveDesktopStudioAccountId();
  const response = await invokeStudioService({
    operation: "cms",
    account_id: accountId,
    method: request.method || "GET",
    path: request.path,
    body: request.body,
  });

  let payload: unknown = null;
  try {
    payload = response.body ? JSON.parse(response.body) : null;
  } catch {
    payload = response.body;
  }
  if (!response.ok) {
    const detail = payload && typeof payload === "object"
      ? (payload as { message?: unknown; error?: unknown })
      : null;
    const message = String(
      detail?.message || detail?.error || "CMS request failed (" + response.status + ")",
    );
    throw Object.assign(new Error(message), { status: response.status, payload });
  }
  return payload;
}

function editorRailForPanel(panel?: CmsPanel) {
  if (panel === "pages") return "pages" as const;
  if (panel === "online-store" || panel === "theme" || panel === "theme-editor") {
    return "settings" as const;
  }
  return "sections" as const;
}

function CmsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const siteSlug = (search.site || search.project_slug || search.project || "agentsam-sdk").trim();
  const siteName = SITE_CATALOG.find((s) => s.slug === siteSlug)?.name ?? siteSlug;
  const cmsAdapter = useMemo(
    () =>
      createHttpCmsAdapter({
        siteId: siteSlug,
        transport: isPackagedDesktop() ? desktopCmsTransport : undefined,
      }),
    [siteSlug],
  );

  const isEditorView = Boolean(
    search.page ||
      (search.panel && search.panel !== "hub") ||
      search.view === "editor",
  );

  const goHub = (slug = siteSlug) => {
    navigate({
      to: "/cms",
      search: { site: slug, panel: undefined, page: undefined, view: undefined },
    });
  };

  if (!isEditorView) {
    return (
      <div className="size-full overflow-y-auto">
        <CmsHubPage
          sites={SITE_CATALOG}
          activeSiteSlug={siteSlug}
          onSelectSite={(slug) => {
            navigate({
              to: "/cms",
              search: { ...search, site: slug, panel: undefined, page: undefined },
            });
          }}
          onNavigate={(path) => {
            if (path.startsWith("/cms")) {
              const parsed = parseCmsNavigatePath(path, siteSlug);
              navigate({
                to: "/cms",
                search: {
                  site: parsed.site,
                  panel: parsed.panel,
                  page: parsed.page,
                  view: parsed.view,
                },
              });
            } else {
              window.location.href = path;
            }
          }}
        />
      </div>
    );
  }

  if (search.panel === "media") {
    return (
      <div className="flex size-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 text-sm">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => goHub()}
          >
            ← Sites
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{siteName}</span>
          <span className="text-muted-foreground">/</span>
          <span>Media</span>
        </div>
        <div className="min-h-0 flex-1">
          <ContentStudioPage
            projectId={siteSlug}
            brandId={siteSlug}
            title={`Media · ${siteName}`}
          />
        </div>
      </div>
    );
  }

  const initialRail = editorRailForPanel(search.panel);

  const handleCmsHostNavigate = (path: string) => {
    if (path === "/cms" || path === "/cms?panel=hub") {
      goHub();
      return;
    }
    if (path.startsWith("/cms")) {
      const parsed = parseCmsNavigatePath(path, siteSlug);
      navigate({
        to: "/cms",
        search: {
          site: parsed.site,
          panel: parsed.panel,
          page: parsed.page,
          view: parsed.view,
        },
      });
      return;
    }
    navigate({ to: path });
  };

  return (
    <div className="size-full overflow-hidden">
      <CmsEditor
        adapter={cmsAdapter}
        siteId={siteSlug}
        initialPageId={search.page || null}
        initialRail={initialRail}
        host={{ navigate: handleCmsHostNavigate }}
      />
    </div>
  );
}
