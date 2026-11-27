import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3, Check, ChevronDown, Circle, Code2, Copy, Diamond, Download, FileJson,
  Grid3X3, Image, Library, Maximize2, MoreHorizontal, Pin, Play, Plus,
  Pencil, Presentation, Share2, Shapes, Square, Star, StickyNote, Table2, Trash2, Triangle, Type, ArrowRight, ChevronRight, MessageSquare, Folder, RefreshCw, HardDrive, Shield, X, FileText, Sparkles,
  ZoomIn, ZoomOut, Eye, Magnet, Ruler, Hand, MousePointer2, Columns2, List,
} from 'lucide-react';
import type { ChartType, CreativeObject, CreativeType } from '../creative-model';

export type ShapeKind = NonNullable<CreativeObject['shape']>;

type Close = () => void;
export type MenuAvoidRect = { left: number; top: number; right: number; bottom: number };
export const MenuAvoidanceContext = createContext<MenuAvoidRect | null>(null);
type MenuPopoverProps = {
  label: string;
  trigger: ReactNode;
  children: (close: Close) => ReactNode;
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
  className?: string;
  triggerClassName?: string;
  avoidRect?: MenuAvoidRect;
};

export function MenuPopover({ label, trigger, children, align = 'start', side = 'bottom', className = '', triggerClassName = '', avoidRect }: MenuPopoverProps) {
  const inheritedAvoidRect = useContext(MenuAvoidanceContext);
  const effectiveAvoidRect = avoidRect || inheritedAvoidRect;
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{ align: 'start' | 'end'; side: 'top' | 'bottom' | 'left' | 'right' }>({ align, side });
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      if (!triggerRect || !menuRect) return;
      const otherAlign = align === 'start' ? 'end' : 'start';
      const otherSide = side === 'bottom' ? 'top' : 'bottom';
      const candidates: Array<{ align: 'start' | 'end'; side: 'top' | 'bottom' | 'left' | 'right' }> = [
        { align, side },
        { align, side: otherSide },
        { align, side: 'right' },
        { align, side: 'left' },
        { align: otherAlign, side },
        { align: otherAlign, side: otherSide },
        { align: otherAlign, side: 'right' },
        { align: otherAlign, side: 'left' },
      ];
      let best = candidates[0];
      let bestScore = Number.POSITIVE_INFINITY;
      candidates.forEach((candidate, index) => {
        const left = candidate.side === 'left' ? triggerRect.left - menuRect.width - 7 : candidate.side === 'right' ? triggerRect.right + 7 : candidate.align === 'start' ? triggerRect.left : triggerRect.right - menuRect.width;
        const top = candidate.side === 'bottom' ? triggerRect.bottom + 7 : candidate.side === 'top' ? triggerRect.top - menuRect.height - 7 : candidate.align === 'start' ? triggerRect.top : triggerRect.bottom - menuRect.height;
        const overflow = Math.max(0, 8 - left) + Math.max(0, left + menuRect.width - (window.innerWidth - 8)) + Math.max(0, 8 - top) + Math.max(0, top + menuRect.height - (window.innerHeight - 8));
        const avoid = effectiveAvoidRect;
        const overlapWidth = avoid ? Math.max(0, Math.min(left + menuRect.width, avoid.right + 10) - Math.max(left, avoid.left - 10)) : 0;
        const overlapHeight = avoid ? Math.max(0, Math.min(top + menuRect.height, avoid.bottom + 10) - Math.max(top, avoid.top - 10)) : 0;
        const overlapArea = overlapWidth * overlapHeight;
        const score = overflow * 10000 + overlapArea * 10 + index;
        if (score < bestScore) { bestScore = score; best = candidate; }
      });
      setPlacement(best);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, align, side, effectiveAvoidRect?.left, effectiveAvoidRect?.top, effectiveAvoidRect?.right, effectiveAvoidRect?.bottom]);

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
    {open ? <div ref={menuRef} id={menuId} className={'dcx-menu-popover align-' + placement.align + ' side-' + placement.side} role="menu" aria-label={label} onKeyDown={(event) => {
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

export function MenuAction({ label, icon, detail, onClick, close, destructive = false, disabled = false }: {
  label: string; icon?: ReactNode; detail?: string; onClick: () => void; close: Close; destructive?: boolean; disabled?: boolean;
}) {
  return <button type="button" role="menuitem" disabled={disabled} className={'dcx-menu-action' + (destructive ? ' is-destructive' : '')} onClick={() => { onClick(); close(); }}>
    {icon ? <span className="dcx-menu-action-icon">{icon}</span> : null}
    <span>{label}</span>
    {detail ? <small>{detail}</small> : null}
  </button>;
}

export function MenuDivider() {
  return <div className="dcx-menu-divider" role="separator"/>;
}

export function DocumentActionsMenu({ name, pinned, currentType, onRename, onDuplicate, onTogglePin, onExport, onDelete, onSaveToLibrary, onShare, onHandoff, onTurnInto, onMoveTo, onRefresh, onStorage, onPermissions, onFeedback, onClose }: {
  name: string; pinned?: boolean; currentType?: CreativeType; onRename: () => void; onDuplicate: () => void; onTogglePin: () => void; onExport: () => void; onDelete: () => void;
  onSaveToLibrary?: () => void; onShare?: () => void; onHandoff?: () => void; onTurnInto?: (type: CreativeType) => void; onMoveTo?: () => void;
  onRefresh?: () => void; onStorage?: () => void; onPermissions?: () => void; onFeedback?: () => void; onClose?: () => void;
}) {
  return <MenuPopover label="Document menu" trigger={<><span className="dcx-document-title-label">{name}</span><ChevronDown size={13}/></>} triggerClassName="dcx-document-title-trigger">
    {(close) => <>
      <div className="dcx-menu-document-heading">{name}</div>
      <MenuAction label="Share" icon={<Share2 size={15}/>} detail={onShare ? 'Share a private workspace link' : 'Sharing is not connected'} onClick={() => onShare?.()} close={close} disabled={!onShare}/>
      <MenuAction label="Export" icon={<FileText size={15}/>} detail="Download editable AgentSam source" onClick={onExport} close={close}/>
      <MenuAction label="Handoff to AgentSam" icon={<Sparkles size={15}/>} detail={onHandoff ? 'Continue in the shared AgentSam composer' : 'Code handoff is not connected'} onClick={() => onHandoff?.()} close={close} disabled={!onHandoff}/>
      <MenuDivider/>
      <MenuAction label={pinned ? 'Unpin' : 'Pin'} icon={<Pin size={15}/>} onClick={onTogglePin} close={close}/>
      <MenuAction label="Rename" icon={<Pencil size={15}/>} onClick={onRename} close={close}/>
      <MenuAction label="Duplicate" icon={<Copy size={15}/>} onClick={onDuplicate} close={close}/>
      <div className="dcx-menu-section-label">Turn into</div>
      <MenuAction label="Slides" icon={<Presentation size={15}/>} detail="Presentation workspace" onClick={() => onTurnInto?.('slides')} close={close} disabled={!onTurnInto || currentType === 'slides'}/>
      <MenuAction label="Design" icon={<Shapes size={15}/>} detail="Artboard workspace" onClick={() => onTurnInto?.('design')} close={close} disabled={!onTurnInto || currentType === 'design'}/>
      <MenuAction label="Whiteboard" icon={<StickyNote size={15}/>} detail="Visual whiteboard workspace" onClick={() => onTurnInto?.('whiteboard')} close={close} disabled={!onTurnInto || currentType === 'whiteboard'}/>
      <MenuDivider/>
      <MenuAction label="Move to" icon={<Folder size={15}/>} detail={onMoveTo ? 'Choose a destination' : 'Collections are not connected'} onClick={() => onMoveTo?.()} close={close} disabled={!onMoveTo}/>
      <MenuAction label="Refresh" icon={<RefreshCw size={15}/>} detail="Reload the saved document" onClick={() => onRefresh?.()} close={close} disabled={!onRefresh}/>
      <MenuAction label="Storage" icon={<HardDrive size={15}/>} detail="View where this document is stored" onClick={() => onStorage?.()} close={close} disabled={!onStorage}/>
      <MenuAction label="Permissions" icon={<Shield size={15}/>} detail={onPermissions ? 'Review document access' : 'Permissions are not connected'} onClick={() => onPermissions?.()} close={close} disabled={!onPermissions}/>
      <MenuAction label="Give feedback" icon={<MessageSquare size={15}/>} detail={onFeedback ? 'Send product feedback' : 'Feedback destination is not connected'} onClick={() => onFeedback?.()} close={close} disabled={!onFeedback}/>
      {onSaveToLibrary ? <><MenuDivider/><MenuAction label="Save to Library" icon={<Library size={15}/>} onClick={onSaveToLibrary} close={close}/></> : null}
      <MenuDivider/>
      <MenuAction label="Close tab" icon={<X size={15}/>} onClick={() => onClose?.()} close={close}/>
      <MenuAction label="Delete" icon={<Trash2 size={15}/>} onClick={onDelete} close={close} destructive/>
    </>}
  </MenuPopover>;
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

export function CreationMenu({ onCreate, onCreateBrandGuidelines }: { onCreate: (type: CreativeType) => void; onCreateBrandGuidelines?: () => void }) {
  return <MenuPopover label="Create new document" trigger={<><Plus size={15}/><span>New</span><ChevronDown size={13}/></>} triggerClassName="dcx-command-button">{(close) => <>
    <MenuAction label="Presentation" icon={<Presentation size={15}/>} onClick={() => onCreate('slides')} close={close}/>
    {onCreateBrandGuidelines ? <MenuAction label="Brand Guidelines" icon={<FileJson size={15}/>} onClick={onCreateBrandGuidelines} close={close}/> : null}
    <MenuAction label="Design" icon={<Shapes size={15}/>} onClick={() => onCreate('design')} close={close}/>
    <MenuAction label="Create in Code" icon={<Code2 size={15}/>} onClick={() => onCreate('code')} close={close}/>
    <MenuAction label="Design System" icon={<Diamond size={15}/>} onClick={() => onCreate('system')} close={close}/>
    <MenuAction label="Whiteboard" icon={<StickyNote size={15}/>} onClick={() => onCreate('whiteboard')} close={close}/>
  </>}</MenuPopover>;
}
export function InsertMenu({ onText, onImage, onMedia, onShape, onChart, onTable }: { onText: () => void; onImage: () => void; onMedia?: () => void; onShape: (kind: ShapeKind) => void; onChart?: (type: ChartType) => void; onTable?: () => void }) {
  const shapes: {label: string; kind: ShapeKind; icon: ReactNode}[] = [
    {label:'Rectangle',kind:'rect',icon:<Square size={15}/>},{label:'Ellipse',kind:'circle',icon:<Circle size={15}/>},{label:'Diamond',kind:'diamond',icon:<Diamond size={15}/>},{label:'Triangle',kind:'triangle',icon:<Triangle size={15}/>},{label:'Star',kind:'star',icon:<Star size={15}/>},{label:'Arrow',kind:'arrow',icon:<ArrowRight size={15}/>},{label:'Plus',kind:'plus',icon:<Plus size={15}/>},{label:'Chevron',kind:'chevron',icon:<ChevronRight size={15}/>},{label:'Callout',kind:'callout',icon:<MessageSquare size={15}/>},{label:'Line',kind:'line',icon:<span className="dcx-menu-line-icon"/>}
  ];
  const charts: [ChartType,string][] = [['bar','Bar chart'],['line','Line chart'],['pie','Pie chart'],['area','Area chart'],['scatter','Scatter plot'],['histogram','Histogram'],['waterfall','Waterfall chart'],['funnel','Funnel chart'],['treemap','Treemap']];
  return <MenuPopover label="Insert" trigger={<><Plus size={15}/><span>Insert</span><ChevronDown size={13}/></>} triggerClassName="dcx-command-button">{(close) => <>
    <MenuAction label="Text box" icon={<Type size={15}/>} onClick={onText} close={close}/><MenuAction label="Image" icon={<Image size={15}/>} onClick={onImage} close={close}/>
    {onMedia ? <MenuAction label="Video" icon={<Play size={15}/>} onClick={onMedia} close={close}/> : null}
    <MenuDivider/><div className="dcx-menu-section-label">Shapes</div><div className="dcx-shape-menu-grid">{shapes.map(shape => <button key={shape.kind} type="button" role="menuitem" title={shape.label} aria-label={shape.label} onClick={() => {onShape(shape.kind);close();}}>{shape.icon}<span>{shape.label}</span></button>)}</div>
    {onChart ? <><MenuDivider/><div className="dcx-menu-section-label">Charts</div>{charts.map(([type,label]) => <MenuAction key={type} label={label} icon={<BarChart3 size={15}/>} onClick={() => onChart(type)} close={close}/>)}</> : null}
    {onTable ? <MenuAction label="Table" icon={<Table2 size={15}/>} onClick={onTable} close={close}/> : null}
  </>}</MenuPopover>;
}
export function ZoomControls({ zoom, onChange, onFit, grid, onToggleGrid, showGridToggle = true }: { zoom: number; onChange: (zoom: number) => void; onFit: () => void; grid: boolean; onToggleGrid: () => void; showGridToggle?: boolean }) {
 return <><button className="dcx-command-icon" aria-label="Zoom out" onClick={() => onChange(Math.max(10,Math.round(zoom/1.2)))}><ZoomOut size={15}/></button><MenuPopover label="Zoom" trigger={<>{zoom}%<ChevronDown size={12}/></>} className="dcx-zoom-level" triggerClassName="dcx-command-button">{close => <><MenuAction label="Fit to view" detail="0" onClick={onFit} close={close}/>{[10,25,50,75,100,125,150,200,300,400].map(value => <MenuAction key={value} label={value+'%'} icon={zoom===value?<Check size={14}/>:undefined} onClick={() => onChange(value)} close={close}/>)}</>}</MenuPopover><button className="dcx-command-icon" aria-label="Zoom in" onClick={() => onChange(Math.min(400,Math.round(zoom*1.2)))}><ZoomIn size={15}/></button>{showGridToggle ? <button className="dcx-command-icon" aria-label="Toggle grid" aria-pressed={grid} onClick={onToggleGrid}><Grid3X3 size={15}/></button> : null}</>;
}




export function SlideLayoutMenu({ onAdd, label = 'Add slide' }: { onAdd: (kind: string) => void; label?: string }) {
  const layouts: [string,string,ReactNode][] = [
    ['Blank','Start with an empty slide',<Square size={15}/>],
    ['Title','A strong opening title',<Type size={15}/>],
    ['Section','Introduce a new section',<Presentation size={15}/>],
    ['Title + body','Title with supporting copy',<FileText size={15}/>],
    ['Bullets','A clear list of key points',<List size={15}/>],
    ['Two columns','Compare two ideas side by side',<Columns2 size={15}/>],
    ['Summary','Three concise takeaways',<Grid3X3 size={15}/>],
  ];
  return <MenuPopover label="Add slide layout" className="dcx-slide-layout-menu" trigger={<><Plus size={15}/><span>{label}</span><ChevronDown size={12}/></>} triggerClassName="dcx-command-button">
    {(close) => <><div className="dcx-menu-section-label">Slide layouts</div>{layouts.map(([kind,detail,icon]) => <MenuAction key={kind} label={kind} detail={detail} icon={icon} onClick={() => onAdd(kind)} close={close}/>)}</>}
  </MenuPopover>;
}

export function ViewMenu({ grid, snap, guides, bounds, onToggleGrid, onToggleSnap, onToggleGuides, onToggleBounds }: {
  grid: boolean; snap: boolean; guides: boolean; bounds: boolean;
  onToggleGrid: () => void; onToggleSnap: () => void; onToggleGuides: () => void; onToggleBounds: () => void;
}) {
  return <MenuPopover label="View options" trigger={<><Eye size={15}/><span>View</span><ChevronDown size={12}/></>} triggerClassName="dcx-command-button">
    {(close) => <>
      <MenuAction label={grid ? 'Hide grid' : 'Show grid'} icon={grid ? <Check size={14}/> : <Grid3X3 size={14}/>} onClick={onToggleGrid} close={close}/>
      <MenuAction label={snap ? 'Disable snap to grid' : 'Snap to grid'} icon={snap ? <Check size={14}/> : <Magnet size={14}/>} onClick={onToggleSnap} close={close}/>
      <MenuAction label={guides ? 'Hide alignment guides' : 'Show alignment guides'} icon={guides ? <Check size={14}/> : <Ruler size={14}/>} onClick={onToggleGuides} close={close}/>
      <MenuAction label={bounds ? 'Hide safe area' : 'Show safe area'} icon={bounds ? <Check size={14}/> : <Square size={14}/>} onClick={onToggleBounds} close={close}/>
    </>}
  </MenuPopover>;
}

export function SlideInsertToolbar({ activeTool, onToolChange, onText, onImage, onNewSvg, onMedia, onTable, onShape, onChart, onComment, onAsk }: {
  activeTool: 'select' | 'hand'; onToolChange: (tool: 'select' | 'hand') => void;
  onText: () => void; onImage: () => void; onNewSvg: () => void; onMedia: () => void; onTable: () => void;
  onShape: (kind: ShapeKind) => void; onChart: (type: ChartType) => void;
  onComment: () => void; onAsk?: () => void;
}) {
  const shapes: {label: string; kind: ShapeKind; icon: ReactNode}[] = [
    {label:'Rectangle',kind:'rect',icon:<Square size={15}/>},
    {label:'Ellipse',kind:'circle',icon:<Circle size={15}/>},
    {label:'Diamond',kind:'diamond',icon:<Diamond size={15}/>},
    {label:'Triangle',kind:'triangle',icon:<Triangle size={15}/>},
    {label:'Star',kind:'star',icon:<Star size={15}/>},
    {label:'Arrow',kind:'arrow',icon:<ArrowRight size={15}/>},
    {label:'Plus',kind:'plus',icon:<Plus size={15}/>},
    {label:'Chevron',kind:'chevron',icon:<ChevronRight size={15}/>},
    {label:'Callout',kind:'callout',icon:<MessageSquare size={15}/>},
    {label:'Line',kind:'line',icon:<span className="dcx-menu-line-icon"/>},
  ];
  const charts: [ChartType,string][] = [
    ['bar','Bar chart'],['line','Line chart'],['pie','Pie chart'],['area','Area chart'],
    ['scatter','Scatter plot'],['histogram','Histogram'],['waterfall','Waterfall chart'],
    ['funnel','Funnel chart'],['treemap','Treemap'],
  ];
  return <div className="dcx-slide-insert-toolbar" role="toolbar" aria-label="Slide insert tools">
    <button type="button" className={'dcx-slide-insert-action' + (activeTool === 'select' ? ' active' : '')} aria-pressed={activeTool === 'select'} onClick={() => onToolChange('select')}><MousePointer2 size={16}/><span>Select</span></button>
    <button type="button" className={'dcx-slide-insert-action' + (activeTool === 'hand' ? ' active' : '')} aria-pressed={activeTool === 'hand'} onClick={() => onToolChange('hand')}><Hand size={16}/><span>Hand</span></button>
    <span className="dcx-slide-insert-divider" aria-hidden="true"/>
    <button type="button" className="dcx-slide-insert-action" onClick={onText}><Type size={16}/><span>Text</span></button>
    <button type="button" className="dcx-slide-insert-action" onClick={onImage}><Image size={16}/><span>Image</span></button>
    <button type="button" className="dcx-slide-insert-action" onClick={onNewSvg}><Code2 size={16}/><span>SVG</span></button>
    <button type="button" className="dcx-slide-insert-action" onClick={onMedia}><Play size={16}/><span>Media</span></button>
    <button type="button" className="dcx-slide-insert-action" onClick={onTable}><Table2 size={16}/><span>Table</span></button>
    <MenuPopover label="Insert shape" trigger={<><Shapes size={16}/><span>Shape</span><ChevronDown size={11}/></>} triggerClassName="dcx-slide-insert-action">
      {(close) => <><div className="dcx-menu-section-label">Shapes</div><div className="dcx-shape-menu-grid">{shapes.map((item) => <button key={item.kind} type="button" role="menuitem" title={item.label} aria-label={item.label} onClick={() => { onShape(item.kind); close(); }}>{item.icon}<span>{item.label}</span></button>)}</div></>}
    </MenuPopover>
    <MenuPopover label="Insert chart" trigger={<><BarChart3 size={16}/><span>Chart</span><ChevronDown size={11}/></>} triggerClassName="dcx-slide-insert-action">
      {(close) => <>{charts.map(([type,label]) => <MenuAction key={type} label={label} icon={<BarChart3 size={14}/>} onClick={() => onChart(type)} close={close}/>)}</>}
    </MenuPopover>
    <span className="dcx-slide-insert-divider" aria-hidden="true"/>
    <button type="button" className="dcx-slide-insert-action" onClick={onComment}><MessageSquare size={16}/><span>Comment</span></button>
    {onAsk ? <button type="button" className="dcx-slide-insert-action is-agent" onClick={onAsk}><Sparkles size={16}/><span>Ask AgentSam</span></button> : null}
  </div>;
}
