import { useRef, useState, useEffect } from 'react';
import { Copy, Download, Expand, Pencil, Plus, Upload, X } from 'lucide-react';
import type { SettingsHost, SettingsTheme } from '../contracts';

/** Management UX only. Theme inventory, persistence, activation and authoring belong to the host. */
export function SettingsThemeGallery({ themes, host, onChanged = () => {} }: { themes: SettingsTheme[]; host: SettingsHost; onChanged?: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<SettingsTheme | null>(null);
  const [author, setAuthor] = useState<SettingsTheme | 'new' | null>(null);
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const naming = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview) dialog.current?.showModal(); else dialog.current?.close(); }, [preview]);
  useEffect(() => { if (author) naming.current?.showModal(); else naming.current?.close(); }, [author]);
  const run = async (id: string, action: () => unknown) => {
    setBusy(id); setError('');
    try { await action(); onChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  };
  const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-40';
  return <section className="space-y-4" data-settings-theme-gallery="">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-medium">Themes</h2><p className="text-sm text-muted-foreground">Reusable themes and your editable drafts.</p></div>
      <div className="flex gap-2">
        {host.importTheme && <button className={button} onClick={() => file.current?.click()} disabled={busy !== null}><Upload size={16} />Import</button>}
        {host.createTheme && <button className={button} onClick={() => { setName(''); setAuthor('new'); }}><Plus size={16} />Create theme</button>}
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void run('import', async () => host.importTheme?.(JSON.parse(await selected.text()))); event.target.value = ''; }} />
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!themes.length && <p className="rounded-xl border border-border p-5 text-muted-foreground">No themes are available from this host.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {themes.map((theme) => <article key={theme.id} className="overflow-hidden rounded-xl border border-border bg-card" data-theme-id={theme.id}>
        <div className="relative h-44 overflow-hidden border-b border-border bg-muted">
          {theme.previewUrl ? <iframe title={`${theme.name} thumbnail`} src={theme.previewUrl} sandbox="" tabIndex={-1} loading="lazy" style={{ width: '300%', height: '300%', transform: 'scale(.333333)', transformOrigin: 'top left', pointerEvents: 'none', border: 0 }} /> : <div className="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">{theme.status || 'No preview supplied'}</div>}
          <div className="absolute bottom-3 left-3 flex gap-1.5">{theme.swatches.map((swatch) => <span key={swatch} className="size-5 rounded-full border border-border" style={{ background: swatch }} title={swatch} />)}</div>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2"><div><h3 className="font-medium">{theme.name}</h3><p className="text-xs text-muted-foreground">{theme.category} · {theme.version || theme.source || 'Theme'}</p></div>{theme.active && <span className="rounded-full bg-muted px-2 py-1 text-xs">Active</span>}</div>
          <p className="truncate font-mono text-xs text-muted-foreground" title={theme.packageName}>{theme.packageName}</p>
          <p className="text-xs text-muted-foreground">{theme.status || theme.source}</p>
          <div className="flex flex-wrap gap-2">
            {theme.previewUrl && <button className={button} onClick={() => setPreview(theme)}><Expand size={14} />Preview</button>}
            {host.activateTheme && theme.capabilities?.editable && <button className={button} disabled={busy !== null || theme.active} onClick={() => void run(theme.id, () => host.activateTheme?.(theme.id))}>Use theme</button>}
            {host.editTheme && theme.capabilities?.editable && <button className={button} disabled={busy !== null} onClick={() => void run(theme.id, () => host.editTheme?.(theme.id))}><Pencil size={14} />Edit</button>}
            {host.duplicateTheme && theme.capabilities?.duplicable && <button className={button} disabled={busy !== null} onClick={() => { setName(theme.name + ' revision'); setAuthor(theme); }}><Copy size={14} />Revise</button>}
            {host.exportTheme && theme.source === 'local' && <button className={button} onClick={() => void run(theme.id, () => host.exportTheme?.(theme.id))}><Download size={14} />Export draft</button>}
          </div>
        </div>
      </article>)}
    </div>
    <dialog ref={dialog} onClose={() => setPreview(null)} className="m-auto w-[min(1200px,94vw)] rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/60">
      <div className="flex items-center justify-between border-b border-border p-3"><h3>{preview?.name}</h3><button className={button} aria-label="Close preview" onClick={() => setPreview(null)}><X size={18} /></button></div>
      {preview && <iframe title={`${preview.name} preview`} src={preview.previewUrl} sandbox="allow-scripts" className="h-[75dvh] w-full border-0" />}
    </dialog>
    <dialog ref={naming} onClose={() => setAuthor(null)} className="m-auto w-[min(440px,94vw)] rounded-xl border border-border bg-card p-5 text-foreground backdrop:bg-black/60">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const source = author; if (!source || !name.trim()) return; void run('author', async () => { if (source === 'new') await host.createTheme?.(name.trim()); else await host.duplicateTheme?.(source.id, name.trim()); setAuthor(null); }); }}>
        <h3 className="font-medium">{author === 'new' ? 'Create theme' : 'Revise theme'}</h3>
        <label className="block text-sm">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
        <div className="flex justify-end gap-2"><button type="button" className={button} onClick={() => setAuthor(null)}>Cancel</button><button className={button} disabled={busy !== null || !name.trim()}>Create draft</button></div>
      </form>
    </dialog>
  </section>;
}
