import { useEffect, useState } from 'react';
import { createDesktopConsoleHost } from '@/lib/apps/desktop-console-host';
import { isPackagedDesktop } from '@/lib/desktop/tauri';
import { createFileRoute } from '@tanstack/react-router';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { resolveEcommerceAdminPath, resolveEcommerceAssetPath } from '@/lib/apps/ecommerce-routing';
import { CmsThemeCodeEditor } from '@/components/themes/CmsThemeCodeEditor';

type Search = { site?: string; site_id?: string; project?: string; page?: string; preview?: 'local'; theme_sku?: string; theme_version?: string; action?: 'try' };

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
  const search = Route.useSearch();
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
  const assetPath = page && !isCodeEditor && (isPackagedDesktop() ? resolveEcommerceAssetPath(page) : page);
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
      // Preserve a validated Theme Store Try intent into the authenticated CMS
      // receiver. This is a selection hint, never authorization for installation.
      if (page === '/admin/store' && search.action === 'try' &&
          /^iam\\.theme\\.[a-z][a-z0-9-]{0,63}$/.test(search.theme_sku || '') &&
          /^\\d+\\.\\d+\\.\\d+$/.test(search.theme_version || '')) {
        resolved.searchParams.set('theme_sku', search.theme_sku!);
        resolved.searchParams.set('theme_version', search.theme_version!);
        resolved.searchParams.set('action', 'try');
      }
      return resolved.toString();
    })()
    : null;

  if (!bridgeReady || authPending) return <p className="p-8 text-muted-foreground">Loading AgentSam account…</p>;
  if (!user && !localPreview) return <RedirectToSignIn />;

  return <section className="flex h-full min-h-0 w-full flex-col bg-background" data-agentsam-installed-app="ecommerce-cms-agentsam">
    {!page ? <p role="alert" className="p-8 text-sm text-destructive">That product route is unavailable.</p>
      : isCodeEditor && search.project && search.site_id ? <CmsThemeCodeEditor projectId={search.project} siteId={search.site_id} />
      : !url ? <p role="alert" className="p-8 text-sm text-destructive">This product route is unavailable.</p>
      : <iframe title="Ecommerce CMS — complete admin application" src={url} className="min-h-0 w-full flex-1 border-0" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen" />}
  </section>;
}
