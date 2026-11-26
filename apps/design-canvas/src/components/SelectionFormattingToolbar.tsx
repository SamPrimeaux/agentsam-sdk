import { useMemo, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Check, ChevronDown, Crop, Italic,
  Link2, MessageCircle, Palette, Settings2, SlidersHorizontal, Sparkles,
  Square, Type, Underline
} from 'lucide-react';
import type { CreativeObject } from '../creative-model';
import { MenuAction, MenuDivider, MenuPopover } from './EditorMenus';

type Anchor = { left: number; top: number; side: 'top' | 'bottom' };
type Props = {
  object: CreativeObject;
  anchor: Anchor;
  colors: string[];
  onChange: (patch: Partial<CreativeObject>) => void;
  onMore: () => void;
  onComment: () => void;
  onAlign?: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onAsk?: () => void;
};

const FONT_FAMILIES = ['Inter', 'Arial', 'Helvetica Neue', 'Georgia', 'Times New Roman'];
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96];
const PALETTE = ['#111827','#374151','#6b7280','#9ca3af','#e5e7eb','#ffffff','#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899'];

function ColorMenu({ label, value, colors, onChange, side }: {
  label: string; value: string; colors: string[]; onChange: (value: string) => void; side: 'top' | 'bottom';
}) {
  const swatches = Array.from(new Set([...colors, ...PALETTE]));
  return <MenuPopover label={label} side={side} trigger={<><span className="dcx-context-color-dot" style={{ background: value || '#ffffff' }}/><ChevronDown size={11}/></>} triggerClassName="dcx-context-icon-trigger">
    {(close) => <>
      <div className="dcx-menu-section-label">Document colors</div>
      <div className="dcx-context-swatches">{swatches.map((color) => <button key={color} type="button" role="menuitem" title={color} aria-label={'Use ' + color} className={value.toLowerCase() === color.toLowerCase() ? 'selected' : ''} style={{ background: color }} onClick={() => { onChange(color); close(); }}>{value.toLowerCase() === color.toLowerCase() ? <Check size={12}/> : null}</button>)}</div>
      <label className="dcx-context-custom-color"><span>Custom color</span><input aria-label={'Custom ' + label.toLowerCase()} type="color" value={value || '#ffffff'} onChange={(event) => onChange(event.target.value)}/></label>
    </>}
  </MenuPopover>;
}

function AlignmentMenu({ object, onChange, side }: { object: CreativeObject; onChange: (patch: Partial<CreativeObject>) => void; side: 'top' | 'bottom' }) {
  const horizontal = [
    { value: 'left' as const, label: 'Align left', icon: <AlignLeft size={15}/> },
    { value: 'center' as const, label: 'Align center', icon: <AlignCenter size={15}/> },
    { value: 'right' as const, label: 'Align right', icon: <AlignRight size={15}/> },
  ];
  return <MenuPopover label="Alignment" side={side} trigger={<><AlignCenter size={15}/><ChevronDown size={11}/></>} triggerClassName="dcx-context-icon-trigger">
    {(close) => <>
      <div className="dcx-menu-section-label">Horizontal</div>
      {horizontal.map((item) => <MenuAction key={item.value} label={item.label} icon={object.align === item.value ? <Check size={14}/> : item.icon} onClick={() => onChange({ align: item.value })} close={close}/>)}
      <MenuDivider/>
      <div className="dcx-menu-section-label">Vertical</div>
      {(['top','middle','bottom'] as const).map((value) => <MenuAction key={value} label={'Align ' + value} icon={object.verticalAlign === value ? <Check size={14}/> : undefined} onClick={() => onChange({ verticalAlign: value })} close={close}/>)}
    </>}
  </MenuPopover>;
}

export function SelectionFormattingToolbar({ object, anchor, colors, onChange, onMore, onComment, onAlign, onAsk }: Props) {
  const [fontQuery, setFontQuery] = useState('');
  const [linkValue, setLinkValue] = useState(object.link || '');
  const [borderColor, setBorderColor] = useState(object.borderColor || '#ffffff');
  const fonts = useMemo(() => FONT_FAMILIES.filter((font) => font.toLowerCase().includes(fontQuery.toLowerCase())), [fontQuery]);
  const isText = object.type === 'text';
  const isImage = object.type === 'image';
  const isShape = object.type === 'shape';
  const activeColor = object.color || '#17191d';
  return <div className="dcx-selection-formatting-toolbar" role="toolbar" aria-label={'Format selected ' + object.type} style={{ left: anchor.left, top: anchor.top }} onPointerDown={(event) => event.stopPropagation()}>
    {isText ? <>
      <MenuPopover label="Font family" side={anchor.side} trigger={<><Type size={14}/><span className="dcx-context-font-name">{object.fontFamily || 'Inter'}</span><ChevronDown size={11}/></>} triggerClassName="dcx-context-font-trigger">
        {(close) => <>
          <input className="dcx-context-search" aria-label="Search fonts" placeholder="Search fonts" value={fontQuery} onChange={(event) => setFontQuery(event.target.value)}/>
          {fonts.map((font) => <MenuAction key={font} label={font} icon={object.fontFamily === font ? <Check size={14}/> : undefined} onClick={() => { onChange({ fontFamily: font }); setFontQuery(''); }} close={close}/>)}
          {!fonts.length ? <div className="dcx-menu-empty">No matching fonts</div> : null}
        </>}
      </MenuPopover>
      <MenuPopover label="Font size" side={anchor.side} trigger={<><span>{object.fontSize || 28}</span><ChevronDown size={11}/></>} triggerClassName="dcx-context-size-trigger">
        {(close) => <>
          {FONT_SIZES.map((size) => <MenuAction key={size} label={size + ' px'} icon={object.fontSize === size ? <Check size={14}/> : undefined} onClick={() => onChange({ fontSize: size })} close={close}/>)}
          <label className="dcx-context-number"><span>Custom size</span><input type="number" min="8" max="240" value={object.fontSize || 28} onChange={(event) => onChange({ fontSize: Math.max(8, Math.min(240, Number(event.target.value) || 8)) })}/></label>
        </>}
      </MenuPopover>
      <span className="dcx-context-divider"/>
      <button type="button" className={'dcx-context-icon-trigger' + ((object.weight || 500) >= 600 ? ' active' : '')} title="Bold" aria-label="Bold" aria-pressed={(object.weight || 500) >= 600} onClick={() => onChange({ weight: (object.weight || 500) >= 600 ? 500 : 700 })}><Bold size={15}/></button>
      <button type="button" className={'dcx-context-icon-trigger' + (object.italic ? ' active' : '')} title="Italic" aria-label="Italic" aria-pressed={!!object.italic} onClick={() => onChange({ italic: !object.italic })}><Italic size={15}/></button>
      <button type="button" className={'dcx-context-icon-trigger' + (object.underline ? ' active' : '')} title="Underline" aria-label="Underline" aria-pressed={!!object.underline} onClick={() => onChange({ underline: !object.underline })}><Underline size={15}/></button>
      <ColorMenu label="Text color" value={activeColor} colors={colors} onChange={(color) => onChange({ color })} side={anchor.side}/>
      <AlignmentMenu object={object} onChange={onChange} side={anchor.side}/>
    </> : null}
    {isImage ? <>
      <MenuPopover label="Crop image" side={anchor.side} trigger={<><Crop size={15}/><span>Crop</span><ChevronDown size={11}/></>} triggerClassName="dcx-context-action-trigger">
        {(close) => <>
          <MenuAction label="Fill frame" detail="Crop to the image frame" icon={object.imageFit === 'cover' || !object.imageFit ? <Check size={14}/> : undefined} onClick={() => onChange({ imageFit: 'cover' })} close={close}/>
          <MenuAction label="Fit image" detail="Show the complete image" icon={object.imageFit === 'contain' ? <Check size={14}/> : undefined} onClick={() => onChange({ imageFit: 'contain' })} close={close}/>
          <MenuAction label="Stretch" detail="Fill the frame exactly" icon={object.imageFit === 'fill' ? <Check size={14}/> : undefined} onClick={() => onChange({ imageFit: 'fill' })} close={close}/>
          <MenuDivider/>
          <div className="dcx-menu-section-label">Crop focus</div>
          {(['center','top','bottom','left','right'] as const).map((position) => <MenuAction key={position} label={position[0].toUpperCase() + position.slice(1)} icon={object.imagePosition === position ? <Check size={14}/> : undefined} onClick={() => onChange({ imagePosition: position })} close={close}/>)}
        </>}
      </MenuPopover>
      <MenuPopover label="Image border" side={anchor.side} trigger={<><Square size={15}/><ChevronDown size={11}/></>} triggerClassName="dcx-context-icon-trigger">
        {(close) => <>
          <label className="dcx-context-custom-color"><span>Border color</span><input type="color" value={borderColor} onChange={(event) => { setBorderColor(event.target.value); onChange({ borderColor: event.target.value, borderWidth: object.borderWidth || 1, borderStyle: 'solid' }); }}/></label>
          <MenuAction label={object.borderWidth ? 'Remove border' : 'Add 1 px border'} onClick={() => onChange({ borderWidth: object.borderWidth ? 0 : 1, borderStyle: object.borderWidth ? 'none' : 'solid', borderColor })} close={close}/>
        </>}
      </MenuPopover>
      <MenuPopover label="Image link" side={anchor.side} trigger={<Link2 size={15}/>} triggerClassName="dcx-context-icon-trigger">
        {(close) => <form className="dcx-context-link-form" onSubmit={(event) => { event.preventDefault(); onChange({ link: linkValue.trim() || undefined }); close(); }}><label>Link URL</label><input type="url" value={linkValue} onChange={(event) => setLinkValue(event.target.value)} placeholder="https://…"/><button type="submit">Apply link</button></form>}
      </MenuPopover>
      <AlignmentMenu object={object} onChange={(patch) => { if (patch.align && onAlign) onAlign(patch.align); else onChange(patch); }} side={anchor.side}/>
    </> : null}
    {isShape ? <>
      <ColorMenu label="Fill color" value={object.fill || '#397ff2'} colors={colors} onChange={(fill) => onChange({ fill, fillType: 'solid' })} side={anchor.side}/>
      <MenuPopover label="Fill type" side={anchor.side} trigger={<><Palette size={15}/><ChevronDown size={11}/></>} triggerClassName="dcx-context-icon-trigger">
        {(close) => <>
          <MenuAction label="Solid" icon={!object.fillType || object.fillType === 'solid' ? <Check size={14}/> : undefined} onClick={() => onChange({ fillType: 'solid' })} close={close}/>
          <MenuAction label="Gradient" icon={object.fillType === 'gradient' ? <Check size={14}/> : undefined} onClick={() => onChange({ fillType: 'gradient', gradientFrom: object.gradientFrom || object.fill || '#397ff2', gradientTo: object.gradientTo || '#8a6cf0', gradientAngle: object.gradientAngle ?? 135 })} close={close}/>
          <MenuAction label="Image" detail="Set an image fill in More formatting options" icon={object.fillType === 'image' ? <Check size={14}/> : undefined} onClick={() => onChange({ fillType: 'image' })} close={close}/>
        </>}
      </MenuPopover>
      <MenuPopover label="Stroke" side={anchor.side} trigger={<><Square size={15}/><ChevronDown size={11}/></>} triggerClassName="dcx-context-icon-trigger">
        {(close) => <>
          <label className="dcx-context-custom-color"><span>Stroke color</span><input type="color" value={borderColor} onChange={(event) => { setBorderColor(event.target.value); onChange({ borderColor: event.target.value }); }}/></label>
          <label className="dcx-context-number"><span>Stroke width</span><input type="number" min="0" max="24" value={object.borderWidth || 0} onChange={(event) => onChange({ borderWidth: Number(event.target.value), borderStyle: Number(event.target.value) ? 'solid' : 'none' })}/></label>
        </>}
      </MenuPopover>
      <MenuPopover label="Corners" side={anchor.side} trigger={<><span className="dcx-context-corner-icon"/><ChevronDown size={11}/></>} triggerClassName="dcx-context-icon-trigger">
        {(close) => <label className="dcx-context-number"><span>Corner radius</span><input type="range" min="0" max="48" value={object.radius || 0} onChange={(event) => onChange({ radius: Number(event.target.value) })}/></label>}
      </MenuPopover>
      {object.text ? <ColorMenu label="Shape text color" value={object.color || '#ffffff'} colors={colors} onChange={(color) => onChange({ color })} side={anchor.side}/> : null}
      {object.text ? <MenuPopover label="Shape text size" side={anchor.side} trigger={<><span>{object.fontSize || 18}</span><ChevronDown size={11}/></>} triggerClassName="dcx-context-size-trigger">{(close) => <>{[12,14,16,18,20,24,28,32,36,42,48].map((size) => <MenuAction key={size} label={size + ' px'} icon={object.fontSize === size ? <Check size={14}/> : undefined} onClick={() => onChange({ fontSize: size })} close={close}/>)}</>}</MenuPopover> : null}
      <MenuPopover label="Shadow" side={anchor.side} trigger={<><span className="dcx-context-shadow-icon"/><ChevronDown size={11}/></>} triggerClassName="dcx-context-icon-trigger">
        {(close) => <>
          <MenuAction label="No shadow" onClick={() => onChange({ shadow: undefined })} close={close}/>
          <MenuAction label="Soft" onClick={() => onChange({ shadow: '0 2px 8px rgba(0,0,0,.14)' })} close={close}/>
          <MenuAction label="Medium" onClick={() => onChange({ shadow: '0 8px 22px rgba(0,0,0,.18)' })} close={close}/>
          <MenuAction label="Strong" onClick={() => onChange({ shadow: '0 16px 40px rgba(0,0,0,.24)' })} close={close}/>
        </>}
      </MenuPopover>
    </> : null}
    {!isText && !isImage && !isShape ? <span className="dcx-context-object-label">{object.name}</span> : null}
    <span className="dcx-context-divider"/>
    <button type="button" className="dcx-context-icon-trigger" title="More formatting options" aria-label="More formatting options" onClick={onMore}><SlidersHorizontal size={15}/></button>
    <button type="button" className="dcx-context-icon-trigger" title="Comment" aria-label="Comment" onClick={onComment}><MessageCircle size={15}/></button>
    {onAsk ? <button type="button" className="dcx-context-ask" onClick={onAsk}><Sparkles size={14}/> Ask AgentSam</button> : null}
  </div>;
}
