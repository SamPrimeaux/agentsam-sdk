// @ts-ignore Portable ecommerce CMS surface adapter.
import { createCmsThemeEditorAdapter, createHttpCmsAdapter } from '@inneranimalmedia/ecommerce-cms-agentsam/cms';
import { CmsHomePage } from '@/components/sites/CmsHomePage';
import { CmsOnlineStoreFrame } from '@/components/sites/CmsOnlineStoreFrame';
// @ts-ignore Portable JS adapter to the real remotely owned ecommerce CMS.
import { createRemoteThemeEditorAdapter } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/remote-worker-adapter';
import { ThemeEditorFrame } from '@/components/themes/ThemeEditorFrame';
import { ThemeProjectEditor } from '@/components/themes/ThemeProjectEditor';
import { studioCmsFetch } from '@/lib/cms/transport';
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
  const { sites, loading: sitesLoading, error: sitesError } = useAuthorizedCmsSites();

  const requestedSlug = (search.site || search.project_slug || search.project || '').trim();
  // Never substitute an unrelated property when an explicit site was requested.
  // On a plain /cms visit, choose only from authenticated properties.
  const ownedSite = sites.find((site) => site.slug === requestedSlug) ||
    (!requestedSlug ? (sites.find((site) => site.can_edit) || sites[0]) : undefined);
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

  // A local theme project is edited only when requested explicitly.
  // Previously a browser-saved theme silently overrode the selected real site.
  const localThemeProjectId = search.theme_project;
  if (!localThemeProjectId && sitesLoading) {
    return <p role="status" className="p-8 text-sm text-muted-foreground">Verifying website access…</p>;
  }
  if (!localThemeProjectId && sitesError && !sites.length && !requestedSlug) {
    // Downloaded desktop and offline installs can still edit local themes,
    // even when the hosted authorization registry is unavailable.
    return <CmsHomePage />;
  }
  if (!localThemeProjectId && requestedSlug && !ownedSite) {
    return <p role="alert" className="p-8 text-sm text-destructive">
      {sitesError ? 'Unable to verify access to this website: ' + sitesError :
        'This website is not registered to your CMS account.'}
    </p>;
  }
  if (!localThemeProjectId && !ownedSite) return <CmsHomePage />;
  if (!localThemeProjectId && ownedSite && !ownedSite.can_edit) {
    return <p role="alert" className="p-8 text-sm text-destructive">
      You do not have editing permission for this website.
    </p>;
  }

  // The merchant-facing Online Store from ecommerce-cms-agentsam is the CMS
  // landing experience. Theme inventory remains available separately at /themes.
  if (!isEditorView && ownedSite) {
    return <div className="flex h-full min-h-0 flex-col overflow-hidden" data-cms-product="ecommerce">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-2 text-sm">
        <label htmlFor="cms-site-select" className="font-medium">Website</label>
        <select id="cms-site-select" aria-label="Choose a website" value={siteSlug}
          onChange={(event) => goHub(event.target.value)}
          className="max-w-[min(60vw,340px)] rounded-lg border border-border bg-background px-3 py-1.5 text-foreground">
          {sites.map((site) => <option key={site.slug} value={site.slug}>{site.name}</option>)}
        </select>
        <button type="button" className="ml-auto rounded-lg border border-border px-3 py-1.5 hover:bg-muted"
          onClick={() => navigate({ to: '/sites' })}>All sites</button>
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted"
          onClick={() => navigate({ to: '/themes' })}>Theme library</button>
      </div>
      <div className="min-h-0 flex-1">
        <CmsOnlineStoreFrame site={ownedSite} adapter={themeAdapter}
          onEdit={(page) => navigate({ to: '/cms',
            search: { site: ownedSite.slug, view: 'editor', page, panel: undefined, theme_project: undefined } })} />
      </div>
    </div>;
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
        {localThemeProjectId ? <ThemeProjectEditor id={localThemeProjectId} page={search.page} /> : <ThemeEditorFrame adapter={themeAdapter} page={search.page} />}
      </div>
    </div>
  );
}

