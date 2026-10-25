import {useEffect} from 'react';
import type {ActiveTool} from '@inneranimalmedia/agentsam-cad-shared';
import {KIT, kitById, kitForLive, type Field} from './sketch-kit-catalog';
import {selectKitTool, setKitOption, useKit, type KitValue} from '../lib/sketch-kit-store';

/** Contextual options + hint for whichever tool is armed. Escape disarms a preview tool. */
export function SamSketchOptionsBar({activeTool}: {activeTool: ActiveTool}) {
  const kit = useKit();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (e.key === 'Escape') selectKitTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const entry = (kit.tool && kitById(kit.tool)) || kitForLive(activeTool) || KIT[0];
  const live = Boolean(entry.live) && !kit.tool;
  const value = (f: Field): KitValue => kit.values[entry.id]?.[f.id] ?? f.value;
  const put = (f: Field, v: KitValue) => setKitOption(entry.id, f.id, v);
  return <div className="cad-optbar" role="toolbar" aria-label={`${entry.label} options`}>
    <span className="cad-optbar-name"><entry.icon size={15}/>{entry.label}</span>
    {entry.fields.map(f => <label key={f.id} className={`cad-opt cad-opt-${f.type}`}>
      <span>{f.label}</span>
      {f.type === 'number' && <><input type="number" aria-label={f.label} value={Number(value(f))} min={f.min} max={f.max} step={f.step}
        onChange={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) put(f, n); }}/>{f.unit && <small>{f.unit}</small>}</>}
      {f.type === 'select' && <select aria-label={f.label} value={String(value(f))} onChange={e => put(f, e.target.value)}>{f.options!.map(o => <option key={o}>{o}</option>)}</select>}
      {f.type === 'toggle' && <input type="checkbox" aria-label={f.label} checked={Boolean(value(f))} onChange={e => put(f, e.target.checked)}/>}
      {f.type === 'seg' && <span className="cad-opt-seg" role="group" aria-label={f.label}>{f.options!.map(o =>
        <button key={o} type="button" aria-pressed={value(f) === o} onClick={() => put(f, o)}>{o}</button>)}</span>}
    </label>)}
    <span className="cad-optbar-hint">{entry.hint}</span>
    <span className={`cad-optbar-pill${live ? ' live' : ''}`} title={live ? 'Drives the live canvas tool; option values are not applied yet' : 'Interface preview: this tool is not wired to geometry yet'}>{live ? 'live tool' : 'preview'}</span>
  </div>;
}
