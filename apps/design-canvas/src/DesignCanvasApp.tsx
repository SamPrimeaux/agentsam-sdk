import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  ArrowLeft, BarChart3, Bold, Check, ChevronDown, Circle, Code2, Copy, Download, FileText,
  FolderOpen, Grid3X3, Hand, Image, Layers, LayoutGrid, Library, Menu, MessageSquare,
  Maximize2, Minimize2, PanelRight, PanelRightClose, MoreHorizontal, MousePointer2, Palette, PenTool, Play, Plus, Presentation, List, Star,
  Redo2, Search, Share2, Shapes, SlidersHorizontal, Square, StickyNote, SwatchBook, Table2, Trash2, Type,
  Undo2, Upload, X, ZoomIn, ZoomOut, Ruler, Component, FileUp, Settings2, Sparkles
} from 'lucide-react';
import { DesignWorkspaceFrame } from '@inneranimalmedia/agentsam-workbench/design';
import type { DesignWorkspaceSnapshot } from '@inneranimalmedia/agentsam-contracts';
import type { DesignCanvasAgentContext } from './creative-model';
import { sanitizeInlineSvg } from './svg';
export type { DesignCanvasAgentContext } from './creative-model';
import { SourceLibraryApp } from './SourceLibraryApp';
import {
  Artboard, AssetToken, CodeDocument, ColorToken, CreativeArtifact, CreativeObject, CreativeType, CreativeComment, ChartType,
  DesignDocument, DesignSystemDocument, ScaleToken, ShadowToken, Slide, SlidesDocument,
  TypeToken, artifactHasImages, brandGuidelinesSlides, contrastRatio, duplicateArtifact, makeArtifact, makeId, makeSlidePreset, reorderSlides,
  normalizeArtifacts, readArtifacts, writeArtifacts, STORAGE_KEY
} from './creative-model';
import { ArtboardMenu, CreationMenu, DocumentActionsMenu, InsertMenu, PresentMenu, SlideInsertToolbar, SlideLayoutMenu, ViewMenu, ZoomControls, type ShapeKind } from './components/EditorMenus';
import { SelectionFormattingToolbar } from './components/SelectionFormattingToolbar';
import { useCanvasZoom } from './components/canvas-zoom';
import '@inneranimalmedia/agentsam-workbench/design/design-workspace.css';
import './design-canvas.css';
import { CREATIVE_WIDGET_COVERS } from '@inneranimalmedia/agentsam-workbench/widgets';
const slidesCover=CREATIVE_WIDGET_COVERS.slides,brandGuidelinesCover=CREATIVE_WIDGET_COVERS['brand-guidelines'],designCover=CREATIVE_WIDGET_COVERS.design,codeCover=CREATIVE_WIDGET_COVERS['design-in-code'],systemCover=CREATIVE_WIDGET_COVERS['design-system'],whiteboardCover=CREATIVE_WIDGET_COVERS.whiteboard;

type AskContext = DesignCanvasAgentContext;
type EditorChromeProps = {
  leading?: ReactNode;
  documentActions?: ReactNode;
  assistant?: ReactNode;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  assistantDock?: 'left' | 'right';
  onAssistantDockChange?: (dock: 'left' | 'right') => void;
};
export type DesignCanvasAppProps = {
  onAskAgentSam?: (context: AskContext) => void;
  /** Existing agentsam-workbench conversation surface. The host owns its thread and composer. */
  assistant?: ReactNode;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  assistantDock?: 'left' | 'right';
  onAssistantDockChange?: (dock: 'left' | 'right') => void;
  initialArtifacts?: CreativeArtifact[];
  initialWorkspace?: CreativeType;
  initialName?: string;
  initialActiveId?: string;
  initialRoute?: 'gallery' | 'references';
  onArtifactsChange?: (artifacts: CreativeArtifact[]) => void;
  onActiveArtifactChange?: (artifactId: string | null, artifact?: CreativeArtifact | null) => void;
  onOpenCode?: (context?: AskContext) => void;
  onMoveArtifact?: (artifact: CreativeArtifact) => void;
  onRefreshArtifact?: (artifact: CreativeArtifact) => void;
  onManagePermissions?: (artifact: CreativeArtifact) => void;
  onGiveFeedback?: (artifact: CreativeArtifact) => void;
  onToggleOutputs?: () => void;
  outputsOpen?: boolean;
  onSaveStatusChange?: (state: 'saving' | 'saved' | 'error') => void;
  onShareArtifact?: (artifact: CreativeArtifact) => void;
  onSaveToLibrary?: (artifact: CreativeArtifact) => void;
  embedded?: boolean;
};
type Section = 'overview' | 'colors' | 'typography' | 'spacing' | 'radii' | 'shadows' | 'components' | 'assets' | 'files';
type Tool = 'select' | 'hand' | 'text' | 'shape' | 'image' | 'media' | 'chart' | 'table' | 'pen' | 'comment' | 'note' | 'frame' | 'rect' | 'ellipse';
type AlignCommand = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type TokenModal = 'color' | 'type' | 'scale' | 'shadow' | 'component' | null;

function snapshotFor(artifact: CreativeArtifact, selection?: { id: string; kind: string }): DesignWorkspaceSnapshot {
  return {
    contract: 'agentsam.design-workspace.v1',
    resource: {
      id: artifact.id,
      kind: artifact.type === 'slides' ? 'slides' : artifact.type === 'whiteboard' ? 'whiteboard' : artifact.type === 'code' ? 'code' : 'design',
      appId: 'agentsam-design-canvas',
      title: artifact.name,
      href: typeof window === 'undefined' ? '/design-canvas' : window.location.href,
      accountId: ''
    },
    capabilities: ['create', 'open', 'select', 'inspect', 'modify', 'preview', 'save', 'undo', 'redo', 'export'],
    revision: artifact.updatedAt,
    savedRevision: artifact.updatedAt,
    dirty: false,
    selection: selection ? [{ id: selection.id, kind: selection.kind }] : [],
    status: 'ready'
  };
}
function formatDate(value: string) {
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value)); }
  catch { return ''; }
}
function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function makeObject(type: Tool, x = 420, y = 230, shapeKind: ShapeKind = 'rect'): CreativeObject {
  const id = makeId('object');
  if (type === 'text') return { id, type: 'text', name: 'Text', x, y, w: 360, h: 100, text: 'Add your text', color: '#17191d', fontSize: 42, weight: 600 };
  if (type === 'image') return { id, type: 'image', name: 'Image', x, y, w: 320, h: 220, fill: '#e5e7eb', label: 'Add image', imageFit: 'cover' };
  if (type === 'media') return { id, type: 'media', name: 'Video', x, y, w: 420, h: 236, mediaType: 'video', label: 'Add video' };
  if (type === 'chart') return { id, type: 'chart', name: 'Bar chart', x, y, w: 360, h: 230, chartType: 'bar', chartData: [{ label: 'A', value: 48 }, { label: 'B', value: 78 }, { label: 'C', value: 62 }, { label: 'D', value: 92 }] };
  if (type === 'table') return { id, type: 'table', name: 'Table', x, y, w: 430, h: 220, tableData: [['Category', 'Value'], ['Item A', '24'], ['Item B', '38'], ['Item C', '52']] };
  return { id, type: 'shape', name: shapeKind === 'circle' ? 'Ellipse' : shapeKind === 'rect' ? 'Rectangle' : shapeKind[0].toUpperCase() + shapeKind.slice(1), x, y, w: 220, h: 150, fill: '#397ff2', shape: shapeKind, radius: 12 };
}
function objectStyle(object: CreativeObject, width: number, height: number): CSSProperties {
  return {
    left: (object.x / width * 100) + '%',
    top: (object.y / height * 100) + '%',
    width: (object.w / width * 100) + '%',
    height: (object.h / height * 100) + '%',
    '--object-font-size': object.fontSize || 28,
    '--object-font-scale': (100 / width) + 'cqw',
    '--object-radius': object.radius || 10,
    opacity: object.opacity ?? 1,
    boxShadow: object.shadow || undefined
  } as CSSProperties;
}
function ChartPreview({ object }: { object: CreativeObject }) {
  const data = object.chartData || [];
  const colors = ['#397ff2','#8a6cf0','#25a783','#e69a45','#d75c78'];
  const total = Math.max(1, data.reduce((sum, item) => sum + Math.max(0, item.value), 0));
  const max = Math.max(1, ...data.map((item) => item.value));
  if (object.chartType === 'treemap') return <div className="dcx-treemap">{data.map((item, i) => <div key={item.label} style={{ flex: Math.max(1, item.value), background: colors[i % colors.length] }}>{item.label}</div>)}</div>;
  if (object.chartType === 'funnel') return <div className="dcx-chart-funnel">{data.map((item, i) => <div key={item.label} style={{ width: Math.max(22, item.value / max * 100) + '%', background: colors[i % colors.length] }}><span>{item.label}</span><b>{item.value}</b></div>)}</div>;
  if (object.chartType === 'scatter') return <div className="dcx-chart-line-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M5 92 H95 M5 53 H95 M5 14 H95 M5 14 V92" stroke="#e5e7eb" strokeWidth="1" fill="none"/>{data.map((item, i) => <circle key={item.label} cx={data.length <= 1 ? 50 : i / (data.length - 1) * 90 + 5} cy={92 - item.value / max * 78} r="3.2" fill={colors[i % colors.length]}/>)}</svg><div className="dcx-chart-labels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div></div>;
  if (object.chartType === 'area') {
    const points = data.map((item, i) => ((data.length <= 1 ? 50 : i / (data.length - 1) * 90 + 5) + ',' + (92 - item.value / max * 78))).join(' ');
    return <div className="dcx-chart-line-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M5 92 H95 M5 53 H95 M5 14 H95" stroke="#e5e7eb" strokeWidth="1" fill="none"/><polygon points={'5,92 ' + points + ' 95,92'} fill="#397ff2" opacity=".2"/><polyline points={points} fill="none" stroke="#397ff2" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg><div className="dcx-chart-labels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div></div>;
  }
  if (object.chartType === 'waterfall') {
    let running = 0;
    const steps = data.map((item) => { const start = running; running += item.value; return { ...item, start, end: running }; });
    const range = Math.max(1, ...steps.map((item) => Math.max(item.start, item.end)));
    return <div className="dcx-chart-waterfall">{steps.map((item, i) => <div key={item.label}><i style={{ bottom: Math.min(item.start, item.end) / range * 86 + '%', height: Math.max(5, Math.abs(item.value) / range * 86) + '%', background: colors[i % colors.length] }}/><span>{item.label}</span></div>)}</div>;
  }
  if (object.chartType === 'pie') {
    let cursor = 0;
    const stops = data.map((item, i) => { const start = cursor; cursor += Math.max(0, item.value) / total * 100; return colors[i % colors.length] + ' ' + start + '% ' + cursor + '%'; }).join(',');
    return <div className="dcx-chart-pie-wrap"><div className="dcx-chart-pie" style={{ background: 'conic-gradient(' + stops + ')' }}/><div className="dcx-chart-legend">{data.map((item, i) => <span key={item.label}><i style={{ background: colors[i % colors.length] }}/>{item.label}</span>)}</div></div>;
  }
  if (object.chartType === 'line') {
    const points = data.map((item, i) => ((data.length <= 1 ? 50 : i / (data.length - 1) * 90 + 5) + ',' + (92 - item.value / max * 78))).join(' ');
    return <div className="dcx-chart-line-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M5 92 H95 M5 53 H95 M5 14 H95" stroke="#e5e7eb" strokeWidth="1" fill="none"/><polyline points={points} fill="none" stroke="#397ff2" strokeWidth="3" vectorEffect="non-scaling-stroke"/>{data.map((item, i) => <circle key={item.label} cx={data.length <= 1 ? 50 : i / (data.length - 1) * 90 + 5} cy={92 - item.value / max * 78} r="2.5" fill="#397ff2"/> )}</svg><div className="dcx-chart-labels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div></div>;
  }
  return <div className="dcx-chart-preview"><div className="dcx-chart-grid">{[0,1,2,3].map((n) => <i key={n}/>)}</div><div className="dcx-chart-bars">{data.map((item, i) => <div key={item.label}><i style={{ height: Math.max(8, item.value / max * 86) + '%', background: colors[i % colors.length] }}/><span>{item.label}</span></div>)}</div></div>;
}
function InlineSvg({ markup, title }: { markup: string; title: string }) {
  const safeMarkup = useMemo(() => {
    try { return sanitizeInlineSvg(markup); }
    catch { return ''; }
  }, [markup]);
  return safeMarkup
    ? <div className="dcx-object-svg-content" role="img" aria-label={title} dangerouslySetInnerHTML={{ __html: safeMarkup }}/>
    : <div className="dcx-object-svg-invalid" role="img" aria-label={title + ' — invalid SVG'}>SVG source needs review</div>;
}

function EditableSurface({
  width, height, background, objects, selectedId, onSelect, onChange, onPlace, onDraw, className = '', snapToGrid = false, showBounds = false, showGuides = false, panEnabled = false
}: {
  width: number; height: number; background: string; objects: CreativeObject[]; selectedId: string;
  onSelect: (id: string) => void; onChange: (id: string, patch: Partial<CreativeObject>) => void;
  onPlace?: (x: number, y: number) => void; onDraw?: (points: { x: number; y: number }[]) => void; className?: string; snapToGrid?: boolean; showBounds?: boolean; showGuides?: boolean; panEnabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number; w: number; h: number; resize: boolean; pan?: boolean; scrollX?: number; scrollY?: number } | null>(null);
  const drawing = useRef<{ points: { x: number; y: number }[] } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number }[] | null>(null);
  const snap = (value: number) => snapToGrid ? Math.round(value / 8) * 8 : value;
  const beginPan = (event: ReactPointerEvent<HTMLElement>) => {
    const viewport = ref.current?.parentElement;
    event.preventDefault(); event.stopPropagation();
    drag.current = { id: '', startX: event.clientX, startY: event.clientY, x: 0, y: 0, w: 0, h: 0, resize: false, pan: true, scrollX: viewport?.scrollLeft || 0, scrollY: viewport?.scrollTop || 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const startDrag = (event: ReactPointerEvent<HTMLElement>, object: CreativeObject, resize = false) => {
    if (event.button !== 0) return;
    if (panEnabled) { beginPan(event); return; }
    event.preventDefault(); event.stopPropagation();
    onSelect(object.id);
    drag.current = { id: object.id, startX: event.clientX, startY: event.clientY, x: object.x, y: object.y, w: object.w, h: object.h, resize };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointAt = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: snap(Math.round((clientX - rect.left) / rect.width * width)), y: snap(Math.round((clientY - rect.top) / rect.height * height)) };
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawing.current) {
      const point = pointAt(event.clientX, event.clientY);
      const points = drawing.current.points;
      const last = points[points.length - 1];
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 2) { points.push(point); setDrawPreview([...points]); }
      return;
    }
    if (!drag.current || !ref.current) return;
    if (drag.current.pan) {
      const viewport = ref.current.parentElement;
      if (viewport) {
        viewport.scrollLeft = (drag.current.scrollX || 0) - (event.clientX - drag.current.startX);
        viewport.scrollTop = (drag.current.scrollY || 0) - (event.clientY - drag.current.startY);
      }
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const dx = (event.clientX - drag.current.startX) / rect.width * width;
    const dy = (event.clientY - drag.current.startY) / rect.height * height;
    if (drag.current.resize) onChange(drag.current.id, { w: Math.max(32, snap(drag.current.w + dx)), h: Math.max(24, snap(drag.current.h + dy)) });
    else onChange(drag.current.id, { x: Math.max(0, Math.min(width - 24, snap(drag.current.x + dx))), y: Math.max(0, Math.min(height - 24, snap(drag.current.y + dy))) });
  };
  const end = () => {
    if (drawing.current) { const points = drawing.current.points; drawing.current = null; setDrawPreview(null); if (points.length > 1) onDraw?.(points); return; }
    drag.current = null;
  };
  return <div ref={ref} className={'dcx-editable-surface ' + className + (showBounds ? ' has-object-bounds' : '') + (panEnabled ? ' is-pan-enabled' : '')} style={{ aspectRatio: width + ' / ' + height, background }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerDown={(event) => {
    if (event.target !== event.currentTarget) return;
    if (panEnabled) { beginPan(event); return; }
    if (onDraw) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const point = pointAt(event.clientX, event.clientY); drawing.current = { points: [point] }; setDrawPreview([point]); return; }
    onSelect('');
    if (onPlace) { const point = pointAt(event.clientX, event.clientY); onPlace(point.x, point.y); }
  }}>
    {showGuides ? <div className="dcx-safe-guides" aria-hidden="true"><span/><span/></div> : null}
    {drawPreview && drawPreview.length > 1 ? <svg className="dcx-draw-preview" viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none"><polyline points={drawPreview.map((point) => point.x + ',' + point.y).join(' ')} fill="none" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg> : null}
    {objects.map((object) => {
      const style = objectStyle(object, width, height);
      const selected = object.id === selectedId;
      return <div key={object.id} className={'dcx-object dcx-object-' + object.type + (selected ? ' is-selected' : '') + (showBounds ? ' has-bounds' : '')} style={{ ...style, border: object.borderStyle && object.borderStyle !== 'none' ? (object.borderWidth || 1) + 'px ' + object.borderStyle + ' ' + (object.borderColor || '#7b8794') : undefined }} onPointerDown={(event) => startDrag(event, object)} onDoubleClick={() => onSelect(object.id)}>
        {object.type === 'text' ? <div className="dcx-object-text" style={{ color: object.color || '#17191d', fontWeight: object.weight || 500, fontStyle: object.italic ? 'italic' : 'normal', textDecoration: object.underline ? 'underline' : 'none', textAlign: object.align || 'left', fontFamily: object.fontFamily || 'Inter', fontSize: 'calc(var(--object-font-size) * var(--object-font-scale))', display: 'flex', flexDirection: 'column', justifyContent: object.verticalAlign === 'middle' ? 'center' : object.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start' }}>{object.text}</div> : null}
        {object.type === 'shape' ? <><div className={'dcx-object-shape shape-' + (object.shape || 'rect')} style={{ background: object.fillType === 'gradient' ? 'linear-gradient(' + (object.gradientAngle ?? 135) + 'deg,' + (object.gradientFrom || '#397ff2') + ',' + (object.gradientTo || '#8a6cf0') + ')' : object.fillType === 'image' && object.fillImage ? 'url(' + object.fillImage + ') center / cover no-repeat' : object.fill || '#397ff2', borderColor: object.borderColor || 'transparent', borderWidth: object.borderWidth || 0, borderStyle: object.borderStyle || 'solid', borderRadius: object.shape === 'circle' ? '50%' : 'calc(var(--object-radius) * var(--object-font-scale))', clipPath: object.shape === 'triangle' ? 'polygon(50% 0, 0 100%, 100% 100%)' : object.shape === 'diamond' ? 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' : object.shape === 'star' ? 'polygon(50% 0, 62% 35%, 100% 38%, 72% 62%, 82% 100%, 50% 78%, 18% 100%, 28% 62%, 0 38%, 38% 35%)' : object.shape === 'arrow' ? 'polygon(0 28%, 62% 28%, 62% 0, 100% 50%, 62% 100%, 62% 72%, 0 72%)' : object.shape === 'plus' ? 'polygon(38% 0, 62% 0, 62% 38%, 100% 38%, 100% 62%, 62% 62%, 62% 100%, 38% 100%, 38% 62%, 0 62%, 0 38%, 38% 38%)' : object.shape === 'chevron' ? 'polygon(0 0, 54% 0, 100% 50%, 54% 100%, 0 100%, 46% 50%)' : object.shape === 'callout' ? 'polygon(0 0, 100% 0, 100% 78%, 64% 78%, 50% 100%, 42% 78%, 0 78%)' : undefined }}/>{object.text ? <span className="dcx-object-shape-text" style={{ color: object.color || '#ffffff', fontSize: object.fontSize ? 'calc(var(--object-font-size) * var(--object-font-scale))' : undefined, fontFamily: object.fontFamily || undefined, fontWeight: object.weight || 600, fontStyle: object.italic ? 'italic' : 'normal', textAlign: object.align || 'center' }}>{object.text}</span> : null}</> : null}
        {object.type === 'svg' ? <InlineSvg markup={object.svgMarkup || ''} title={object.name}/> : null}
        {object.type === 'image' ? object.src ? <img src={object.src} alt={object.name} draggable={false} style={{ objectFit: object.imageFit || 'cover', objectPosition: object.imagePosition || 'center' }}/> : <div className="dcx-image-placeholder"><Image size={22}/><span>{object.label || 'Add image'}</span></div> : null}
        {object.type === 'media' ? object.src ? <video src={object.src} aria-label={object.name} controls playsInline preload="metadata"/> : <div className="dcx-image-placeholder"><Play size={22}/><span>{object.label || 'Add video'}</span></div> : null}
        {object.type === 'path' ? <svg className="dcx-object-path" viewBox={'0 0 ' + Math.max(1, object.w) + ' ' + Math.max(1, object.h)} preserveAspectRatio="none"><polyline points={(object.points || []).map((point) => point.x + ',' + point.y).join(' ')} fill="none" stroke={object.strokeColor || '#1f2937'} strokeWidth={object.strokeWidth || 3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg> : null}
        {object.type === 'chart' ? <ChartPreview object={object}/> : null}
        {object.type === 'table' ? <table className="dcx-object-table"><tbody>{(object.tableData || []).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table> : null}
        {selected ? <button className="dcx-resize-handle" aria-label="Resize selected object" onPointerDown={(event) => startDrag(event, object, true)}><span/></button> : null}
      </div>;
    })}
  </div>;
}
function ToolBar({ active, onChange, includeChart = false, includeTable = false, includeMedia = false, includeDesignTools = false, includeWhiteboardTools = false }: { active: Tool; onChange: (tool: Tool) => void; includeChart?: boolean; includeTable?: boolean; includeMedia?: boolean; includeDesignTools?: boolean; includeWhiteboardTools?: boolean }) {
  const tools: { id: Tool; label: string; icon: ReactNode }[] = [
    { id: 'select', label: 'Select', icon: <MousePointer2 size={16}/> },
    { id: 'hand', label: 'Hand / pan', icon: <Hand size={16}/> },
    { id: 'text', label: 'Text', icon: <Type size={16}/> },
    { id: 'shape', label: 'Shape', icon: <Square size={16}/> },
    { id: 'image', label: 'Image', icon: <Image size={16}/> },
    ...(includeMedia ? [{ id: 'media' as Tool, label: 'Video', icon: <Play size={16}/> }] : []),
    ...(includeDesignTools ? [{ id: 'frame' as Tool, label: 'Frame', icon: <LayoutGrid size={16}/> }, { id: 'pen' as Tool, label: 'Pen', icon: <PenTool size={16}/> }, { id: 'comment' as Tool, label: 'Comment', icon: <MessageSquare size={16}/> }, { id: 'rect' as Tool, label: 'Rectangle', icon: <Square size={16}/> }, { id: 'ellipse' as Tool, label: 'Ellipse', icon: <Circle size={16}/> }] : []),
    ...(includeWhiteboardTools ? [{ id: 'frame' as Tool, label: 'Frame', icon: <LayoutGrid size={16}/> }, { id: 'note' as Tool, label: 'Sticky note', icon: <StickyNote size={16}/> }, { id: 'pen' as Tool, label: 'Pen', icon: <PenTool size={16}/> }, { id: 'comment' as Tool, label: 'Comment', icon: <MessageSquare size={16}/> }, { id: 'rect' as Tool, label: 'Rectangle', icon: <Square size={16}/> }, { id: 'ellipse' as Tool, label: 'Ellipse', icon: <Circle size={16}/> }] : []),
    ...(includeChart ? [{ id: 'chart' as Tool, label: 'Chart', icon: <BarChart3 size={16}/> }] : []),
    ...(includeTable ? [{ id: 'table' as Tool, label: 'Table', icon: <Table2 size={16}/> }] : [])
  ];
  return <div className="dcx-floating-toolbar" role="toolbar" aria-label="Editing tools">{tools.map((tool) => <button key={tool.id} className={active === tool.id ? 'active' : ''} title={tool.label} aria-label={tool.label} aria-pressed={active === tool.id} onClick={() => onChange(tool.id)}>{tool.icon}</button>)}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="dcx-field"><span>{label}</span>{children}</label>;
}
function AlignmentControls({ onAlign }: { onAlign: (alignment: AlignCommand) => void }) {
  const items: { id: AlignCommand; label: string }[] = [
    { id: 'left', label: 'Align left' }, { id: 'center', label: 'Center horizontally' }, { id: 'right', label: 'Align right' },
    { id: 'top', label: 'Align top' }, { id: 'middle', label: 'Center vertically' }, { id: 'bottom', label: 'Align bottom' }
  ];
  return <div className="dcx-align-grid" role="group" aria-label="Align selected object">{items.map((item) => <button type="button" key={item.id} title={item.label} aria-label={item.label} onClick={() => onAlign(item.id)}><span className={'align-' + item.id}/></button>)}</div>;
}
function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="dcx-empty-state">{icon ? <div className="dcx-empty-icon">{icon}</div> : null}<strong>{title}</strong>{description ? <p>{description}</p> : null}{action ? <div className="dcx-empty-actions">{action}</div> : null}</div>;
}
type SelectionToolbarAnchor = { left: number; top: number; side: 'top' | 'bottom'; avoidRect: { left: number; top: number; right: number; bottom: number } } | null;
function useSelectionToolbarAnchor(areaRef: { current: HTMLDivElement | null }, selectedId: string, revision: string): SelectionToolbarAnchor {
  const [anchor, setAnchor] = useState<SelectionToolbarAnchor>(null);
  useEffect(() => {
    const area = areaRef.current;
    if (!area || !selectedId) { setAnchor(null); return; }
    const update = () => {
      const target = area.querySelector<HTMLElement>('.dcx-object.is-selected');
      if (!target) { setAnchor(null); return; }
      const areaRect = area.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const visibleTop = rect.top - areaRect.top;
      const visibleBottom = rect.bottom - areaRect.top;
      const placeAbove = visibleTop >= 54 || visibleBottom > area.clientHeight - 54;
      const toolbarHalf = Math.min(230, Math.max(120, area.clientWidth / 2 - 8));
      const minLeft = area.scrollLeft + toolbarHalf + 8;
      const maxLeft = area.scrollLeft + area.clientWidth - toolbarHalf - 8;
      const center = area.scrollLeft + rect.left - areaRect.left + rect.width / 2;
      const left = maxLeft < minLeft ? area.scrollLeft + area.clientWidth / 2 : Math.max(minLeft, Math.min(maxLeft, center));
      const top = area.scrollTop + (placeAbove ? Math.max(8, visibleTop - 48) : visibleBottom + 8);
      setAnchor({ left, top, side: placeAbove ? 'top' : 'bottom', avoidRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } });
    };
    update();
    area.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { area.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [areaRef, selectedId, revision]);
  return anchor;
}

function SlideInspector({ slide, selected, commentsOpen, onSlide, onObject, onAddComment, onToggleComments, onUploadImage, onUploadSvg, onUploadBackground, onGenerateBackground, onAsk, onAlign }: {
  slide: Slide; selected?: CreativeObject; commentsOpen: boolean;
  onSlide: (patch: Partial<Slide>) => void; onObject: (patch: Partial<CreativeObject>) => void;
  onAddComment: (text: string) => void; onToggleComments: () => void; onUploadImage: () => void; onUploadSvg: () => void; onUploadBackground: () => void;
  onGenerateBackground?: () => void; onAsk?: () => void; onAlign: (alignment: AlignCommand) => void;
}) {
  const [comment, setComment] = useState('');
  const [commentQuery, setCommentQuery] = useState('');
  const [svgDraft, setSvgDraft] = useState(selected?.type === 'svg' ? selected.svgMarkup || '' : '');
  const [svgError, setSvgError] = useState('');
  useEffect(() => {
    setSvgDraft(selected?.type === 'svg' ? selected.svgMarkup || '' : '');
    setSvgError('');
  }, [selected?.id, selected?.svgMarkup]);
  if (commentsOpen) {
    const visibleComments = slide.comments.filter((item) => !commentQuery || item.text.toLowerCase().includes(commentQuery.toLowerCase()));
    return <div className="dcx-inspector-content">
      <div className="dcx-inspector-heading"><strong>Comments</strong><button onClick={onToggleComments} aria-label="Close comments"><X size={15}/></button></div>
      <div className="dcx-comment-search"><Search size={14}/><input value={commentQuery} onChange={(event) => setCommentQuery(event.target.value)} placeholder="Search comments"/></div>
      {visibleComments.length ? <div className="dcx-comment-list">{visibleComments.map((item) => <div className="dcx-comment" key={item.id}><p>{item.text}</p><small>{item.targetId ? 'Attached to selected object' : 'Slide comment'} · {formatDate(item.createdAt)}</small></div>)}</div> : <EmptyState title={slide.comments.length ? 'No matching comments' : 'No comments yet'} description={slide.comments.length ? 'Try another search.' : 'Add a comment to start a conversation on this slide.'} icon={<MessageSquare size={18}/>} />}
      <form className="dcx-comment-entry" onSubmit={(event) => { event.preventDefault(); if (comment.trim()) { onAddComment(comment.trim()); setComment(''); } }}><div className="dcx-comment-target">{slide.name}{selected ? ' › ' + (selected.name || selected.type) : ''}</div><div className="dcx-comment-composer"><textarea aria-label="Add a comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" rows={2}/><div className="dcx-comment-actions"><button className="dcx-comment-submit" type="submit" aria-label="Add comment" disabled={!comment.trim()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div></div></form>
    </div>;
  }
  const tableRows = selected?.tableData || [];
  const updateTableCell = (rowIndex: number, columnIndex: number, value: string) => onObject({ tableData: tableRows.map((row, i) => i === rowIndex ? row.map((cell, j) => j === columnIndex ? value : cell) : row) });
  const removeTableRow = (rowIndex: number) => onObject({ tableData: tableRows.filter((_, i) => i !== rowIndex) });
  const addTableRow = () => { const columns = Math.max(1, ...tableRows.map((row) => row.length)); onObject({ tableData: [...tableRows, Array.from({ length: columns }, () => '')] }); };
  const addTableColumn = () => onObject({ tableData: tableRows.map((row) => [...row, '']) });
  const opacity = Math.round((selected?.opacity ?? 1) * 100);
  return <div className="dcx-inspector-content">
    <div className="dcx-inspector-heading"><strong>{selected ? selected.type === 'text' ? 'Text' : selected.type === 'shape' ? 'Shape' : selected.type === 'svg' ? 'SVG / Illustration' : selected.type === 'chart' ? 'Chart' : selected.type === 'table' ? 'Table' : 'Image' : 'Slide'}</strong><button onClick={onToggleComments} aria-label="Show comments"><MessageSquare size={15}/></button></div>
    {selected ? <>
      <Field label="Name"><input value={selected.name} onChange={(event) => onObject({ name: event.target.value })}/></Field>
      <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Size & position</div>
        <div className="dcx-field-grid"><Field label="X"><input type="number" value={Math.round(selected.x)} onChange={(event) => onObject({ x: Number(event.target.value) })}/></Field><Field label="Y"><input type="number" value={Math.round(selected.y)} onChange={(event) => onObject({ y: Number(event.target.value) })}/></Field></div>
        <div className="dcx-field-grid"><Field label="Width"><input type="number" min="24" value={Math.round(selected.w)} onChange={(event) => onObject({ w: Math.max(24, Number(event.target.value)) })}/></Field><Field label="Height"><input type="number" min="24" value={Math.round(selected.h)} onChange={(event) => onObject({ h: Math.max(24, Number(event.target.value)) })}/></Field></div>
      </section>
      {selected.type === 'text' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Typography</div>
        <Field label="Text"><textarea rows={4} value={selected.text || ''} onChange={(event) => onObject({ text: event.target.value })}/></Field>
        <div className="dcx-field-grid"><Field label="Font size"><input type="number" min="8" max="240" value={selected.fontSize || 28} onChange={(event) => onObject({ fontSize: Number(event.target.value) })}/></Field><Field label="Weight"><select value={selected.weight || 500} onChange={(event) => onObject({ weight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option></select></Field></div>
        <Field label="Typeface"><select value={selected.fontFamily || 'Inter'} onChange={(event) => onObject({ fontFamily: event.target.value })}><option>Inter</option><option>Arial</option><option>Helvetica Neue</option><option>Georgia</option><option>Times New Roman</option></select></Field>
        <div className="dcx-field-grid"><Field label="Text color"><input type="color" value={selected.color || '#17191d'} onChange={(event) => onObject({ color: event.target.value })}/></Field><Field label="Align"><select value={selected.align || 'left'} onChange={(event) => onObject({ align: event.target.value as CreativeObject['align'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></Field></div>
        <div className="dcx-field-grid"><Field label="Italic"><input type="checkbox" checked={!!selected.italic} onChange={(event) => onObject({ italic: event.target.checked })}/></Field><Field label="Underline"><input type="checkbox" checked={!!selected.underline} onChange={(event) => onObject({ underline: event.target.checked })}/></Field></div>
        <Field label="Vertical alignment"><select value={selected.verticalAlign || 'top'} onChange={(event) => onObject({ verticalAlign: event.target.value as CreativeObject['verticalAlign'] })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></Field>
        <Field label="Link URL"><input type="url" value={selected.link || ''} placeholder="https://…" onChange={(event) => onObject({ link: event.target.value || undefined })}/></Field>
      </section> : null}
      {selected.type === 'shape' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Appearance</div>
        <Field label="Shape"><select value={selected.shape || 'rect'} onChange={(event) => onObject({ shape: event.target.value as CreativeObject['shape'] })}><option value="rect">Rectangle</option><option value="circle">Ellipse</option><option value="diamond">Diamond</option><option value="triangle">Triangle</option><option value="star">Star</option><option value="arrow">Arrow</option><option value="plus">Plus</option><option value="chevron">Chevron</option><option value="callout">Callout</option><option value="line">Line</option></select></Field>
        <Field label="Fill type"><select value={selected.fillType || 'solid'} onChange={(event) => onObject({ fillType: event.target.value as CreativeObject['fillType'] })}><option value="solid">Solid</option><option value="gradient">Gradient</option><option value="image">Image fill</option></select></Field>
        {selected.fillType === 'gradient' ? <><div className="dcx-field-grid"><Field label="Start color"><input type="color" value={selected.gradientFrom || selected.fill || '#397ff2'} onChange={(event) => onObject({ gradientFrom: event.target.value })}/></Field><Field label="End color"><input type="color" value={selected.gradientTo || '#8a6cf0'} onChange={(event) => onObject({ gradientTo: event.target.value })}/></Field></div><Field label="Gradient angle"><input type="number" min="0" max="360" value={selected.gradientAngle ?? 135} onChange={(event) => onObject({ gradientAngle: Number(event.target.value) })}/></Field></> : null}
        {selected.fillType !== 'gradient' ? <Field label="Fill"><input type="color" value={selected.fill || '#397ff2'} onChange={(event) => onObject({ fill: event.target.value, fillType: 'solid' })}/></Field> : null}
        <Field label="Image fill URL"><input type="url" value={selected.fillImage || ''} placeholder="https://…" onChange={(event) => onObject({ fillImage: event.target.value || undefined, fillType: 'image' })}/></Field><Field label="Shape text"><textarea rows={2} value={selected.text || ''} onChange={(event) => onObject({ text: event.target.value })} placeholder="Optional label"/></Field>
        <div className="dcx-field-grid"><Field label="Text color"><input type="color" value={selected.color || '#ffffff'} onChange={(event) => onObject({ color: event.target.value })}/></Field><Field label="Text size"><input type="number" min="8" max="96" value={selected.fontSize || 18} onChange={(event) => onObject({ fontSize: Number(event.target.value) })}/></Field></div><Field label="Text typeface"><select value={selected.fontFamily || 'Inter'} onChange={(event) => onObject({ fontFamily: event.target.value })}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></Field>
        <div className="dcx-field-grid"><Field label="Corner radius"><input type="number" min="0" max="96" value={selected.radius || 0} onChange={(event) => onObject({ radius: Number(event.target.value) })}/></Field><Field label="Border"><input type="color" value={selected.borderColor || '#ffffff'} onChange={(event) => onObject({ borderColor: event.target.value, borderWidth: selected.borderWidth || 1, borderStyle: selected.borderStyle || 'solid' })}/></Field></div>
        <div className="dcx-field-grid"><Field label="Border width"><input type="number" min="0" max="24" value={selected.borderWidth || 0} onChange={(event) => onObject({ borderWidth: Number(event.target.value) })}/></Field><Field label="Border style"><select value={selected.borderStyle || 'none'} onChange={(event) => onObject({ borderStyle: event.target.value as CreativeObject['borderStyle'] })}><option value="none">None</option><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></Field></div>
        <Field label="Shadow"><select value={selected.shadow || 'none'} onChange={(event) => onObject({ shadow: event.target.value === 'none' ? undefined : event.target.value })}><option value="none">None</option><option value="0 2px 8px rgba(0,0,0,.14)">Soft</option><option value="0 8px 22px rgba(0,0,0,.18)">Medium</option><option value="0 16px 40px rgba(0,0,0,.24)">Strong</option></select></Field>
      </section> : null}
      {selected.type === 'chart' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Data</div><Field label="Chart type"><select value={selected.chartType || 'bar'} onChange={(event) => onObject({ chartType: event.target.value as CreativeObject['chartType'] })}><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option><option value="area">Area</option><option value="scatter">Scatter</option><option value="histogram">Histogram</option><option value="waterfall">Waterfall</option><option value="funnel">Funnel</option><option value="treemap">Treemap</option></select></Field><div className="dcx-data-editor"><div className="dcx-data-editor-head"><span>Label</span><span>Value</span><span/></div>{(selected.chartData || []).map((item, index) => <div className="dcx-chart-data-row" key={index}><input value={item.label} aria-label="Data label" onChange={(event) => onObject({ chartData: (selected.chartData || []).map((value, i) => i === index ? { ...value, label: event.target.value } : value) })}/><input type="number" value={item.value} aria-label="Data value" onChange={(event) => onObject({ chartData: (selected.chartData || []).map((value, i) => i === index ? { ...value, value: Number(event.target.value) } : value) })}/><button aria-label="Remove data point" onClick={() => onObject({ chartData: (selected.chartData || []).filter((_, i) => i !== index) })}><X size={12}/></button></div>)}<button className="dcx-inline-action" onClick={() => onObject({ chartData: [...(selected.chartData || []), { label: 'New', value: 20 }] })}><Plus size={13}/> Add data point</button></div></section> : null}
      {selected.type === 'table' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Table content</div><div className="dcx-data-editor">{tableRows.map((row, rowIndex) => <div className="dcx-table-edit-row" key={rowIndex}>{row.map((cell, columnIndex) => <input key={columnIndex} value={cell} aria-label={'Row ' + (rowIndex + 1) + ', column ' + (columnIndex + 1)} onChange={(event) => updateTableCell(rowIndex, columnIndex, event.target.value)}/>)}<button aria-label="Remove row" onClick={() => removeTableRow(rowIndex)}><X size={12}/></button></div>)}<div className="dcx-data-actions"><button className="dcx-inline-action" onClick={addTableRow}><Plus size={13}/> Add row</button><button className="dcx-inline-action" onClick={addTableColumn}><Plus size={13}/> Add column</button></div></div></section> : null}
      {selected.type === 'svg' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Vector source</div>
        <Field label="Inline SVG markup"><textarea rows={12} spellCheck={false} value={svgDraft} onChange={(event) => { setSvgDraft(event.target.value); setSvgError(''); }} placeholder="Paste SVG markup or ask AgentSam to create an illustration…"/></Field>
        <p className="dcx-muted-copy">This stays editable vector source. Canvas transforms resize the artwork without flattening it.</p>
        {svgError ? <p className="dcx-svg-error" role="alert">{svgError}</p> : null}
        <div className="dcx-field-grid"><button className="dcx-secondary-button" onClick={() => { try { onObject({ svgMarkup: sanitizeInlineSvg(svgDraft) }); setSvgError(''); } catch (error) { setSvgError(error instanceof Error ? error.message : 'SVG source is invalid.'); } }}>Apply source</button><button className="dcx-secondary-button" onClick={onUploadSvg}><Upload size={14}/> Replace file</button></div>
        {onAsk ? <button className="dcx-inline-action" onClick={onAsk}><Sparkles size={13}/> Ask AgentSam to refine this SVG</button> : null}
      </section> : null}
      {selected.type === 'image' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Image</div><button className="dcx-secondary-button" onClick={onUploadImage}><Upload size={14}/> Replace image</button><Field label="Crop / fit"><select value={selected.imageFit || 'cover'} onChange={(event) => onObject({ imageFit: event.target.value as CreativeObject['imageFit'] })}><option value="cover">Fill frame</option><option value="contain">Fit image</option><option value="fill">Stretch</option></select></Field><Field label="Crop position"><select value={selected.imagePosition || 'center'} onChange={(event) => onObject({ imagePosition: event.target.value as CreativeObject['imagePosition'] })}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></Field><Field label="Link URL"><input type="url" value={selected.link || ''} placeholder="https://…" onChange={(event) => onObject({ link: event.target.value || undefined })}/></Field><div className="dcx-field-grid"><Field label="Border color"><input type="color" value={selected.borderColor || '#ffffff'} onChange={(event) => onObject({ borderColor: event.target.value, borderWidth: selected.borderWidth || 1, borderStyle: 'solid' })}/></Field><Field label="Border width"><input type="number" min="0" max="24" value={selected.borderWidth || 0} onChange={(event) => onObject({ borderWidth: Number(event.target.value), borderStyle: Number(event.target.value) ? 'solid' : 'none' })}/></Field></div><AlignmentControls onAlign={onAlign}/></section> : null}
      <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Appearance</div><Field label="Opacity"><input type="range" min="0" max="100" value={opacity} onChange={(event) => onObject({ opacity: Number(event.target.value) / 100 })}/></Field></section>
      <div className="dcx-inspector-actions"><button className="dcx-danger-button" onClick={() => onObject({ name: '__delete__' })}><Trash2 size={14}/> Delete object</button></div>
    </> : <>
      <Field label="Slide name"><input value={slide.name} onChange={(event) => onSlide({ name: event.target.value })}/></Field>
      <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Background</div><Field label="Color"><input type="color" value={slide.background} onChange={(event) => onSlide({ background: event.target.value })}/></Field>
        <button className="dcx-secondary-button" onClick={onUploadBackground}><Image size={14}/> {slide.backgroundImage ? 'Replace background image' : 'Add background image'}</button>
        {onGenerateBackground ? <button className="dcx-inline-action" onClick={onGenerateBackground}><Palette size={13}/> Generate with AgentSam</button> : null}
        {slide.backgroundImage ? <button className="dcx-inline-action" onClick={() => onSlide({ backgroundImage: undefined })}>Remove background image</button> : null}
      </section>
      <Field label="Speaker notes"><textarea rows={4} value={slide.notes} onChange={(event) => onSlide({ notes: event.target.value })} placeholder="Notes for this slide"/></Field>
      <p className="dcx-muted-copy">Select an object on the slide to edit its properties.</p>
    </>}
  </div>;
}

function SourcePanel({ title, value, filename }: { title: string; value: string; filename: string }) {
  const copy = () => { if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(value); };
  return <div className="dcx-source-panel"><div className="dcx-source-panel-heading"><div><strong>{title}</strong><small>{filename} · Read-only document source</small></div><div><button className="dcx-inline-action" onClick={copy}><Copy size={13}/> Copy</button><button className="dcx-inline-action" onClick={() => download(filename, JSON.parse(value))}><Download size={13}/> Export</button></div></div><textarea readOnly spellCheck={false} value={value} aria-label={title}/></div>;
}

function SlideEditor({ artifact, onChange, onAsk, leading, documentActions, assistant, assistantOpen, onAssistantOpenChange, assistantDock, onAssistantDockChange }: { artifact: CreativeArtifact; onChange: (data: SlidesDocument) => void; onAsk?: (context: AskContext) => void } & EditorChromeProps) {
  const doc = artifact.data as SlidesDocument;
  const [slideId, setSlideId] = useState(doc.slides[0]?.id || '');
  const [selectedId, setSelectedId] = useState('');
  const [tool, setTool] = useState<Tool>('select');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [overview, setOverview] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [present, setPresent] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [presentNotes, setPresentNotes] = useState(false);
  const [explorerTab, setExplorerTab] = useState<'slides' | 'layers'>('slides');
  const [draggedSlideId, setDraggedSlideId] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [showBounds, setShowBounds] = useState(false);
  const [history, setHistory] = useState<SlidesDocument[]>([doc]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const svgInput = useRef<HTMLInputElement>(null);
  const [svgImportError, setSvgImportError] = useState('');
  const backgroundInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const slide = doc.slides.find((item) => item.id === slideId) || doc.slides[0];
  const selected = slide?.objects.find((item) => item.id === selectedId);
  const viewport = useCanvasZoom(1200, 675, !!slide, tool === 'hand');
  const { areaRef: canvasAreaRef, zoom, change: setZoom, fit: fitCanvas } = viewport;
  const selectionAnchor = useSelectionToolbarAnchor(canvasAreaRef, selected?.id || '', [zoom, selected?.x, selected?.y, selected?.w, selected?.h].join(':'));
  const documentColors = Array.from(new Set((slide?.objects || []).flatMap((item) => [item.color, item.fill, item.borderColor].filter((value): value is string => !!value))));
  const presentSlide = doc.slides[presentIndex] || doc.slides[0];
  useEffect(() => { if (!doc.slides.some((item) => item.id === slideId)) setSlideId(doc.slides[0]?.id || ''); }, [doc.slides, slideId]);
  useEffect(() => {
    if (!present) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresent(false);
      if (event.key === 'ArrowRight') setPresentIndex((index) => Math.min(doc.slides.length - 1, index + 1));
      if (event.key === 'ArrowLeft') setPresentIndex((index) => Math.max(0, index - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [present, doc.slides.length]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName))) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey && historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1; setHistoryIndex(nextIndex); onChange(history[nextIndex]);
      } else if (!event.shiftKey && historyIndex > 0) {
        const nextIndex = historyIndex - 1; setHistoryIndex(nextIndex); onChange(history[nextIndex]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, historyIndex, onChange]);
  const updateDoc = (next: SlidesDocument) => {
    const nextHistory = [...history.slice(0, historyIndex + 1), next];
    setHistory(nextHistory); setHistoryIndex(nextHistory.length - 1); onChange(next);
  };
  const undo = () => { if (historyIndex > 0) { const nextIndex = historyIndex - 1; setHistoryIndex(nextIndex); onChange(history[nextIndex]); } };
  const redo = () => { if (historyIndex < history.length - 1) { const nextIndex = historyIndex + 1; setHistoryIndex(nextIndex); onChange(history[nextIndex]); } };
  const updateSlide = (patch: Partial<Slide>) => updateDoc({ ...doc, slides: doc.slides.map((item) => item.id === slide.id ? { ...item, ...patch } : item) });
  const updateObject = (id: string, patch: Partial<CreativeObject>) => {
    updateSlide({ objects: patch.name === '__delete__' ? slide.objects.filter((item) => item.id !== id) : slide.objects.map((item) => item.id === id ? { ...item, ...patch } : item) });
    if (patch.name === '__delete__') setSelectedId('');
  };
  const addObjectAt = (type: Tool, x = 400, y = 240, shapeKind?: ShapeKind) => {
    if (!slide || type === 'select' || type === 'hand') return;
    const object = makeObject(type, type === 'text' ? Math.max(24, x) : x, type === 'text' ? Math.max(24, y) : y, shapeKind);
    updateSlide({ objects: [...slide.objects, object] });
    setSelectedId(object.id); setTool('select');
    if (type === 'media') uploadVideo();
  };
  const addObject = (type: Tool) => addObjectAt(type, type === 'text' ? 92 : 400, type === 'text' ? 90 : 240);
  const addShape = (kind: ShapeKind) => addObjectAt('shape', 400, 240, kind);
  const addChart = (chartType: ChartType) => {
    const object = makeObject('chart', 400, 240);
    object.chartType = chartType;
    object.name = chartType[0].toUpperCase() + chartType.slice(1) + ' chart';
    updateSlide({ objects: [...slide.objects, object] }); setSelectedId(object.id);
  };
  const uploadImage = () => imageInput.current?.click();
  const uploadSvg = () => svgInput.current?.click();
  const uploadVideo = () => videoInput.current?.click();
  const uploadBackground = () => backgroundInput.current?.click();
  const acceptBackground = (file?: File) => {
    if (!file || !slide || file.size > 3_000_000) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') updateSlide({ backgroundImage: reader.result }); };
    reader.readAsDataURL(file);
  };
  const acceptImage = (file?: File) => {
    if (!file || !slide || file.size > 3_000_000) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      if (selected?.type === 'image') updateObject(selected.id, { src: reader.result, name: file.name, label: file.name });
      else {
        const object = { ...makeObject('image', 400, 220), src: reader.result, name: file.name, label: file.name };
        updateSlide({ objects: [...slide.objects, object] }); setSelectedId(object.id);
      }
    };
    reader.readAsDataURL(file);
  };
  const createSvg = () => {
    if (!slide) return;
    const object: CreativeObject = {
      id: makeId('object'),
      type: 'svg',
      name: 'New illustration',
      x: 420,
      y: 220,
      w: 320,
      h: 220,
      svgMarkup: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"></svg>',
    };
    updateSlide({ objects: [...slide.objects, object] });
    setSelectedId(object.id);
    setInspectorOpen(true);
  };
  const acceptSvg = async (file?: File) => {
    if (!file || !slide || file.size > 256_000) return;
    try {
      const svgMarkup = sanitizeInlineSvg(await file.text());
      const name = file.name.replace(/\.svg$/i, '') || 'SVG illustration';
      if (selected?.type === 'svg') updateObject(selected.id, { svgMarkup, name });
      else {
        const object: CreativeObject = { id: makeId('object'), type: 'svg', name, x: 420, y: 220, w: 320, h: 220, svgMarkup };
        updateSlide({ objects: [...slide.objects, object] });
        setSelectedId(object.id);
      }
      setSvgImportError('');
      setInspectorOpen(true);
    } catch (error) {
      setSvgImportError(error instanceof Error ? error.message : 'SVG could not be imported.');
    }
  };
  const acceptVideo = (file?: File) => {
    if (!file || !slide || file.size > 3_000_000) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      if (selected?.type === 'media') updateObject(selected.id, { src: reader.result, name: file.name, label: file.name, mediaType: 'video' as const });
      else {
        const object = { ...makeObject('media', 400, 220), src: reader.result, name: file.name, label: file.name, mediaType: 'video' as const };
        updateSlide({ objects: [...slide.objects, object] }); setSelectedId(object.id);
      }
    };
    reader.readAsDataURL(file);
  };
  const addSlide = (kind: string) => {
    const next = makeSlidePreset(kind);
    next.name = kind === 'Blank' ? 'Slide ' + (doc.slides.length + 1) : kind;
    updateDoc({ slides: [...doc.slides, next] }); setSlideId(next.id); setSelectedId(''); setExplorerTab('slides');
  };
  const addComment = (value: string) => updateSlide({ comments: [...slide.comments, { id: makeId('comment'), text: value, targetId: selectedId || undefined, createdAt: new Date().toISOString() }] });
  const alignSelected = (alignment: AlignCommand) => {
    if (!selected || !slide) return;
    const patch = alignment === 'left' ? { x: 0 } : alignment === 'center' ? { x: Math.round((1200 - selected.w) / 2) } : alignment === 'right' ? { x: Math.max(0, 1200 - selected.w) } : alignment === 'top' ? { y: 0 } : alignment === 'middle' ? { y: Math.round((675 - selected.h) / 2) } : { y: Math.max(0, 675 - selected.h) };
    updateObject(selected.id, patch);
  };
  const duplicateLayer = (id: string) => {
    const original = slide.objects.find((item) => item.id === id);
    if (!original) return;
    const copy = { ...original, id: makeId('object'), name: original.name + ' copy', x: original.x + 24, y: original.y + 24 };
    updateSlide({ objects: [...slide.objects, copy] }); setSelectedId(copy.id);
  };
  const moveLayer = (id: string, direction: -1 | 1) => {
    const index = slide.objects.findIndex((item) => item.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= slide.objects.length) return;
    const objects = [...slide.objects];
    const [item] = objects.splice(index, 1);
    objects.splice(nextIndex, 0, item);
    updateSlide({ objects });
  };
  const startPresent = (withNotes: boolean) => {
    setPresentIndex(Math.max(0, doc.slides.findIndex((item) => item.id === slide.id)));
    setPresentNotes(withNotes); setPresent(true);
  };
  const explorer = <div className="dcx-explorer-content">
    <div className="dcx-panel-title"><strong>Structure</strong><span>{explorerTab === 'slides' ? doc.slides.length + ' slides' : slide.objects.length + ' layers'}</span></div>
    <div className="dcx-explorer-tabs" role="tablist" aria-label="Document structure"><button role="tab" aria-selected={explorerTab === 'slides'} className={explorerTab === 'slides' ? 'active' : ''} onClick={() => setExplorerTab('slides')}>Slides</button><button role="tab" aria-selected={explorerTab === 'layers'} className={explorerTab === 'layers' ? 'active' : ''} onClick={() => setExplorerTab('layers')}>Layers</button></div>
    {explorerTab === 'slides' ? <>
      <div className="dcx-slide-list" aria-label="Slides">{doc.slides.map((item, index) => <button
        key={item.id}
        draggable
        className={'dcx-slide-thumb' + (item.id === slide.id ? ' active' : '') + (draggedSlideId === item.id ? ' is-dragging' : '')}
        aria-label={'Slide ' + (index + 1) + ': ' + item.name + '. Drag to reorder'}
        onClick={() => { setSlideId(item.id); setSelectedId(''); setCommentsOpen(false); }}
        onDragStart={(event) => { setDraggedSlideId(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const sourceId = draggedSlideId || event.dataTransfer.getData('text/plain'); const slides = reorderSlides(doc.slides, sourceId, item.id); if (slides !== doc.slides) updateDoc({ ...doc, slides }); setDraggedSlideId(''); }}
        onDragEnd={() => setDraggedSlideId('')}
      ><span className="dcx-thumb-number">{index + 1}</span><span className="dcx-thumb-preview" style={{ background: item.backgroundImage ? 'linear-gradient(135deg,#2b3038,#14161a)' : item.background }}><span>{item.objects.find((o) => o.type === 'text')?.text?.slice(0, 36) || item.name}</span></span><span className="dcx-thumb-label">{item.name}</span></button>)}</div>
      <SlideLayoutMenu onAdd={addSlide} label="Add slide"/>
    </> : <>
      {slide.objects.length ? <div className="dcx-layer-list">{[...slide.objects].reverse().map((object) => <div className={'dcx-layer-row' + (object.id === selectedId ? ' active' : '')} key={object.id}><button className="dcx-layer-select" onClick={() => setSelectedId(object.id)}><span className="dcx-layer-kind">{object.type === 'text' ? <Type size={13}/> : object.type === 'image' ? <Image size={13}/> : object.type === 'svg' ? <Code2 size={13}/> : object.type === 'chart' ? <BarChart3 size={13}/> : object.type === 'table' ? <Table2 size={13}/> : <Square size={13}/>}</span><span>{object.name}</span></button><div className="dcx-layer-actions"><button title="Move up" aria-label={'Move ' + object.name + ' up'} onClick={() => moveLayer(object.id, 1)}>↑</button><button title="Move down" aria-label={'Move ' + object.name + ' down'} onClick={() => moveLayer(object.id, -1)}>↓</button><button title="Duplicate" aria-label={'Duplicate ' + object.name} onClick={() => duplicateLayer(object.id)}><Copy size={11}/></button><button title="Delete" aria-label={'Delete ' + object.name} onClick={() => updateObject(object.id, { name: '__delete__' })}><Trash2 size={11}/></button></div></div>)}</div> : <EmptyState title="No layers yet" description="Insert text, shapes, images, SVG illustrations, charts, or tables to build this slide."/>}
      <button className="dcx-add-slide" onClick={() => addObject('text')}><Plus size={15}/> Add text layer</button>
    </>}
  </div>;
  const inspector = inspectorOpen ? <div className="dcx-inspector-shell">
    <SlideInspector slide={slide} selected={selected} commentsOpen={commentsOpen} onSlide={updateSlide} onObject={(patch) => selected && updateObject(selected.id, patch)} onAddComment={addComment} onToggleComments={() => setCommentsOpen(!commentsOpen)} onUploadImage={uploadImage} onUploadSvg={uploadSvg} onUploadBackground={uploadBackground} onGenerateBackground={onAsk ? () => onAsk({ artifactId: artifact.id, artifactType: 'slides', title: artifact.name, selection: { id: slide.id, kind: 'slide-background', label: 'Generate background image' } }) : undefined} onAsk={onAsk && selected ? () => onAsk({ artifactId: artifact.id, artifactType: 'slides', title: artifact.name, selection: { id: selected.id, kind: selected.type, label: selected.name, source: selected.type === 'svg' ? selected.svgMarkup?.slice(0, 12000) : undefined } }) : undefined} onAlign={alignSelected}/>
  </div> : undefined;
  const commands = <>
    <div className="dcx-command-group">
      <SlideLayoutMenu onAdd={addSlide} label="New slide"/>
      <ViewMenu grid={showGrid} snap={snapToGrid} guides={showGuides} bounds={showBounds} onToggleGrid={() => setShowGrid((value) => !value)} onToggleSnap={() => setSnapToGrid((value) => !value)} onToggleGuides={() => setShowGuides((value) => !value)} onToggleBounds={() => setShowBounds((value) => !value)}/>
      <button className={'dcx-command-button' + (notesOpen ? ' active' : '')} onClick={() => setNotesOpen(!notesOpen)}>Speaker notes</button>
      <button className={'dcx-command-icon' + (inspectorOpen ? ' active' : '')} title={inspectorOpen ? 'Hide properties' : 'Show properties'} aria-label={inspectorOpen ? 'Hide properties' : 'Show properties'} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}><Settings2 size={15}/></button>
      <button className="dcx-command-icon" title="Undo" aria-label="Undo" disabled={historyIndex === 0} onClick={undo}><Undo2 size={15}/></button>
      <button className="dcx-command-icon" title="Redo" aria-label="Redo" disabled={historyIndex >= history.length - 1} onClick={redo}><Redo2 size={15}/></button>
    </div>
    <div className="dcx-command-group">
      <ZoomControls zoom={zoom} onChange={setZoom} onFit={fitCanvas} grid={showGrid} onToggleGrid={() => setShowGrid(!showGrid)} showGridToggle={false}/>
      <button className="dcx-command-button" onClick={() => setOverview(true)}>Overview</button>
      <PresentMenu onPresent={() => startPresent(false)} onPresentWithNotes={() => startPresent(true)}/>
      <button className="dcx-command-icon" title="Export presentation JSON" aria-label="Export presentation JSON" onClick={() => download(artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json', artifact)}><Download size={15}/></button>
    </div>
  </>;
  return <>
    {overview ? <section className="dcx-slide-overview" aria-label="Presentation overview">
      <header className="dcx-slide-overview-header">
        <div className="dcx-slide-overview-leading">{leading}</div>
        <div className="dcx-slide-overview-actions">
          <button className="dcx-command-button" onClick={() => setOverview(false)}><Type size={15}/> Edit</button>
          <PresentMenu onPresent={() => startPresent(false)} onPresentWithNotes={() => startPresent(true)}/>
        </div>
      </header>
      <div className="dcx-slide-overview-list">
        {doc.slides.map((item, index) => <div key={item.id} className={'dcx-slide-overview-card' + (item.id === slide?.id ? ' active' : '')}>
          <div inert className="dcx-slide-overview-preview"><EditableSurface width={1200} height={675} background={item.backgroundImage ? 'url("' + item.backgroundImage + '") center / cover no-repeat' : item.background} objects={item.objects} selectedId="" onSelect={() => {}} onChange={() => {}}/></div>
          <button className="dcx-slide-overview-select" aria-label={'Select slide ' + (index + 1) + ': ' + item.name} aria-pressed={item.id === slide?.id} onClick={() => { setSlideId(item.id); setSelectedId(''); }} />
        </div>)}
        {!doc.slides.length ? <EmptyState title="No slides yet" action={<button className="dcx-primary-button" onClick={() => { addSlide('Blank'); setOverview(false); }}>Add a slide</button>}/> : null}
      </div>
    </section> : <DesignWorkspaceFrame snapshot={snapshotFor(artifact, selected ? { id: selected.id, kind: selected.type } : { id: slide?.id || '', kind: 'slide' })} leading={leading} commands={commands} documentActions={documentActions} explorer={explorer} inspector={inspector} assistant={assistant} assistantOpen={assistantOpen} onAssistantOpenChange={onAssistantOpenChange} assistantDock={assistantDock} onAssistantDockChange={onAssistantDockChange} inspectorSheetOpen={commentsOpen && inspectorOpen} onInspectorSheetDismiss={() => { setCommentsOpen(false); setInspectorOpen(false); }} stageLabel="Slides editor" className="dcx-shared-frame">
      {slide ? <div className="dcx-editor-stage dcx-slides-stage">
        <div ref={canvasAreaRef} tabIndex={0} aria-label="Slide canvas; scroll to zoom, middle-drag to pan" className={'dcx-slide-canvas-area dcx-zoom-viewport' + (showGrid ? ' is-grid' : '') + (tool === 'hand' ? ' is-hand' : '')}>
          <div className="dcx-zoom-world" style={viewport.worldStyle}><div className="dcx-canvas-zoom-wrap" style={viewport.artboardStyle}>
            <EditableSurface width={1200} height={675} background={slide.backgroundImage ? 'url("' + slide.backgroundImage + '") center / cover no-repeat' : slide.background} objects={slide.objects} selectedId={selectedId} onSelect={setSelectedId} onChange={updateObject} onPlace={tool === 'select' || tool === 'hand' ? undefined : (x, y) => addObjectAt(tool, x, y)} snapToGrid={snapToGrid} showBounds={showBounds} showGuides={showGuides} panEnabled={tool === 'hand'}/>
          </div></div>
          {selected && selectionAnchor ? <SelectionFormattingToolbar object={selected} anchor={selectionAnchor} colors={documentColors} onChange={(patch) => updateObject(selected.id, patch)} onMore={() => setInspectorOpen(true)} onComment={() => { setCommentsOpen(true); setInspectorOpen(true); }} onAlign={alignSelected} onAsk={onAsk ? () => onAsk({ artifactId: artifact.id, artifactType: 'slides', title: artifact.name, selection: { id: selected.id, kind: selected.type, label: selected.name, source: selected.type === 'svg' ? selected.svgMarkup?.slice(0, 12000) : undefined } }) : undefined}/> : null}
        </div>
        <SlideInsertToolbar
          activeTool={tool === 'hand' ? 'hand' : 'select'}
          onToolChange={(value) => setTool(value)}
          onText={() => addObject('text')}
          onImage={uploadImage}
          onNewSvg={createSvg}
          onMedia={uploadVideo}
          onTable={() => addObject('table')}
          onShape={addShape}
          onChart={addChart}
          onComment={() => { setCommentsOpen(true); setInspectorOpen(true); }}
          onAsk={onAsk ? () => onAsk({ artifactId: artifact.id, artifactType: 'slides', title: artifact.name, selection: selected ? { id: selected.id, kind: selected.type, label: selected.name, source: selected.type === 'svg' ? selected.svgMarkup?.slice(0, 12000) : undefined } : undefined }) : undefined}
        />
        {notesOpen ? <div className="dcx-speaker-notes"><textarea aria-label="Speaker notes" value={slide.notes} onChange={(event) => updateSlide({ notes: event.target.value })} placeholder="Add speaker notes for this slide"/></div> : null}
        <div className="dcx-stage-footer"><span>Slide {doc.slides.findIndex((item) => item.id === slide.id) + 1} of {doc.slides.length}</span><button onClick={() => setNotesOpen(!notesOpen)}>{notesOpen ? 'Hide speaker notes' : 'Speaker notes'}</button><span>16:9 · {zoom}%</span></div>
      </div> : <EmptyState title="No slides yet" action={<button className="dcx-primary-button" onClick={() => addSlide('Blank')}><Plus size={15}/> Add a slide</button>}/>}
    </DesignWorkspaceFrame>}
    <input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => { acceptImage(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
    <input ref={svgInput} hidden type="file" accept=".svg,image/svg+xml" onChange={(event) => { void acceptSvg(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
    {svgImportError ? <div className="dcx-svg-error" role="alert">{svgImportError}</div> : null}
    <input ref={backgroundInput} hidden type="file" accept="image/*" onChange={(event) => { acceptBackground(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
    <input ref={videoInput} hidden type="file" accept="video/*" onChange={(event) => { acceptVideo(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
    {present && presentSlide ? <div className="dcx-present-mode"><div className="dcx-present-topbar"><span>{artifact.name}</span><span>{presentIndex + 1} / {doc.slides.length}</span><button className="dcx-present-close" onClick={() => setPresent(false)}><X size={17}/> Exit</button></div><div className="dcx-present-slide"><EditableSurface width={1200} height={675} background={presentSlide.backgroundImage ? 'url("' + presentSlide.backgroundImage + '") center / cover no-repeat' : presentSlide.background} objects={presentSlide.objects} selectedId="" onSelect={() => {}} onChange={() => {}}/></div>{presentNotes && presentSlide.notes ? <div className="dcx-present-notes"><strong>Speaker notes</strong><p>{presentSlide.notes}</p></div> : null}<div className="dcx-present-controls"><button disabled={presentIndex === 0} onClick={() => setPresentIndex((index) => Math.max(0, index - 1))}>Previous</button><button disabled={presentIndex >= doc.slides.length - 1} onClick={() => setPresentIndex((index) => Math.min(doc.slides.length - 1, index + 1))}>Next</button></div></div> : null}
  </>;
}

function DesignCommentsPanel({ comments, selected, targetLabel, onAddComment, onResolve, onClose, onAskComment }: {
  comments: CreativeComment[]; selected?: CreativeObject; targetLabel: string; onAddComment: (text: string) => void; onResolve: (id: string) => void; onClose: () => void; onAskComment?: (text: string) => void;
}) {
  const [comment, setComment] = useState('');
  const [query, setQuery] = useState('');
  const [askAgent, setAskAgent] = useState(false);
  const visible = comments.filter((item) => !query || item.text.toLowerCase().includes(query.toLowerCase()));
  return <div className="dcx-inspector-content">
    <div className="dcx-inspector-heading"><strong>Comments <span className="dcx-comment-count">{comments.length}</span></strong><button onClick={onClose} aria-label="Close comments"><X size={15}/></button></div>
    <div className="dcx-comment-search"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search comments"/></div>
    {visible.length ? <div className="dcx-comment-list">{visible.map((item) => <div className={'dcx-comment' + (item.resolved ? ' is-resolved' : '')} key={item.id}><p>{item.text}</p><small>{item.targetId ? 'Attached to selected object' : 'Canvas comment'} · {formatDate(item.createdAt)}</small><button className="dcx-inline-action" onClick={() => onResolve(item.id)}>{item.resolved ? 'Reopen' : 'Resolve'}</button></div>)}</div> : <EmptyState title={comments.length ? 'No matching comments' : 'No comments yet'} description={comments.length ? 'Try another search.' : 'Add a comment to start a conversation on this canvas.'} icon={<MessageSquare size={18}/>}/>}
    <form className="dcx-comment-entry" onSubmit={(event) => { event.preventDefault(); const text = comment.trim(); if (text) { onAddComment(text); if (askAgent) onAskComment?.(text); setComment(''); setAskAgent(false); } }}>
      <div className="dcx-comment-target">{targetLabel}{selected ? ' › ' + (selected.name || selected.type) : ''}</div>
      <div className="dcx-comment-composer">
        <textarea aria-label="Add a comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" rows={2}/>
        <div className="dcx-comment-actions">
          {onAskComment ? <label className="dcx-comment-agent-toggle"><input type="checkbox" role="switch" checked={askAgent} onChange={(event) => setAskAgent(event.target.checked)}/> Add to AgentSam chat</label> : null}
          <button type="submit" className="dcx-comment-submit" aria-label="Add comment" disabled={!comment.trim()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button>
        </div>
      </div>
    </form>
  </div>;
}

function DesignInspector({ board, selected, onBoard, onObject, onDelete, onUploadImage, onAlign, onToggleComments, commentsCount = 0 }: {
  board: Artboard; selected?: CreativeObject; onBoard: (patch: Partial<Artboard>) => void; onObject: (patch: Partial<CreativeObject>) => void; onDelete: () => void; onUploadImage: () => void; onAlign: (alignment: AlignCommand) => void; onToggleComments: () => void; commentsCount?: number;
}) {
  const opacity = Math.round((selected?.opacity ?? 1) * 100);
  return <div className="dcx-inspector-content">
    <div className="dcx-inspector-heading"><strong>{selected ? selected.type === 'text' ? 'Text' : selected.type === 'shape' ? 'Shape' : selected.type === 'image' ? 'Image' : selected.type === 'chart' ? 'Chart' : selected.type === 'table' ? 'Table' : 'Video' : 'Artboard'}</strong><button onClick={onToggleComments} aria-label="Show comments"><MessageSquare size={15}/><span className="dcx-comment-count">{commentsCount}</span></button></div>
    {selected ? <>
      <Field label="Name"><input value={selected.name} onChange={(event) => onObject({ name: event.target.value })}/></Field>
      <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Size & position</div><div className="dcx-field-grid"><Field label="X"><input type="number" value={Math.round(selected.x)} onChange={(event) => onObject({ x: Number(event.target.value) })}/></Field><Field label="Y"><input type="number" value={Math.round(selected.y)} onChange={(event) => onObject({ y: Number(event.target.value) })}/></Field></div><div className="dcx-field-grid"><Field label="Width"><input type="number" min="24" value={Math.round(selected.w)} onChange={(event) => onObject({ w: Math.max(24, Number(event.target.value)) })}/></Field><Field label="Height"><input type="number" min="24" value={Math.round(selected.h)} onChange={(event) => onObject({ h: Math.max(24, Number(event.target.value)) })}/></Field></div><AlignmentControls onAlign={onAlign}/></section>
      {selected.type === 'text' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Typography</div><Field label="Text"><textarea rows={4} value={selected.text || ''} onChange={(event) => onObject({ text: event.target.value })}/></Field><div className="dcx-field-grid"><Field label="Font size"><input type="number" min="8" max="240" value={selected.fontSize || 28} onChange={(event) => onObject({ fontSize: Number(event.target.value) })}/></Field><Field label="Weight"><select value={selected.weight || 500} onChange={(event) => onObject({ weight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option></select></Field></div><Field label="Typeface"><select value={selected.fontFamily || 'Inter'} onChange={(event) => onObject({ fontFamily: event.target.value })}><option>Inter</option><option>Arial</option><option>Helvetica Neue</option><option>Georgia</option><option>Times New Roman</option></select></Field><div className="dcx-field-grid"><Field label="Text color"><input type="color" value={selected.color || '#17191d'} onChange={(event) => onObject({ color: event.target.value })}/></Field><Field label="Align"><select value={selected.align || 'left'} onChange={(event) => onObject({ align: event.target.value as CreativeObject['align'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></Field></div><div className="dcx-field-grid"><Field label="Italic"><input type="checkbox" checked={!!selected.italic} onChange={(event) => onObject({ italic: event.target.checked })}/></Field><Field label="Underline"><input type="checkbox" checked={!!selected.underline} onChange={(event) => onObject({ underline: event.target.checked })}/></Field></div><Field label="Vertical alignment"><select value={selected.verticalAlign || 'top'} onChange={(event) => onObject({ verticalAlign: event.target.value as CreativeObject['verticalAlign'] })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></Field><Field label="Link URL"><input type="url" value={selected.link || ''} placeholder="https://…" onChange={(event) => onObject({ link: event.target.value || undefined })}/></Field></section> : null}
      {selected.type === 'shape' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Appearance</div><Field label="Shape"><select value={selected.shape || 'rect'} onChange={(event) => onObject({ shape: event.target.value as CreativeObject['shape'] })}><option value="rect">Rectangle</option><option value="circle">Ellipse</option><option value="diamond">Diamond</option><option value="triangle">Triangle</option><option value="star">Star</option><option value="arrow">Arrow</option><option value="plus">Plus</option><option value="chevron">Chevron</option><option value="callout">Callout</option><option value="line">Line</option></select></Field><Field label="Fill type"><select value={selected.fillType || 'solid'} onChange={(event) => onObject({ fillType: event.target.value as CreativeObject['fillType'] })}><option value="solid">Solid</option><option value="gradient">Gradient</option><option value="image">Image fill</option></select></Field>{selected.fillType === 'gradient' ? <><div className="dcx-field-grid"><Field label="Start color"><input type="color" value={selected.gradientFrom || selected.fill || '#397ff2'} onChange={(event) => onObject({ gradientFrom: event.target.value })}/></Field><Field label="End color"><input type="color" value={selected.gradientTo || '#8a6cf0'} onChange={(event) => onObject({ gradientTo: event.target.value })}/></Field></div><Field label="Gradient angle"><input type="number" min="0" max="360" value={selected.gradientAngle ?? 135} onChange={(event) => onObject({ gradientAngle: Number(event.target.value) })}/></Field></> : <Field label="Fill"><input type="color" value={selected.fill || '#397ff2'} onChange={(event) => onObject({ fill: event.target.value, fillType: 'solid' })}/></Field>}<Field label="Image fill URL"><input type="url" value={selected.fillImage || ''} placeholder="https://…" onChange={(event) => onObject({ fillImage: event.target.value || undefined, fillType: 'image' })}/></Field><Field label="Shape text"><textarea rows={2} value={selected.text || ''} onChange={(event) => onObject({ text: event.target.value })} placeholder="Optional label"/></Field><div className="dcx-field-grid"><Field label="Text color"><input type="color" value={selected.color || '#ffffff'} onChange={(event) => onObject({ color: event.target.value })}/></Field><Field label="Text size"><input type="number" min="8" max="96" value={selected.fontSize || 18} onChange={(event) => onObject({ fontSize: Number(event.target.value) })}/></Field></div><Field label="Text typeface"><select value={selected.fontFamily || 'Inter'} onChange={(event) => onObject({ fontFamily: event.target.value })}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></Field><div className="dcx-field-grid"><Field label="Corner radius"><input type="number" min="0" max="96" value={selected.radius || 0} onChange={(event) => onObject({ radius: Number(event.target.value) })}/></Field><Field label="Border color"><input type="color" value={selected.borderColor || '#ffffff'} onChange={(event) => onObject({ borderColor: event.target.value, borderWidth: selected.borderWidth || 1, borderStyle: selected.borderStyle || 'solid' })}/></Field></div><div className="dcx-field-grid"><Field label="Border width"><input type="number" min="0" max="24" value={selected.borderWidth || 0} onChange={(event) => onObject({ borderWidth: Number(event.target.value) })}/></Field><Field label="Border style"><select value={selected.borderStyle || 'none'} onChange={(event) => onObject({ borderStyle: event.target.value as CreativeObject['borderStyle'] })}><option value="none">None</option><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></Field></div><Field label="Shadow"><select value={selected.shadow || 'none'} onChange={(event) => onObject({ shadow: event.target.value === 'none' ? undefined : event.target.value })}><option value="none">None</option><option value="0 2px 8px rgba(0,0,0,.14)">Soft</option><option value="0 8px 22px rgba(0,0,0,.18)">Medium</option><option value="0 16px 40px rgba(0,0,0,.24)">Strong</option></select></Field></section> : null}
      {selected.type === 'image' ? <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Image</div><button className="dcx-secondary-button" onClick={onUploadImage}><Upload size={14}/> Replace image</button><Field label="Crop / fit"><select value={selected.imageFit || 'cover'} onChange={(event) => onObject({ imageFit: event.target.value as CreativeObject['imageFit'] })}><option value="cover">Fill frame</option><option value="contain">Fit image</option><option value="fill">Stretch</option></select></Field><Field label="Crop position"><select value={selected.imagePosition || 'center'} onChange={(event) => onObject({ imagePosition: event.target.value as CreativeObject['imagePosition'] })}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></Field><Field label="Link URL"><input type="url" value={selected.link || ''} placeholder="https://…" onChange={(event) => onObject({ link: event.target.value || undefined })}/></Field><div className="dcx-field-grid"><Field label="Border color"><input type="color" value={selected.borderColor || '#ffffff'} onChange={(event) => onObject({ borderColor: event.target.value, borderWidth: selected.borderWidth || 1, borderStyle: 'solid' })}/></Field><Field label="Border width"><input type="number" min="0" max="24" value={selected.borderWidth || 0} onChange={(event) => onObject({ borderWidth: Number(event.target.value), borderStyle: Number(event.target.value) ? 'solid' : 'none' })}/></Field></div></section> : null}
      <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Appearance</div><Field label="Opacity"><input type="range" min="0" max="100" value={opacity} onChange={(event) => onObject({ opacity: Number(event.target.value) / 100 })}/></Field></section>
      <button className="dcx-danger-button" onClick={onDelete}><Trash2 size={14}/> Delete object</button>
    </> : <>
      <Field label="Name"><input value={board.name} onChange={(event) => onBoard({ name: event.target.value })}/></Field>
      <section className="dcx-inspector-section"><div className="dcx-inspector-section-heading">Artboard size</div><div className="dcx-field-grid"><Field label="Width"><input type="number" min="160" value={board.width} onChange={(event) => onBoard({ width: Math.max(160, Number(event.target.value)) })}/></Field><Field label="Height"><input type="number" min="160" value={board.height} onChange={(event) => onBoard({ height: Math.max(160, Number(event.target.value)) })}/></Field></div><Field label="Background"><input type="color" value={board.background} onChange={(event) => onBoard({ background: event.target.value })}/></Field></section>
      <p className="dcx-muted-copy">Select an object on the artboard to edit its properties.</p>
    </>}
  </div>;
}
function DesignEditor({ artifact, onChange, onOpenReferences, onAsk, leading, documentActions, assistant, assistantOpen, onAssistantOpenChange, assistantDock, onAssistantDockChange }: { artifact: CreativeArtifact; onChange: (data: DesignDocument) => void; onOpenReferences: () => void; onAsk?: (context: AskContext) => void } & EditorChromeProps) {
  const doc = artifact.data as DesignDocument;
  const [boardId, setBoardId] = useState(doc.artboards[0]?.id || '');
  const [selectedId, setSelectedId] = useState('');
  const [tool, setTool] = useState<Tool>('select');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentPosition, setCommentPosition] = useState<{ x: number; y: number } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [showBounds, setShowBounds] = useState(false);
  const [history, setHistory] = useState<DesignDocument[]>([doc]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const board = doc.artboards.find((item) => item.id === boardId) || doc.artboards[0];
  const selected = board?.objects.find((item) => item.id === selectedId);
  const viewport = useCanvasZoom(board?.width || 1200, board?.height || 900, !!board, tool === 'hand');
  const { areaRef: canvasAreaRef, zoom, change: setZoom, fit: fitCanvas } = viewport;
  const selectionAnchor = useSelectionToolbarAnchor(canvasAreaRef, selected?.id || '', [zoom, selected?.x, selected?.y, selected?.w, selected?.h].join(':'));
  const documentColors = Array.from(new Set((board?.objects || []).flatMap((item) => [item.color, item.fill, item.borderColor].filter((value): value is string => !!value))));
  useEffect(() => { if (!doc.artboards.some((item) => item.id === boardId)) setBoardId(doc.artboards[0]?.id || ''); }, [doc.artboards, boardId]);
  const updateDoc = (next: DesignDocument) => {
    const nextHistory = [...history.slice(0, historyIndex + 1), next];
    setHistory(nextHistory); setHistoryIndex(nextHistory.length - 1); onChange(next);
  };
  const undo = () => { if (historyIndex > 0) { const nextIndex = historyIndex - 1; setHistoryIndex(nextIndex); onChange(history[nextIndex]); } };
  const redo = () => { if (historyIndex < history.length - 1) { const nextIndex = historyIndex + 1; setHistoryIndex(nextIndex); onChange(history[nextIndex]); } };
  const updateBoard = (patch: Partial<Artboard>) => updateDoc({ ...doc, artboards: doc.artboards.map((item) => item.id === board.id ? { ...item, ...patch } : item) });
  const addComment = (value: string, x = commentPosition?.x, y = commentPosition?.y) => { updateBoard({ comments: [...(board.comments || []), { id: makeId('comment'), text: value, targetId: selectedId || undefined, createdAt: new Date().toISOString(), x, y }] }); setCommentPosition(null); };
  const openCommentsForSelection = () => { if (selected) setCommentPosition({ x: selected.x + selected.w / 2, y: selected.y + selected.h / 2 }); setCommentsOpen(true); setInspectorOpen(true); };
  const addNoteAt = (x: number, y: number) => { const object = makeObject('shape', x, y, 'rect'); Object.assign(object, { name: 'Sticky note', text: 'Add a note', fill: '#fff2b3', color: '#34302a', w: 240, h: 160, radius: 8, shadow: '0 4px 12px rgba(0,0,0,.12)' }); updateBoard({ objects: [...board.objects, object] }); setSelectedId(object.id); setTool('select'); };
  const addPath = (points: { x: number; y: number }[]) => { const xs = points.map((point) => point.x); const ys = points.map((point) => point.y); const minX = Math.min(...xs); const minY = Math.min(...ys); const maxX = Math.max(...xs); const maxY = Math.max(...ys); const object: CreativeObject = { id: makeId('object'), type: 'path', name: 'Pen stroke', x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY), points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })), strokeColor: '#1f2937', strokeWidth: 3 }; updateBoard({ objects: [...board.objects, object] }); setSelectedId(object.id); setTool('select'); };
  const placeToolAt = (activeTool: Tool, x: number, y: number) => { if (activeTool === 'comment') { setCommentPosition({ x, y }); setCommentsOpen(true); setInspectorOpen(true); setTool('select'); return; } if (activeTool === 'note') { addNoteAt(x, y); return; } if (activeTool === 'rect') { addObjectAt('shape', x, y, 'rect'); return; } if (activeTool === 'ellipse') { addObjectAt('shape', x, y, 'circle'); return; } addObjectAt(activeTool, x, y); };
  const handleToolChange = (nextTool: Tool) => { if (nextTool === 'frame') { addBoard(); setTool('select'); return; } setTool(nextTool); };
  const updateObject = (id: string, patch: Partial<CreativeObject>) => {
    updateBoard({ objects: patch.name === '__delete__' ? board.objects.filter((item) => item.id !== id) : board.objects.map((item) => item.id === id ? { ...item, ...patch } : item) });
    if (patch.name === '__delete__') setSelectedId('');
  };
  const addBoard = (size: 'landscape' | 'square' | 'portrait' = 'landscape') => {
    const dimensions = size === 'square' ? [1080,1080] : size === 'portrait' ? [900,1200] : [1200,900];
    const next: Artboard = { id: makeId('artboard'), name: 'Artboard ' + (doc.artboards.length + 1), width: dimensions[0], height: dimensions[1], background: '#ffffff', objects: [] };
    updateDoc({ artboards: [...doc.artboards, next] }); setBoardId(next.id); setSelectedId('');
  };
  const addObjectAt = (type: Tool, x = 120, y = 130, shapeKind?: ShapeKind) => {
    if (!board || type === 'select' || type === 'hand') return;
    const object = makeObject(type, x, y, shapeKind);
    updateBoard({ objects: [...board.objects, object] }); setSelectedId(object.id); setTool('select');
    if (type === 'image') uploadImage();
  };
  const addObject = (type: Tool) => addObjectAt(type, type === 'text' ? 92 : 120, type === 'text' ? 90 : 130);
  const addShape = (kind: ShapeKind) => addObjectAt('shape', 120, 130, kind);
  const alignSelected = (alignment: AlignCommand) => {
    if (!selected || !board) return;
    const patch = alignment === 'left' ? { x: 0 } : alignment === 'center' ? { x: Math.round((board.width - selected.w) / 2) } : alignment === 'right' ? { x: Math.max(0, board.width - selected.w) } : alignment === 'top' ? { y: 0 } : alignment === 'middle' ? { y: Math.round((board.height - selected.h) / 2) } : { y: Math.max(0, board.height - selected.h) };
    updateObject(selected.id, patch);
  };
  const uploadImage = () => imageInput.current?.click();
  const acceptImage = (file?: File) => {
    if (!file || !board || file.size > 3_000_000) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      if (selected?.type === 'image') updateObject(selected.id, { src: reader.result, name: file.name, label: file.name });
      else {
        const object = { ...makeObject('image', 160, 150), src: reader.result, name: file.name, label: file.name };
        updateBoard({ objects: [...board.objects, object] }); setSelectedId(object.id);
      }
    };
    reader.readAsDataURL(file);
  };
  const duplicateLayer = (id: string) => {
    const original = board?.objects.find((item) => item.id === id);
    if (!original || !board) return;
    const copy = { ...original, id: makeId('object'), name: original.name + ' copy', x: original.x + 24, y: original.y + 24 };
    updateBoard({ objects: [...board.objects, copy] }); setSelectedId(copy.id);
  };
  const moveLayer = (id: string, direction: -1 | 1) => {
    if (!board) return;
    const index = board.objects.findIndex((item) => item.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= board.objects.length) return;
    const objects = [...board.objects]; const [item] = objects.splice(index, 1); objects.splice(nextIndex, 0, item);
    updateBoard({ objects });
  };
  const explorer = <div className="dcx-explorer-content">
    <div className="dcx-panel-title"><strong>Structure</strong><span>{board?.objects.length || 0} layers</span></div>
    <div className="dcx-artboard-list">{doc.artboards.map((item) => <button key={item.id} className={item.id === board?.id ? 'active' : ''} onClick={() => { setBoardId(item.id); setSelectedId(''); }}><Square size={14}/><span>{item.name}</span><small>{item.width} × {item.height}</small></button>)}</div>
    {board ? <><div className="dcx-panel-subheading">Layers</div>{board.objects.length ? <div className="dcx-layer-list">{[...board.objects].reverse().map((object) => <div className={'dcx-layer-row' + (object.id === selectedId ? ' active' : '')} key={object.id}><button className="dcx-layer-select" onClick={() => setSelectedId(object.id)}><Layers size={13}/><span>{object.name}</span></button><div className="dcx-layer-actions"><button title="Move up" aria-label={'Move ' + object.name + ' up'} onClick={() => moveLayer(object.id, 1)}>↑</button><button title="Move down" aria-label={'Move ' + object.name + ' down'} onClick={() => moveLayer(object.id, -1)}>↓</button><button title="Duplicate" aria-label={'Duplicate ' + object.name} onClick={() => duplicateLayer(object.id)}><Copy size={11}/></button><button title="Delete" aria-label={'Delete ' + object.name} onClick={() => updateObject(object.id, { name: '__delete__' })}><Trash2 size={11}/></button></div></div>)}</div> : <EmptyState title="No layers yet" description="Insert objects to build this artboard."/>}</> : null}
    <ArtboardMenu onAdd={addBoard}/>
  </div>;
  const inspector = board && inspectorOpen ? <div className="dcx-inspector-shell">{commentsOpen ? <DesignCommentsPanel comments={board.comments || []} selected={selected} targetLabel={board.name} onAskComment={onAsk ? (text) => onAsk({ artifactId: artifact.id, artifactType: artifact.type, title: artifact.name, selection: { id: selected?.id || board.id, kind: selected?.type || 'artboard', label: selected?.name || board.name }, comment: text }) : undefined} onAddComment={(value) => addComment(value)} onResolve={(id) => updateBoard({ comments: (board.comments || []).map((item) => item.id === id ? { ...item, resolved: !item.resolved } : item) })} onClose={() => setCommentsOpen(false)}/> : <DesignInspector board={board} selected={selected} onBoard={updateBoard} onObject={(patch) => selected && updateObject(selected.id, patch)} onDelete={() => selected && updateObject(selected.id, { name: '__delete__' })} onUploadImage={uploadImage} onAlign={alignSelected} onToggleComments={() => { setCommentsOpen(true); setInspectorOpen(true); }} commentsCount={(board.comments || []).length}/>}</div> : undefined;
  const commands = <>
    <div className="dcx-command-group"><ArtboardMenu onAdd={addBoard}/><InsertMenu onText={() => addObject('text')} onImage={uploadImage} onShape={addShape}/><button className="dcx-command-button" onClick={onOpenReferences}><Library size={15}/> Source library</button><button className={'dcx-command-button' + (commentsOpen ? ' active' : '')} onClick={() => { setCommentsOpen((value) => !value); setInspectorOpen(true); }}><MessageSquare size={14}/> Comments</button><button className="dcx-command-icon" title="Undo" aria-label="Undo" disabled={historyIndex === 0} onClick={undo}><Undo2 size={15}/></button><button className="dcx-command-icon" title="Redo" aria-label="Redo" disabled={historyIndex >= history.length - 1} onClick={redo}><Redo2 size={15}/></button></div>
    <div className="dcx-command-group">{onAsk ? <button className="dcx-command-button" onClick={() => onAsk({ artifactId: artifact.id, artifactType: 'design', title: artifact.name, selection: selected ? { id: selected.id, kind: selected.type, label: selected.name } : board ? { id: board.id, kind: 'artboard', label: board.name } : undefined })}>Ask AgentSam</button> : null}<ZoomControls zoom={zoom} onChange={setZoom} onFit={fitCanvas} grid={showGrid} onToggleGrid={() => setShowGrid(!showGrid)}/><button className={'dcx-command-icon' + (inspectorOpen ? ' active' : '')} title={inspectorOpen ? 'Hide properties' : 'Show properties'} aria-label={inspectorOpen ? 'Hide properties' : 'Show properties'} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}><Settings2 size={15}/></button><button className="dcx-command-icon" title="Export design JSON" aria-label="Export design JSON" onClick={() => download(artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json', artifact)}><Download size={15}/></button></div>
  </>;
  return <>
    <DesignWorkspaceFrame snapshot={snapshotFor(artifact, selected ? { id: selected.id, kind: selected.type } : board ? { id: board.id, kind: 'artboard' } : undefined)} leading={leading} commands={commands} documentActions={documentActions} explorer={explorer} inspector={inspector} assistant={assistant} assistantOpen={assistantOpen} onAssistantOpenChange={onAssistantOpenChange} assistantDock={assistantDock} onAssistantDockChange={onAssistantDockChange} inspectorSheetOpen={commentsOpen && inspectorOpen} onInspectorSheetDismiss={() => { setCommentsOpen(false); setInspectorOpen(false); }} stageLabel="Design editor" className="dcx-shared-frame">
      {board ? <div className="dcx-editor-stage dcx-design-stage">
        <div ref={canvasAreaRef} tabIndex={0} aria-label="Design canvas; scroll to zoom, middle-drag to pan" className={'dcx-design-canvas-area dcx-zoom-viewport' + (showGrid ? ' is-grid' : '') + (tool === 'hand' ? ' is-hand' : '')}>
          <div className="dcx-zoom-world" style={viewport.worldStyle}><div className="dcx-canvas-zoom-wrap" style={viewport.artboardStyle}>
            <EditableSurface width={board.width} height={board.height} background={board.background} objects={board.objects} selectedId={selectedId} onSelect={setSelectedId} onChange={updateObject} onPlace={tool === 'select' || tool === 'hand' || tool === 'pen' ? undefined : (x, y) => placeToolAt(tool, x, y)} onDraw={tool === 'pen' ? addPath : undefined} snapToGrid={snapToGrid} showBounds={showBounds} showGuides={showGuides} panEnabled={tool === 'hand'}/>
            {(board.comments || []).filter((item) => item.x !== undefined && item.y !== undefined).map((item) => <button key={item.id} className={'dcx-comment-pin' + (item.resolved ? ' is-resolved' : '')} style={{ left: (item.x! / board.width * 100) + '%', top: (item.y! / board.height * 100) + '%' }} title={item.text} aria-label={'Open comment: ' + item.text} onClick={() => { setCommentPosition({ x: item.x!, y: item.y! }); setCommentsOpen(true); setInspectorOpen(true); }}><MessageSquare size={13}/></button>)}
          </div></div>
          {selected && selectionAnchor ? <SelectionFormattingToolbar object={selected} anchor={selectionAnchor} colors={documentColors} onChange={(patch) => updateObject(selected.id, patch)} onMore={() => setInspectorOpen(true)} onComment={openCommentsForSelection} onAlign={alignSelected} onAsk={onAsk ? () => onAsk({ artifactId: artifact.id, artifactType: artifact.type === 'whiteboard' ? 'whiteboard' : 'design', title: artifact.name, selection: { id: selected.id, kind: selected.type, label: selected.name } }) : undefined}/> : null}
        </div>
        <ToolBar active={tool} onChange={handleToolChange} includeDesignTools={artifact.type === 'design'} includeWhiteboardTools={artifact.type === 'whiteboard'}/>
        <div className="dcx-stage-footer"><span>{board.name}</span><span>{board.width} × {board.height} · {zoom}% · {(board.comments || []).length} comments</span></div>
      </div> : <div className="dcx-design-empty-wrap"><EmptyState title="Start with a blank artboard" description="Create an artboard and begin shaping your design." icon={<PenTool size={20}/>} action={<><ArtboardMenu onAdd={addBoard}/><button className="dcx-secondary-button" onClick={onOpenReferences}><Library size={15}/> Browse source artboards</button></>}/></div>}
    </DesignWorkspaceFrame>
    <input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => { acceptImage(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
  </>;
}
function TokenDialog({ type, onClose, onCreate }: { type: Exclude<TokenModal, null>; onClose: () => void; onCreate: (value: Record<string, unknown>) => void }) {
  const [name, setName] = useState(type === 'color' ? 'Primary' : type === 'type' ? 'Body' : type === 'component' ? 'Button' : type === 'shadow' ? 'Shadow 1' : 'space-1');
  const [value, setValue] = useState(type === 'color' ? '#397ff2' : '8');
  const [group, setGroup] = useState('Palette');
  const [note, setNote] = useState('');
  const [family, setFamily] = useState('Inter');
  const [weight, setWeight] = useState('500');
  const [lineHeight, setLineHeight] = useState('1.4');
  const [unit, setUnit] = useState('px');
  const [x, setX] = useState('0');
  const [y, setY] = useState('4');
  const [blur, setBlur] = useState('16');
  const [spread, setSpread] = useState('0');
  const [color, setColor] = useState('#000000');
  return <div className="dcx-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="dcx-modal" onSubmit={(event) => { event.preventDefault(); onCreate({ name, value, group, note, family, weight: Number(weight), lineHeight: Number(lineHeight), unit, x: Number(x), y: Number(y), blur: Number(blur), spread: Number(spread), color }); }}>
      <div className="dcx-modal-heading"><strong>{type === 'color' ? 'Add color' : type === 'type' ? 'Add type style' : type === 'scale' ? 'Add token' : type === 'shadow' ? 'Add shadow' : 'Create component'}</strong><button type="button" onClick={onClose} aria-label="Close"><X size={16}/></button></div>
      <Field label="Name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} required/></Field>
      {type === 'color' ? <><Field label="Color"><div className="dcx-color-input"><input type="color" value={value} onChange={(event) => setValue(event.target.value)}/><input value={value} onChange={(event) => setValue(event.target.value)} pattern="#[0-9a-fA-F]{6}" required/></div></Field><Field label="Group"><input value={group} onChange={(event) => setGroup(event.target.value)}/></Field><Field label="Usage note"><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Where this color should be used"/></Field></> : null}
      {type === 'type' ? <><Field label="Typeface"><input value={family} onChange={(event) => setFamily(event.target.value)}/></Field><div className="dcx-field-grid"><Field label="Size"><input type="number" min="8" max="180" value={value} onChange={(event) => setValue(event.target.value)}/></Field><Field label="Weight"><select value={weight} onChange={(event) => setWeight(event.target.value)}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option></select></Field></div><Field label="Line height"><input type="number" min="0.8" max="3" step="0.1" value={lineHeight} onChange={(event) => setLineHeight(event.target.value)}/></Field></> : null}
      {type === 'scale' ? <div className="dcx-field-grid"><Field label="Value"><input type="number" min="0" step="0.5" value={value} onChange={(event) => setValue(event.target.value)}/></Field><Field label="Unit"><select value={unit} onChange={(event) => setUnit(event.target.value)}><option>px</option><option>rem</option><option>%</option></select></Field></div> : null}
      {type === 'shadow' ? <><div className="dcx-field-grid"><Field label="X"><input type="number" value={x} onChange={(event) => setX(event.target.value)}/></Field><Field label="Y"><input type="number" value={y} onChange={(event) => setY(event.target.value)}/></Field></div><div className="dcx-field-grid"><Field label="Blur"><input type="number" min="0" value={blur} onChange={(event) => setBlur(event.target.value)}/></Field><Field label="Spread"><input type="number" value={spread} onChange={(event) => setSpread(event.target.value)}/></Field></div><Field label="Color"><input type="color" value={color} onChange={(event) => setColor(event.target.value)}/></Field></> : null}
      {type === 'component' ? <><Field label="Description"><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the component"/></Field><Field label="Variant"><input value={group} onChange={(event) => setGroup(event.target.value)} placeholder="Default"/></Field></> : null}
      <div className="dcx-modal-actions"><button type="button" className="dcx-secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="dcx-primary-button" disabled={!name.trim()}>Add</button></div>
    </form>
  </div>;
}
function SystemOverview({ data, onChange, onSection, onImport, onUpload, onAsk }: { data: DesignSystemDocument; onChange: (patch: Partial<DesignSystemDocument>) => void; onSection: (section: Section) => void; onImport: () => void; onUpload: () => void; onAsk?: (kind: 'github' | 'connectors') => void }) {
  return <div className="dcx-system-overview">
    <div className="dcx-section-heading"><div><h2>Overview</h2><p>Define the visual language shared across your work.</p></div></div>
    <section className="dcx-overview-card"><div className="dcx-overview-card-heading"><strong>Your design system</strong><span>Overview</span></div><textarea rows={3} value={data.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Describe the visual direction and purpose of this system."/><div className="dcx-principles"><div className="dcx-overview-card-heading"><strong>Principles</strong><button className="dcx-inline-action" onClick={() => onChange({ principles: [...data.principles, ''] })}><Plus size={13}/> Add</button></div>{data.principles.map((item, index) => <div className="dcx-principle-row" key={index}><input value={item} placeholder="Add a principle" onChange={(event) => onChange({ principles: data.principles.map((value, i) => i === index ? event.target.value : value) })}/><button aria-label="Remove principle" onClick={() => onChange({ principles: data.principles.filter((_, i) => i !== index) })}><X size={13}/></button></div>)}</div></section>
    <div className="dcx-setup-grid">
      {onAsk ? <button className="dcx-setup-card" onClick={() => onAsk('github')}><span className="dcx-setup-icon"><FolderOpen size={18}/></span><span><strong>Sync from GitHub</strong><small>Bring in an existing system from a repository.</small></span><ChevronDown size={14}/></button> : null}
      {onAsk ? <button className="dcx-setup-card" onClick={() => onAsk('connectors')}><span className="dcx-setup-icon"><Layers size={18}/></span><span><strong>Build from connected sources</strong><small>Use brand resources already connected to AgentSam.</small></span><ChevronDown size={14}/></button> : null}
      <button className="dcx-setup-card" onClick={onUpload}><span className="dcx-setup-icon"><Upload size={18}/></span><span><strong>Upload brand files</strong><small>Add logos, fonts, guidelines, and token files.</small></span><Plus size={15}/></button>
    </div>
    <div className="dcx-overview-footer"><div><strong>Import design tokens</strong><p>Bring in a JSON token file to populate colors and typography.</p></div><button className="dcx-secondary-button" onClick={onImport}><FileUp size={15}/> Import tokens</button></div>
  </div>;
}
function DesignSystemEditor({ artifact, onChange, onAsk, leading, documentActions, assistant, assistantOpen, onAssistantOpenChange, assistantDock, onAssistantDockChange }: { artifact: CreativeArtifact; onChange: (data: DesignSystemDocument) => void; onAsk?: (context: AskContext) => void } & EditorChromeProps) {
  const data = artifact.data as DesignSystemDocument;
  const [section, setSection] = useState<Section>('overview');
  const [modal, setModal] = useState<TokenModal>(null);
  const [importMessage, setImportMessage] = useState('');
  const fontInput = useRef<HTMLInputElement>(null);
  const assetInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const brandInput = useRef<HTMLInputElement>(null);
  const systemStageRef = useRef<HTMLDivElement>(null);
  const update = (patch: Partial<DesignSystemDocument>) => onChange({ ...data, ...patch });
  const uploadData = (file: File, done: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') done(reader.result); };
    reader.readAsDataURL(file);
  };
  const handleFont = (file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) { setImportMessage('Choose a font file under 2 MB.'); return; }
    uploadData(file, (dataUrl) => update({ typography: [...data.typography, { id: makeId('type'), role: file.name.replace(/\.[^.]+$/, ''), family: file.name.replace(/\.[^.]+$/, ''), size: 16, weight: 400, lineHeight: 1.4, fontData: dataUrl }] }));
  };
  const handleAsset = (file?: File) => {
    if (!file) return;
    if (file.size > 3_000_000) { setImportMessage('Choose an image under 3 MB.'); return; }
    uploadData(file, (dataUrl) => update({ assets: [...data.assets, { id: makeId('asset'), name: file.name, kind: file.type || 'file', dataUrl, size: file.size }] }));
  };
  const handleBrandFile = (file?: File) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'json') importTokens(file);
    else if (['woff','woff2','ttf','otf'].includes(extension || '')) handleFont(file);
    else handleAsset(file);
  };
  const importTokens = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const colors = Array.isArray(parsed.colors) ? parsed.colors.map((item: any) => ({ id: makeId('color'), name: String(item.name || item.token || 'Color'), value: String(item.value || item.hex || '#000000'), group: String(item.group || 'Palette'), note: String(item.note || '') })) : [];
        const typography = Array.isArray(parsed.typography) ? parsed.typography.map((item: any) => ({ id: makeId('type'), role: String(item.role || item.name || 'Body'), family: String(item.family || item.fontFamily || 'Inter'), size: Number(item.size || item.fontSize || 16), weight: Number(item.weight || 400), lineHeight: Number(item.lineHeight || 1.4) })) : [];
        if (!colors.length && !typography.length) throw new Error('No supported color or typography tokens were found.');
        update({ colors: [...data.colors, ...colors], typography: [...data.typography, ...typography] });
        setImportMessage('Imported ' + colors.length + ' colors and ' + typography.length + ' type styles.');
      } catch (error) { setImportMessage(error instanceof Error ? error.message : 'Could not import this file.'); }
    };
    reader.readAsText(file);
  };
  const createToken = (value: Record<string, unknown>) => {
    if (modal === 'color') update({ colors: [...data.colors, { id: makeId('color'), name: String(value.name), value: String(value.value), group: String(value.group || 'Palette'), note: String(value.note || '') }] });
    if (modal === 'type') update({ typography: [...data.typography, { id: makeId('type'), role: String(value.name), family: String(value.family || 'Inter'), size: Number(value.value || 16), weight: Number(value.weight || 500), lineHeight: Number(value.lineHeight || 1.4) }] });
    if (modal === 'scale') {
      const token = { id: makeId('scale'), name: String(value.name), value: Number(value.value || 0), unit: String(value.unit || 'px') };
      if (section === 'spacing') update({ spacing: [...data.spacing, token] });
      else if (section === 'radii') update({ radii: [...data.radii, token] });
    }
    if (modal === 'shadow') update({ shadows: [...data.shadows, { id: makeId('shadow'), name: String(value.name), x: Number(value.x || 0), y: Number(value.y || 0), blur: Number(value.blur || 0), spread: Number(value.spread || 0), color: String(value.color || '#000000') }] });
    if (modal === 'component') update({ components: [...data.components, { id: makeId('component'), name: String(value.name), description: String(value.note || ''), variant: String(value.group || 'Default') }] });
    setModal(null);
  };
  const scrollToSection = (target: Section) => {
    setSection(target);
    window.requestAnimationFrame(() => {
      systemStageRef.current?.querySelector<HTMLElement>(`[data-system-section="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  useEffect(() => {
    const root = systemStageRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const next = current?.target.getAttribute('data-system-section');
      if (next && ['overview', 'colors', 'typography', 'spacing', 'radii', 'shadows', 'components', 'assets', 'files'].includes(next)) setSection(next as Section);
    }, { root, rootMargin: '-8% 0px -72% 0px', threshold: [0, 0.15, 0.35] });
    root.querySelectorAll<HTMLElement>('[data-system-section]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  const explorer = <div className="dcx-explorer-content dcx-system-nav">
    <div className="dcx-panel-title"><strong>Design system</strong></div>
    {([
      ['overview','Overview',<LayoutGrid size={15}/>],
      ['colors','Colors',<Palette size={15}/>],
      ['typography','Typography',<Type size={15}/>],
      ['spacing','Spacing',<Ruler size={15}/>],
      ['radii','Corner radius',<Circle size={15}/>],
      ['shadows','Shadows',<Grid3X3 size={15}/>],
      ['components','Components',<Component size={15}/>],
      ['assets','Assets',<Image size={15}/>],
      ['files','Files',<FolderOpen size={15}/>]
    ] as [Section,string,ReactNode][]).map(([id,label,icon]) => <button key={id} className={'dcx-system-nav-item' + (section === id ? ' active' : '')} onClick={() => scrollToSection(id)}>{icon}<span>{label}</span></button>)}
  </div>;
  const addButton = section === 'colors' ? <button className="dcx-command-button" onClick={() => setModal('color')}><Plus size={15}/> Add color</button>
    : section === 'typography' ? <><button className="dcx-command-button" onClick={() => setModal('type')}><Plus size={15}/> Add type style</button><button className="dcx-command-button" onClick={() => fontInput.current?.click()}><Upload size={15}/> Upload font</button></>
    : section === 'spacing' || section === 'radii' ? <button className="dcx-command-button" onClick={() => setModal('scale')}><Plus size={15}/> Add token</button>
    : section === 'shadows' ? <button className="dcx-command-button" onClick={() => setModal('shadow')}><Plus size={15}/> Add shadow</button>
    : section === 'components' ? <button className="dcx-command-button" onClick={() => setModal('component')}><Plus size={15}/> Create component</button>
    : section === 'assets' ? <button className="dcx-command-button" onClick={() => assetInput.current?.click()}><Upload size={15}/> Upload asset</button>
    : null;
  const commands = <div className="dcx-command-group">{onAsk ? <button className="dcx-command-button" onClick={() => onAsk({ artifactId: artifact.id, artifactType: 'system', title: artifact.name })}>Ask AgentSam</button> : null}{addButton}<button className="dcx-command-icon" title="Import token file" aria-label="Import token file" onClick={() => importInput.current?.click()}><FileUp size={15}/></button></div>;
  const sectionHeader = (title: string, description: string, action?: ReactNode) => <div className="dcx-section-heading"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>;
  const renderSection = (section: Section): ReactNode => {
    let content: ReactNode;
    if (section === 'overview') content = <SystemOverview data={data} onChange={update} onSection={scrollToSection} onImport={() => importInput.current?.click()} onUpload={() => brandInput.current?.click()} onAsk={onAsk ? (kind) => onAsk({ artifactId: artifact.id, artifactType: 'system', title: artifact.name, selection: { id: artifact.id, kind: 'source-import', label: kind === 'github' ? 'Sync from GitHub' : 'Build from connected sources' } }) : undefined}/>;
    else if (section === 'colors') content = <div className="dcx-system-section">{sectionHeader('Colors','Build palettes and define how color is used.',<button className="dcx-primary-button" onClick={() => setModal('color')}><Plus size={15}/> Add color</button>)}{data.colors.length ? <div className="dcx-token-groups">{Array.from(new Set(data.colors.map((item) => item.group || 'Palette'))).map((group) => <section className="dcx-token-group" key={group}><h3>{group}</h3><div className="dcx-color-table">{data.colors.filter((item) => (item.group || 'Palette') === group).map((item) => <div className="dcx-color-row" key={item.id}><input className="dcx-color-swatch" type="color" value={item.value} onChange={(event) => update({ colors: data.colors.map((v) => v.id === item.id ? { ...v, value: event.target.value } : v) })}/><input aria-label="Color name" value={item.name} onChange={(event) => update({ colors: data.colors.map((v) => v.id === item.id ? { ...v, name: event.target.value } : v) })}/><input aria-label="Color value" value={item.value} onChange={(event) => update({ colors: data.colors.map((v) => v.id === item.id ? { ...v, value: event.target.value } : v) })}/><span className="dcx-contrast">{Math.max(contrastRatio(item.value,'#ffffff'), contrastRatio(item.value,'#000000')).toFixed(1)}:1</span><button aria-label="Delete color" onClick={() => update({ colors: data.colors.filter((v) => v.id !== item.id) })}><Trash2 size={14}/></button></div>)}</div></section>)}</div> : <EmptyState title="No colors yet" description="Add your first color to start building the palette." action={<button className="dcx-primary-button" onClick={() => setModal('color')}><Plus size={15}/> Add color</button>}/>}</div>;
    else if (section === 'typography') content = <div className="dcx-system-section">{sectionHeader('Typography','Set type roles and upload the fonts used across your work.',<div className="dcx-heading-actions"><button className="dcx-secondary-button" onClick={() => fontInput.current?.click()}><Upload size={15}/> Upload font</button><button className="dcx-primary-button" onClick={() => setModal('type')}><Plus size={15}/> Add type style</button></div>)}{data.typography.length ? <div className="dcx-type-list">{data.typography.map((item) => <div className="dcx-type-row" key={item.id}><div className="dcx-type-preview" style={{ fontFamily: item.family, fontSize: Math.min(38, item.size), fontWeight: item.weight }}>Aa</div><div className="dcx-type-meta"><input aria-label="Type role" value={item.role} onChange={(event) => update({ typography: data.typography.map((v) => v.id === item.id ? { ...v, role: event.target.value } : v) })}/><div className="dcx-type-fields"><input aria-label="Typeface" value={item.family} onChange={(event) => update({ typography: data.typography.map((v) => v.id === item.id ? { ...v, family: event.target.value } : v) })}/><input aria-label="Font size" type="number" value={item.size} onChange={(event) => update({ typography: data.typography.map((v) => v.id === item.id ? { ...v, size: Number(event.target.value) } : v) })}/><select aria-label="Font weight" value={item.weight} onChange={(event) => update({ typography: data.typography.map((v) => v.id === item.id ? { ...v, weight: Number(event.target.value) } : v) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option></select></div></div><button aria-label="Delete type style" onClick={() => update({ typography: data.typography.filter((v) => v.id !== item.id) })}><Trash2 size={14}/></button></div>)}</div> : <EmptyState title="No type styles yet" description="Add a type role or upload a brand font." action={<><button className="dcx-primary-button" onClick={() => setModal('type')}><Plus size={15}/> Add type style</button><button className="dcx-secondary-button" onClick={() => fontInput.current?.click()}><Upload size={15}/> Upload font</button></>}/>}</div>;
    else if (section === 'spacing' || section === 'radii') { const list = section === 'spacing' ? data.spacing : data.radii; content = <div className="dcx-system-section">{sectionHeader(section === 'spacing' ? 'Spacing' : 'Corner radius', section === 'spacing' ? 'Define consistent spacing values.' : 'Define the shape language for surfaces and controls.',<button className="dcx-primary-button" onClick={() => setModal('scale')}><Plus size={15}/> Add token</button>)}{list.length ? <div className="dcx-scale-list">{list.map((item) => <div className="dcx-scale-row" key={item.id}><input value={item.name} onChange={(event) => update({ [section]: list.map((v) => v.id === item.id ? { ...v, name: event.target.value } : v) } as Partial<DesignSystemDocument>)}/><input type="number" value={item.value} onChange={(event) => update({ [section]: list.map((v) => v.id === item.id ? { ...v, value: Number(event.target.value) } : v) } as Partial<DesignSystemDocument>)}/><span>{item.unit}</span><button aria-label="Delete token" onClick={() => update({ [section]: list.filter((v) => v.id !== item.id) } as Partial<DesignSystemDocument>)}><Trash2 size={14}/></button></div>)}</div> : <EmptyState title={section === 'spacing' ? 'No spacing values yet' : 'No corner radii yet'} description={section === 'spacing' ? 'Add the values that define your layout rhythm.' : 'Add the radius values used by your surfaces and controls.'} action={<button className="dcx-primary-button" onClick={() => setModal('scale')}><Plus size={15}/> Add token</button>}/>}</div>; }
    else if (section === 'shadows') content = <div className="dcx-system-section">{sectionHeader('Shadows','Define reusable elevation and depth.',<button className="dcx-primary-button" onClick={() => setModal('shadow')}><Plus size={15}/> Add shadow</button>)}{data.shadows.length ? <div className="dcx-shadow-list">{data.shadows.map((item) => <div className="dcx-shadow-row" key={item.id}><div className="dcx-shadow-preview" style={{ boxShadow: item.x + 'px ' + item.y + 'px ' + item.blur + 'px ' + item.spread + 'px ' + item.color }}/><div className="dcx-shadow-meta"><input aria-label="Shadow name" value={item.name} onChange={(event) => update({ shadows: data.shadows.map((v) => v.id === item.id ? { ...v, name: event.target.value } : v) })}/><div className="dcx-shadow-fields">{(['x','y','blur','spread'] as const).map((key) => <input key={key} aria-label={key} title={key} type="number" value={item[key]} onChange={(event) => update({ shadows: data.shadows.map((v) => v.id === item.id ? { ...v, [key]: Number(event.target.value) } : v) })}/>) }<input aria-label="Shadow color" type="color" value={item.color} onChange={(event) => update({ shadows: data.shadows.map((v) => v.id === item.id ? { ...v, color: event.target.value } : v) })}/></div></div><button aria-label="Delete shadow" onClick={() => update({ shadows: data.shadows.filter((v) => v.id !== item.id) })}><Trash2 size={14}/></button></div>)}</div> : <EmptyState title="No shadows yet" description="Add reusable shadow styles for your interface." action={<button className="dcx-primary-button" onClick={() => setModal('shadow')}><Plus size={15}/> Add shadow</button>}/>}</div>;
    else if (section === 'components') content = <div className="dcx-system-section">{sectionHeader('Components','Keep reusable components connected to this system.',<button className="dcx-primary-button" onClick={() => setModal('component')}><Plus size={15}/> Create component</button>)}{data.components.length ? <div className="dcx-component-list">{data.components.map((item) => <div className="dcx-component-row" key={item.id}><div className="dcx-component-preview"><span>{item.name}</span></div><div><input aria-label="Component name" value={item.name} onChange={(event) => update({ components: data.components.map((v) => v.id === item.id ? { ...v, name: event.target.value } : v) })}/><input aria-label="Component description" value={item.description} onChange={(event) => update({ components: data.components.map((v) => v.id === item.id ? { ...v, description: event.target.value } : v) })}/></div><button aria-label="Delete component" onClick={() => update({ components: data.components.filter((v) => v.id !== item.id) })}><Trash2 size={14}/></button></div>)}</div> : <EmptyState title="No components yet" description="Create reusable components for your creative work." action={<button className="dcx-primary-button" onClick={() => setModal('component')}><Plus size={15}/> Create component</button>}/>}</div>;
    else if (section === 'assets') content = <div className="dcx-system-section">{sectionHeader('Assets','Keep logos, imagery, and brand resources together.',<button className="dcx-primary-button" onClick={() => assetInput.current?.click()}><Upload size={15}/> Upload asset</button>)}{data.assets.length ? <div className="dcx-asset-grid">{data.assets.map((item) => <div className="dcx-asset-card" key={item.id}>{item.kind.startsWith('image/') || item.dataUrl.startsWith('data:image') ? <img src={item.dataUrl} alt={item.name}/> : <FileText size={22}/>}<span>{item.name}</span><button aria-label="Delete asset" onClick={() => update({ assets: data.assets.filter((v) => v.id !== item.id) })}><Trash2 size={13}/></button></div>)}</div> : <EmptyState title="No assets yet" description="Upload logos, photography, and other brand resources." action={<button className="dcx-primary-button" onClick={() => assetInput.current?.click()}><Upload size={15}/> Upload asset</button>}/>}</div>;
    else content = <div className="dcx-system-section">{sectionHeader('Files','Files attached to this design system.')}{data.files.length || data.assets.length || data.typography.some((item) => item.fontData) ? <div className="dcx-files-list">{[...data.files, ...data.assets, ...data.typography.filter((item) => item.fontData).map((item) => ({ id: item.id, name: item.family, kind: 'font', size: 0, dataUrl: '' }))].map((item) => <div className="dcx-file-row" key={item.id}><FileText size={16}/><span>{item.name}</span><small>{item.kind}</small></div>)}</div> : <EmptyState title="No files yet" description="Uploaded fonts and assets will appear here."/>}</div>;
    return content;
  };
  const content = <div className="dcx-system-document">
    {(['overview', 'colors', 'typography', 'spacing', 'radii', 'shadows', 'components', 'assets', 'files'] as Section[]).map((sectionId) => (
      <section key={sectionId} id={'dcx-system-section-' + sectionId} data-system-section={sectionId} className="dcx-system-scroll-section" onClickCapture={() => setSection(sectionId)}>
        {renderSection(sectionId)}
      </section>
    ))}
  </div>;
  const fontFaces = data.typography.filter((item) => item.fontData).map((item) => '@font-face{font-family:"' + item.family.replace(/['"\\]/g, '') + '";src:url("' + item.fontData + '");font-display:swap;}').join('');
  return <>
    {fontFaces ? <style>{fontFaces}</style> : null}
    <DesignWorkspaceFrame snapshot={snapshotFor(artifact)} leading={leading} commands={commands} documentActions={documentActions} explorer={explorer} assistant={assistant} assistantOpen={assistantOpen} onAssistantOpenChange={onAssistantOpenChange} assistantDock={assistantDock} onAssistantDockChange={onAssistantDockChange} stageLabel="Design system editor" className="dcx-shared-frame dcx-system-frame">
      <div ref={systemStageRef} className="dcx-system-stage">{content}</div>
    </DesignWorkspaceFrame>
    <input ref={fontInput} hidden type="file" accept=".woff,.woff2,.ttf,.otf,font/*" onChange={(event) => { handleFont(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
    <input ref={assetInput} hidden type="file" accept="image/*,.svg,.pdf" onChange={(event) => { handleAsset(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
    <input ref={importInput} hidden type="file" accept=".json,application/json" onChange={(event) => { importTokens(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
    <input ref={brandInput} hidden type="file" accept="image/*,.svg,.pdf,.woff,.woff2,.ttf,.otf,.json" onChange={(event) => { handleBrandFile(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
    {importMessage ? <div className="dcx-toast" role="status">{importMessage}<button onClick={() => setImportMessage('')}><X size={13}/></button></div> : null}
    {modal ? <TokenDialog type={modal} onClose={() => setModal(null)} onCreate={createToken}/> : null}
  </>;
}
function AgentSamBuildEditor({ artifact, leading, documentActions, assistant, assistantOpen, onAssistantOpenChange, assistantDock, onAssistantDockChange, onOpenCode }: {
  artifact: CreativeArtifact;
  leading?: ReactNode;
  documentActions?: ReactNode;
  assistant?: ReactNode;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  assistantDock?: 'left' | 'right';
  onAssistantDockChange?: (dock: 'left' | 'right') => void;
  onOpenCode?: (context?: AskContext) => void;
  onMoveArtifact?: (artifact: CreativeArtifact) => void;
  onRefreshArtifact?: (artifact: CreativeArtifact) => void;
  onManagePermissions?: (artifact: CreativeArtifact) => void;
  onGiveFeedback?: (artifact: CreativeArtifact) => void;
}) {
  return <DesignWorkspaceFrame
    snapshot={snapshotFor(artifact, { id: artifact.id, kind: 'agent-build-workspace' })}
    leading={leading}
    documentActions={documentActions}
    assistant={assistant}
    assistantOpen={assistantOpen}
    onAssistantOpenChange={onAssistantOpenChange}
    assistantDock={assistantDock}
    onAssistantDockChange={onAssistantDockChange}
    stageLabel="AgentSam Code workspace"
    className="dcx-shared-frame dcx-build-frame"
  >
    <div className="dcx-build-stage">
      <div className="dcx-build-intro">
        <span className="dcx-build-mark"><Code2 size={21}/></span>
        <p className="dcx-section-label">EXISTING WORK IDE</p>
        <h1>Continue in AgentSam Code</h1>
        <p>This saved workspace is preserved. Project files, the IDE, terminal and AgentSam execution now live together in the existing Work surface.</p>
        <div className="dcx-build-capabilities">
          <span>Project files</span><span>IDE and terminal</span><span>Shared conversation</span>
        </div>
        <button type="button" className="dcx-primary-button" onClick={() => onOpenCode?.()}>Open Code in Work <Code2 size={14}/></button>
      </div>
    </div>
  </DesignWorkspaceFrame>;
}

function CreateSlidesDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (kind: 'blank' | 'brand') => void }) {
  return <div className="dcx-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dcx-modal dcx-create-modal">
    <div className="dcx-modal-heading"><strong>New presentation</strong><button onClick={onClose} aria-label="Close"><X size={16}/></button></div>
    <button className="dcx-template-option" onClick={() => onCreate('brand')}><span className="dcx-template-preview brand"><b>Brand</b><i>Guidelines</i></span><span><strong>Brand Guidelines</strong><small>A seven-slide starting deck for your identity.</small></span><Plus size={16}/></button>
    <button className="dcx-template-option" onClick={() => onCreate('blank')}><span className="dcx-template-preview blank"><span/></span><span><strong>Blank presentation</strong><small>Start with a clean slide.</small></span><Plus size={16}/></button>
  </div></div>;
}
function ArtifactCard({ artifact, onOpen, onRename, onDuplicate, onDelete, onTogglePin }: {
  artifact: CreativeArtifact; onOpen: () => void; onRename: () => void; onDuplicate: () => void; onDelete: () => void; onTogglePin: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const slide = artifact.type === 'slides' ? (artifact.data as SlidesDocument).slides[0] : null;
  const board = artifact.type === 'design' || artifact.type === 'whiteboard' ? (artifact.data as DesignDocument).artboards[0] : null;
  const system = artifact.type === 'system' ? artifact.data as DesignSystemDocument : null;
  const code = artifact.type === 'code' ? artifact.data as CodeDocument : null;
  const previewBackground = slide?.background || board?.background || '#1b2028';
  const previewText = slide?.objects.filter((item) => item.type === 'text').slice(0, 2) || board?.objects.filter((item) => item.type === 'text').slice(0, 2) || [];
  const typeLabel = artifact.type === 'slides' ? 'Slides' : artifact.type === 'system' ? 'Design System' : artifact.type === 'code' ? 'Create in Code' : artifact.type === 'whiteboard' ? 'Whiteboard' : 'Design';
  return <article className="dcx-artifact-card">
    <button className="dcx-artifact-open" onClick={onOpen}>
      <div className={'dcx-artifact-preview ' + artifact.type} style={{ background: previewBackground }}>
        {artifact.type === 'slides' ? previewText.length ? previewText.map((item) => <span key={item.id} style={{ color: item.color || '#ffffff', fontSize: 'clamp(14px, 2vw, 30px)', fontWeight: item.weight || 600 }}>{item.text}</span>) : <><strong>{artifact.name}</strong><small>Presentation</small></> : null}
        {artifact.type === 'design' || artifact.type === 'whiteboard' ? board ? previewText.length ? previewText.map((item) => <span key={item.id}>{item.text}</span>) : <span>{board.name}</span> : <><img src={designCover} alt=""/><span>Empty artboard</span></> : null}
        {artifact.type === 'code' ? <><Code2 size={27}/><span>{code?.files.length || 0} files</span></> : null}
        {artifact.type === 'system' ? system && system.colors.length ? <div className="dcx-system-preview-swatches">{system.colors.slice(0, 6).map((item) => <i key={item.id} style={{ background: item.value }} title={item.name}/>)}</div> : <><img src={systemCover} alt=""/><span>No tokens yet</span></> : null}
      </div>
      <div className="dcx-artifact-meta"><div><strong>{artifact.name}</strong><small>{typeLabel} · Edited {formatDate(artifact.updatedAt)}</small></div>{artifact.pinned ? <Star size={14} className="dcx-pinned-mark" fill="currentColor"/> : null}{artifact.shared ? <Share2 size={13} className="dcx-shared-mark"/> : null}</div>
    </button>
    <button className="dcx-card-menu-trigger" aria-label="Artifact actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={16}/></button>
    {menu ? <div className="dcx-card-menu"><button onClick={() => { onTogglePin(); setMenu(false); }}><Star size={14}/>{artifact.pinned ? 'Remove from pinned' : 'Pin'}</button><button onClick={() => { onRename(); setMenu(false); }}><FileText size={14}/> Rename</button><button onClick={() => { onDuplicate(); setMenu(false); }}><Copy size={14}/> Duplicate</button><button onClick={() => { onDelete(); setMenu(false); }}><Trash2 size={14}/> Delete</button></div> : null}
  </article>;
}
export function DesignCanvasApp({ onAskAgentSam, assistant, assistantOpen: controlledAssistantOpen, onAssistantOpenChange, assistantDock, onAssistantDockChange, initialArtifacts, initialWorkspace, initialName, initialActiveId, initialRoute, onArtifactsChange, onActiveArtifactChange, onOpenCode, onMoveArtifact, onRefreshArtifact, onManagePermissions, onGiveFeedback, onToggleOutputs, outputsOpen = false, onSaveStatusChange, onShareArtifact, onSaveToLibrary, embedded = false }: DesignCanvasAppProps) {
  const [initialState] = useState(() => {
    const loaded = normalizeArtifacts(initialArtifacts ?? readArtifacts());
    const selected = initialActiveId ? loaded.find((item) => item.id === initialActiveId) : undefined;
    if (selected) return { artifacts: loaded, activeId: selected.id, route: 'editor' as const };
    if (initialWorkspace) {
      const artifact = initialWorkspace === 'slides' && initialName === 'Brand Guidelines' ? makeArtifact('slides','Brand Guidelines',brandGuidelinesSlides()) : makeArtifact(initialWorkspace, initialName || (
        initialWorkspace === 'slides' ? 'Untitled presentation' :
        initialWorkspace === 'system' ? 'Untitled design system' :
        initialWorkspace === 'code' ? 'Create in Code' :
        initialWorkspace === 'whiteboard' ? 'Untitled whiteboard' : 'Untitled design'
      ));
      return { artifacts: [artifact, ...loaded], activeId: artifact.id, route: 'editor' as const };
    }
    return { artifacts: loaded, activeId: '', route: initialRoute === 'references' ? 'references' as const : 'gallery' as const };
  });
  const [artifacts, setArtifacts] = useState<CreativeArtifact[]>(initialState.artifacts);
  const [activeId, setActiveId] = useState(initialState.activeId);
  const [route, setRoute] = useState<'gallery' | 'editor' | 'references'>(initialState.route);
  const [tab, setTab] = useState<'all' | 'pinned' | 'yours' | 'shared'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | CreativeType>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [deleteId, setDeleteId] = useState('');
  const [renameId, setRenameId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [storageError, setStorageError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [internalAssistantOpen, setInternalAssistantOpen] = useState(true);
  const [storageInfoOpen, setStorageInfoOpen] = useState(false);
  const effectiveAssistantOpen = controlledAssistantOpen ?? internalAssistantOpen;
  const updateAssistantOpen = (open: boolean) => {
    setInternalAssistantOpen(open);
    onAssistantOpenChange?.(open);
  };
  const active = artifacts.find((item) => item.id === activeId);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleFullscreen = async () => {
    if (document.fullscreenElement === rootRef.current) {
      await document.exitFullscreen();
      return;
    }
    if (fullscreen) {
      setFullscreen(false);
      return;
    }
    try {
      await rootRef.current?.requestFullscreen();
    } catch {
      setFullscreen(true);
    }
  };
  useEffect(() => { onActiveArtifactChange?.(active?.id || null, active || null); }, [active?.id, active?.name, active?.type, onActiveArtifactChange]);
  useEffect(() => {
    if (onArtifactsChange) onArtifactsChange(artifacts);
    else {
      const saved = writeArtifacts(artifacts);
      setStorageError(!saved);
      onSaveStatusChange?.(saved ? 'saved' : 'error');
    }
  }, [artifacts, onArtifactsChange, onSaveStatusChange]);
  const visible = useMemo(() => artifacts.filter((item) => {
    const matchesTab = tab === 'pinned' ? Boolean(item.pinned) : tab === 'shared' ? Boolean(item.shared) : tab === 'yours' ? !item.shared : true;
    const matchesType = filterType === 'all' || item.type === filterType;
    const haystack = [item.name, item.type, item.workspace || ''].join(' ').toLowerCase();
    return matchesTab && matchesType && (!query || haystack.includes(query.toLowerCase()));
  }).sort((a,b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt)), [artifacts, tab, filterType, query]);
  const create = (artifact: CreativeArtifact) => { setArtifacts((items) => [artifact, ...items]); setActiveId(artifact.id); setRoute('editor'); };
  const createDesign = () => create(makeArtifact('design'));
  const createSystem = () => create(makeArtifact('system'));
  const createBrandGuidelines = () => {
    create(makeArtifact('slides', 'Brand Guidelines', brandGuidelinesSlides()));
    setNavOpen(false);
  };
  const selectCreation = (type: CreativeType) => {
    if (type === 'code') {
      onOpenCode?.();
      setNavOpen(false);
      return;
    }
    create(makeArtifact(type));
    setNavOpen(false);
  };
  const renameArtifact = (id: string) => {
    const item = artifacts.find((value) => value.id === id);
    if (!item) return;
    setRenameId(id); setRenameValue(item.name);
  };
  const duplicate = (item: CreativeArtifact) => {
    const copy = duplicateArtifact(item);
    setArtifacts((items) => [copy, ...items]); setActiveId(copy.id); setRoute('editor');
  };
  const turnInto = (target: CreativeType) => {
    if (!active || target === active.type) return;
    let data: CreativeArtifact['data'];
    if (target === 'slides') {
      if (active.type !== 'design' && active.type !== 'whiteboard') return;
      const source = active.data as DesignDocument;
      const slides: Slide[] = source.artboards.map((board) => ({ id: makeId('slide'), name: board.name, background: board.background, objects: board.objects, notes: '', comments: board.comments || [] }));
      data = { slides: slides.length ? slides : (makeArtifact('slides').data as SlidesDocument).slides };
    } else if (target === 'design' || target === 'whiteboard') {
      if (active.type === 'slides') {
        const source = active.data as SlidesDocument;
        const artboards: Artboard[] = source.slides.map((slide) => ({ id: makeId('artboard'), name: slide.name, width: 1200, height: 675, background: slide.background, objects: slide.objects, comments: slide.comments || [] }));
        data = { artboards: artboards.length ? artboards : (makeArtifact(target).data as DesignDocument).artboards };
      } else if (active.type === 'design' || active.type === 'whiteboard') data = active.data as DesignDocument;
      else return;
    } else return;
    const label = target === 'slides' ? 'Slides' : target === 'whiteboard' ? 'Whiteboard' : 'Design';
    const converted = makeArtifact(target, active.name + ' — ' + label, data);
    converted.workspace = active.workspace;
    create(converted);
  };
  const refreshActive = () => {
    if (!active) return;
    if (onRefreshArtifact) { onRefreshArtifact(active); return; }
    const saved = readArtifacts().find((item) => item.id === active.id);
    if (saved) setArtifacts((items) => items.map((item) => item.id === active.id ? saved : item));
  };
  const handoffToAgentSam = () => {
    if (!active || !onOpenCode) return;
    onOpenCode({ artifactId: active.id, artifactType: active.type === 'slides' ? 'slides' : active.type === 'whiteboard' ? 'whiteboard' : active.type === 'code' ? 'code' : 'design', title: active.name });
  };
  const togglePin = (id: string) => setArtifacts((items) => items.map((item) => item.id === id ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() } : item));
  const deleteArtifact = (id: string) => {
    setArtifacts((items) => items.filter((item) => item.id !== id));
    if (activeId === id) { setActiveId(''); setRoute('gallery'); }
  };
  const updateActive = (data: CreativeArtifact['data']) => {
    if (!active) return;
    setArtifacts((items) => items.map((item) => item.id === active.id ? { ...item, data, updatedAt: new Date().toISOString() } : item));
  };
  const ask = onAskAgentSam && active ? (context: AskContext) => {
    updateAssistantOpen(true);
    onAskAgentSam(context);
  } : undefined;
  const requestDelete = (id: string) => setDeleteId(id);
  const workspaceLabel = active ? active.type === 'slides' ? 'Slides' : active.type === 'system' ? 'Design System' : active.type === 'code' ? 'Create in Code' : active.type === 'whiteboard' ? 'Whiteboard' : 'Design' : '';
  const leading = active ? (
    <div className="dcx-leading-actions">
      <button className="dcx-library-menu-button" type="button" aria-label="Toggle workspace navigation" aria-expanded={navOpen} onClick={() => setNavOpen(value => !value)}>
        <Menu size={17}/>
      </button>
      <button className="dcx-back-button" type="button" onClick={() => { setRoute('gallery'); setActiveId(''); }}>
        <ArrowLeft size={15}/><span>All work</span><span className="dcx-breadcrumb-separator">/</span><span>{workspaceLabel}</span>
      </button>
      <DocumentActionsMenu name={active.name} pinned={active.pinned} currentType={active.type} onRename={() => renameArtifact(active.id)} onDuplicate={() => duplicate(active)} onTogglePin={() => togglePin(active.id)} onExport={() => download(active.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json', active)} onDelete={() => requestDelete(active.id)} onSaveToLibrary={onSaveToLibrary ? () => onSaveToLibrary(active) : undefined} onShare={onShareArtifact ? () => onShareArtifact(active) : undefined} onHandoff={onOpenCode ? handoffToAgentSam : undefined} onTurnInto={active.type === 'slides' || active.type === 'design' || active.type === 'whiteboard' ? turnInto : undefined} onMoveTo={onMoveArtifact ? () => onMoveArtifact(active) : undefined} onRefresh={refreshActive} onStorage={() => setStorageInfoOpen(true)} onPermissions={onManagePermissions ? () => onManagePermissions(active) : onShareArtifact ? () => onShareArtifact(active) : undefined} onFeedback={onGiveFeedback ? () => onGiveFeedback(active) : undefined} onClose={() => { setRoute('gallery'); setActiveId(''); }}/>
    </div>
  ) : undefined;
  const documentActions = active ? (
    <div className="dcx-topbar-actions">
      <button className="dcx-topbar-icon" type="button" title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}>
        {fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
      </button>
      {onShareArtifact ? <button className="dcx-topbar-icon" type="button" title="Share document" aria-label="Share document" onClick={() => onShareArtifact(active)}>
        <Share2 size={16}/>
      </button> : null}
      <CreationMenu onCreate={selectCreation} onCreateBrandGuidelines={createBrandGuidelines}/>
      {onToggleOutputs ? <button className="dcx-topbar-icon" type="button" title={outputsOpen ? 'Return to canvas' : 'Show outputs and files'} aria-label={outputsOpen ? 'Return to canvas' : 'Show outputs and files'} aria-pressed={outputsOpen} onClick={onToggleOutputs}>
        {outputsOpen ? <PanelRightClose size={16}/> : <PanelRight size={16}/>}
      </button> : null}

    </div>
  ) : undefined;
  const editorChrome = {
    leading, documentActions, assistant, assistantOpen: effectiveAssistantOpen,
    onAssistantOpenChange: updateAssistantOpen, assistantDock, onAssistantDockChange
  };
  const editor = active ? active.type === 'slides'
    ? <SlideEditor key={active.id} artifact={active} onChange={updateActive} onAsk={ask} {...editorChrome}/>
    : active.type === 'system'
      ? <DesignSystemEditor artifact={active} onChange={updateActive} onAsk={ask} {...editorChrome}/>
      : active.type === 'code'
        ? <AgentSamBuildEditor artifact={active} leading={leading} documentActions={documentActions} onOpenCode={onOpenCode}/>
        : <DesignEditor artifact={active} onChange={updateActive} onOpenReferences={() => setRoute('references')} onAsk={ask} {...editorChrome}/> : null;
  if (route === 'references') return <SourceLibraryApp assetsBase={embedded ? '/design-canvas/sources' : './sources'} onExit={() => setRoute(active ? 'editor' : 'gallery')}/>;
  return <div ref={rootRef} className={'dcx-root' + (embedded ? ' is-embedded' : '') + (route === 'gallery' ? ' is-gallery' : '') + (fullscreen ? ' is-fullscreen' : '')}>
    <main className="dcx-main">
      {route === 'gallery' ? (
        <header className="dcx-appbar">
          <button className="dcx-library-menu-button" type="button" aria-label="Open Design navigation" aria-expanded={navOpen} onClick={() => setNavOpen(value => !value)}>
            <Menu size={17}/>
          </button>
        </header>
      ) : null}
      {route === 'gallery' ? <section className="dcx-gallery">
        <div className="dcx-library-heading">
          <h1>Design</h1>
        </div>
        <div className="dcx-library-toolbar">
          <nav className="dcx-library-tabs" role="tablist" aria-label="Work filters">
            {(['all','pinned','yours','shared'] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value === 'all' ? 'All' : value === 'pinned' ? 'Pinned' : value === 'yours' ? 'Yours' : 'Shared with you'}</button>)}
          </nav>
          <div className="dcx-gallery-tools">
            {searchOpen || query ? (
              <div className="dcx-search is-open">
                <Search size={15}/>
                <input autoFocus={searchOpen && !query} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your work" aria-label="Search your work"/>
                <button type="button" aria-label="Clear search" title="Clear search" onClick={() => { setQuery(''); setSearchOpen(false); }}><X size={14}/></button>
              </div>
            ) : (
              <button className="dcx-gallery-tool" type="button" title="Search" aria-label="Search" onClick={() => setSearchOpen(true)}><Search size={16}/></button>
            )}
          <div className="dcx-filter-anchor">
            <button className={'dcx-gallery-tool' + (filterType !== 'all' ? ' active' : '')} title="Filter by type" aria-label="Filter by type" aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}><SlidersHorizontal size={16}/></button>
            {filterOpen ? <div className="dcx-filter-popover" role="group" aria-label="Filter by type">
              {([{value:'all',label:'All types'},{value:'slides',label:'Slides'},{value:'design',label:'Design'},{value:'code',label:'Create in Code'},{value:'system',label:'Design System'},{value:'whiteboard',label:'Whiteboard'}] as const).map(option => <button key={option.value} className={filterType === option.value ? 'active' : ''} onClick={() => { setFilterType(option.value); setFilterOpen(false); }}>{option.label}</button>)}
            </div> : null}
          </div>
          <button className="dcx-gallery-tool" type="button" title={viewMode === 'grid' ? 'List view' : 'Grid view'} aria-label={viewMode === 'grid' ? 'List view' : 'Grid view'} aria-pressed={viewMode === 'list'} onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>{viewMode === 'grid' ? <List size={16}/> : <LayoutGrid size={16}/>}</button>
          </div>
        </div>
        <section className="dcx-create-section">
          <div className="dcx-section-label">Make something new</div>
          <div className="dcx-create-grid">
            <button className="dcx-create-tile slides" onClick={() => selectCreation('slides')}><img src={slidesCover} alt=""/><span>Slides</span></button>
            <button className="dcx-create-tile brand-guidelines" onClick={createBrandGuidelines}><img src={brandGuidelinesCover} alt=""/><span>Brand Guidelines <i>Template</i></span></button>
            <button className="dcx-create-tile design" onClick={() => selectCreation('design')}><img src={designCover} alt=""/><span>Design</span></button>
            <button className="dcx-create-tile code" onClick={() => selectCreation('code')}><img src={codeCover} alt=""/><span>Create in Code</span></button>
            <button className="dcx-create-tile system" onClick={() => selectCreation('system')}><img src={systemCover} alt=""/><span>Design System</span></button>
            <button className="dcx-create-tile whiteboard" onClick={() => selectCreation('whiteboard')}><img src={whiteboardCover} alt=""/><span>Whiteboard <i>Beta</i></span></button>
          </div>
        </section>
        <section className="dcx-artifacts-section" aria-label="Saved work">
          {visible.length ? <div className={'dcx-artifact-grid' + (viewMode === 'list' ? ' is-list' : '')}>{visible.map((item) => <ArtifactCard key={item.id} artifact={item} onOpen={() => { setActiveId(item.id); setRoute('editor'); }} onRename={() => renameArtifact(item.id)} onDuplicate={() => duplicate(item)} onTogglePin={() => togglePin(item.id)} onDelete={() => requestDelete(item.id)}/>)}</div> : <EmptyState title={query ? 'No matching work' : tab === 'pinned' ? 'Nothing pinned yet' : tab === 'shared' ? 'Nothing shared with you yet' : 'Your work will appear here'} description={query ? 'Try another search or clear the type filter.' : tab === 'pinned' ? 'Pin a document from its actions menu to find it here.' : tab === 'shared' ? 'Documents shared with you will appear here.' : 'Create a presentation, design, design system or whiteboard, or open Code to work in an existing project.'}/>}
        </section>
        {storageError ? <div className="dcx-storage-warning" role="status">Changes could not be saved in this browser.</div> : null}
        {filterOpen ? <button className="dcx-filter-dismiss" aria-label="Close filters" onClick={() => setFilterOpen(false)}/> : null}
        {navOpen ? <div className="dcx-library-nav-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setNavOpen(false); }}>
          <nav className="dcx-library-nav" aria-label="Creative workspace navigation">
            <div className="dcx-library-nav-heading"><strong>Design</strong><button onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={16}/></button></div>
            <button onClick={() => { setRoute('gallery'); setActiveId(''); setNavOpen(false); }}><LayoutGrid size={16}/> All work</button>
            <div className="dcx-library-nav-label">Library</div>
            <button onClick={() => { setRoute('references'); setNavOpen(false); }}><Library size={16}/> Reference library</button>
          </nav>
        </div> : null}
      </section> : active && editor ? <section className="dcx-editor-view">{editor}</section> : null}
      {route === 'editor' && navOpen ? <div className="dcx-library-nav-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setNavOpen(false); }}>
        <nav className="dcx-library-nav" aria-label="Creative workspace navigation">
          <div className="dcx-library-nav-heading"><strong>Creative workspace</strong><button onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={16}/></button></div>
          <button onClick={() => { setRoute('gallery'); setActiveId(''); setNavOpen(false); }}><LayoutGrid size={16}/> All work</button>
          <div className="dcx-library-nav-label">Create</div>
          <button onClick={() => selectCreation('slides')}><Presentation size={16}/> Presentation</button>
          <button onClick={createBrandGuidelines}><FileText size={16}/> Brand Guidelines template</button>
          <button onClick={() => selectCreation('design')}><Shapes size={16}/> Design</button>
          <button onClick={() => selectCreation('system')}><Settings2 size={16}/> Design system</button>
          <button onClick={() => selectCreation('whiteboard')}><StickyNote size={16}/> Whiteboard</button>
          <button onClick={() => selectCreation('code')}><Code2 size={16}/> Open Code</button>
          <div className="dcx-library-nav-label">Library</div>
          <button onClick={() => { setRoute('references'); setNavOpen(false); }}><Library size={16}/> Reference library</button>
        </nav>
      </div> : null}
      {storageInfoOpen && active ? <div className="dcx-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setStorageInfoOpen(false); }}><div className="dcx-modal" role="dialog" aria-modal="true" aria-labelledby="dcx-storage-title"><div className="dcx-modal-heading"><strong id="dcx-storage-title">Document storage</strong><button type="button" aria-label="Close storage details" onClick={() => setStorageInfoOpen(false)}><X size={16}/></button></div><p>This document is currently stored in the Design workspace's browser-backed document store.</p><Field label="Storage key"><input readOnly value={STORAGE_KEY}/></Field><Field label="Document"><input readOnly value={active.name}/></Field><Field label="Approximate record size"><input readOnly value={(JSON.stringify(active).length).toLocaleString() + ' characters'}/></Field><div className="dcx-modal-actions"><button type="button" className="dcx-secondary-button" onClick={() => setStorageInfoOpen(false)}>Close</button><button type="button" className="dcx-primary-button" onClick={() => { download(active.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json', active); setStorageInfoOpen(false); }}>Export backup</button></div></div></div> : null}
      {renameId ? <div className="dcx-modal-backdrop"><form className="dcx-modal" onSubmit={(event) => { event.preventDefault(); setArtifacts((items) => items.map((item) => item.id === renameId ? { ...item, name: renameValue, updatedAt: new Date().toISOString() } : item)); setRenameId(''); }}><div className="dcx-modal-heading"><strong>Rename</strong><button type="button" onClick={() => setRenameId('')}><X size={16}/></button></div><Field label="Name"><input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus/></Field><div className="dcx-modal-actions"><button type="button" className="dcx-secondary-button" onClick={() => setRenameId('')}>Cancel</button><button className="dcx-primary-button">Save</button></div></form></div> : null}
      {deleteId ? (
        <div className="dcx-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDeleteId(''); }}>
          <div className="dcx-modal" role="alertdialog" aria-modal="true" aria-labelledby="dcx-delete-title" aria-describedby="dcx-delete-description">
            <div className="dcx-modal-heading">
              <strong id="dcx-delete-title">Delete document?</strong>
              <button type="button" aria-label="Close confirmation" onClick={() => setDeleteId('')}><X size={16}/></button>
            </div>
            <p id="dcx-delete-description">“{artifacts.find(item => item.id === deleteId)?.name || 'This document'}” will be removed from this workspace. This cannot be undone.</p>
            <div className="dcx-modal-actions">
              <button type="button" className="dcx-secondary-button" onClick={() => setDeleteId('')}>Cancel</button>
              <button type="button" className="dcx-danger-button" onClick={() => { deleteArtifact(deleteId); setDeleteId(''); }}>Delete document</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  </div>;
}
