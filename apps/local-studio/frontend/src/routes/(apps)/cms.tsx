// @ts-ignore Portable ecommerce CMS surface adapter.
import { CmsHubPage, createCmsThemeEditorAdapter, createHttpCmsAdapter } from '@inneranimalmedia/ecommerce-cms-agentsam/cms';
import { ThemeStorePage } from '@/components/themes/ThemeStorePage';
import { ThemeEditorFrame } from '@/components/themes/ThemeEditorFrame';
import { ThemeProjectEditor } from '@/components/themes/ThemeProjectEditor';
import { studioCmsFetch } from '@/lib/cms/transport';
// @ts-ignore Portable authenticated site discovery module.
import { loadAuthorizedCmsSiteCatalog, selectAuthorizedCmsSite } from '@/lib/cms/site-catalog.mjs';
import { getActiveThemeId } from '@/lib/themes/projects';
import { useMemo, useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ContentStudioPage } from "@/components/content/ContentStudioPage";
import { parseCmsNavigatePath, type CmsPanel } from "@/lib/cms/parseCmsNavigatePath";

interface CmsSearchParams {
  theme_project?: string;
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
      theme_project: typeof search.theme_project === "string" ? search.theme_project : undefined,
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

interface CmsSite {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  page_count: number;
}

function CmsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [activeThemeProject, setActiveThemeProject] = useState<string>();
  const [siteCatalog, setSiteCatalog] = useState<CmsSite[] | null>(null);
  const [siteLoadError, setSiteLoadError] = useState('');
  useEffect(() => { void getActiveThemeId().then(setActiveThemeProject); }, []);
  useEffect(() => {
    let mounted = true;
    void loadAuthorizedCmsSiteCatalog(studioCmsFetch)
      .then((sites: CmsSite[]) => { if (mounted) setSiteCatalog(sites); })
      .catch((error: Error) => {
        if (mounted) setSiteLoadError(error.message || 'cms_site_discovery_unavailable');
      });
    return () => { mounted = false; };
  }, []);

  const requestedSlug = search.site || search.project_slug || search.project || '';
  const selectedSite: CmsSite | null = selectAuthorizedCmsSite(siteCatalog || [], requestedSlug);
  const siteSlug = selectedSite?.slug || '';
  const siteName = selectedSite?.name || 'Website';

  const adapter = useMemo(
    () =>
      createHttpCmsAdapter({
        transport: studioCmsFetch,
        sites: (siteCatalog || []).map((s) => ({
          id: s.slug,
          slug: s.slug,
          name: s.name,
          domain: s.domain,
        })),
      }),
    [siteCatalog],
  );

  const themeAdapter = useMemo(() => createCmsThemeEditorAdapter(adapter, siteSlug, {
    resolvePreview: async (_site: unknown, page: { id: string }) => {
      const response = await studioCmsFetch(`/api/cms/render-page?site=${encodeURIComponent(siteSlug)}&page_id=${encodeURIComponent(page.id)}&mode=draft`);
      if (!response.ok) throw new Error("cms_preview_unavailable");
      return { html: await response.text() };
    },
  }), [adapter, siteSlug]);

  const isEditorView = Boolean(
    search.theme_project ||
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

  // The useful CMS starts with the actual packaged theme workspace. The old
  // generic CMS hub remains available only through explicit legacy/page routes.
  if (!isEditorView) return <ThemeStorePage />;

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

  // Design starts with an actual theme project; legacy content pages remain an adapter seam.
  if (!search.theme_project && !activeThemeProject && !search.page && (!search.panel || search.panel === 'pages')) return <ThemeStorePage />;

  return (
    <div className="size-full overflow-hidden" data-cms-adapter="http">
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
        <span>Editor</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" style={{ height: "calc(100% - 41px)" }}>
        {(search.theme_project || activeThemeProject) ? <ThemeProjectEditor id={(search.theme_project || activeThemeProject)!} page={search.page} /> : <ThemeEditorFrame adapter={themeAdapter} page={search.page} />}
      </div>
    </div>
  );
}

