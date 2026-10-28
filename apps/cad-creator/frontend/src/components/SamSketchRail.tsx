import {useState} from 'react';
import type {ActiveTool} from '@inneranimalmedia/agentsam-cad-shared';
import {PenTool, ChevronsLeft, ChevronsRight} from 'lucide-react';
import {KIT, GROUP_ORDER, chooseKitTool, isKitActive, viewerSafe} from './sketch-kit-catalog';
import {useKit} from '../lib/sketch-kit-store';

/** SamSketch: the draftsman's tool rail for the 2D drawing surface. Every tool arms and shows its options. */
export function SamSketchRail({tool, onTool, readOnly, onPlace}: {tool: ActiveTool; onTool(t: ActiveTool): void; readOnly: boolean; onPlace(): void}) {
  const [compact, setCompact] = useState(false);
  const kit = useKit();
  const groups = GROUP_ORDER.filter(g => g === 'Navigate' || g === 'Draw' || g === 'Annotate');
  return <aside className={`cad-sketch-rail${compact ? ' compact' : ''}`} aria-label="SamSketch drafting tools">
    <header className="cad-sketch-brand"><PenTool size={14}/>{!compact && <span><strong>SamSketch</strong><small>2D draft</small></span>}
      <button type="button" aria-label={compact ? 'Expand tool rail' : 'Collapse tool rail'} title={compact ? 'Expand' : 'Collapse'} onClick={() => setCompact(v => !v)}>
        {compact ? <ChevronsRight size={14}/> : <ChevronsLeft size={14}/>}</button></header>
    {groups.map(g => <section key={g} className="cad-sketch-group" aria-label={g}>
      {!compact && <h5>{g}</h5>}
      <div className="cad-sketch-grid">
        {KIT.filter(t => t.group === g && Boolean(t.live || t.place)).map(t => {
          const blocked = readOnly && !viewerSafe(t);
          const title = `${t.label}${t.key ? ` (${t.key})` : ''}${t.live || t.place ? '' : ' · preview'}`;
          return <button key={t.id} type="button" title={title} aria-label={title} aria-pressed={isKitActive(t, tool, kit.tool)} disabled={blocked}
            className={`cad-sketch-tool${t.live || t.place ? ' live' : ''}`} onClick={() => chooseKitTool(t, onTool, onPlace)}>
            <t.icon size={17}/>{!compact && <span>{t.label}</span>}</button>;
        })}
      </div>
    </section>)}
  </aside>;
}
