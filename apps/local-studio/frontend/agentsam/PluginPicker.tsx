import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Plus, Plug, X } from 'lucide-react';
import { loadComposerPlugins, type ComposerPlugin } from './plugins';
import { useWorkStore } from '@/lib/work/store';

/** One registry-backed menu for the + button and inline @ mentions. */
export function PluginPicker({ value, onChange, children }: {
  value: string; onChange: (value: string) => void;
  children: (controls: { trigger: ReactNode; onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void; onSelect: (position: number) => void }) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const [plugins, setPlugins] = useState<ComposerPlugin[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value.length);
  const [active, setActive] = useState(0);
  const [revision, setRevision] = useState(0);
  const match = value.slice(0, cursor).match(/(?:^|\s)@([\w-]*)$/);
  const filtered = plugins.filter((plugin) => !match || `${plugin.label} ${plugin.mention}`.toLowerCase().includes(match[1].toLowerCase()));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    loadComposerPlugins(controller.signal).then(setPlugins).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  function choose(plugin: ComposerPlugin) {
    if (!plugin.ready) { useWorkStore.getState().setSettingsOpen(true); setOpen(false); return; }
    const start = match ? cursor - match[1].length - 1 : value.length;
    const end = match ? cursor : value.length;
    const prefix = value.slice(0, start);
    const next = `${prefix}${prefix && !/\s$/.test(prefix) ? ' ' : ''}${plugin.mention} ${value.slice(end)}`;
    onChange(next); setOpen(false);
    requestAnimationFrame(() => { const input = root.current?.querySelector('textarea'); input?.focus(); input?.setSelectionRange(next.length - value.slice(end).length, next.length - value.slice(end).length); });
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
    if (event.key === 'Enter') { event.preventDefault(); if (filtered[active]) choose(filtered[active]); }
  }
  return <div className="agentsam-plugin-host" ref={root}>
    {children({ trigger: <button type="button" className="as-nav-button" aria-label="Add plugins" aria-expanded={open} aria-controls={id} onClick={() => { setOpen(!open); setActive(0); }}><Plus size={16} /></button>, onKeyDown, onSelect: (position) => { setCursor(position); setActive(0); const input = root.current?.querySelector('textarea'); setOpen(Boolean(input?.value.slice(0, position).match(/(?:^|\s)@([\w-]*)$/))); } })}
    {open && <div className="agentsam-plugin-menu" id={id} role="dialog" aria-label="AgentSam plugins">
      <div className="agentsam-plugin-heading"><strong>Plugins</strong><span>Type @ to find a plugin</span><button type="button" className="as-nav-button" aria-label="Close plugins" onClick={() => setOpen(false)}><X size={16} /></button></div>
      {loading ? <p role="status">Loading your plugins…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRevision((n) => n + 1)}>Retry</button></p> : !filtered.length ? <p>No matching plugins.</p> : filtered.map((plugin, index) => <button type="button" key={plugin.id} className="agentsam-plugin-row" data-active={index === active} onClick={() => choose(plugin)}>
        {plugin.iconUrl ? <span className="agentsam-plugin-icon"><img className="plugin-icon-light" src={plugin.iconUrl} alt="" /><img className="plugin-icon-dark" src={plugin.iconDarkUrl || plugin.iconUrl} alt="" /></span> : <Plug size={20} />}<span><strong>{plugin.label}</strong><small>{plugin.description}</small></span><small>{plugin.ready ? plugin.mention : 'Set up in settings'}</small>
      </button>)}
    </div>}
    {!loading && plugins.length > 0 && <div className="agentsam-plugin-previews" aria-label="Available plugins">{plugins.slice(0, 4).map((plugin) => <button type="button" key={plugin.id} title={`${plugin.label} · ${plugin.status}`} onClick={() => { setOpen(true); setActive(Math.max(0, filtered.findIndex((item) => item.id === plugin.id))); }}><Plug size={13} />{plugin.mention}</button>)}</div>}
  </div>;
}
