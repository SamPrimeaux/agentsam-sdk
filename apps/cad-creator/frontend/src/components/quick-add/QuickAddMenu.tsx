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
  /** Rows of the flat list. Groups are separated by a hairline, exactly like the reference menu. */
  groups: {label:string; entries:QuickAddEntry[]}[];
  label?: string;
  disabled?: boolean;
  onPickObject: (item: QuickAddItem) => void;
  onPickScene: (item: QuickAddItem) => void;
}

/** "+" menu: Templates first (opens the gallery), then grouped one-line actions with shortcuts. */
export function QuickAddMenu({ groups, label = 'Add', disabled = false, onPickObject, onPickScene }: QuickAddMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [gallery, setGallery] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const catalog = useQuickAddCatalog(gallery);

  React.useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc); };
  }, [open]);

  const row = (e: QuickAddEntry) => (
    <button type="button" role="menuitem" key={e.id} className={e.active ? 'on' : ''} disabled={e.disabled} onClick={() => { setOpen(false); e.run(); }}>
      <span className="qa-row-icon">{e.icon}</span><span className="qa-row-label">{e.label}</span>{e.kbd && <kbd>{e.kbd}</kbd>}
    </button>
  );

  return (
    <div className="qa-root" ref={root}>
      <button type="button" className={`qa-trigger${open ? ' on' : ''}`} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <Plus size={18} /><ChevronDown size={11} className="qa-caret" /><span className="qa-sr">{label}</span>
      </button>
      {open && (
        <div className="qa-pop" role="menu" aria-label={label}>
          {row({ id: 'templates', label: 'Templates', icon: <Blocks size={16} />, run: () => setGallery(true) })}
          {groups.filter(group=>group.entries.length).map(group=><div className="qa-group" role="group" aria-label={group.label} key={group.label}><strong>{group.label}</strong>{group.entries.map(row)}</div>)}
        </div>
      )}
      <TemplatesGallery open={gallery} items={catalog.items} onClose={() => setGallery(false)}
        onPick={(item) => (item.tab === 'scenes' ? onPickScene(item) : onPickObject(item))} />
    </div>
  );
}
