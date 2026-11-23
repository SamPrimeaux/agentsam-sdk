import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { categoryLabel, useQuickAddCatalog, QuickAddPreview } from './quick-add';
import type { QuickAddItem } from './quick-add/types';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { loadStudioProjectTemplate } from '../lib/studio-template-source';

interface Props {
  onClose: () => void;
  canLoad: boolean;
  onApply: (project: ProjectState) => void;
}

export function TemplateDrawer({ onClose, canLoad, onApply }: Props) {
  const catalog = useQuickAddCatalog(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templates = useMemo(() => catalog.items.filter(item => item.tab === 'templates'), [catalog.items]);
  const categories = useMemo(() => Array.from(new Set(templates.map(item => categoryLabel(item.category)))), [templates]);
  const list = useMemo(() => {
    const q = query.toLowerCase().trim();
    return templates.filter(item => (!category || categoryLabel(item.category) === category)
      && (!q || [item.title, item.description, item.category].some(value => value.toLowerCase().includes(q))));
  }, [templates, category, query]);
  const active = list.find(item => item.id === picked) ?? null;

  const apply = async (item: QuickAddItem) => {
    if (!canLoad || loading) return;
    setLoading(true);
    setError(null);
    try {
      onApply(await loadStudioProjectTemplate(item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The registered template could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  return <aside className="cad-work-pane cad-template-drawer" aria-label="Templates">
    <header className="cad-pane-head"><span>Templates</span>
      <button type="button" aria-label="Back to objects" title="Back to objects" onClick={onClose}><X size={16}/></button></header>
    <label className="cad-tree-search"><Search size={15}/>
      <input aria-label="Search templates" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search registered templates…"/></label>
    <div className="cad-chip-row" role="group" aria-label="Template category">
      <button type="button" aria-pressed={!category} onClick={() => setCategory(null)}>All</button>
      {categories.map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}
    </div>
    {catalog.status === 'loading' && <p className="cad-property-help" role="status">Loading registered studio templates…</p>}
    {catalog.status === 'error' && <p className="cad-property-help" role="alert">{catalog.error || 'The studio catalog is unavailable.'} <button type="button" onClick={catalog.refresh}>Retry</button></p>}
    {error && <p className="cad-property-help" role="alert">{error}</p>}
    <div className="cad-template-grid" role="list">
      {list.map(item => <button key={item.id} type="button" role="listitem" className="cad-template-card" aria-pressed={picked === item.id}
        onClick={() => setPicked(item.id)} onDoubleClick={() => void apply(item)}>
        <span className="cad-template-thumb"><QuickAddPreview item={item}/></span>
        <strong>{item.title}</strong><small>{categoryLabel(item.category)}</small>
      </button>)}
      {catalog.status === 'ready' && list.length === 0 && <p className="cad-property-help">No registered templates match.</p>}
    </div>
    {active && <footer className="cad-template-detail">
      <strong>{active.title}</strong><p>{active.description}</p>
      <button type="button" className="cad-template-use" disabled={!canLoad || loading} onClick={() => void apply(active)}>
        {!canLoad ? 'Viewers cannot load templates' : loading ? 'Loading template…' : 'Start editing this template'}
      </button>
    </footer>}
  </aside>;
}
