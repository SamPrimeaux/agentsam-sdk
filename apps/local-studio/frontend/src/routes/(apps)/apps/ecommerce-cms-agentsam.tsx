import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { studioCmsFetch } from '@/lib/cms/transport';
import { resolveEcommerceAdminPath } from '@/lib/apps/ecommerce-routing';

type Site = {
  id: string; slug: string; name: string; domain?: string | null;
  source: 'shared-d1' | 'worker'; can_edit: boolean;
};
type Search = { site?: string; page?: string; preview?: 'local' };

export const Route = createFileRoute('/(apps)/apps/ecommerce-cms-agentsam')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    site: typeof search.site === 'string' ? search.site : undefined,
    page: typeof search.page === 'string' ? search.page : undefined,
    preview: search.preview === 'local' ? 'local' : undefined,
  }),
  component: EcommerceAppHost,
});

function adminOrigin(candidate?: string | null) {
  if (!candidate) return null;
  try {
    const url = new URL(candidate.includes('://') ? candidate : 'https://' + candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

/**
 * Each installed site runs the SAME product code with its OWN Worker and
 * resources. The Studio host does not impersonate its API or borrow a tenant DB.
 */
function EcommerceAppHost() {
  const search = Route.useSearch();
  const { user, isPending: authPending } = useCurrentUserState();
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);
  const localHost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const localPreview = localHost && search.preview === 'local';

  useEffect(() => {
    let live = true;
    if (localPreview) { setPending(false); return; }
    studioCmsFetch('/api/cms/sites').then(async response => {
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'site_discovery_failed');
      if (live) setSites(body.sites || []);
    }).catch(cause => { if (live) setError(String(cause)); })
      .finally(() => { if (live) setPending(false); });
    return () => { live = false; };
  }, [localPreview]);

  const selected = search.site
    ? sites.find(site => site.slug === search.site)
    : sites.find(site => site.source === 'worker' && site.can_edit);
  const page = resolveEcommerceAdminPath(search.page || '/admin/store');
  const origin = localPreview ? 'http://127.0.0.1:4387'
    : selected?.source === 'worker' && selected.can_edit ? adminOrigin(selected.domain) : null;
  const url = useMemo(() => origin && page ? origin + page : null, [origin, page]);

  if (authPending) return <p className="p-8 text-muted-foreground">Loading AgentSam account…</p>;
  if (!user && !localPreview) return <RedirectToSignIn />;

  return <section className="fixed inset-0 z-50 flex flex-col bg-background" data-agentsam-installed-app="ecommerce-cms-agentsam">
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
      <a href="/sites" className="inline-flex items-center gap-2 text-xs font-medium hover:underline"><ArrowLeft size={14} /> Sites</a>
      <span className="truncate text-xs text-muted-foreground">{localPreview ? 'Local Ecommerce preview' : selected ? selected.name : 'Ecommerce CMS'}</span>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs hover:underline">
        Open full window <ExternalLink size={13}/>
      </a> : <span />}
    </div>
    {pending ? <p className="p-8 text-sm">Resolving installed Ecommerce application…</p>
      : error ? <p role="alert" className="p-8 text-sm text-destructive">{error}</p>
      : !page ? <p role="alert" className="p-8 text-sm text-destructive">That route is not available in the Ecommerce application.</p>
      : !url ? <div className="p-8 text-sm">
        No authorized Ecommerce Worker was found for this site. Configure the installation's Worker domain in Sites, or use the local preview on a loopback development host.
      </div>
      : <iframe title="Ecommerce CMS — complete admin application" src={url} className="min-h-0 w-full flex-1 border-0" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen" />}
  </section>;
}
