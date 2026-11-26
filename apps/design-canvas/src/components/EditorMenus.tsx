import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3, Check, ChevronDown, Circle, Code2, Copy, Diamond, Download, FileJson,
  Grid3X3, Image, Library, Maximize2, MoreHorizontal, Pin, Play, Plus,
  Pencil, Presentation, Share2, Shapes, Square, Star, StickyNote, Table2, Trash2, Triangle, Type,
  ZoomIn, ZoomOut
} from 'lucide-react';
import type { CreativeObject, CreativeType } from '../creative-model';

export type ShapeKind = NonNullable<CreativeObject['shape']>;

type Close = () => void;
type MenuPopoverProps = {
  label: string;
  trigger: ReactNode;
  children: (close: Close) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
  triggerClassName?: string;
};

export function MenuPopover({ label, trigger, children, align = 'start', className = '', triggerClassName = '' }: MenuPopoverProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return <div ref={rootRef} className={'dcx-menu-anchor ' + className}>
    <button ref={triggerRef} type="button" className={'dcx-menu-trigger ' + triggerClassName} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)}>
      {trigger}
    </button>
    {open ? <div id={menuId} className={'dcx-menu-popover align-' + align} role="menu" aria-label={label} onKeyDown={(event) => {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { close(); triggerRef.current?.focus(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); items[(current + 1 + items.length) % items.length]?.focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); items[(current - 1 + items.length) % items.length]?.focus(); }
      else if (event.key === 'Home') { event.preventDefault(); items[0]?.focus(); }
      else if (event.key === 'End') { event.preventDefault(); items[items.length - 1]?.focus(); }
    }}>
      {children(close)}
    </div> : null}
  </div>;
}

export function MenuAction({ label, icon, detail, onClick, close, destructive = false }: {
  label: string; icon?: ReactNode; detail?: string; onClick: () => void; close: Close; destructive?: boolean;
}) {
  return <button type="button" role="menuitem" className={'dcx-menu-action' + (destructive ? ' is-destructive' : '')} onClick={() => { onClick(); close(); }}>
    {icon ? <span className="dcx-menu-action-icon">{icon}</span> : null}
    <span>{label}</span>
    {detail ? <small>{detail}</small> : null}
  </button>;
}

export function MenuDivider() {
  return <div className="dcx-menu-divider" role="separator"/>;
}

export function DocumentActionsMenu({
  name, pinned, onRename, onDuplicate, onTogglePin, onExport, onDelete, onShare, onSaveToLibrary
}: {
  name: string; pinned?: boolean; onRename: () => void; onDuplicate: () => void; onTogglePin: () => void;
  onExport: () => void; onDelete: () => void; onShare?: () => void; onSaveToLibrary?: () => void;
}) {
  return <MenuPopover label="Document actions" trigger={<MoreHorizontal size={17}/>} align="end" triggerClassName="dcx-menu-icon-trigger">
    {(close) => <>
      <div className="dcx-menu-heading">{name}</div>
      {onShare ? <MenuAction label="Share" icon={<Share2 size={15}/>} onClick={onShare} close={close}/> : null}
      {onSaveToLibrary ? <MenuAction label="Save to library" icon={<Library size={15}/>} onClick={onSaveToLibrary} close={close}/> : null}
      <MenuAction label="Download document backup" detail="AgentSam JSON source" icon={<Download size={15}/>} onClick={onExport} close={close}/>
      <MenuDivider/>
      <MenuAction label={pinned ? 'Unpin' : 'Pin'} icon={<Pin size={15}/>} onClick={onTogglePin} close={close}/>
      <MenuAction label="Rename" icon={<Pencil size={15}/>} onClick={onRename} close={close}/>
      <MenuAction label="Duplicate" icon={<Copy size={15}/>} onClick={onDuplicate} close={close}/>
      <MenuDivider/>
      <MenuAction label="Delete" icon={<Trash2 size={15}/>} onClick={onDelete} close={close} destructive/>
    </>}
  </MenuPopover>;
}




export function CreationMenu({ onCreate, onCreateBrandGuidelines }: { onCreate: (type: CreativeType) => void; onCreateBrandGuidelines?: () => void }) {
  return <MenuPopover label="Create new document" trigger={<><Plus size={15}/><span>New</span><ChevronDown size={13}/></>} triggerClassName="dcx-command-button">
    {(close) => <>
      <MenuAction label="Presentation" detail="Blank slides and speaker notes" icon={<Presentation size={15}/>} onClick={() => onCreate('slides')} close={close}/>
      {onCreateBrandGuidelines ? <MenuAction label="Brand Guidelines" detail="Eight-slide editable identity template" icon={<FileJson size={15}/>} onClick={onCreateBrandGuidelines} close={close}/> : null}
      <MenuAction label="Design" detail="Artboards and visual assets" icon={<Shapes size={15}/>} onClick={() => onCreate('design')} close={close}/>
      <MenuAction label="Create in Code" detail="Open project files, IDE and terminal" icon={<Code2 size={15}/>} onClick={() => onCreate('code')} close={close}/>
      <MenuAction label="Design System" detail="Reusable tokens and components" icon={<Diamond size={15}/>} onClick={() => onCreate('system')} close={close}/>
      <MenuAction label="Whiteboard" detail="Open-ended canvas" icon={<StickyNote size={15}/>} onClick={() => onCreate('whiteboard')} close={close}/>
    </>}
  </MenuPopover>;
}

export function InsertMenu({ onText, onImage, onShape, onChart, onTable }: {
  onText: () => void; onImage: () => void; onShape: (shape: ShapeKind) => void; onChart?: () => void; onTable?: () => void;
}) {
  const shapes: { label: string; kind: ShapeKind; icon: ReactNode }[] = [
    { label: 'Rectangle', kind: 'rect', icon: <Square size={15}/> },
    { label: 'Ellipse', kind: 'circle', icon: <Circle size={15}/> },
    { label: 'Diamond', kind: 'diamond', icon: <Diamond size={15}/> },
    { label: 'Triangle', kind: 'triangle', icon: <Triangle size={15}/> },
    { label: 'Star', kind: 'star', icon: <Star size={15}/> },
    { label: 'Line', kind: 'line', icon: <span className="dcx-menu-line-icon"/> }
  ];
  return <MenuPopover label="Insert" trigger={<><Plus size={15}/><span>Insert</span><ChevronDown size={13}/></>} triggerClassName="dcx-command-button">
    {(close) => <>
      <MenuAction label="Text box" icon={<Type size={15}/>} onClick={onText} close={close}/>
      <MenuAction label="Image" icon={<Image size={15}/>} onClick={onImage} close={close}/>
      <MenuDivider/>
      <div className="dcx-menu-section-label">Shapes</div>
      <div className="dcx-shape-menu-grid">{shapes.map((shape) => <button key={shape.kind} type="button" role="menuitem" title={shape.label} aria-label={shape.label} onClick={() => { onShape(shape.kind); close(); }}>{shape.icon}<span>{shape.label}</span></button>)}</div>
      {onChart ? <><MenuDivider/><MenuAction label="Chart" icon={<BarChart3 size={15}/>} onClick={onChart} close={close}/></> : null}
      {onTable ? <MenuAction label="Table" icon={<Table2 size={15}/>} onClick={onTable} close={close}/> : null}
    </>}
  </MenuPopover>;
}

export function ZoomControls({ zoom, onChange, onFit, grid, onToggleGrid }: {
  zoom: number; onChange: (value: number) => void; onFit: () => void; grid?: boolean; onToggleGrid?: () => void;
}) {
  const levels = [50, 75, 100, 125, 150, 200];
  return <div className="dcx-zoom-controls" role="group" aria-label="Canvas zoom">
    <button type="button" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => onChange(Math.max(50, zoom - 25))}><ZoomOut size={14}/></button>
    <MenuPopover label="Zoom level" trigger={<><span>{zoom}%</span><ChevronDown size={12}/></>} triggerClassName="dcx-zoom-level">
      {(close) => <>
        <MenuAction label="Fit canvas" detail="100%" icon={<Maximize2 size={14}/>} onClick={() => { onFit(); close(); }} close={close}/>
        <MenuDivider/>
        {levels.map((level) => <MenuAction key={level} label={level + '%'} icon={level === zoom ? <Check size={14}/> : <span className="dcx-menu-icon-spacer"/>} onClick={() => onChange(level)} close={close}/>) }
      </>}
    </MenuPopover>
    <button type="button" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 200} onClick={() => onChange(Math.min(200, zoom + 25))}><ZoomIn size={14}/></button>
    <button type="button" className={grid ? 'active' : ''} title={grid ? 'Hide grid' : 'Show grid'} aria-label={grid ? 'Hide grid' : 'Show grid'} aria-pressed={!!grid} onClick={onToggleGrid}><Grid3X3 size={14}/></button>
  </div>;
}

export function ArtboardMenu({ onAdd }: { onAdd: (size: 'landscape' | 'square' | 'portrait') => void }) {
  return <MenuPopover label="Add artboard" trigger={<><Plus size={15}/><span>Artboard</span><ChevronDown size={13}/></>} triggerClassName="dcx-command-button">
    {(close) => <>
      <MenuAction label="Landscape" detail="1200 × 900" icon={<Square size={15}/>} onClick={() => onAdd('landscape')} close={close}/>
      <MenuAction label="Square" detail="1080 × 1080" icon={<Circle size={15}/>} onClick={() => onAdd('square')} close={close}/>
      <MenuAction label="Portrait" detail="900 × 1200" icon={<Presentation size={15}/>} onClick={() => onAdd('portrait')} close={close}/>
    </>}
  </MenuPopover>;
}

export function PresentMenu({ onPresent, onPresentWithNotes }: { onPresent: () => void; onPresentWithNotes: () => void }) {
  return <MenuPopover label="Presentation options" trigger={<><Play size={14}/><span>Present</span><ChevronDown size={12}/></>} triggerClassName="dcx-command-button dcx-present-trigger" align="end">
    {(close) => <>
      <MenuAction label="Present" detail="Full-screen slide show" icon={<Play size={15}/>} onClick={onPresent} close={close}/>
      <MenuAction label="Present with notes" detail="Keep speaker notes visible" icon={<Presentation size={15}/>} onClick={onPresentWithNotes} close={close}/>
    </>}
  </MenuPopover>;
}

export function ArtifactKindLabel({ type }: { type: CreativeType }) {
  return <span className="dcx-artifact-kind-label">{type === 'slides' ? 'Slides' : type === 'system' ? 'Design System' : 'Design'}</span>;
}
