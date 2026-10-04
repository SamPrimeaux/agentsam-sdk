import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
// @ts-ignore Portable ecommerce CMS authoring module.
import { createThemeProjectAdapter } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project';
import { themeProjectStore } from '@/lib/themes/projects';
import { ThemeEditorFrame } from './ThemeEditorFrame';

export function ThemeProjectEditor({ id, page }: { id: string; page?: string }) {
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<any>(null);
  const [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { let live = true; void themeProjectStore.get(id).then((project) => { if (!live) return; if (!project) setError('Theme draft not found'); else setProject(project); }, (error) => { if (live) setError(error.message); }); return () => { live = false; }; }, [id]);
  const adapter = useMemo(() => project ? createThemeProjectAdapter(project, themeProjectStore, { resolveAssetBase: (base: string) => new URL(base, location.href).href }) : null, [project]);
  const openSettings = useCallback(async (slug: string) => { const latest = await adapter.getProject(); setSettings({ slug, name: latest.name, title: latest.pages.find((p: any) => p.slug === slug)?.title, tokens: latest.tokens || {} }); }, [adapter]);
  useEffect(() => { if (settings) dialog.current?.showModal(); else dialog.current?.close(); }, [settings]);
  if (error) return <p role="alert" className="p-6">{error}</p>;
  if (!adapter) return <p role="status" className="p-6 text-muted-foreground">Loading theme draft…</p>;
  return <><ThemeEditorFrame key={revision} adapter={adapter} page={page} onPageSettings={openSettings} />
    <dialog ref={dialog} onClose={() => setSettings(null)} className="m-auto max-h-[85dvh] w-[min(620px,94vw)] overflow-auto rounded-xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60">
      {settings && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void adapter.updatePageSettings(settings.slug, settings).then(() => { setSettings(null); setRevision((v) => v + 1); }, (error: Error) => setError(error.message)); }}>
        <h2 className="text-lg font-medium">Theme &amp; page settings</h2>
        <label className="block text-sm">Theme name<input required className="mt-2 w-full rounded-lg border border-border bg-background p-2" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} /></label>
        <label className="block text-sm">Page title<input required className="mt-2 w-full rounded-lg border border-border bg-background p-2" value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} /></label>
        <h3 className="font-medium">Theme design tokens</h3>
        <p className="text-xs text-muted-foreground">These values style your theme preview.</p>
        {Object.entries(settings.tokens).map(([key, value]) => <label key={key} className="flex items-center gap-3 text-xs"><span className="w-1/2 break-all">{key}</span>{/^#[0-9a-f]{6}$/i.test(String(value)) && <input type="color" aria-label={`${key} color`} value={String(value)} onChange={(e) => setSettings({ ...settings, tokens: { ...settings.tokens, [key]: e.target.value } })} />}<input aria-label={key} className="min-w-0 flex-1 rounded border border-border bg-background p-2" value={String(value)} onChange={(e) => setSettings({ ...settings, tokens: { ...settings.tokens, [key]: e.target.value } })} /></label>)}
        {!Object.keys(settings.tokens).length && <p className="text-sm text-muted-foreground">This starter has no custom design tokens.</p>}
        <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border border-border px-3 py-2" onClick={() => setSettings(null)}>Cancel</button><button className="rounded-lg bg-foreground px-3 py-2 text-background">Save settings</button></div>
      </form>}
    </dialog>
  </>;
}
