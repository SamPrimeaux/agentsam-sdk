import React, {useMemo, useState} from 'react';
import {Search, X} from 'lucide-react';
import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {TEMPLATE_METADATA_LIST} from '../lib/templates';
import {TemplateSchematic} from './TemplateSchematic';
import {cloneTemplateProject} from './TemplateStarterGrid';

const CATEGORIES = [
  {id: 'all', label: 'All'}, {id: 'architecture', label: 'Residential'}, {id: 'commercial', label: 'Office'},
  {id: 'presentations', label: 'Expo'}, {id: 'brand', label: 'Brand'}, {id: 'social_media', label: 'Social'},
];

/** Left-dock template browser: uniform scrollable previews, select to inspect, one action to start. */
export function TemplateDrawer({onApply, canLoad, onClose}: {onApply(project: ProjectState): void; canLoad: boolean; onClose(): void}) {
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const list = useMemo(() => {
    const q = query.toLowerCase().trim();
    return TEMPLATE_METADATA_LIST.filter(t => (cat === 'all' || t.category === cat)
      && (!q || [t.name, t.description, t.useCase, ...t.tags].some(x => x.toLowerCase().includes(q))));
  }, [cat, query]);
  const active = list.find(t => t.id === picked) ?? null;
  return <aside className="cad-work-pane cad-template-drawer" aria-label="Templates">
    <header className="cad-pane-head"><span>Templates</span>
      <button type="button" aria-label="Back to objects" title="Back to objects" onClick={onClose}><X size={16}/></button></header>
    <label className="cad-tree-search"><Search size={15}/>
      <input aria-label="Search templates" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search templates…"/></label>
    <div className="cad-chip-row" role="group" aria-label="Template category">
      {CATEGORIES.map(c => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
    </div>
    <div className="cad-template-grid" role="list">
      {list.map(t => <button key={t.id} type="button" role="listitem" className="cad-template-card" aria-pressed={picked === t.id}
        onClick={() => setPicked(t.id)} onDoubleClick={() => { if (canLoad) onApply(cloneTemplateProject(t)); }}>
        <span className="cad-template-thumb"><TemplateSchematic project={t.project} className="cad-template-svg"/></span>
        <strong>{t.name}</strong><small>{t.approxSqFt} sq ft · {t.categoryLabel}</small>
      </button>)}
      {list.length === 0 && <p className="cad-property-help">No templates match.</p>}
    </div>
    {active && <footer className="cad-template-detail">
      <strong>{active.name}</strong><p>{active.description}</p>
      <button type="button" className="cad-template-use" disabled={!canLoad} onClick={() => onApply(cloneTemplateProject(active))}>
        {canLoad ? 'Start editing this template' : 'Viewers cannot load templates'}</button>
    </footer>}
  </aside>;
}
