import { useEffect, useRef, useState } from 'react';
// @ts-ignore JavaScript surface and bridge are public ecommerce CMS exports.
import { mountThemeEditor } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/mount';
// @ts-ignore
import { createThemeEditorBridge } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/bridge';

export function ThemeEditorFrame({ adapter, page, onPageSettings }: { adapter: any; page?: string; onPageSettings?: (slug: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    let disposed = false;
    const boot = async () => {
      if (disposed || !iframe.contentDocument) return;
      const scope = iframe.closest('.agentsam-shell') || iframe;
      const computed = getComputedStyle(scope);
      for (const token of ['--color-background', '--color-card', '--color-border', '--color-foreground', '--color-muted', '--color-muted-foreground', '--color-accent', '--font-sans']) {
        iframe.contentDocument.documentElement.style.setProperty(token, computed.getPropertyValue(token));
      }
      try {
        const pages = await adapter.listPages();
        if (disposed) return;
        const initial =
          pages.find((p: any) => p.slug === page || p.id === page)?.slug ||
          pages.find((p: any) => p.slug === 'home')?.slug ||
          pages[0]?.slug;
        if (!initial) throw new Error('This site has no pages to edit');
        await mountThemeEditor(iframe, { adapter: createThemeEditorBridge(adapter), page: initial, onPageSettings });
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : String(error)); }
    };
    iframe.addEventListener('load', boot);
    iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/theme-editor/editor.css"></head><body></body></html>';
    const observer = new MutationObserver(() => {
      const computed = getComputedStyle(iframe.closest('.agentsam-shell') || iframe);
      for (const token of ['--color-background', '--color-card', '--color-border', '--color-foreground', '--color-muted', '--color-muted-foreground', '--color-accent']) iframe.contentDocument?.documentElement.style.setProperty(token, computed.getPropertyValue(token));
    });
    const scope = iframe.closest('.as-nav-scope');
    if (scope) observer.observe(scope, { attributes: true });
    return () => { disposed = true; observer.disconnect(); iframe.removeEventListener('load', boot); };
  }, [adapter, page, onPageSettings]);
  return <div className="relative size-full min-h-0" data-theme-editor-surface="fnf">
    {error && <p role="alert" className="p-4 text-destructive">{error}</p>}
    <iframe ref={frame} title="Theme Editor" className="size-full border-0" />
  </div>;
}
