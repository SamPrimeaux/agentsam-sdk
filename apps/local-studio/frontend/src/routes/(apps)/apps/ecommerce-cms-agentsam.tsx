import { useEffect, useState } from 'react';
import { createDesktopConsoleHost } from '@/lib/apps/desktop-console-host';
import { isPackagedDesktop } from '@/lib/desktop/tauri';
import { createFileRoute } from '@tanstack/react-router';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { resolveEcommerceAdminPath, resolveEcommerceAssetPath } from '@/lib/apps/ecommerce-routing';
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
    const route = '/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent('/admin/products');
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

export const Route = createFileRoute('/(apps)/apps/ecommerce-cms-agentsam')({
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
 * Local Studio owns its installed ecommerce routes and data. Embed the
 * packaged console from this origin so its UI and /api/admin requests stay on
 * the Local Studio Worker and its DB binding. The browser retains the registered /apps/ecommerce-cms-agentsam route
 * and its page search parameter. The Worker separately serves direct /admin/* URLs.
 */
function EcommerceAppHost() {
  return <EcommerceAppView search={Route.useSearch()} />;
}

/**
 * Reusable installed product view. The clean /admin/store mount and legacy
 * /apps/... wrapper intentionally share this one component and product routes.
 * The clean mount frames the packaged asset to avoid an iframe self-loop.
 */
export function EcommerceAppView({ search, forcePackagedAsset = false }: {
  search: Search;
  forcePackagedAsset?: boolean;
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
  const assetPath = page && !isCodeEditor && ((isPackagedDesktop() || forcePackagedAsset) ? resolveEcommerceAssetPath(page) : page);
  const url = typeof window !== 'undefined' && assetPath
    ? (() => {
      const resolved = new URL(assetPath, window.location.origin);
      if (!isPackagedDesktop() && page === '/admin/home') resolved.searchParams.set('__agentsamEmbedded', '1');
      if (search.site_id && /^[A-Za-z0-9_-]{1,120}$/.test(search.site_id) && page?.startsWith('/admin/')) {
        resolved.searchParams.set('site_id', search.site_id);
      }
      if (page?.split('?')[0] === '/admin/theme-project-editor' && search.project && /^[A-Za-z0-9_-]{1,160}$/.test(search.project)) {
        resolved.searchParams.set('project', search.project);
      }
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
      return resolved.toString();
    })()
    : null;

  if (!bridgeReady || authPending) return <p className="p-8 text-muted-foreground">Loading AgentSam account…</p>;
  if (!user && !localPreview) return <RedirectToSignIn />;

  return <section className="flex h-full min-h-0 w-full flex-col bg-background" data-agentsam-installed-app="ecommerce-cms-agentsam">
    {!page ? <UnavailableProductRoute requested={search.page} />
      : isCodeEditor && search.project && search.site_id ? <CmsThemeCodeEditor projectId={search.project} siteId={search.site_id} />
      : !url ? <UnavailableProductRoute requested={search.page} />
      : <iframe title="Ecommerce CMS — complete admin application" src={url} className="min-h-0 w-full flex-1 border-0" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen" />}
  </section>;
}
