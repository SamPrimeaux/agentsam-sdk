import { useEffect, useMemo, useRef, useState } from 'react';
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
}: {
  site: MerchantSite;
  adapter: EditorAdapter | null;
  onEdit: (pageSlug: string) => void;
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

  // Some historical projects have content records but no deployed renderer.
  // A project record must never impersonate an active website/theme.
  if (site.source !== 'worker') {
    return <section data-cms-site-installation="unlinked" className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 px-6 py-12 text-foreground">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Content project · Theme not installed</p>
      <h1 className="text-2xl font-semibold">{site.name}</h1>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        This project contains CMS content, but has no verified storefront renderer, installed theme, or publication binding.
        Its project domain cannot be used as a website preview. You can edit the structured content, but those changes
        do not represent the published website until its theme and templates are installed.
      </p>
      <div><button type="button" className="rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium hover:bg-accent"
        onClick={async () => {
          try {
            const pages = await adapter?.listPages();
            if (pages?.length) onEdit(pages.find(p => p.slug === 'home')?.slug || pages[0].slug);
            else setError('No editable content pages are registered for this project.');
          } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        }}>Edit structured content</button></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>;
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
