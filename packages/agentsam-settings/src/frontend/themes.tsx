import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Archive, Check, Copy, Download, Expand, Paintbrush, Plus, RotateCcw, Search, Upload, X,
} from 'lucide-react';
import type { SettingsHost, SettingsTheme, SettingsThemeStyle } from '../contracts';

type GalleryFilter = 'all' | 'mine' | 'archived';
type ThemeEditorDraft = {
  id?: string;
  sourceThemeId?: string;
  name: string;
  themeFamily: string;
  cssVars: Record<string, string>;
};
type TokenField = { key: string; label: string };
const TOKEN_FIELDS: TokenField[] = [
  { key: '--bg-canvas', label: 'Canvas' },
  { key: '--bg-surface', label: 'Surface' },
  { key: '--bg-panel', label: 'Panel' },
  { key: '--bg-nav', label: 'Navigation' },
  { key: '--bg-shell', label: 'Shell' },
  { key: '--color-primary', label: 'Primary' },
  { key: '--accent', label: 'Accent' },
  { key: '--text-main', label: 'Main text' },
  { key: '--text-muted', label: 'Muted text' },
  { key: '--border', label: 'Border' },
];
const DEFAULT_VARS: Record<string, string> = {
  '--bg-canvas': '#0f172a', '--bg-surface': '#1e293b', '--bg-panel': '#273449',
  '--bg-nav': '#111827', '--bg-shell': '#0b1220', '--color-primary': '#3b82f6',
  '--accent': '#60a5fa', '--text-main': '#e2e8f0', '--text-muted': '#94a3b8',
  '--border': '#334155',
};
const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40';
const primaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

function colorInputValue(value: string | undefined, fallback: string) {
  const raw = value || fallback;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) return '#' + raw.slice(1).split('').map(part => part + part).join('');
  return fallback;
}
function themeCss(theme: SettingsTheme) {
  return theme.cssVars && Object.keys(theme.cssVars).length ? theme.cssVars : DEFAULT_VARS;
}
function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    theme_in_use_select_another_theme_first: 'This theme is active. Apply another theme before archiving it.',
    theme_in_use_by_site: 'This theme is still assigned to a site and cannot be archived yet.',
    theme_not_found_or_not_owned: 'This theme is no longer available to your account. Refresh and try again.',
    theme_source_not_found: 'The source preset is no longer available. Refresh the library and try again.',
    account_not_found: 'Your signed-in account could not be resolved for this database.',
    theme_store_unavailable: 'The theme database could not complete that change. No other account was modified.',
    origin_not_allowed: 'This request was blocked because its origin could not be verified.',
  };
  return messages[code] || code.replaceAll('_', ' ');
}

function ThemePreview({ theme }: { theme: SettingsTheme }) {
  const vars = themeCss(theme);
  const pick = (key: string, fallback: string) => vars[key] || fallback;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  if (theme.previewImageUrl && failedImage !== theme.previewImageUrl) {
    return <img src={theme.previewImageUrl} alt={theme.name + ' preview'} className="h-full w-full object-cover" loading="lazy"
      onError={() => setFailedImage(theme.previewImageUrl || null)} />;
  }
  if (!theme.previewImageUrl && theme.previewUrl) {
    return <iframe title={theme.name + ' preview'} src={theme.previewUrl} sandbox="" tabIndex={-1} loading="lazy"
      className="pointer-events-none h-[300%] w-[300%] origin-top-left scale-[.333333] border-0" />;
  }
  return (
    <div role="img" aria-label={theme.name + ' interface color preview'} className="h-full w-full overflow-hidden bg-[var(--settings-preview-canvas)] p-3 text-[var(--settings-preview-text)]" style={{
      '--settings-preview-canvas': pick('--bg-canvas', '#0f172a'),
      '--settings-preview-text': pick('--text-main', '#e2e8f0'),
      '--settings-preview-nav': pick('--bg-nav', '#111827'),
      '--settings-preview-shell': pick('--bg-shell', '#0b1220'),
      '--settings-preview-surface': pick('--bg-surface', '#1e293b'),
      '--settings-preview-muted': pick('--text-muted', '#94a3b8'),
      '--settings-preview-primary': pick('--color-primary', '#3b82f6'),
      '--settings-preview-border': pick('--border', '#334155'),
    } as CSSProperties}>
      <div aria-hidden="true" className="flex h-6 items-center justify-between rounded-t-md border-b border-[var(--settings-preview-border)] bg-[var(--settings-preview-nav)] px-2 text-[9px]">
        <span className="font-semibold tracking-wide">STUDIO</span><span>•••</span>
      </div>
      <div aria-hidden="true" className="flex h-[calc(100%-24px)] gap-2 rounded-b-md bg-[var(--settings-preview-shell)] p-2">
        <div className="w-[24%] space-y-2 rounded bg-[var(--settings-preview-nav)] p-2">
          <div className="h-1.5 w-4/5 rounded bg-[var(--settings-preview-muted)]" />
          <div className="h-1.5 w-3/5 rounded bg-[var(--settings-preview-muted)]" />
          <div className="h-1.5 w-4/5 rounded bg-[var(--settings-preview-primary)]" />
        </div>
        <div className="flex-1 rounded border border-[var(--settings-preview-border)] bg-[var(--settings-preview-surface)] p-2">
          <div className="mb-2 h-2 w-2/5 rounded bg-[var(--settings-preview-text)]" />
          <div className="mb-3 h-1.5 w-3/4 rounded bg-[var(--settings-preview-muted)]" />
          <div className="h-5 w-1/3 rounded bg-[var(--settings-preview-primary)]" />
        </div>
      </div>
    </div>
  );
}

/** Management UX only. Theme inventory and mutations belong to the authenticated host. */
export function SettingsThemeGallery({
  themes, host, onChanged = () => {},
}: {
  themes: SettingsTheme[];
  host: SettingsHost;
  onChanged?: () => void | Promise<void>;
}) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<ThemeEditorDraft | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [newTokenKey, setNewTokenKey] = useState('--');
  const [newTokenValue, setNewTokenValue] = useState('#ffffff');
  const file = useRef<HTMLInputElement>(null);

  const availableCount = themes.filter(theme => theme.status !== 'archived').length;
  const ownCount = themes.filter(theme => theme.source === 'account-custom' && theme.status !== 'archived').length;
  const archivedCount = themes.filter(theme => theme.source === 'account-custom' && theme.status === 'archived').length;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return themes.filter(theme => {
      if (filter === 'mine' && (theme.source !== 'account-custom' || theme.status === 'archived')) return false;
      if (filter === 'archived' && (theme.source !== 'account-custom' || theme.status !== 'archived')) return false;
      if (filter !== 'archived' && theme.status === 'archived') return false;
      if (!needle) return true;
      return [theme.name, theme.slug, theme.category, theme.packageName, theme.status]
        .some(value => String(value || '').toLowerCase().includes(needle));
    });
  }, [themes, query, filter]);

  const run = async (id: string, action: () => unknown | Promise<unknown>, success?: string) => {
    setBusy(id); setError(''); setNotice('');
    try {
      await action();
      await onChanged();
      if (success) setNotice(success);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally { setBusy(null); }
  };

  const openCustomize = (theme?: SettingsTheme) => {
    setError(''); setNotice('');
    if (!theme) {
      setEditor({ name: 'My theme', themeFamily: 'custom', cssVars: { ...DEFAULT_VARS } });
      return;
    }
    const own = theme.source === 'account-custom' && theme.accountOwned !== false;
    setEditor({
      ...(own ? { id: theme.id } : { sourceThemeId: theme.id }),
      name: own ? theme.name : theme.name + ' Custom',
      themeFamily: theme.themeFamily || theme.category || 'custom',
      cssVars: { ...DEFAULT_VARS, ...themeCss(theme) },
    });
  };

  const saveEditor = async (applyAfterSave: boolean) => {
    if (!editor || !editor.name.trim()) return;
    const style: SettingsThemeStyle = {
      name: editor.name.trim(),
      themeFamily: editor.themeFamily,
      cssVars: editor.cssVars,
    };
    setBusy('save'); setError(''); setNotice('');
    try {
      let saved: SettingsTheme | void;
      if (editor.id) {
        if (!host.updateTheme) throw new Error('theme_update_not_supported');
        saved = await host.updateTheme(editor.id, style);
      } else if (editor.sourceThemeId) {
        if (!host.duplicateTheme) throw new Error('theme_customization_not_supported');
        saved = await host.duplicateTheme(editor.sourceThemeId, editor.name.trim(), style);
      } else {
        if (!host.createTheme) throw new Error('theme_creation_not_supported');
        saved = await host.createTheme(editor.name.trim(), style);
      }
      const savedId = (saved as SettingsTheme | undefined)?.id || editor.id || editor.sourceThemeId;
      if (applyAfterSave && savedId) {
        if (!host.applyTheme) throw new Error('theme_apply_not_supported');
        await host.applyTheme(savedId);
      }
      setEditor(null);
      await onChanged();
      setNotice(applyAfterSave ? 'Theme saved and applied to your account.' : 'Private theme saved.');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally { setBusy(null); }
  };

  const buttonForApply = (theme: SettingsTheme) => {
    if (theme.source === 'catalog' || theme.source === 'account-custom') {
      return host.applyTheme ? () => host.applyTheme?.(theme.id) : undefined;
    }
    return host.activateTheme ? () => host.activateTheme?.(theme.id) : undefined;
  };

  const addToken = () => {
    if (!editor) return;
    const key = newTokenKey.trim();
    if (!/^--[a-zA-Z0-9_-]{1,78}$/.test(key) || editor.cssVars[key] !== undefined || !newTokenValue.trim()) {
      setError('Use a unique CSS variable name such as --brand-accent and provide a value.');
      return;
    }
    setEditor({ ...editor, cssVars: { ...editor.cssVars, [key]: newTokenValue.trim() } });
    setNewTokenKey('--'); setNewTokenValue('#ffffff'); setError('');
  };

  const knownKeys = new Set(TOKEN_FIELDS.map(field => field.key));
  const extraTokens = editor ? Object.entries(editor.cssVars).filter(([key]) => !knownKeys.has(key)) : [];

  return <section className="space-y-5" data-settings-theme-gallery="">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Appearance</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Theme Studio</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Browse shared presets, preview the available styles, and save private account-owned custom themes. Shared presets are never edited in place.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {host.importTheme && <button className={button} onClick={() => file.current?.click()} disabled={busy !== null}><Upload size={15} />Import project</button>}
        {host.createTheme && <button className={primaryButton} onClick={() => openCustomize()} disabled={busy !== null}><Plus size={15} />Create theme</button>}
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={event => {
          const selected = event.target.files?.[0];
          if (selected) void run('import', async () => host.importTheme?.(JSON.parse(await selected.text())), 'Theme project imported.');
          event.target.value = '';
        }} />
      </div>
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Available themes</p><p className="mt-1 text-2xl font-semibold tabular-nums">{availableCount}</p><p className="mt-1 text-xs text-muted-foreground">Shared presets + saved themes</p></div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">My themes</p><p className="mt-1 text-2xl font-semibold tabular-nums">{ownCount}</p><p className="mt-1 text-xs text-muted-foreground">Private to your account</p></div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Archived</p><p className="mt-1 text-2xl font-semibold tabular-nums">{archivedCount}</p><p className="mt-1 text-xs text-muted-foreground">Recoverable, not hard-deleted</p></div>
    </div>

    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <label className="relative block min-w-0 flex-1">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search themes by name, family, or slug…" className="min-h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Theme filters">
        {([
          ['all', `All available · ${availableCount}`],
          ['mine', `My themes · ${ownCount}`],
          ['archived', `Archived · ${archivedCount}`],
        ] as [GalleryFilter, string][]).map(([key, label]) => (
          <button key={key} type="button" className={filter === key ? primaryButton : button} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
    </div>

    {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">{notice}</p>}
    {!filtered.length && <div className="rounded-xl border border-dashed border-border p-10 text-center"><p className="font-medium">No themes match this view</p><p className="mt-1 text-sm text-muted-foreground">Try another filter or create a theme of your own.</p></div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map(theme => {
        const isCustom = theme.source === 'account-custom' && theme.accountOwned !== false;
        const isArchived = theme.status === 'archived';
        const canApply = Boolean(buttonForApply(theme));
        return <article key={theme.id} className="overflow-hidden rounded-xl border border-border bg-card" data-theme-id={theme.id}>
          <div className="relative h-44 overflow-hidden border-b border-border bg-muted">
            <ThemePreview theme={theme} />
            <div className="absolute bottom-3 left-3 flex gap-1.5">
              {theme.swatches.slice(0, 7).map((swatch, index) => <span key={swatch + index} className="size-4 rounded-full border border-white/40 bg-[var(--settings-theme-swatch)] shadow-sm" style={{ '--settings-theme-swatch': swatch } as CSSProperties} title={swatch} />)}
            </div>
            {theme.active && <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Active</span>}
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="truncate font-semibold">{theme.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{theme.category} · {theme.version || theme.source || 'Theme'}</p></div>
              <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{isCustom ? 'Private' : theme.source === 'catalog' ? 'Shared' : 'Package'}</span>
            </div>
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={theme.slug || theme.packageName}>{theme.slug || theme.packageName}</p>
            <p className="text-xs text-muted-foreground">{isArchived ? 'Archived · can be restored' : theme.status || theme.source}</p>
            <div className="flex flex-wrap gap-2">
              {theme.previewUrl && <a className={button} href={theme.previewUrl} target="_blank" rel="noopener noreferrer" aria-label={'Explore ' + theme.name + ' preview in a new tab'}><Expand size={14} />Preview</a>}
              {(theme.source === 'catalog' || isCustom) && !isArchived && <button type="button" className={primaryButton} disabled={busy !== null} onClick={() => openCustomize(theme)}><Paintbrush size={14} />Customize</button>}
              {canApply && !isArchived && <button type="button" className={button} disabled={busy !== null || theme.active} onClick={() => void run(theme.id, buttonForApply(theme)!, 'Theme applied to your account.')}><Check size={14} />{theme.active ? 'Active' : 'Apply'}</button>}
              {isCustom && !isArchived && <button type="button" className={button} disabled={busy !== null} onClick={() => {
                if (window.confirm('Archive "' + theme.name + '"? It will remain recoverable. Active or site-assigned themes cannot be archived.')) {
                  void run(theme.id, () => host.archiveTheme?.(theme.id), 'Theme archived.');
                }
              }}><Archive size={14} />Archive</button>}
              {isCustom && isArchived && <button type="button" className={button} disabled={busy !== null} onClick={() => void run(theme.id, () => host.restoreTheme?.(theme.id), 'Theme restored.')}><RotateCcw size={14} />Restore</button>}
              {host.installTheme && ['bundled', 'installed', 'workspace'].includes(theme.source || '') && theme.capabilities?.editable && <button type="button" className={button} disabled={busy !== null} onClick={() => void run(theme.id, () => host.installTheme?.(theme.id), 'Editable draft opened.')}><Plus size={14} />{theme.draftId ? 'Open draft' : 'Install & edit'}</button>}
              {host.editTheme && theme.source === 'cms-draft' && theme.capabilities?.editable && <button type="button" className={button} disabled={busy !== null} onClick={() => void run(theme.id, () => host.editTheme?.(theme.id))}><Paintbrush size={14} />Edit draft</button>}
              {host.exportTheme && ['cms-draft', 'local', 'imported'].includes(theme.source || '') && <button type="button" className={button} disabled={busy !== null} onClick={() => void run(theme.id, () => host.exportTheme?.(theme.id))}><Download size={14} />Export</button>}
            </div>
          </div>
        </article>;
      })}
    </div>

    {editor && <div className="fixed inset-0 z-[100] flex justify-end bg-black/45" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close theme customization" onClick={() => setEditor(null)}><span className="sr-only">Close theme customization</span></button>
      <aside role="dialog" aria-modal="true" aria-labelledby="theme-editor-title" className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-border bg-background text-foreground shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{editor.id ? 'Private theme' : editor.sourceThemeId ? 'Create private copy' : 'New theme'}</p><h3 id="theme-editor-title" className="mt-1 text-lg font-semibold">Customize theme</h3><p className="mt-1 text-xs text-muted-foreground">Changes are isolated to your account. Shared presets are never edited in place.</p></div>
          <button type="button" className={button} aria-label="Close customization" onClick={() => setEditor(null)}><X size={16} aria-hidden="true" />Close</button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <label className="block text-sm font-medium">Theme name<input value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} maxLength={100} required className="mt-2 min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          <label className="block text-sm font-medium">Theme family<select value={editor.themeFamily} onChange={event => setEditor({ ...editor, themeFamily: event.target.value })} className="mt-2 min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="custom">Custom</option><option value="dark">Dark</option><option value="light">Light</option><option value="brand">Brand</option><option value="dashboard">Dashboard</option><option value="editor">Editor</option></select></label>
          <div><div className="mb-3"><h4 className="text-sm font-semibold">Core style tokens</h4><p className="mt-1 text-xs text-muted-foreground">Tune the core surfaces, accents, text and borders.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TOKEN_FIELDS.map(field => <label key={field.key} className="block rounded-lg border border-border p-3 text-xs font-medium">
                <span>{field.label}</span><span className="mt-2 flex items-center gap-2"><input type="color" aria-label={field.label + ' color picker'} value={colorInputValue(editor.cssVars[field.key], DEFAULT_VARS[field.key])} onChange={event => setEditor({ ...editor, cssVars: { ...editor.cssVars, [field.key]: event.target.value } })} className="size-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5" /><input aria-label={field.key} value={editor.cssVars[field.key] || DEFAULT_VARS[field.key]} onChange={event => setEditor({ ...editor, cssVars: { ...editor.cssVars, [field.key]: event.target.value } })} className="min-w-0 w-full rounded border border-border bg-background px-2 py-2 font-mono text-[11px]" /></span>
              </label>)}
            </div>
          </div>
          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Advanced CSS variables <span className="ml-1 text-xs font-normal text-muted-foreground">({extraTokens.length})</span></summary>
            <div className="space-y-3 border-t border-border p-4">
              {extraTokens.map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                <code className="truncate text-[10px] text-muted-foreground" title={key}>{key}</code><input aria-label={key + ' value'} value={value} onChange={event => setEditor({ ...editor, cssVars: { ...editor.cssVars, [key]: event.target.value } })} className="min-w-0 rounded border border-border bg-background px-2 py-2 font-mono text-[11px]" /><button type="button" className={button} aria-label={'Remove ' + key} onClick={() => { const next = { ...editor.cssVars }; delete next[key]; setEditor({ ...editor, cssVars: next }); }}><X size={13} aria-hidden="true" />Remove</button>
              </div>)}
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input aria-label="New CSS variable name" value={newTokenKey} onChange={event => setNewTokenKey(event.target.value)} placeholder="--brand-accent" className="min-w-0 rounded border border-border bg-background px-2 py-2 font-mono text-[11px]" />
                <input aria-label="New CSS variable value" value={newTokenValue} onChange={event => setNewTokenValue(event.target.value)} placeholder="#ffffff" className="min-w-0 rounded border border-border bg-background px-2 py-2 font-mono text-[11px]" />
                <button type="button" className={button} onClick={addToken}><Plus size={13} />Add</button>
              </div>
            </div>
          </details>
          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-4">
          <button type="button" className={button} disabled={busy !== null} onClick={() => setEditor(null)}>Cancel</button>
          <button type="button" className={button} disabled={busy !== null || !editor.name.trim()} onClick={() => void saveEditor(false)}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          <button type="button" className={primaryButton} disabled={busy !== null || !editor.name.trim()} onClick={() => void saveEditor(true)}>{busy === 'save' ? 'Saving…' : <><Check size={14} />Save & apply</>}</button>
        </footer>
      </aside>
    </div>}
  </section>;
}
