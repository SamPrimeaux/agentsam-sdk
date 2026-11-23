import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { categoryLabel, sectionsFor } from './catalog';
import { QuickAddPreview } from './QuickAddPreview';
import type { QuickAddItem, QuickAddStatus, QuickAddTab } from './types';

const TABS: { id: QuickAddTab; label: string }[] = [
  { id: 'templates', label: 'Templates' },
  { id: 'objects', label: 'Objects' },
  { id: 'scenes', label: 'Scenes' },
];

interface Props {
  open: boolean;
  items: QuickAddItem[];
  status: QuickAddStatus;
  error?: string | null;
  onClose: () => void;
  onRetry?: () => void;
  onPick: (item: QuickAddItem) => void;
}

function actionLabel(item: QuickAddItem): string {
  if (item.kind === 'cad_project_template') return 'Start a copy';
  if (item.kind === 'cad_stock_object') return 'Add to project';
  if (item.kind === 'cad_parametric_template') return 'Create parametric part';
  if (item.kind === 'cad_terrain_preset') return item.specs.apply_mode === 'replace' ? 'Apply site scene' : 'Add scenery';
  if (item.kind === 'model_3d') return 'Open model preview';
  return 'Open';
}

export function TemplatesGallery({ open, items, status, error, onClose, onRetry, onPick }: Props) {
  const [tab, setTab] = useState<QuickAddTab>('templates');
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setCategory(null);
    setQuery('');
  }, [open]);

  const sections = useMemo(() => sectionsFor(items, tab, query), [items, tab, query]);
  const categories = sections.map((section) => section.category);
  const focused = useMemo(() => {
    const all = sections.flatMap((section) => section.items);
    return category ? all.filter((item) => categoryLabel(item.category) === category) : all;
  }, [sections, category]);

  if (!open) return null;

  return (
    <div className="qa-gallery-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="qa-gallery" role="dialog" aria-modal="true" aria-label="Studio templates and assets">
        <header className="qa-header">
          <div className="qa-heading">
            <strong>Studio Library</strong>
            <small>{items.length} registered resources</small>
          </div>
          <nav className="qa-tabs" aria-label="Studio library">
            {TABS.map((entry) => (
              <button key={entry.id} type="button" className={tab === entry.id ? 'on' : ''}
                aria-pressed={tab === entry.id} onClick={() => { setTab(entry.id); setCategory(null); }}>
                {entry.label}
              </button>
            ))}
          </nav>
          <label className="qa-search">
            <Search size={17} aria-hidden="true" />
            <input autoFocus aria-label="Search studio library" value={query}
              onChange={(event) => { setQuery(event.target.value); setCategory(null); }}
              placeholder="Search templates, objects and scenes…" />
          </label>
          <button type="button" className="qa-close" aria-label="Close templates" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="qa-gallery-main">
          <nav className="qa-rail" aria-label="Asset categories">
            <button type="button" className={!category ? 'on' : ''} aria-pressed={!category}
              onClick={() => setCategory(null)}>All</button>
            {categories.map((entry) => (
              <button type="button" key={entry} className={category === entry ? 'on' : ''}
                aria-pressed={category === entry} onClick={() => setCategory(entry)}>{entry}</button>
            ))}
          </nav>

          <div className="qa-gallery-body">
            {status === 'loading' && <p className="qa-state">Loading registered studio resources…</p>}
            {status === 'error' && (
              <div className="qa-state qa-state-error">
                <strong>The studio catalog is unavailable.</strong>
                <p>{error || 'CAD does not have a local fallback catalog. Nothing has been substituted.'}</p>
                {onRetry && <button type="button" onClick={onRetry}>Retry catalog</button>}
              </div>
            )}
            {status === 'empty' && <p className="qa-state">No registered resources are available yet.</p>}
            {status === 'ready' && focused.length === 0 && (
              <p className="qa-state">Nothing matches this category or search.</p>
            )}
            {category && status === 'ready' && (
              <div className="qa-focus-head">
                <button type="button" aria-label="Back to all categories" onClick={() => setCategory(null)}>
                  <ArrowLeft size={16} />
                </button>
                <h3>{category}</h3>
              </div>
            )}
            {status === 'ready' && focused.length > 0 && (
              <div className="qa-grid">
                {focused.map((item) => (
                  <button type="button" key={item.id} className="qa-card" onClick={() => onPick(item)}>
                    <span className="qa-card-thumb"><QuickAddPreview item={item} /></span>
                    <span className="qa-card-body">
                      <span className="qa-card-kicker">{item.pack || categoryLabel(item.category)}</span>
                      <strong className="qa-card-title">{item.title}</strong>
                      {item.description && <span className="qa-card-description">{item.description}</span>}
                      <span className="qa-card-action">{actionLabel(item)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
