import { createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { resolveEcommerceAdminPath } from '@/lib/apps/ecommerce-routing';

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
  const { user, isPending: authPending } = useCurrentUserState();
  const localHost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const localPreview = localHost && search.preview === 'local';
  const page = resolveEcommerceAdminPath(search.page || '/admin/store');
  const assetPath = page === '/admin/home'
    ? '/ecommerce-cms-agentsam/admin/home.html'
    : page;
  const url = typeof window !== 'undefined' && assetPath
    ? new URL(assetPath, window.location.origin).toString()
    : null;

  if (authPending) return <p className="p-8 text-muted-foreground">Loading AgentSam account…</p>;
  if (!user && !localPreview) return <RedirectToSignIn />;

  return <section className="fixed inset-0 z-50 flex flex-col bg-background" data-agentsam-installed-app="ecommerce-cms-agentsam">
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
      <a href="/admin/home" className="inline-flex items-center gap-2 text-xs font-medium hover:underline"><ArrowLeft size={14} /> Home</a>
      <span className="truncate text-xs text-muted-foreground">Local Studio Commerce</span>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs hover:underline">
        Open full window <ExternalLink size={13}/>
      </a> : <span />}
    </div>
    {!page ? <p role="alert" className="p-8 text-sm text-destructive">That route is not available in Local Studio Commerce.</p>
      : !url ? <p role="alert" className="p-8 text-sm text-destructive">This Local Studio route is unavailable.</p>
      : <iframe title="Ecommerce CMS — complete admin application" src={url} className="min-h-0 w-full flex-1 border-0" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen" />}
  </section>;
}
