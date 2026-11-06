import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Bold, Check, ChevronDown, Code2, Highlighter, Italic, Link2, List, ListOrdered, MessageCircle, Palette, Strikethrough, Underline } from 'lucide-react';

export type TextTone = 'default' | 'danger' | 'warning' | 'success' | 'info' | 'teal' | 'accent';
export type TextFormat = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'bullet' | 'number';
export type ReviewTag = 'review' | 'question' | 'important';

export type DocumentSelectionToolbarProps = {
  anchor: { left: number; top: number; bottom: number };
  agentIcon: ReactNode;
  activeStyle?: 'paragraph'|'h1'|'h2'|'h3';
  activeTone?: TextTone;
  activeHighlight?: TextTone | null;
  onAsk: () => void;
  onFormat: (format: TextFormat) => void;
  onTextTone: (tone: TextTone) => void;
  onHighlight: (tone: TextTone | null) => void;
  onLink: (url: string) => void;
  onComment: (comment: string, sendToAgent: boolean) => void;
  onReact: (tag: ReviewTag) => void;
  onDismiss: () => void;
};

type MenuName = 'style' | 'color' | 'list' | 'comment' | 'link' | 'react' | null;

const HEADINGS: { id: TextFormat; label: string }[] = [
  { id: 'paragraph', label: 'Text' },
  { id: 'h1', label: 'Heading 1' },
  { id: 'h2', label: 'Heading 2' },
  { id: 'h3', label: 'Heading 3' },
];
const TONES: { id: TextTone; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'danger', label: 'Red' },
  { id: 'warning', label: 'Yellow' },
  { id: 'success', label: 'Green' },
  { id: 'teal', label: 'Teal' },
  { id: 'accent', label: 'Purple' },
];

export function DocumentSelectionToolbar({
  anchor, agentIcon, activeStyle = 'paragraph', activeTone = 'default', activeHighlight = null,
  onAsk, onFormat, onTextTone, onHighlight, onLink, onComment, onReact, onDismiss,
}: DocumentSelectionToolbarProps) {
  const [menu, setMenu] = useState<MenuName>(null);
  const [comment, setComment] = useState('');
  const [sendToAgent, setSendToAgent] = useState(true);
  const [url, setUrl] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const width = root.current?.offsetWidth ?? 420;
    const x = Math.min(Math.max(8, anchor.left - width / 2), Math.max(8, window.innerWidth - width - 8));
    const y = anchor.top >= 52 ? anchor.top - 48 : Math.min(anchor.bottom + 8, window.innerHeight - 48);
    setPosition({ x, y });
  }, [anchor.left, anchor.top, anchor.bottom]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onDismiss();
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (menu) setMenu(null);
      else onDismiss();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [menu, onDismiss]);
  const command = (format: TextFormat) => { onFormat(format); setMenu(null); };
  const button = (label: string, icon: ReactNode, action: () => void, expanded?: MenuName) =>
    <button type="button" className="agent-selection-button" title={label} aria-label={label}
      aria-haspopup={expanded ? 'menu' : undefined} aria-expanded={expanded ? menu === expanded : undefined}
      onClick={action}>{icon}</button>;
  const toggle = (next: MenuName) => setMenu(current => current === next ? null : next);
  const dismissMenu = () => setMenu(null);
  return <div ref={root} role="toolbar" aria-label="Format selected text" data-agent-selection-toolbar=""
      className="agent-selection-toolbar" data-menu-above={typeof window !== 'undefined' && position.y + 380 > window.innerHeight ? 'true' : undefined}
      style={{ '--selection-x': position.x + 'px', '--selection-y': position.y + 'px' } as CSSProperties}
      onPointerDown={event => {
        // Preserve a browser DOM Range when the toolbar is clicked; its controls
        // must never re-target formatting to an accidental caret position.
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement))
          event.preventDefault();
      }}>
    {button('Ask AgentSam about selection', agentIcon, () => { onAsk(); dismissMenu(); })}
    {button('Comment on selection', <MessageCircle size={17}/>, () => toggle('comment'), 'comment')}
    {button('Mark for review', <Highlighter size={16}/>, () => toggle('react'), 'react')}
    <span className="agent-selection-separator" aria-hidden="true"/>
    {button('Text style', <><span className="agent-selection-style-text">{activeStyle==='paragraph'?'Text':activeStyle.toUpperCase()}</span><ChevronDown size={12}/></>, () => toggle('style'), 'style')}
    <span className="agent-selection-separator" aria-hidden="true"/>
    {button('Bold', <Bold size={18}/>, () => command('bold'))}
    {button('Italic', <Italic size={18}/>, () => command('italic'))}
    {button('Underline', <Underline size={18}/>, () => command('underline'))}
    {button('Strikethrough', <Strikethrough size={18}/>, () => command('strike'))}
    {button('Code', <Code2 size={17}/>, () => command('code'))}
    <span className="agent-selection-separator" aria-hidden="true"/>
    {button('Text and highlight colors', <><Palette size={18}/><ChevronDown size={12}/></>, () => toggle('color'), 'color')}
    {button('Bullets and numbering', <><List size={18}/><ChevronDown size={12}/></>, () => toggle('list'), 'list')}
    {button('Insert link', <Link2 size={18}/>, () => toggle('link'), 'link')}
    {menu && <div className="agent-selection-menu" role={menu === 'comment' || menu === 'link' ? 'group' : 'menu'}
        aria-label={menu === 'color' ? 'Text and highlight color' : menu === 'style' ? 'Text style' : menu}>
      {menu === 'style' && HEADINGS.map(item =>
        <button type="button" role="menuitem" key={item.id} className="agent-selection-menu-item"
          onClick={() => command(item.id)} aria-checked={item.id===activeStyle}>
          <span>{item.label}</span>{item.id===activeStyle?<Check size={16} aria-hidden="true"/>:null}
        </button>)}
      {menu === 'color' && <>
        <div className="agent-selection-menu-label">Text</div>
        {TONES.map(item => <button type="button" role="menuitem" key={'text-'+item.id}
          className="agent-selection-menu-item" onClick={() => { onTextTone(item.id); dismissMenu(); }}>
          <i aria-hidden="true" className="agent-selection-swatch" data-tone={item.id}/><span>{item.label}</span>
          {activeTone === item.id ? <Check size={16} aria-hidden="true"/> : null}
        </button>)}
        <div className="agent-selection-menu-label">Highlight</div>
        <button type="button" role="menuitem" className="agent-selection-menu-item"
          onClick={() => { onHighlight(null); dismissMenu(); }}><span>No highlight</span>
          {!activeHighlight ? <Check size={16} aria-hidden="true"/> : null}</button>
        {TONES.filter(item => item.id !== 'default').map(item =>
          <button type="button" role="menuitem" key={'highlight-'+item.id} className="agent-selection-menu-item"
            onClick={() => { onHighlight(item.id); dismissMenu(); }}>
            <i aria-hidden="true" className="agent-selection-swatch" data-tone={item.id}/><span>{item.label}</span>
            {activeHighlight === item.id ? <Check size={16} aria-hidden="true"/> : null}</button>)}
      </>}
      {menu === 'list' && <>
        <button type="button" role="menuitem" className="agent-selection-menu-item" onClick={() => command('bullet')}><List size={17}/>Bulleted list</button>
        <button type="button" role="menuitem" className="agent-selection-menu-item" onClick={() => command('number')}><ListOrdered size={17}/>Numbered list</button>
      </>}
      {menu === 'react' && ([
        ['review','Review'],['question','Question'],['important','Important'],
      ] as [ReviewTag,string][]).map(([tag,label]) => <button type="button" role="menuitem"
        className="agent-selection-menu-item" key={tag} onClick={() => { onReact(tag); dismissMenu(); }}>
        {label}</button>)}
      {menu === 'link' && <form className="agent-selection-form" onSubmit={event => {
        event.preventDefault(); try {
          const parsed = new URL(url.trim()); if (!['https:', 'http:'].includes(parsed.protocol)) return;
          onLink(parsed.href); dismissMenu(); setUrl('');
        } catch { /* Browser validation below prompts for a valid URL. */ }
      }}>
        <label htmlFor="agent-selection-url">Link address</label>
        <input id="agent-selection-url" type="url" required placeholder="https://…" value={url}
          onChange={event => setUrl(event.target.value)} />
        <button type="submit">Apply link</button>
      </form>}
      {menu === 'comment' && <form className="agent-selection-form" onSubmit={event => {
        event.preventDefault(); if (!comment.trim()) return;
        onComment(comment.trim(), sendToAgent); dismissMenu(); setComment('');
      }}>
        <label htmlFor="agent-selection-comment">Comment on selected text</label>
        <textarea id="agent-selection-comment" required rows={3} maxLength={2000} value={comment}
          onChange={event => setComment(event.target.value)} placeholder="What should change?"/>
        <label className="agent-selection-check">
          <input type="checkbox" checked={sendToAgent} onChange={event => setSendToAgent(event.target.checked)}/>
          Send to AgentSam
        </label>
        <button type="submit">Save comment</button>
      </form>}
    </div>}
  </div>;
}
