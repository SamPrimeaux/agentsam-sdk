import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import { sectionsFor } from './catalog';
import { QuickAddPreview } from './QuickAddPreview';
import type { QuickAddItem, QuickAddTab } from './types';

const TABS: Array<{ id: QuickAddTab; label: string }> = [{ id: 'objects', label: 'Objects' }, { id: 'scenes', label: 'Scenes' }];
const PREVIEW_COUNT = 4;

export interface TemplatesGalleryProps {
  open: boolean;
  items: QuickAddItem[];
  initialTab?: QuickAddTab;
  onClose: () => void;
  onPick: (item: QuickAddItem) => void;
}

/** Templates modal: Objects / Scenes tabs, category rail, search, per-category "View all". */
export function TemplatesGallery({ open, items, initialTab = 'objects', onClose, onPick }: TemplatesGalleryProps) {
  const [tab, setTab] = React.useState<QuickAddTab>(initialTab);
  const [category, setCategory] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const body = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { if (open) { setTab(initialTab); setCategory(null); setQuery(''); } }, [open, initialTab]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  React.useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [tab, category, query]);

  const sections = React.useMemo(() => sectionsFor(items, tab, query), [items, tab, query]);
  const rail = React.useMemo(() => sectionsFor(items, tab).map((s) => s.category), [items, tab]);
  if (!open) return null;

  const searching = query.trim().length > 0;
  const focused = category ? sections.filter((s) => s.category === category) : sections;
  const tile = (item: QuickAddItem) => (
    <button type="button" key={item.id} className="qa-tile" title={item.description || item.title} onClick={() => { onPick(item); onClose(); }}>
      <span className="qa-thumb"><QuickAddPreview item={item} /></span>
      <span className="qa-tile-label">{item.title}</span>
    </button>
  );

  return createPortal(
    <div className="qa-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qa-gallery" role="dialog" aria-modal="true" aria-label="Templates">
        <header className="qa-gallery-head">
          <strong>Templates</strong>
          <div className="qa-tabs" role="tablist">
            {TABS.map((t) => <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''}
              onClick={() => { setTab(t.id); setCategory(null); }}>{t.label}</button>)}
          </div>
          <label className="qa-search"><Search size={15} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search templates" autoFocus />
          </label>
          <button type="button" className="qa-close" aria-label="Close templates" onClick={onClose}><X size={16} /><span className="qa-sr">Close</span></button>
        </header>
        <div className="qa-gallery-main">
          <nav className="qa-rail" aria-label="Categories">
            <button type="button" className={!category ? 'on' : ''} onClick={() => setCategory(null)}>All</button>
            {rail.map((c) => <button type="button" key={c} className={category === c ? 'on' : ''} onClick={() => { setCategory(c); setQuery(''); }}>{c}</button>)}
          </nav>
          <div className="qa-gallery-body" ref={body}>
            {!focused.length && <p className="qa-empty">Nothing matches that search.</p>}
            {category && !searching && (
              <div className="qa-focus-head"><button type="button" aria-label="Back to all categories" onClick={() => setCategory(null)}><ArrowLeft size={15} /><span className="qa-sr">Back</span></button><h3>{category}</h3></div>
            )}
            {focused.map((s) => {
              const showAll = !category && !searching;
              const shown = showAll ? s.items.slice(0, PREVIEW_COUNT) : s.items;
              return (
                <section key={s.category} className="qa-section">
                  {showAll && (
                    <div className="qa-section-head"><h3>{s.category}</h3>
                      {s.items.length > PREVIEW_COUNT && <button type="button" onClick={() => setCategory(s.category)}>View all <ArrowRight size={13} /></button>}
                    </div>
                  )}
                  <div className="qa-grid">{shown.map(tile)}</div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
