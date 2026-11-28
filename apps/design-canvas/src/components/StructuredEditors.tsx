import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type CSSProperties } from 'react';
import { Plus, Trash2, Sparkles, ListChecks, Type, AlignLeft, Table2, Calculator, FileText, PanelTop, ChevronDown, ChevronLeft, X, Bold, Italic, Underline, Strikethrough, AlignCenter, AlignRight, PaintBucket, Grid2X2, Undo2, Redo2, List, Upload, Copy } from 'lucide-react';
import { DesignWorkspaceFrame } from '@inneranimalmedia/agentsam-workbench/design';
import type { DesignWorkspaceSnapshot } from '@inneranimalmedia/agentsam-contracts';
import type {
  CreativeArtifact, DesignCanvasAgentContext, PageDocument, PageBlock,
  PageTaskItem, TextDocument, DocumentBlock, SpreadsheetDocument, SpreadsheetSheet, SpreadsheetCellStyle,
} from '../creative-model';
import { makeId, blankSpreadsheet, reidentifyCreativeData } from '../creative-model';

type ChromeProps = {
  leading?: ReactNode;
  documentActions?: ReactNode;
  assistant?: ReactNode;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  assistantDock?: 'left' | 'right';
  onAssistantDockChange?: (dock: 'left' | 'right') => void;
};
type Props = ChromeProps & {
  artifact: CreativeArtifact;
  onChange: (data: CreativeArtifact['data']) => void;
  onAsk?: (context: DesignCanvasAgentContext) => void;
};

function workspaceSnapshot(artifact: CreativeArtifact, selection?: { id: string; kind: string }): DesignWorkspaceSnapshot {
  return {
    contract: 'agentsam.design-workspace.v1',
    resource: {
      id: artifact.id,
      kind: 'design',
      appId: 'agentsam-design-canvas',
      title: artifact.name,
      href: typeof window === 'undefined' ? '/admin/design-canvas' : window.location.href,
      accountId: '',
    },
    capabilities: ['create', 'open', 'select', 'inspect', 'modify', 'preview', 'save', 'undo', 'redo', 'export'],
    revision: artifact.updatedAt,
    savedRevision: artifact.updatedAt,
    dirty: false,
    selection: selection ? [{ id: selection.id, kind: selection.kind }] : [],
    status: 'ready',
  };
}

function askContext(artifact: CreativeArtifact, kind: string, label: string): DesignCanvasAgentContext {
  return { artifactId: artifact.id, artifactType: artifact.type, title: artifact.name, selection: { id: artifact.id, kind, label } };
}

function Frame({ artifact, stageLabel, selection, children, chrome }: {
  artifact: CreativeArtifact; stageLabel: string; selection?: { id: string; kind: string };
  children: ReactNode; chrome: ChromeProps;
}) {
  return <DesignWorkspaceFrame
    snapshot={workspaceSnapshot(artifact, selection)}
    leading={chrome.leading}
    documentActions={chrome.documentActions}
    assistant={chrome.assistant}
    assistantOpen={chrome.assistantOpen}
    onAssistantOpenChange={chrome.onAssistantOpenChange}
    assistantDock={chrome.assistantDock}
    onAssistantDockChange={chrome.onAssistantDockChange}
    stageLabel={stageLabel}
    className="dcx-shared-frame dcx-structured-frame"
  >
    {children}
  </DesignWorkspaceFrame>;
}

export function PageEditor({ artifact, onChange, onAsk, ...chrome }: Props) {
  const data = artifact.data as PageDocument;
  const updateBlock = (id: string, patch: Partial<PageBlock>) => onChange({
    ...data,
    blocks: data.blocks.map((block) => block.id === id ? { ...block, ...patch } as PageBlock : block),
  });
  const addBlock = (type: PageBlock['type']) => {
    const id = makeId('pageblock');
    const block: PageBlock = type === 'heading' ? { id, type, text: 'New section', level: 2 }
      : type === 'paragraph' ? { id, type, text: '' }
      : type === 'task_list' ? { id, type, title: 'To do', items: [] }
      : type === 'bullet_list' ? { id, type, title: 'List', items: [''] }
      : type === 'callout' ? { id, type, tone: 'info', text: '' }
      : { id, type: 'divider' };
    onChange({ ...data, blocks: [...data.blocks, block] });
  };
  const removeBlock = (id: string) => onChange({ ...data, blocks: data.blocks.filter((block) => block.id !== id) });
  const updateTask = (blockId: string, taskId: string, patch: Partial<PageTaskItem>) => {
    const block = data.blocks.find((item) => item.id === blockId);
    if (!block || block.type !== 'task_list') return;
    updateBlock(blockId, { items: block.items.map((item) => item.id === taskId ? { ...item, ...patch } : item) } as Partial<PageBlock>);
  };
  const addTask = (blockId: string) => {
    const block = data.blocks.find((item) => item.id === blockId);
    if (!block || block.type !== 'task_list') return;
    updateBlock(blockId, { items: [...block.items, { id: makeId('task'), text: '', checked: false }] } as Partial<PageBlock>);
  };

  return <Frame artifact={artifact} stageLabel="Page editor" selection={{ id: artifact.id, kind: 'page' }} chrome={chrome}>
    <div className="dcx-structured-stage dcx-page-stage">
      <div className="dcx-structured-toolbar">
        <div className="dcx-structured-toolbar-group">
          <button type="button" onClick={() => addBlock('heading')}><Type size={15}/> Heading</button>
          <button type="button" onClick={() => addBlock('paragraph')}><AlignLeft size={15}/> Text</button>
          <button type="button" onClick={() => addBlock('task_list')}><ListChecks size={15}/> Checklist</button>
          <button type="button" onClick={() => addBlock('callout')}><PanelTop size={15}/> Callout</button>
          <button type="button" onClick={() => addBlock('divider')}>Divider</button>
        </div>
        {onAsk ? <button type="button" className="dcx-structured-ask" onClick={() => onAsk({ ...askContext(artifact, 'page-assistant', 'Gather and organize my tasks'), comment: 'Check relevant conversations and connected apps for tasks I need to do. If context is incomplete, ask me what to add. Preserve existing edits and checkbox states. Do not invent tasks or deadlines.' })}><Sparkles size={15}/> Ask AgentSam</button> : null}
      </div>
      <article className="dcx-page-paper">
        <input className="dcx-structured-title" aria-label="Page title" value={data.title} onChange={(event) => onChange({ ...data, title: event.target.value })} placeholder="Untitled page"/>
        <input className="dcx-structured-subtitle" aria-label="Page description" value={data.subtitle || ''} onChange={(event) => onChange({ ...data, subtitle: event.target.value })} placeholder="Add a short description"/>
        <div className="dcx-page-blocks">
          {data.blocks.map((block) => <section className={'dcx-page-block dcx-page-block-' + block.type} key={block.id}>
            {block.type === 'heading' ? <input aria-label="Section heading" value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="Section heading"/> : null}
            {block.type === 'paragraph' ? <textarea aria-label="Paragraph" value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="Write something…"/> : null}
            {block.type === 'task_list' ? <div className="dcx-page-task-list">
              <input className="dcx-page-block-title" value={block.title} onChange={(event) => updateBlock(block.id, { title: event.target.value })} aria-label="Checklist title"/>
              {block.items.map((task) => <div className="dcx-page-task" key={task.id}>
                <input type="checkbox" checked={task.checked} onChange={(event) => updateTask(block.id, task.id, { checked: event.target.checked })} aria-label="Mark task complete"/>
                <input value={task.text} onChange={(event) => updateTask(block.id, task.id, { text: event.target.value })} placeholder="Add a task"/>
                <button type="button" aria-label="Remove task" onClick={() => updateBlock(block.id, { items: block.items.filter((item) => item.id !== task.id) } as Partial<PageBlock>)}><Trash2 size={13}/></button>
              </div>)}
              <button type="button" className="dcx-structured-inline-add" onClick={() => addTask(block.id)}><Plus size={14}/> Add task</button>
            </div> : null}
            {block.type === 'bullet_list' ? <div className="dcx-page-task-list">
              <input className="dcx-page-block-title" value={block.title || ''} onChange={(event) => updateBlock(block.id, { title: event.target.value })} aria-label="List title"/>
              {block.items.map((item, index) => <div className="dcx-page-task" key={index}><span>•</span><input value={item} onChange={(event) => updateBlock(block.id, { items: block.items.map((value, i) => i === index ? event.target.value : value) })} placeholder="List item"/></div>)}
              <button type="button" className="dcx-structured-inline-add" onClick={() => updateBlock(block.id, { items: [...block.items, ''] })}><Plus size={14}/> Add item</button>
            </div> : null}
            {block.type === 'callout' ? <div className={'dcx-page-callout is-' + block.tone}>
              <select aria-label="Callout tone" value={block.tone} onChange={(event) => updateBlock(block.id, { tone: event.target.value as 'info' | 'success' | 'warning' })}><option value="info">Info</option><option value="success">Success</option><option value="warning">Attention</option></select>
              <textarea aria-label="Callout text" value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="Add a note"/>
            </div> : null}
            {block.type === 'divider' ? <hr/> : null}
            <button type="button" className="dcx-structured-remove" aria-label="Remove block" onClick={() => removeBlock(block.id)}><Trash2 size={13}/></button>
          </section>)}
          {!data.blocks.length ? <div className="dcx-structured-empty"><ListChecks size={25}/><strong>Your page starts here</strong><p>Add a heading, text block or checklist. Your changes are saved as an editable Page.</p></div> : null}
        </div>
      </article>
    </div>
  </Frame>;
}

export function DocumentEditor({ artifact, onChange, onAsk, ...chrome }: Props) {
  const data = artifact.data as TextDocument;
  const addBlock = (type: DocumentBlock['type']) => {
    const id = makeId('docblock');
    const block: DocumentBlock = type === 'heading' ? { id, type, text: 'New section', level: 2 }
      : type === 'paragraph' ? { id, type, text: '' }
      : type === 'bullet_list' ? { id, type, items: [''] }
      : type === 'callout' ? { id, type, tone: 'info', text: '' }
      : { id, type: 'divider' };
    onChange({ ...data, blocks: [...data.blocks, block] });
  };
  const updateBlock = (id: string, patch: Partial<DocumentBlock>) => onChange({ ...data, blocks: data.blocks.map((block) => block.id === id ? { ...block, ...patch } as DocumentBlock : block) });

  return <Frame artifact={artifact} stageLabel="Document editor" selection={{ id: artifact.id, kind: 'document' }} chrome={chrome}>
    <div className="dcx-structured-stage dcx-document-stage">
      <div className="dcx-structured-toolbar">
        <div className="dcx-structured-toolbar-group">
          <button type="button" onClick={() => addBlock('heading')}><Type size={15}/> Heading</button>
          <button type="button" onClick={() => addBlock('paragraph')}><AlignLeft size={15}/> Paragraph</button>
          <button type="button" onClick={() => addBlock('bullet_list')}><ListChecks size={15}/> Bullets</button>
          <button type="button" onClick={() => addBlock('callout')}><PanelTop size={15}/> Callout</button>
          <button type="button" onClick={() => addBlock('divider')}>Divider</button>
        </div>
        {onAsk ? <button type="button" className="dcx-structured-ask" onClick={() => onAsk(askContext(artifact, 'document-content', 'Review and develop this document'))}><Sparkles size={15}/> Ask AgentSam</button> : null}
      </div>
      <article className="dcx-document-paper">
        <input className="dcx-structured-title" aria-label="Document title" value={data.title} onChange={(event) => onChange({ ...data, title: event.target.value })} placeholder="Untitled document"/>
        <input className="dcx-structured-subtitle" aria-label="Document subtitle" value={data.subtitle} onChange={(event) => onChange({ ...data, subtitle: event.target.value })} placeholder="Add a subtitle or short description"/>
        <div className="dcx-document-blocks">
          {data.blocks.map((block) => <section className={'dcx-document-block dcx-document-block-' + block.type} key={block.id}>
            {block.type === 'heading' ? <input aria-label="Section heading" value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="Section heading"/> : null}
            {block.type === 'paragraph' ? <textarea aria-label="Paragraph" value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="Write your content…"/> : null}
            {block.type === 'bullet_list' ? <div className="dcx-document-bullets">
              {block.items.map((item, index) => <div key={index}><span>•</span><input value={item} onChange={(event) => updateBlock(block.id, { items: block.items.map((value, i) => i === index ? event.target.value : value) })} placeholder="Add a bullet point"/></div>)}
              <button type="button" className="dcx-structured-inline-add" onClick={() => updateBlock(block.id, { items: [...block.items, ''] })}><Plus size={14}/> Add bullet</button>
            </div> : null}
            {block.type === 'callout' ? <div className="dcx-page-callout">
              <select aria-label="Callout tone" value={block.tone} onChange={(event) => updateBlock(block.id, { tone: event.target.value as 'info' | 'success' | 'warning' })}><option value="info">Info</option><option value="success">Success</option><option value="warning">Attention</option></select>
              <textarea aria-label="Callout text" value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="Add a note"/>
            </div> : null}
            {block.type === 'divider' ? <hr/> : null}
            <button type="button" className="dcx-structured-remove" aria-label="Remove section" onClick={() => onChange({ ...data, blocks: data.blocks.filter((item) => item.id !== block.id) })}><Trash2 size={13}/></button>
          </section>)}
          {!data.blocks.length ? <div className="dcx-structured-empty"><FileText size={25}/><strong>Start writing</strong><p>Add a heading, paragraph, list or callout. This document stays fully editable.</p></div> : null}
        </div>
      </article>
    </div>
  </Frame>;
}

function columnName(index: number): string {
  let n = index + 1, result = '';
  while (n > 0) { const rem = (n - 1) % 26; result = String.fromCharCode(65 + rem) + result; n = Math.floor((n - 1) / 26); }
  return result;
}
function parseCellRef(value: string): { row: number; column: number } | null {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(value.trim());
  if (!match) return null;
  let column = 0;
  for (const char of match[1].toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, column: column - 1 };
}
function rawCell(sheet: SpreadsheetSheet, row: number, column: number): string {
  return sheet.rows[row]?.cells[sheet.columns[column]?.id] || '';
}
function evaluateFormula(raw: string, sheet: SpreadsheetSheet, depth = 0): string {
  if (!raw.startsWith('=')) return raw;
  if (depth > 8) return '#CYCLE';
  const match = /^=(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX)\(\s*([A-Z]+[1-9]\d*)(?::([A-Z]+[1-9]\d*))?\s*\)$/i.exec(raw.trim());
  if (!match) return '#ERROR';
  const start = parseCellRef(match[2]), end = parseCellRef(match[3] || match[2]);
  if (!start || !end) return '#REF';
  const values: string[] = [];
  for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
    for (let column = Math.min(start.column, end.column); column <= Math.max(start.column, end.column); column++) {
      const value = rawCell(sheet, row, column);
      values.push(value.startsWith('=') ? evaluateFormula(value, sheet, depth + 1) : value);
    }
  }
  if (match[1].toUpperCase() === 'COUNTA') return String(values.filter((value) => value !== '').length);
  const numbers = values.filter((value) => value !== '' && Number.isFinite(Number(value))).map(Number);
  if (match[1].toUpperCase() === 'COUNT') return String(numbers.length);
  if (!numbers.length) return '0';
  if (match[1].toUpperCase() === 'SUM') return String(numbers.reduce((sum, value) => sum + value, 0));
  if (match[1].toUpperCase() === 'AVERAGE') return String(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
  if (match[1].toUpperCase() === 'MIN') return String(Math.min(...numbers));
  return String(Math.max(...numbers));
}

type CellPoint = { rowId: string; columnId: string };

function parseWorkbookCSV(text: string): string[][] {
  const result: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || value === '') quoted = !quoted;
      else value += ch;
    } else if (!quoted && ch === ',') { row.push(value); value = ''; }
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(value); result.push(row); row = []; value = '';
    } else value += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (value || row.length) { row.push(value); result.push(row); }
  return result;
}

export function SpreadsheetEditor({ artifact, onChange, onAsk, ...chrome }: Props) {
  const data = artifact.data as SpreadsheetDocument;
  const sheet = data.sheets.find(item => item.id === data.activeSheetId) || data.sheets[0];
  const [selected, setSelected] = useState<CellPoint | null>(null);
  const [rangeEnd, setRangeEnd] = useState<CellPoint | null>(null);
  const [editing, setEditing] = useState<CellPoint | null>(null);
  const [menu, setMenu] = useState<'sheets' | 'add' | 'zoom' | 'format' | 'help' | null>(null);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState('');
  const [past, setPast] = useState<SpreadsheetDocument[]>([]);
  const [future, setFuture] = useState<SpreadsheetDocument[]>([]);
  const csvInput = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const selectedRow = selected ? sheet.rows.find(row => row.id === selected.rowId) : undefined;
  const selectedRaw = selectedRow && selected ? selectedRow.cells[selected.columnId] || '' : '';
  const selectedStyle = selectedRow && selected ? selectedRow.cellStyles?.[selected.columnId] || {} : {};
  const indexes = (point: CellPoint | null) => point ? { row: sheet.rows.findIndex(r => r.id === point.rowId), col: sheet.columns.findIndex(c => c.id === point.columnId) } : { row: -1, col: -1 };
  const start = indexes(selected), end = indexes(rangeEnd || selected);
  const inRange = (r: number, c: number) => start.row >= 0 && end.row >= 0 && start.col >= 0 && end.col >= 0 && r >= Math.min(start.row,end.row) && r <= Math.max(start.row,end.row) && c >= Math.min(start.col,end.col) && c <= Math.max(start.col,end.col);
  const commit = (next: SpreadsheetDocument) => { setPast(p => [...p.slice(-49), data]); setFuture([]); onChange(next); };
  const updateSheet = (next: SpreadsheetSheet) => commit({ ...data, sheets: data.sheets.map(item => item.id === sheet.id ? next : item) });
  const setCell = (rowId: string, columnId: string, value: string) => updateSheet({ ...sheet, rows: sheet.rows.map(row => row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: value } } : row) });
  const resetSelection = () => { setSelected(null); setRangeEnd(null); setEditing(null); };
  const select = (point: CellPoint, extend = false) => { if (extend && selected) setRangeEnd(point); else { setSelected(point); setRangeEnd(null); } setEditing(null); };
  const activate = (id: string) => { if (id !== sheet.id) { onChange({ ...data, activeSheetId: id }); resetSelection(); if (grid.current) grid.current.scrollTo(0,0); } setMenu(null); };
  const addRow = () => updateSheet({ ...sheet, rows: [...sheet.rows, { id: makeId('row'), cells: Object.fromEntries(sheet.columns.map(c => [c.id, ''])) }] });
  const addColumn = () => { const column = { id: makeId('column'), label: 'Column ' + columnName(sheet.columns.length), width: 136, type: 'text' as const }; updateSheet({ ...sheet, columns: [...sheet.columns, column], rows: sheet.rows.map(row => ({ ...row, cells: { ...row.cells, [column.id]: '' } })) }); };
  const nextName = () => { let n = data.sheets.length + 1; while (data.sheets.some(s => s.name === 'Sheet ' + n)) n++; return 'Sheet ' + n; };
  const appendSheet = (next: SpreadsheetSheet) => { commit({ ...data, activeSheetId: next.id, sheets: [...data.sheets, next] }); resetSelection(); setMenu(null); };
  const addSheet = () => { const next = blankSpreadsheet().sheets[0]; next.name = nextName(); appendSheet(next); };
  const duplicateSheet = () => { const next = reidentifyCreativeData({ activeSheetId: sheet.id, sheets: [sheet] }).sheets[0]; next.name = sheet.name + ' copy'; appendSheet(next); };
  const removeSheet = () => { if (data.sheets.length < 2 || !window.confirm('Delete sheet "' + sheet.name + '"?')) return; const sheets = data.sheets.filter(s => s.id !== sheet.id); commit({ ...data, sheets, activeSheetId: sheets[0].id }); resetSelection(); setMenu(null); };
  const importCSV = async (file: File) => {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('CSV must be smaller than 5 MB.');
      const rows = parseWorkbookCSV((await file.text()).replace(/^\uFEFF/, ''));
      if (!rows.length || rows.length > 5000 || rows.some(r => r.length > 100)) throw new Error('Use a CSV with 1–5000 rows and up to 100 columns.');
      const width = Math.max(...rows.map(r => r.length)); const cols = Array.from({length:width}, (_,i) => ({ id: makeId('column'), label: 'Column ' + columnName(i), width: 136, type: 'text' as const }));
      appendSheet({ id:makeId('sheet'), name:file.name.replace(/\.csv$/i,'') || nextName(), columns:cols, rows:rows.map(r => ({id:makeId('row'), cells:Object.fromEntries(cols.map((c,i)=>[c.id,r[i]||'']))})) }); setError('');
    } catch(e) { setError(e instanceof Error ? e.message : 'CSV import failed.'); }
  };
  const format = (patch: SpreadsheetCellStyle) => { if (!selected) return; updateSheet({ ...sheet, rows: sheet.rows.map((row,r) => { const styles = { ...row.cellStyles }; sheet.columns.forEach((c,i) => { if(inRange(r,i)) styles[c.id] = {...styles[c.id], ...patch}; }); return {...row,cellStyles:styles}; }) }); };
  const undo = () => { if (!past.length) return; setFuture(f=>[data,...f]); onChange(past[past.length-1]); setPast(p=>p.slice(0,-1)); resetSelection(); };
  const redo = () => { if (!future.length) return; setPast(p=>[...p,data]); onChange(future[0]); setFuture(f=>f.slice(1)); resetSelection(); };
  const move = (dr:number, dc:number, extend=false) => { const base = extend ? end : start; const r = sheet.rows[Math.max(0,Math.min(sheet.rows.length-1,base.row+dr))]; const c = sheet.columns[Math.max(0,Math.min(sheet.columns.length-1,base.col+dc))]; if (r && c) { select({rowId:r.id,columnId:c.id},extend); requestAnimationFrame(()=>grid.current?.querySelector('[data-row="'+r.id+'"][data-column="'+c.id+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'})); } };
  useEffect(()=>{ resetSelection(); },[sheet.id]);
  useEffect(()=>{ const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close); },[]);
  const styleFor = (s:SpreadsheetCellStyle): CSSProperties => ({ fontWeight:s.bold?700:undefined, fontStyle:s.italic?'italic':undefined, textDecoration:[s.underline?'underline':'',s.strike?'line-through':''].filter(Boolean).join(' ')||undefined, textAlign:s.align, background:s.fill, color:s.color, boxShadow:s.border?'inset 0 0 0 1px var(--dcx-text)':undefined });
  const activeAddress = start.row>=0 && start.col>=0 ? columnName(start.col)+(start.row+1) : 'Cell';
  const tool = (label:string, icon:ReactNode, action:()=>void, active=false, disabled=false) => <button type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled} className={active?'is-active':''} onClick={action}>{icon}</button>;
  return <Frame artifact={artifact} stageLabel="Spreadsheet editor" selection={selected ? {id:selected.rowId,kind:'cell'} : {id:sheet.id,kind:'sheet'}} chrome={chrome}>
    <div className="dcx-structured-stage dcx-spreadsheet-stage dcx-workbook">
      <div className="dcx-spreadsheet-formula-bar">
        <strong>{activeAddress}</strong><span>ƒx</span>
        <input aria-label="Formula bar" value={selectedRaw} disabled={!selected} onChange={e=>selected&&setCell(selected.rowId,selected.columnId,e.target.value)} placeholder="Select a cell"/>
        <small>{selectedRaw.startsWith('=') ? evaluateFormula(selectedRaw,sheet) : ''}</small>
        <button type="button" aria-label="Zoom" onClick={()=>setMenu('zoom')}>{zoom}% <ChevronDown size={14}/></button>
        {tool('Undo',<Undo2 size={17}/>,undo,false,!past.length)}
        {tool('Redo',<Redo2 size={17}/>,redo,false,!future.length)}
      </div>
      <div className="dcx-spreadsheet-grid-wrap" ref={grid} tabIndex={0} aria-label="Spreadsheet grid" onKeyDown={e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;const arrows:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};if(arrows[e.key]){e.preventDefault();move(...arrows[e.key],e.shiftKey);}else if(e.key==='Enter'&&selected){e.preventDefault();setEditing(selected);} }}>
        <table className="dcx-spreadsheet-grid" style={{zoom:zoom/100}}>
          <colgroup><col style={{width:36}}/>{sheet.columns.map(c=><col key={c.id} style={{width:Math.max(96,Math.min(c.width||136,320))}}/>)}</colgroup>
          <thead><tr><th className="dcx-spreadsheet-row-number">#</th>{sheet.columns.map((c,i)=><th key={c.id} className={start.col===i?'is-axis-selected':''}><span>{columnName(i)}</span><input aria-label={'Column '+columnName(i)+' name'} value={c.label} onChange={e=>updateSheet({...sheet,columns:sheet.columns.map(col=>col.id===c.id?{...col,label:e.target.value}:col)})}/></th>)}</tr></thead>
          <tbody>{sheet.rows.map((row,r)=><tr key={row.id}><th className={'dcx-spreadsheet-row-number '+(start.row===r?'is-axis-selected':'')}>{r+1}</th>{sheet.columns.map((c,i)=>{
            const point={rowId:row.id,columnId:c.id};const raw=row.cells[c.id]||'';const display=evaluateFormula(raw,sheet);const active=selected?.rowId===row.id&&selected.columnId===c.id;const edit=editing?.rowId===row.id&&editing.columnId===c.id;const typed=c.type==='status'||c.type==='priority';const choices=c.type==='status'?['','Not started','In progress','Blocked','Done']:['','Low','Normal','High','Urgent'];
            return <td key={c.id} data-row={row.id} data-column={c.id} className={(active?'is-selected ':'')+(inRange(r,i)?'is-in-range':'')} style={styleFor(row.cellStyles?.[c.id]||{})} onClick={e=>{if(!edit)select(point,e.shiftKey);}} onDoubleClick={()=>{select(point);setEditing(point);}} aria-selected={inRange(r,i)}>
              {typed?<select aria-label={c.label+' row '+(r+1)} className="dcx-workbook-choice" value={raw} onFocus={()=>select(point)} onChange={e=>setCell(row.id,c.id,e.target.value)}>{[...new Set([...choices,raw])].map(v=><option key={v} value={v}>{v||'—'}</option>)}</select>:edit?<input autoFocus aria-label={c.label+' row '+(r+1)} value={raw} onChange={e=>setCell(row.id,c.id,e.target.value)} onBlur={()=>setEditing(null)} onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();setEditing(null);grid.current?.focus();}}}/>:<button type="button" className="dcx-workbook-cell" aria-label={c.label+' row '+(r+1)} onClick={e=>{e.stopPropagation();if(active&&!e.shiftKey)setEditing(point);else select(point,e.shiftKey);}}>{display}</button>}
              {raw.startsWith('=')?<span className="dcx-spreadsheet-formula-result" hidden>{display}</span>:null}
              {active&&!edit?<span className="dcx-workbook-range-handle" role="button" aria-label="Extend cell selection" onPointerDown={e=>{e.stopPropagation();drag.current=true;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current)return;const td=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('td[data-row][data-column]');if(td?.dataset.row&&td.dataset.column)setRangeEnd({rowId:td.dataset.row,columnId:td.dataset.column});}} onPointerUp={()=>{drag.current=false;}} onPointerCancel={()=>{drag.current=false;}}/>:null}
            </td>;})}</tr>)}</tbody>
        </table>
        <button type="button" className="dcx-workbook-add-row" onClick={addRow}><Plus size={15}/> Add row</button>
      </div>
      <div className="dcx-workbook-format" role="toolbar" aria-label="Cell formatting">
        {tool('Bold',<Bold size={19}/>,()=>format({bold:!selectedStyle.bold}),!!selectedStyle.bold,!selected)}
        {tool('Italic',<Italic size={19}/>,()=>format({italic:!selectedStyle.italic}),!!selectedStyle.italic,!selected)}
        {tool('Underline',<Underline size={19}/>,()=>format({underline:!selectedStyle.underline}),!!selectedStyle.underline,!selected)}
        {tool('Strikethrough',<Strikethrough size={19}/>,()=>format({strike:!selectedStyle.strike}),!!selectedStyle.strike,!selected)}
        {tool('Align left',<AlignLeft size={19}/>,()=>format({align:'left'}),selectedStyle.align==='left',!selected)}
        {tool('Align center',<AlignCenter size={19}/>,()=>format({align:'center'}),selectedStyle.align==='center',!selected)}
        {tool('Align right',<AlignRight size={19}/>,()=>format({align:'right'}),selectedStyle.align==='right',!selected)}
        {tool('Cell colors',<PaintBucket size={19}/>,()=>setMenu('format'),false,!selected)}
        {tool('Cell border',<Grid2X2 size={19}/>,()=>format({border:!selectedStyle.border}),!!selectedStyle.border,!selected)}
        {tool('Add column',<Plus size={19}/>,addColumn)}
        {onAsk?tool('Ask AgentSam',<Sparkles size={19}/>,()=>onAsk(askContext(artifact,'spreadsheet-data','Analyze and update this spreadsheet'))):null}
        {tool('Formula help',<Calculator size={19}/>,()=>setMenu('help'))}
      </div>
      <div className="dcx-workbook-tabs" aria-label="Workbook sheets">
        {tool('Add sheet',<Plus size={20}/>,()=>setMenu('add'))}
        {tool('Manage sheets',<List size={20}/>,()=>setMenu('sheets'))}
        <div role="tablist" aria-label="Worksheets">{data.sheets.map(s=><button type="button" key={s.id} role="tab" aria-selected={s.id===sheet.id} className={s.id===sheet.id?'is-active':''} onClick={()=>activate(s.id)}>{s.name}{s.id===sheet.id?<ChevronDown size={13} onClick={e=>{e.stopPropagation();setMenu('sheets');}}/>:null}</button>)}</div>
      </div>
      <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void importCSV(f);e.target.value='';}}/>
      {menu?<div className="dcx-workbook-overlay" onClick={()=>setMenu(null)}><section className="dcx-workbook-sheet" role="dialog" aria-modal="true" aria-label={menu==='sheets'?'Manage sheets':menu==='add'?'Add sheet':menu==='zoom'?'Zoom':menu==='format'?'Cell colors':'Formula help'} onClick={e=>e.stopPropagation()}>
        <div className="dcx-workbook-sheet-handle"/><header>{menu==='add'?<button type="button" aria-label="Back to sheets" onClick={()=>setMenu('sheets')}><ChevronLeft size={20}/></button>:null}<strong>{menu==='sheets'?'Worksheets':menu==='add'?'Add sheet':menu==='zoom'?'Zoom':menu==='format'?'Cell colors':'Formula help'}</strong><button type="button" aria-label="Close menu" onClick={()=>setMenu(null)}><X size={20}/></button></header>
        {menu==='sheets'?<><button type="button" onClick={()=>setMenu('add')}><Plus size={18}/> Add sheet</button>{data.sheets.map(s=><button key={s.id} type="button" onClick={()=>activate(s.id)}>{s.name}<span>{s.id===sheet.id?'✓':''}</span></button>)}<label>Sheet name<input aria-label="Sheet name" value={sheet.name} onChange={e=>updateSheet({...sheet,name:e.target.value})}/></label><button type="button" onClick={duplicateSheet}><Copy size={18}/> Duplicate current sheet</button><button type="button" disabled={data.sheets.length===1} onClick={removeSheet}><Trash2 size={18}/> Delete current sheet</button></>:menu==='add'?<><button type="button" onClick={()=>csvInput.current?.click()}><Upload size={18}/> Import CSV</button><button type="button" onClick={addSheet}><FileText size={18}/> Blank sheet</button></>:menu==='zoom'?<>{[50,75,100,125,150,200].map(z=><button key={z} type="button" onClick={()=>{setZoom(z);setMenu(null);}}>{z}%<span>{zoom===z?'✓':''}</span></button>)}</>:menu==='format'?<><label>Fill<input type="color" aria-label="Cell fill" value={selectedStyle.fill||'#ffffff'} onChange={e=>format({fill:e.target.value})}/></label><label>Text<input type="color" aria-label="Cell text color" value={selectedStyle.color||'#222222'} onChange={e=>format({color:e.target.value})}/></label><button type="button" onClick={()=>format({fill:undefined,color:undefined})}>Reset colors</button></>:<p>Supported formulas: SUM, AVERAGE, COUNT, COUNTA, MIN and MAX. Example: =SUM(A1:A5).</p>}
        {error?<p role="alert">{error}</p>:null}
      </section></div>:null}
    </div>
  </Frame>;
}
