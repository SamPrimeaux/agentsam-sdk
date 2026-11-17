import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, ExternalLink, Globe2, MoreHorizontal, Plus, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Native Online Store. One page in the global shell: store picker, live
 * preview, Draft themes and Discover themes. It reads the same authenticated
 * APIs the packaged console used; the packaged page and its second sidebar are
 * not involved.
 */

type StoreSite = { id: string; name?: string; title?: string; slug?: string; url?: string; primary_domain?: string; is_default?: boolean };
type StoreTheme = {
  id: string; name?: string; version?: string; package_version?: string;
  snapshot_url?: string | null; preview_url?: string | null; edit_href?: string | null; site_id?: string;
  last_saved?: string; updated_at?: string; created_at?: string; publish_ready?: boolean;
};
type StorePayload = {
  ok?: boolean; error?: string;
  selected_site_id?: string; selected_site_name?: string; available_sites?: StoreSite[];
  site_preview?: { url?: string; title?: string; name?: string; edit_href?: string } | null;
  store?: { visibility?: string; url?: string } | null;
  active_theme?: StoreTheme | null; preview_theme?: StoreTheme | null; draft_themes?: StoreTheme[];
  new_theme_url?: string;
};
type MarketTheme = {
  slug: string; name?: string; version?: string; developer?: string; author?: string;
  thumbnail_url?: string | null; preview_url?: string | null; can_install?: boolean;
};

const EDITOR_HOST = '/admin/apps/ecommerce-cms-agentsam';

function go(to: string) { window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to } })); }

/** Every editor entry goes through the one installed editor route. */
export function editorTarget(href: string | null | undefined, siteId?: string): string | null {
  if (!href) return null;
  let url: URL;
  try { url = new URL(href, window.location.origin); } catch { return null; }
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/admin/')) return null;
  if (siteId && !url.searchParams.has('site_id')) url.searchParams.set('site_id', siteId);
  return EDITOR_HOST + '?' + new URLSearchParams({ page: url.pathname + url.search }).toString();
}

function InAppLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    go(to);
  };
  return <a href={to} onClick={onClick} className={className}>{children}</a>;
}

const pill = 'inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted';

function formatSaved(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'short' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${month} at ${time}`;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || (data && data.ok === false)) throw new Error((data && data.error) || 'request_failed');
  return data as T;
}

function ThemeThumb({ theme }: { theme: StoreTheme }) {
  const [failed, setFailed] = useState(false);
  const src = theme.snapshot_url || null;
  const initial = (theme.name || 'T').trim().charAt(0).toUpperCase();
  return (
    <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      {src && !failed
        ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : <span aria-hidden="true" className="text-lg font-semibold text-muted-foreground">{initial}</span>}
    </div>
  );
}

function DraftRow({ theme, siteId, onPublished }: { theme: StoreTheme; siteId: string; onPublished: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const edit = editorTarget(theme.edit_href, theme.site_id || siteId);
  const saved = formatSaved(theme.last_saved || theme.updated_at || theme.created_at);
  const version = theme.version || theme.package_version;
  const canPublish = theme.publish_ready !== false;

  const publish = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/store/themes/${encodeURIComponent(theme.id)}/publish`, { method: 'POST', credentials: 'same-origin' });
      const data = await response.json().catch(() => null);
      if (!response.ok || (data && data.ok === false)) throw new Error((data && data.error) || 'publish_failed');
      setConfirming(false);
      onPublished();
    } catch { setError('This theme could not be published. Your live site has not changed.'); }
    finally { setBusy(false); }
  };

  return (
    <li className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <div className="flex items-center gap-4">
        <ThemeThumb theme={theme} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{theme.name || 'Untitled theme'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {saved ? `Last saved: ${saved}` : 'Not saved yet'}{version ? ` · v${version}` : ''}
          </p>
        </div>
        {edit && <InAppLink to={edit} className={cn(pill, 'h-8 bg-primary text-primary-foreground hover:bg-primary/90')}>Edit theme</InAppLink>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${theme.name || 'theme'}`}><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>{theme.name || 'Theme'}</DropdownMenuLabel>
            {edit && <DropdownMenuItem onSelect={() => go(edit)}>Edit theme</DropdownMenuItem>}
            {theme.preview_url && <DropdownMenuItem onSelect={() => window.open(theme.preview_url!, '_blank', 'noopener')}>Preview in new tab</DropdownMenuItem>}
            {canPublish && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setConfirming(true)}>Publish</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="Publish theme" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3">
          <p className="text-sm text-foreground">Publish this theme? The current live theme moves to Drafts and can be restored.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

function DiscoverCard({ theme, siteId }: { theme: MarketTheme; siteId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const add = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/website-themes/${encodeURIComponent(theme.slug)}/install`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: theme.version }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.editor_url !== 'string') throw new Error(data?.error || 'install_failed');
      const target = editorTarget(data.editor_url, siteId);
      if (!target) throw new Error('invalid_editor_destination');
      go(target);
    } catch { setError('This theme could not be added. Your existing sites have not changed.'); setBusy(false); }
  };
  const by = theme.developer || theme.author;
  return (
    <li className="flex flex-col gap-3">
      <div className="aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted">
        {theme.thumbnail_url && !imageFailed
          ? <img src={theme.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
          : <div className="flex h-full items-center justify-center text-3xl font-semibold text-muted-foreground" aria-hidden="true">{(theme.name || theme.slug).charAt(0).toUpperCase()}</div>}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{theme.name || theme.slug}</p>
          {by && <p className="truncate text-xs text-muted-foreground">by {by}</p>}
        </div>
        {theme.can_install !== false && <Button variant="outline" size="sm" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add'}</Button>}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function OnlineStorePage({ siteId }: { siteId?: string }) {
  const [data, setData] = useState<StorePayload | null>(null);
  const [error, setError] = useState('');
  const [market, setMarket] = useState<MarketTheme[]>([]);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    getJson<StorePayload>('/api/admin/store/online' + (siteId ? '?site_id=' + encodeURIComponent(siteId) : ''), controller.signal)
      .then(setData)
      .catch(cause => { if (!controller.signal.aborted) setError(String(cause?.message || 'request_failed')); });
    return () => controller.abort();
  }, [siteId, tick]);

  useEffect(() => {
    const controller = new AbortController();
    getJson<{ themes?: MarketTheme[] } | MarketTheme[]>('/api/admin/website-themes', controller.signal)
      .then(result => setMarket(Array.isArray(result) ? result : (result.themes || [])))
      .catch(() => { if (!controller.signal.aborted) setMarket([]); });
    return () => controller.abort();
  }, []);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl p-8" role="alert">
        <h1 className="text-xl font-semibold text-foreground">Online Store</h1>
        <p className="mt-3 text-sm text-muted-foreground">We couldn’t load your store right now.</p>
        <Button className="mt-4" variant="outline" onClick={reload}>Try again</Button>
      </div>
    );
  }
  if (!data) return <p role="status" className="p-8 text-sm text-muted-foreground">Loading Online Store…</p>;

  const sites = data.available_sites || [];
  const selectedId = data.selected_site_id || siteId || '';
  const selected = sites.find(site => site.id === selectedId);
  const siteName = data.selected_site_name || selected?.name || selected?.title || 'Your website';
  const siteDomain = selected?.primary_domain || selected?.url || '';
  const live = data.site_preview?.url || (data.store?.visibility === 'public' ? data.store?.url : '') || '';
  const status = data.site_preview?.url ? 'Website live'
    : data.store?.visibility === 'public' ? 'Public'
    : data.store?.visibility === 'password' ? 'Password protected' : 'Theme not published';
  const activeTheme = data.preview_theme || data.active_theme || null;
  const activeEdit = editorTarget(data.site_preview?.edit_href || activeTheme?.edit_href, selectedId);
  const drafts = (data.draft_themes || []).filter(draft => draft.id !== activeTheme?.id);
  const newTheme = editorTarget(data.new_theme_url || '/admin/theme-editor?new=1', selectedId);
  const checkout = editorTarget('/admin/onboarding-preview', selectedId);
  const workspace = editorTarget('/admin/theme-workspace', selectedId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex w-full max-w-sm items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted" aria-label="Choose website">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">{siteName}</span>
              {siteDomain && <span className="block truncate text-xs text-muted-foreground">{siteDomain}</span>}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-64">
          <DropdownMenuLabel>Websites</DropdownMenuLabel>
          {sites.map(site => (
            <DropdownMenuItem key={site.id} onSelect={() => go('/admin/store?site_id=' + encodeURIComponent(site.id))}>
              <span className="flex flex-col"><span>{site.name || site.title || site.slug || site.id}</span>
                {(site.primary_domain || site.url) && <span className="text-xs text-muted-foreground">{site.primary_domain || site.url}</span>}
              </span>
            </DropdownMenuItem>
          ))}
          {!sites.length && <DropdownMenuItem disabled>No websites yet</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-2xl font-semibold text-foreground"><Store className="size-5 text-muted-foreground" aria-hidden="true" />Online Store</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={pill}><span className={cn('size-2 rounded-full', live ? 'bg-accent' : 'bg-muted-foreground')} aria-hidden="true" />{status}</span>
          {checkout && <InAppLink to={checkout} className={pill}>Preview checkout</InAppLink>}
          {live && <a className={pill} href={live} target="_blank" rel="noopener noreferrer">View site <ExternalLink className="size-3.5" aria-hidden="true" /></a>}
          {workspace && <InAppLink to={workspace} className={pill}>My Theme Studio</InAppLink>}
        </div>
      </header>

      <section aria-label="Live site preview" className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative aspect-[16/8] bg-muted">
          {live
            ? <iframe src={live} title={`${siteName} preview`} loading="lazy" className="pointer-events-none h-full w-full border-0" sandbox="allow-scripts allow-same-origin" />
            : <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><Globe2 className="size-8" aria-hidden="true" /><p className="text-sm">Publish a theme to see your site here.</p></div>}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{data.site_preview?.title || data.site_preview?.name || siteName}</p>
            <p className="truncate text-xs text-muted-foreground">{live ? `Published website · ${live}` : (activeTheme?.name || 'No published theme')}</p>
          </div>
          {activeEdit && <InAppLink to={activeEdit} className={cn(pill, 'bg-primary text-primary-foreground hover:bg-primary/90')}>Edit page</InAppLink>}
        </div>
      </section>

      <section aria-label="Draft themes">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Draft themes</h2>
          {newTheme && <InAppLink to={newTheme} className={pill}><Plus className="size-4" aria-hidden="true" />New theme</InAppLink>}
        </div>
        <div className="rounded-2xl border border-border bg-card">
          {drafts.length
            ? <ul>{drafts.map(draft => <DraftRow key={draft.id} theme={draft} siteId={selectedId} onPublished={reload} />)}</ul>
            : <p className="px-5 py-8 text-sm text-muted-foreground">No draft themes yet. Create one, or add a theme below to start editing.</p>}
        </div>
      </section>

      <section aria-label="Discover themes">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Discover themes</h2>
          <a className={pill} href="https://themes.inneranimalmedia.com/" target="_blank" rel="noopener noreferrer">Visit Theme Store <ExternalLink className="size-3.5" aria-hidden="true" /></a>
        </div>
        {market.length
          ? <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{market.map(theme => <DiscoverCard key={theme.slug} theme={theme} siteId={selectedId} />)}</ul>
          : <p className="text-sm text-muted-foreground">No themes are available to add right now.</p>}
      </section>
    </div>
  );
}
