import React from 'react';
import { Blocks, ChevronDown, Plus } from 'lucide-react';
import { TemplatesGallery } from './TemplatesGallery';
import { useQuickAddCatalog } from './useQuickAddCatalog';
import type { QuickAddItem } from './types';

export interface QuickAddEntry {
  id: string;
  label: string;
  icon: React.ReactNode;
  kbd?: string;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

export interface QuickAddMenuProps {
  groups: { label: string; entries: QuickAddEntry[] }[];
  label?: string;
  disabled?: boolean;
  onPickTemplate: (item: QuickAddItem) => void;
  onPickObject: (item: QuickAddItem) => void;
  onPickScene: (item: QuickAddItem) => void;
}

/** One entry point for registered starters, objects, scene assets and modeling commands. */
export function QuickAddMenu({
  groups,
  label = 'Add',
  disabled = false,
  onPickTemplate,
  onPickObject,
  onPickScene,
}: QuickAddMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [gallery, setGallery] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const catalog = useQuickAddCatalog(gallery);

  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setGallery(false);
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const row = (entry: QuickAddEntry) => (
    <button type="button" role="menuitem" key={entry.id}
      className={entry.active ? 'on' : ''} disabled={entry.disabled}
      onClick={() => { setOpen(false); entry.run(); }}>
      <span className="qa-row-icon">{entry.icon}</span>
      <span className="qa-row-label">{entry.label}</span>
      {entry.kbd && <kbd>{entry.kbd}</kbd>}
    </button>
  );

  const pick = (item: QuickAddItem) => {
    setGallery(false);
    if (item.tab === 'templates') onPickTemplate(item);
    else if (item.tab === 'scenes') onPickScene(item);
    else onPickObject(item);
  };

  return (
    <div className="qa-root" ref={root}>
      <button type="button" className={`qa-trigger${open ? ' on' : ''}`}
        aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        disabled={disabled} onClick={() => setOpen((value) => !value)}>
        <Plus size={18} />
        <ChevronDown size={11} className="qa-caret" />
        <span className="qa-sr">{label}</span>
      </button>
      {open && (
        <div className="qa-pop" role="menu" aria-label={label}>
          {row({
            id: 'studio-library',
            label: 'Templates',
            icon: <Blocks size={16} />,
            run: () => { setOpen(false); setGallery(true); },
          })}
          {groups.filter((group) => group.entries.length).map((group) => (
            <div className="qa-group" role="group" aria-label={group.label} key={group.label}>
              <strong>{group.label}</strong>
              {group.entries.map(row)}
            </div>
          ))}
        </div>
      )}
      <TemplatesGallery
        open={gallery}
        items={catalog.items}
        status={catalog.status}
        error={catalog.error}
        onClose={() => setGallery(false)}
        onRetry={catalog.refresh}
        onPick={pick}
      />
    </div>
  );
}
