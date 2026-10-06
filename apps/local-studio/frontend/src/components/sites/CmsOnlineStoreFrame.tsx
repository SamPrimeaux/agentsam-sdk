import { useEffect, useMemo, useRef, useState } from 'react';
// The merchant Store is packaged with ecommerce-cms-agentsam, not an
// independently reimagined Local Studio screen.
// @ts-ignore Public portable JS package entry.
import { mountOnlineStore } from '@inneranimalmedia/ecommerce-cms-agentsam/store/mount';

interface MerchantSite {
  slug: string;
  name: string;
  domain?: string | null;
  source: 'shared-d1' | 'worker';
  can_edit: boolean;
}

function publishedStoreUrl(domain?: string | null): string | null {
  if (!domain) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(domain) ? domain : 'https://' + domain);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) return null;
    if (url.username || url.password) return null;
    return url.origin + '/';
  } catch {
    return null;
  }
}

export function CmsOnlineStoreFrame({
  site,
  adapter,
  onEdit,
}: {
  site: MerchantSite;
  adapter: { listPages: () => Promise<{ slug: string; id?: string; title?: string }[]> } | null;
  onEdit: (pageSlug: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState('');
  const storefrontUrl = useMemo(() => publishedStoreUrl(site.domain), [site.domain]);
  useEffect(() => {
    const iframe = frame.current;
    if (!iframe || !adapter) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    const boot = async () => {
      if (disposed || !iframe.contentDocument) return;
      setError('');
      try {
        dispose = await mountOnlineStore(iframe, {
          baseUrl: window.location.origin,
          storefrontUrl,
          async loadStore() {
            // The actual authorized CMS is the authority for which pages exist.
            // Do not silently create demo home/shop pages or pretend a theme is live.
            const pages = await adapter.listPages();
            if (!Array.isArray(pages) || !pages.length) throw new Error('No registered CMS pages were returned for this site');
            return {
              store: { visibility: 'unknown' },
              performance: {},
              active_theme: {
                name: 'Theme details unavailable',
                verified: false,
                last_saved: null,
                preview_href: storefrontUrl,
                edit_href: '/admin/theme-editor?slug=' +
                  encodeURIComponent(pages.find((page) => page.slug === 'home')?.slug || pages[0].slug),
              },
              draft_themes: [],
            };
          },
          async onEdit(requestedSlug: string) {
            const pages = await adapter.listPages();
            const page = pages.find(({ slug }) => slug === requestedSlug) ||
              pages.find(({ slug }) => slug === 'home') || pages[0];
            if (page) onEdit(page.slug);
          },
        });
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    iframe.addEventListener('load', boot);
    iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>';
    return () => {
      disposed = true;
      dispose?.();
      iframe.removeEventListener('load', boot);
    };
  }, [site.slug, storefrontUrl, adapter, onEdit]);
  return <div className="relative h-full min-h-0 overflow-hidden" data-studio-product="commerce-online-store" data-site={site.slug}>
    {error && <p role="alert" className="absolute left-4 right-4 top-4 z-10 rounded-md border border-destructive/30 bg-background p-3 text-sm text-destructive">{error}</p>}
    {!adapter && <p role="alert" className="p-6 text-sm text-destructive">No authorized CMS adapter is available for this site.</p>}
    <iframe ref={frame} title={site.name + ' — Online Store'} className="h-full w-full border-0" />
  </div>;
}
