import { useEffect, useState } from 'react';
import { createDesktopConsoleHost } from '@/lib/apps/desktop-console-host';
import { isPackagedDesktop } from '@/lib/desktop/tauri';
import { createFileRoute } from '@tanstack/react-router';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { resolveEcommerceAdminPath, resolveEcommerceAssetPath } from '@/lib/apps/ecommerce-routing';

type Search = { site?: string; page?: string; preview?: 'local' };

export const Route = createFileRoute('/(apps)/apps/ecommerce-cms-agentsam')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    site: typeof search.site === 'string' ? search.site : undefined,
    page: typeof search.page === 'string' ? search.page : undefined,
    preview: search.preview === 'local' ? 'local' : undefined,
  }),
  component: EcommerceAppHost,
});

/**
 * Local Studio owns its installed ecommerce routes and data. Embed the
 * packaged console from this origin so its UI and /api/admin requests stay on
 * the Local Studio Worker and its DB binding.
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
  const page = resolveEcommerceAdminPath(search.page || '/admin/store');
  const assetPath = page && (isPackagedDesktop() ? resolveEcommerceAssetPath(page) : page);
  const url = typeof window !== 'undefined' && assetPath
    ? new URL(assetPath, window.location.origin).toString()
    : null;

  if (!bridgeReady || authPending) return <p className="p-8 text-muted-foreground">Loading AgentSam account…</p>;
  if (!user && !localPreview) return <RedirectToSignIn />;

  return <section className="fixed inset-0 flex min-h-0 flex-col bg-background" data-agentsam-installed-app="ecommerce-cms-agentsam">
    {!page ? <p role="alert" className="p-8 text-sm text-destructive">That product route is unavailable.</p>
      : !url ? <p role="alert" className="p-8 text-sm text-destructive">This product route is unavailable.</p>
      : <iframe title="Ecommerce CMS — complete admin application" src={url} className="min-h-0 w-full flex-1 border-0" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen" />}
  </section>;
}
