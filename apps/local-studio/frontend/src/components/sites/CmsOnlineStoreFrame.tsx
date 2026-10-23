import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CircleHelp, FileText, LayoutTemplate, PanelsTopLeft, ShieldCheck, Store } from 'lucide-react';
// The original merchant Store is packaged with ecommerce-cms-agentsam.
// @ts-ignore Public portable JS package entry.
import { mountOnlineStore } from '@inneranimalmedia/ecommerce-cms-agentsam/store/mount';

interface MerchantSite {
  slug: string;
  name: string;
  domain?: string | null;
  source: 'shared-d1' | 'worker';
  can_edit: boolean;
}

type EditorAdapter = {
  listPages: () => Promise<{ slug: string; id?: string; title?: string }[]>;
  getStoreOverview?: () => Promise<{
    ok?: boolean;
    store?: { url?: string | null; visibility?: string };
    active_theme?: {
      id?: string;
      name?: string;
      edit_href?: string;
      appearance?: { tokens?: { color?: Record<string, string> } };
    } | null;
    draft_themes?: unknown[];
  }>;
};

function verifiedPublicUrl(candidate?: string | null, expectedDomain?: string | null): string | null {
  if (!candidate || !expectedDomain) return null;
  try {
    const domain = new URL(/^https?:\/\//i.test(expectedDomain) ? expectedDomain : 'https://' + expectedDomain);
    const url = new URL(candidate, domain);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) return null;
    if (url.origin !== domain.origin || url.username || url.password) return null;
    return url.origin + '/';
  } catch { return null; }
}

function validColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[a-f0-9]{3,8}$/i.test(value) ? value : undefined;
}

export function CmsOnlineStoreFrame({
  site,
  adapter,
  onEdit,
  onOpenThemes,
  onOpenHelp,
}: {
  site: MerchantSite;
  adapter: EditorAdapter | null;
  onEdit: (pageSlug: string) => void;
  onOpenThemes: () => void;
  onOpenHelp: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const storefrontUrl = useMemo(() =>
    site.source === 'worker' ? verifiedPublicUrl(site.domain, site.domain) : null,
  [site.domain, site.source]);

  useEffect(() => {
    if (site.source !== 'worker') return;
    const iframe = frame.current;
    if (!iframe || !adapter) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    setLoading(true);

    const boot = async () => {
      if (disposed || !iframe.contentDocument) return;
      setError('');
      try {
        dispose = await mountOnlineStore(iframe, {
          baseUrl: window.location.origin,
          storefrontUrl,
          async loadStore() {
            if (!adapter.getStoreOverview) throw new Error('The site has no installed Store Overview adapter');
            const [overview, pages] = await Promise.all([adapter.getStoreOverview(), adapter.listPages()]);
            if (overview.ok === false) throw new Error('Store authority rejected the overview request');
            if (!Array.isArray(pages) || !pages.length) throw new Error('The owning Worker returned no registered CMS pages');
            // The owning Worker—not a guessed project domain—is the authority
            // for the public storefront. Reject conflicting domains.
            const publicUrl = verifiedPublicUrl(overview.store?.url, site.domain);
            const active = overview.active_theme;
            const colors = active?.appearance?.tokens?.color || {};
            if (!disposed) setTokens(Object.fromEntries(
              Object.entries(colors).filter(([, value]) => validColor(value))
            ) as Record<string, string>);
            const pageSlug = pages.find(({ slug }) => slug === 'shop')?.slug ||
              pages.find(({ slug }) => slug === 'home')?.slug || pages[0].slug;
            return {
              ...overview,
              store: { ...(overview.store || {}), visibility: overview.store?.visibility || 'unknown', url: publicUrl },
              active_theme: active
                ? {
                    ...active,
                    verified: Boolean(publicUrl),
                    preview_href: publicUrl,
                    edit_href: active.edit_href || '/admin/theme-editor?slug=' + encodeURIComponent(pageSlug),
                  }
                : null,
              draft_themes: overview.draft_themes || [],
            };
          },
          async onEdit(requestedSlug: string) {
            const pages = await adapter.listPages();
            const page = pages.find(({ slug }) => slug === requestedSlug) ||
              pages.find(({ slug }) => slug === 'shop') ||
              pages.find(({ slug }) => slug === 'home') || pages[0];
            if (page) onEdit(page.slug);
          },
          onReady() { if (!disposed) setLoading(false); },
        });
      } catch (cause) {
        if (!disposed) { setError(cause instanceof Error ? cause.message : String(cause)); setLoading(false); }
      }
    };
    iframe.addEventListener('load', boot);
    iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>';
    return () => {
      disposed = true;
      dispose?.();
      iframe.removeEventListener('load', boot);
    };
  }, [site.slug, site.source, storefrontUrl, adapter, onEdit]);

  // Content-only records stay editable, but must not impersonate a live storefront.
  // Use the Online Store workspace as the presentation reference while making
  // the actual setup steps and publication boundary explicit.
  if (site.source !== 'worker') {
    const openContentEditor = async () => {
      try {
        const pages = await adapter?.listPages();
        if (pages?.length) onEdit(pages.find(page => page.slug === 'home')?.slug || pages[0].slug);
        else setError('No editable content pages are registered for this project.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    return (
      <section data-cms-site-installation="unlinked" className="h-full min-h-0 overflow-auto bg-background text-foreground">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center gap-7 px-5 py-8 lg:px-9">
          <header className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Store size={15} /> Online Store / Setup
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your store is taking shape.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {site.name} has editable content, but it is not connected to a verified storefront renderer and installed theme yet.
                The setup view keeps that distinction clear instead of presenting an unverified draft as a live website.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
              <span className="size-2 rounded-full bg-amber-500" /> Storefront not configured
            </span>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.85fr)]">
            <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="cms-store-setup-title">
              <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
                <span className="rounded-xl border border-border bg-background p-2.5"><PanelsTopLeft size={19} /></span>
                <div className="min-w-0 flex-1">
                  <h2 id="cms-store-setup-title" className="font-semibold">Bring the storefront online</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Three clear steps from editable content to a verifiable store.</p>
                </div>
                <span className="hidden rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">Setup</span>
              </div>
              <ol className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                <li className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-4">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-semibold">01</span>
                  <LayoutTemplate className="mt-4 text-muted-foreground" size={19} />
                  <h3 className="mt-3 text-sm font-semibold">Choose a theme</h3>
                  <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">Start from a packaged design for this site's storefront.</p>
                  <button type="button" onClick={onOpenThemes} className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-medium hover:underline">
                    Explore themes <ArrowRight size={14} />
                  </button>
                </li>
                <li className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-4">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-semibold">02</span>
                  <FileText className="mt-4 text-muted-foreground" size={19} />
                  <h3 className="mt-3 text-sm font-semibold">Shape your content</h3>
                  <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">Edit the existing pages and their structured content without publishing.</p>
                  <button type="button" onClick={() => void openContentEditor()} className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-medium hover:underline">
                    Edit content <ArrowRight size={14} />
                  </button>
                </li>
                <li className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-4">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-semibold">03</span>
                  <ShieldCheck className="mt-4 text-muted-foreground" size={19} />
                  <h3 className="mt-3 text-sm font-semibold">Preview and publish</h3>
                  <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">Available when a renderer, theme, and publication binding are verified.</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">Waiting for connection</span>
                </li>
              </ol>
            </section>

            <aside className="flex flex-col rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="cms-online-store-reference-title">
              <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background"><Store size={20} /></span>
              <h2 id="cms-online-store-reference-title" className="mt-4 text-lg font-semibold">Online Store workspace</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This is the reference experience for connected sites: actual desktop and mobile storefront previews, active-theme status, draft themes, and publishing readiness.
              </p>
              <ul className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
                <li className="flex items-center gap-2.5"><PanelsTopLeft size={16} className="text-muted-foreground" /> Desktop and mobile preview</li>
                <li className="flex items-center gap-2.5"><LayoutTemplate size={16} className="text-muted-foreground" /> Active theme and saved drafts</li>
                <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-muted-foreground" /> Verified publish state</li>
              </ul>
              <button type="button" onClick={onOpenHelp} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted">
                <CircleHelp size={16} /> Website setup guide <ArrowRight size={14} />
              </button>
            </aside>
          </div>
          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        </div>
      </section>
    );
  }

  const overlayStyle = {
    backgroundColor: validColor(tokens.canvas) || 'var(--color-background)',
    color: validColor(tokens.ink) || 'var(--color-foreground)',
  };
  return <div className="relative h-full min-h-0 overflow-hidden" data-studio-product="commerce-online-store" data-site={site.slug}>
    {loading && <div data-cms-loading-theme={tokens.canvas ? 'installed' : 'neutral'} role="status"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 transition-colors" style={overlayStyle}>
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
      <p className="text-sm font-medium">Loading {site.name} theme and storefront…</p>
      <p className="text-xs opacity-60">Verifying installed theme, page templates, and live preview</p>
    </div>}
    {error && <p role="alert" className="absolute left-4 right-4 top-4 z-20 rounded-md border border-destructive/30 bg-background p-3 text-sm text-destructive">{error}</p>}
    {!adapter && <p role="alert" className="p-6 text-sm text-destructive">No authorized CMS adapter is available for this site.</p>}
    <iframe ref={frame} title={site.name + ' — Online Store'} className="h-full w-full border-0" />
  </div>;
}
