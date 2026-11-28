import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Plus, Trash2, Sparkles, ListChecks, Type, AlignLeft, Table2, Calculator, FileText, PanelTop } from 'lucide-react';
import { DesignWorkspaceFrame } from '@inneranimalmedia/agentsam-workbench/design';
import type { DesignWorkspaceSnapshot } from '@inneranimalmedia/agentsam-contracts';
import type {
  CreativeArtifact, DesignCanvasAgentContext, PageDocument, PageBlock,
  PageTaskItem, TextDocument, DocumentBlock, SpreadsheetDocument, SpreadsheetSheet,
} from '../creative-model';
import { makeId } from '../creative-model';

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

export function SpreadsheetEditor({ artifact, onChange, onAsk, ...chrome }: Props) {
  const data = artifact.data as SpreadsheetDocument;
  const sheet = data.sheets.find((item) => item.id === data.activeSheetId) || data.sheets[0];
  const [selected, setSelected] = useState<{ rowId: string; columnId: string } | null>(null);
  const selectedRow = selected ? sheet.rows.find((row) => row.id === selected.rowId) : undefined;
  const selectedRaw = selectedRow && selected ? selectedRow.cells[selected.columnId] || '' : '';
  const formulaHelp = useMemo(() => 'Supported formulas: =SUM(A1:A5), =AVERAGE(B2:B8), =COUNT(A1:A5), =COUNTA(A1:A5), =MIN(A1:A5), =MAX(A1:A5).', []);
  const updateSheet = (next: SpreadsheetSheet) => onChange({ ...data, sheets: data.sheets.map((item) => item.id === sheet.id ? next : item) });
  const setCell = (rowId: string, columnId: string, value: string) => updateSheet({ ...sheet, rows: sheet.rows.map((row) => row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: value } } : row) });
  const addRow = () => updateSheet({ ...sheet, rows: [...sheet.rows, { id: makeId('row'), cells: Object.fromEntries(sheet.columns.map((column) => [column.id, ''])) }] });
  const addColumn = () => {
    const column = { id: makeId('column'), label: 'New column', width: 180, type: 'text' as const };
    updateSheet({ ...sheet, columns: [...sheet.columns, column], rows: sheet.rows.map((row) => ({ ...row, cells: { ...row.cells, [column.id]: '' } })) });
  };
  const renameColumn = (columnId: string, label: string) => updateSheet({ ...sheet, columns: sheet.columns.map((column) => column.id === columnId ? { ...column, label } : column) });
  const activeCell = selected ? sheet.columns.find((column) => column.id === selected.columnId) : undefined;

  return <Frame artifact={artifact} stageLabel="Spreadsheet editor" selection={selected ? { id: selected.rowId, kind: 'cell' } : { id: sheet.id, kind: 'sheet' }} chrome={chrome}>
    <div className="dcx-structured-stage dcx-spreadsheet-stage">
      <div className="dcx-structured-toolbar">
        <div className="dcx-structured-toolbar-group">
          <button type="button" onClick={addRow}><Plus size={15}/> Add row</button>
          <button type="button" onClick={addColumn}><Plus size={15}/> Add column</button>
          <span className="dcx-structured-sheet-name"><Table2 size={15}/><input aria-label="Sheet name" value={sheet.name} onChange={(event) => updateSheet({ ...sheet, name: event.target.value })}/></span>
        </div>
        {onAsk ? <button type="button" className="dcx-structured-ask" onClick={() => onAsk(askContext(artifact, 'spreadsheet-data', 'Analyze and update this spreadsheet'))}><Sparkles size={15}/> Ask AgentSam</button> : null}
      </div>
      <div className="dcx-spreadsheet-formula-bar">
        <strong>{selected && activeCell ? columnName(sheet.columns.findIndex((column) => column.id === activeCell.id)) + (sheet.rows.findIndex((row) => row.id === selected.rowId) + 1) : 'Cell'}</strong>
        <span>fx</span>
        <input aria-label="Formula bar" value={selectedRaw} onChange={(event) => { if (selected) setCell(selected.rowId, selected.columnId, event.target.value); }} placeholder="Enter a value or formula, e.g. =SUM(A1:A5)"/>
        <small>{selectedRaw.startsWith('=') && selected ? evaluateFormula(selectedRaw, sheet) : ''}</small>
      </div>
      <div className="dcx-spreadsheet-grid-wrap">
        <table className="dcx-spreadsheet-grid">
          <thead><tr><th className="dcx-spreadsheet-row-number">#</th>{sheet.columns.map((column, index) => <th key={column.id}><span>{columnName(index)}</span><input aria-label={'Column ' + columnName(index) + ' name'} value={column.label} onChange={(event) => renameColumn(column.id, event.target.value)}/></th>)}</tr></thead>
          <tbody>{sheet.rows.map((row, rowIndex) => <tr key={row.id}>
            <th className="dcx-spreadsheet-row-number">{rowIndex + 1}</th>
            {sheet.columns.map((column, columnIndex) => {
              const raw = row.cells[column.id] || '';
              const display = evaluateFormula(raw, sheet);
              const isSelected = selected?.rowId === row.id && selected?.columnId === column.id;
              const shared = { value: display, onFocus: () => setSelected({ rowId: row.id, columnId: column.id }), onChange: (event: ChangeEvent<HTMLInputElement>) => setCell(row.id, column.id, event.target.value), 'aria-label': column.label + ' row ' + (rowIndex + 1), className: isSelected ? 'is-selected' : '' };
              return <td key={column.id}>
                {column.type === 'status' ? <select {...shared} value={raw} onChange={(event) => setCell(row.id, column.id, event.target.value)}><option value="">—</option><option>Not started</option><option>In progress</option><option>Blocked</option><option>Done</option></select>
                  : column.type === 'priority' ? <select {...shared} value={raw} onChange={(event) => setCell(row.id, column.id, event.target.value)}><option value="">—</option><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select>
                  : <input {...shared} type={column.type === 'date' ? 'date' : 'text'} title={raw.startsWith('=') ? raw : undefined}/>}
                {raw.startsWith('=') ? <span className="dcx-spreadsheet-formula-result">{display}</span> : null}
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="dcx-spreadsheet-help"><Calculator size={14}/>{formulaHelp}</p>
    </div>
  </Frame>;
}
