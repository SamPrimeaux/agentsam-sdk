// @ts-ignore Portable ecommerce CMS surface adapter.
import { createCmsThemeEditorAdapter, createHttpCmsAdapter } from '@inneranimalmedia/ecommerce-cms-agentsam/cms';
import { CmsHomePage } from '@/components/sites/CmsHomePage';
// @ts-ignore Portable JS adapter to the real remotely owned ecommerce CMS.
import { createRemoteThemeEditorAdapter } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/remote-worker-adapter';
import { ThemeEditorFrame } from '@/components/themes/ThemeEditorFrame';
import { ThemeProjectEditor } from '@/components/themes/ThemeProjectEditor';
import { studioCmsFetch } from '@/lib/cms/transport';
import { getActiveThemeId } from '@/lib/themes/projects';
import { useMemo, useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ContentStudioPage } from "@/components/content/ContentStudioPage";
import type { CmsPanel } from "@/lib/cms/parseCmsNavigatePath";

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

interface AuthorizedCmsSite {
  id: string;
  slug: string;
  name: string;
  domain?: string | null;
  source: 'shared-d1' | 'worker';
  worker_id?: string | null;
  can_edit: boolean;
  can_publish: boolean;
}

/** Every website comes from the authenticated project/tenant registry. */
function useAuthorizedCmsSites() {
  const [sites, setSites] = useState<AuthorizedCmsSite[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    studioCmsFetch('/api/cms/sites').then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'cms_sites_unavailable');
      if (mounted) setSites(result.sites || []);
    }).catch((cause) => { if (mounted) setError(String(cause)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  return { sites, error, loading };
}

function CmsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [activeThemeProject, setActiveThemeProject] = useState<string>();
  const { sites, loading: sitesLoading, error: sitesError } = useAuthorizedCmsSites();
  useEffect(() => { void getActiveThemeId().then(setActiveThemeProject); }, []);

  const requestedSlug = (search.site || search.project_slug || search.project || '').trim();
  const ownedSite = sites.find((site) => site.slug === requestedSlug);
  const siteSlug = ownedSite?.slug || '';
  const siteName = ownedSite?.name || requestedSlug || 'Site';

  const adapter = useMemo(
    () => createHttpCmsAdapter({ transport: studioCmsFetch }),
    [],
  );

  const themeAdapter = useMemo(() => {
    if (!ownedSite || !ownedSite.can_edit) return null;
    if (ownedSite.source === 'worker') {
      return createRemoteThemeEditorAdapter(ownedSite.slug, studioCmsFetch);
    }
    return createCmsThemeEditorAdapter(adapter, ownedSite.slug, {
      resolvePreview: async (_site: unknown, page: { id: string }) => {
        const response = await studioCmsFetch(
          `/api/cms/render-page?site=${encodeURIComponent(ownedSite.slug)}&page_id=${encodeURIComponent(page.id)}&mode=draft`,
        );
        if (!response.ok) throw new Error('cms_preview_unavailable');
        return { html: await response.text() };
      },
    });
  }, [adapter, ownedSite]);

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

  // /cms is a genuine application home; theme editing has its own launch flow.
  // Existing deep links to hosted pages and local theme projects remain intact.
  if (!isEditorView) return <CmsHomePage />;

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

