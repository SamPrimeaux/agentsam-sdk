import { useEffect, useState } from 'react';
import { createDesktopConsoleHost } from '@/lib/apps/desktop-console-host';
import { isPackagedDesktop } from '@/lib/desktop/tauri';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { resolveEcommerceAdminPath, resolveEcommerceAssetPath } from '@/lib/apps/ecommerce-routing';
import { shouldRedirectEcommerceAppHost } from '@/lib/apps/ecommerce-routing';
import { themeStoreTrySelection } from '@/lib/apps/theme-store-selection';
import { CmsThemeCodeEditor } from '@/components/themes/CmsThemeCodeEditor';
import { runCommand } from '@/lib/commands/native-commands';
import { AlertCircle, ArrowLeft, Package, RefreshCw } from 'lucide-react';

type Search = { site?: string; site_id?: string; project?: string; page?: string; preview?: 'local'; theme_sku?: string; theme_version?: string; action?: 'try'; stock?: string; preview_id?: string };

function UnavailableProductRoute({ requested }: { requested?: string }) {
  const productRequested = requested?.startsWith('/admin/products');
  const diagnostic = (() => {
    if (!requested) return 'No destination was supplied.';
    try {
      const url = new URL(requested, 'https://agent-route.invalid');
      const keys = [...new Set(url.searchParams.keys())];
      return url.pathname + (keys.length ? ' · parameters: ' + keys.join(', ') : '');
    } catch { return 'The destination could not be parsed.'; }
  })();
  const openProducts = () => {
    const route = '/admin/products';
    if (isPackagedDesktop()) window.location.hash = '#' + route;
    else window.location.assign(route);
  };
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto px-5 py-10" role="alert" data-product-route-unavailable>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <AlertCircle aria-hidden="true" className="mb-4 size-6 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">
          {productRequested ? "Product Studio couldn't open" : "This page couldn't open"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This desktop installation doesn't recognize the destination. The link may be outdated, or a newer app build may be needed. Your existing work wasn't changed.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" onClick={openProducts}>
            <Package aria-hidden="true" className="size-4" /> Open Products
          </button>
          <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted" onClick={() => window.history.back()}>
            <ArrowLeft aria-hidden="true" className="size-4" /> Go back
          </button>
          {isPackagedDesktop() ? <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted" onClick={() => void runCommand('app.check_updates')}>
            <RefreshCw aria-hidden="true" className="size-4" /> Check for updates
          </button> : null}
        </div>
        <details className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <p className="mt-2 break-all font-mono">{diagnostic}</p>
        </details>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/(apps)/admin/apps/ecommerce-cms-agentsam')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    site: typeof search.site === 'string' ? search.site : undefined,
    site_id: typeof search.site_id === 'string' ? search.site_id : undefined,
    project: typeof search.project === 'string' ? search.project : undefined,
    page: typeof search.page === 'string' ? search.page : undefined,
    preview: search.preview === 'local' ? 'local' : undefined,
    theme_sku: typeof search.theme_sku === 'string' ? search.theme_sku : undefined,
    theme_version: typeof search.theme_version === 'string' ? search.theme_version : undefined,
    action: search.action === 'try' ? 'try' : undefined,
    stock: typeof search.stock === 'string' && /^platform\/[a-z0-9-]{1,70}$/.test(search.stock) ? search.stock : undefined,
  }),
  component: EcommerceAppHost,
});

/**
 * Compatibility entry for old /admin/apps/ecommerce-cms-agentsam?page=... links.
 * Local Studio redirects them to the canonical top-level /admin/... URL; it no
 * longer nests CMS pages inside a second application route.
 */
function EcommerceAppHost() {
  const search = Route.useSearch();
  return <EcommerceAppView search={search} redirectOnly={shouldRedirectEcommerceAppHost(isPackagedDesktop(), search.page)} />;
}

/**
 * Reusable installed product view. The clean /admin/store mount and legacy
 * /apps/... wrapper intentionally share this one component and product routes.
 * The clean mount frames the packaged asset to avoid an iframe self-loop.
 */
export function EcommerceAppView({ search, redirectOnly = false }: {
  search: Search;
  redirectOnly?: boolean;
}) {
  const [bridgeReady, setBridgeReady] = useState(!isPackagedDesktop());
  useEffect(() => {
    if (!isPackagedDesktop()) return;
    const bridge = createDesktopConsoleHost(path => { window.location.hash = '#' + path; });
    window.agentsamConsoleHost = bridge;
    setBridgeReady(true);
    return () => { if (window.agentsamConsoleHost === bridge) delete window.agentsamConsoleHost; };
  }, []);
  const { user, isPending: authPending } = useCurrentUserState();
  const localHost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const localPreview = localHost && search.preview === 'local';
  const isCodeEditor = search.page === '/admin/theme-code-editor';
  const page = isCodeEditor ? '/admin/theme-code-editor' : resolveEcommerceAdminPath(search.page || '/admin/store');
  // Embedded product content must resolve to the packaged asset, never another
  // /admin route that could recursively mount Local Studio's outer shell.
  const assetPath = page && !isCodeEditor ? resolveEcommerceAssetPath(page) : null;
  const redirectTarget = page && typeof window !== 'undefined'
    ? (() => {
      const resolved = new URL(page, window.location.origin);
      const siteScoped = ['/admin/store','/admin/pages','/admin/theme-editor','/admin/page-edit',
        '/admin/theme-project-editor','/admin/product-edit','/admin/products','/admin/collections',
        '/admin/collections/new','/admin/inventory','/admin/onboarding-preview','/admin/products/create'];
      if (search.site_id && siteScoped.some(path => resolved.pathname === path || resolved.pathname.startsWith(path + '/')) && !resolved.searchParams.has('site_id'))
        resolved.searchParams.set('site_id', search.site_id);
      if (resolved.pathname === '/admin/theme-project-editor' && search.project && !resolved.searchParams.has('project'))
        resolved.searchParams.set('project', search.project);
      if (resolved.pathname === '/admin/onboarding-preview' && search.preview_id && !resolved.searchParams.has('preview_id'))
        resolved.searchParams.set('preview_id', search.preview_id);
      const trySelection = resolved.pathname === '/admin/store' ? themeStoreTrySelection(search) : null;
      if (trySelection) {
        resolved.searchParams.set('theme_sku', trySelection.theme_sku);
        resolved.searchParams.set('theme_version', trySelection.theme_version);
        resolved.searchParams.set('action', trySelection.action);
      }
      if (search.stock && /^platform\/[a-z0-9-]{1,70}$/.test(search.stock)) resolved.searchParams.set('stock', search.stock);
      return resolved.pathname + resolved.search + resolved.hash;
    })()
    : null;
  useEffect(() => {
    if (!redirectOnly || localPreview || !redirectTarget || !bridgeReady || authPending || !user) return;
    if (isPackagedDesktop()) window.location.hash = '#' + redirectTarget;
    else window.location.replace(redirectTarget);
  }, [redirectOnly, localPreview, redirectTarget, bridgeReady, authPending, user]);

  const url = assetPath
    ? (() => {
      // The iframe URL is origin-relative so server and client render the same markup.
      const resolved = new URL(assetPath, 'https://agentsam.local');
      // The host already owns global navigation, search, assistant and dock.
      // Standalone CMS routes remain unchanged; only this iframe is chrome-free.
      resolved.searchParams.set('__agentsamEmbedded', '1');
      const cleanSiteScopedEditor = /^\/admin\/sites\/[A-Za-z0-9_-]{1,160}\/(?:pages\/[A-Za-z0-9_-]{1,160}\/editor|themes\/[A-Za-z0-9_-]{1,160}\/editor(?:\/[A-Za-z0-9_-]{1,160})?|settings\/editor)$/.test(page?.split('?')[0] || '');
      if (!cleanSiteScopedEditor && search.site_id && /^[A-Za-z0-9_-]{1,120}$/.test(search.site_id) && page?.startsWith('/admin/')) {
        resolved.searchParams.set('site_id', search.site_id);
      }
      if (page?.split('?')[0] === '/admin/theme-project-editor' && search.project && /^[A-Za-z0-9_-]{1,160}$/.test(search.project)) {
        resolved.searchParams.set('project', search.project);
      }
      const editorRoutePath = page?.split('?')[0] || '';
      const isThemeStudioRoute = editorRoutePath === '/admin/theme-editor' || editorRoutePath === '/admin/theme-project-editor' ||
        /^\/admin\/sites\/[A-Za-z0-9_-]{1,160}\/(?:pages\/[A-Za-z0-9_-]{1,160}\/editor|themes\/[A-Za-z0-9_-]{1,160}\/editor(?:\/[A-Za-z0-9_-]{1,160})?|settings\/editor)$/.test(editorRoutePath);
      if (isThemeStudioRoute && page) resolved.searchParams.set('editor_route', page);
      // The source-backed Design Canvas handoff is only an editor selection.
      // It never grants site ownership, installs a component or publishes content.
      if (search.stock && /^platform\/[a-z0-9-]{1,70}$/.test(search.stock))
        resolved.searchParams.set('stock', search.stock);
      if (page?.split('?')[0]==='/admin/onboarding-preview' && search.preview_id &&
          /^cprev_[a-f0-9]{24}$/.test(search.preview_id))
        resolved.searchParams.set('preview_id', search.preview_id);
      // Preserve a validated Theme Store Try intent into the authenticated CMS
      // receiver. This is a selection hint, never authorization for installation.
      const trySelection = page === '/admin/store' ? themeStoreTrySelection(search) : null;
      if (trySelection) {
        resolved.searchParams.set('theme_sku', trySelection.theme_sku);
        resolved.searchParams.set('theme_version', trySelection.theme_version);
        resolved.searchParams.set('action', trySelection.action);
      }
      return resolved.pathname + resolved.search + resolved.hash;
    })()
    : null;

  // The web CMS editor uses one route for every viewport width. A top-level
  // editor document avoids an unnecessary Local Studio iframe around its own
  // srcdoc workbench and storefront preview. Breakpoints affect layout only,
  // never which editor runs. Packaged desktop navigation is intentionally
  // handled by its native app host; it mounts the same CMS editor product.
  const editorRoutePath = page?.split('?')[0] || '';
  const standaloneWebEditor = typeof window !== 'undefined' && !isPackagedDesktop() && (
    editorRoutePath === '/admin/theme-editor' || editorRoutePath === '/admin/theme-project-editor' ||
    /^\/admin\/sites\/[A-Za-z0-9_-]{1,160}\/(?:pages\/[A-Za-z0-9_-]{1,160}\/editor|themes\/[A-Za-z0-9_-]{1,160}\/editor(?:\/[A-Za-z0-9_-]{1,160})?|settings\/editor)$/.test(editorRoutePath)
  );
  useEffect(() => {
    if (!standaloneWebEditor || !page || !bridgeReady || authPending || (!user && !localPreview)) return;
    window.location.replace(page);
  }, [standaloneWebEditor, page, bridgeReady, authPending, user, localPreview]);

  if (!bridgeReady || authPending) return <p className="p-8 text-muted-foreground">Loading AgentSam account…</p>;
  if (!user && !localPreview) return <RedirectToSignIn />;
  if (standaloneWebEditor) return <p role="status" className="p-5 text-sm text-muted-foreground">Opening Theme Studio…</p>;

  // Compatibility for saved CMS navigation links created before Design Canvas
  // was unified. Do not try to mount it as a packaged ecommerce route.
  const legacyPage = (search.page || "").split("?")[0];
  const legacyDesignCanvas = legacyPage === "/admin/design-canvas" || legacyPage === "/admin/design-canvas/";
  if (legacyDesignCanvas) {
    return <Navigate to="/admin/canvas" search={{ library: "sources" }} replace />;
  }
  if (redirectOnly && !localPreview) {
    return redirectTarget
      ? <p className="p-8 text-muted-foreground">Opening the requested Local Studio page…</p>
      : <UnavailableProductRoute requested={search.page} />;
  }

  return <section className="flex h-full min-h-0 w-full flex-col bg-background" data-agentsam-installed-app="ecommerce-cms-agentsam">
    {!page ? <UnavailableProductRoute requested={search.page} />
      : isCodeEditor && search.project ? <CmsThemeCodeEditor projectId={search.project} siteId={search.site_id} />
      : !url ? <UnavailableProductRoute requested={search.page} />
      : <iframe title="Ecommerce CMS — complete admin application" src={url} className="min-h-0 w-full flex-1 border-0" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen" />}
  </section>;
}
