/**
 * Development-only preview of real packaged components.
 * No API, account, registry, or public route is involved.
 */
import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Paperclip, Plus, Folder, FileText, CircleHelp, LoaderCircle, Trash2 } from 'lucide-react';
import { Nav } from '../src/Nav.js';
import type { NavAction, NavMode } from '../src/contracts.js';
import { AgentComposer } from '../../agentsam-workbench/src/agent/Composer.js';
import '../src/shell.css';
import '../src/theme.css';
import './showcase.css';

function DemoButton({ children, onClick, active }: { children: ReactNode; onClick: () => void; active?: boolean }) {
  return <button type="button" className="preview-control" aria-pressed={active} onClick={onClick}>{children}</button>;
}

function ComponentPreview() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mode, setMode] = useState<NavMode>('chat');
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('Conversation component preview');
  const [pinned, setPinned] = useState(false);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [status, setStatus] = useState('Ready — actions below use local demo state only.');
  const [outputs, setOutputs] = useState([{ id: 'output-1', label: 'Component contract.md', kind: 'Document' }]);
  const [sources, setSources] = useState([{ id: 'source-1', label: 'Existing codebase', kind: 'Project' }]);
  const [streaming, setStreaming] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [effort, setEffort] = useState('High');
  const menuActions: NavAction[] = [
    { id: 'attach', label: 'Add photos & files', icon: <Paperclip size={16}/>, onSelect: () => setStatus('In production this opens the host file picker.') },
    { id: 'library', label: 'Add from Library', icon: <Folder size={16}/>, onSelect: () => setSources(items => [...items, { id: 'source-' + (items.length + 1), label: 'Library item ' + (items.length + 1), kind: 'Library' }]) },
    { id: 'nested', label: 'More capabilities', icon: <Plus size={16}/>, children: [
      { id: 'normal', label: 'Enabled item', onSelect: () => setStatus('Nested action selected') },
      { id: 'disabled', label: 'Disabled item', disabled: true, onSelect: () => setStatus('Disabled should not fire') },
      { id: 'loading', label: 'Running operation', loading: loadingAction, onSelect: () => setLoadingAction(true) },
    ] },
  ];
  return <Nav.Provider theme={theme} accentColor="#8b5cf6" value={{
    brand: { name: 'AgentSam' }, mode, onModeChange: setMode,
    conversation: { id: 'preview-chat', title, pinned, projectId },
    projects: [{ id: 'preview-project', name: 'Component test project' }],
    onRenameConversation: (_id, value) => { setTitle(value); setStatus('Renamed in preview'); },
    onPinConversation: () => { setPinned(value => !value); setStatus('Pin state updated'); },
    onArchiveConversation: () => setStatus('Archive callback invoked (preview only)'),
    onDeleteConversation: () => setStatus('Delete callback invoked (preview only)'),
    onAssignConversationToProject: (_id, value) => { setProjectId(value ?? undefined); setStatus('Project association updated'); },
    onShare: () => setStatus('Public links require an authenticated host; nothing was shared.'),
    pinnedSummary: {
      outputs: outputs.map(value => ({ ...value, onSelect: () => setStatus('Opened ' + value.label) })),
      sources: sources.map(value => ({ ...value, onSelect: () => setStatus('Opened ' + value.label) })),
      outputActions: [
        { id: 'add-output', label: 'Create sample output', icon: <FileText size={16}/>, onSelect: () => setOutputs(items => [...items, { id: 'output-' + (items.length + 1), label: 'Output ' + (items.length + 1) + '.md', kind: 'Document' }]) },
        { id: 'empty-output', label: 'Unavailable format', disabled: true },
      ],
      sourceActions: [
        { id: 'add-source', label: 'Attach sample source', icon: <Paperclip size={16}/>, onSelect: () => setSources(items => [...items, { id: 'source-' + (items.length + 1), label: 'Source ' + (items.length + 1), kind: 'File' }]) },
      ],
    },
    conversationActions: [
      { id: 'copy', label: 'Copy transcript', icon: <FileText size={16}/>, onSelect: () => setStatus('Copy callback invoked (preview only)') },
      { id: 'test-danger', label: 'Destructive state', icon: <Trash2 size={16}/>, destructive: true, onSelect: () => setStatus('Destructive callback invoked (preview only)') },
    ],
  }}>
    <Nav.Scope className="preview-shell">
      <header className="preview-top">
        <span className="preview-brand">AgentSam · Component preview</span>
        <span className="preview-tag">Development only</span>
      </header>
      <Nav.Topbar showNavigationTrigger={false} className="preview-topbar" />
      <main className="preview-body">
        <section className="preview-settings" aria-label="Component states">
          <h1>Packaged components</h1>
          <p>These are the real Nav and Workbench components, with isolated demo data and callbacks. Use the header menus, nested plus actions, keyboard navigation, and controlled composer.</p>
          <div className="preview-options">
            <DemoButton onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Theme: {theme}</DemoButton>
            <DemoButton onClick={() => setMode(mode === 'chat' ? 'work' : 'chat')}>Mode: {mode}</DemoButton>
            <DemoButton onClick={() => setStreaming(!streaming)} active={streaming}>Streaming: {String(streaming)}</DemoButton>
            <DemoButton onClick={() => setDisabled(!disabled)} active={disabled}>Disabled: {String(disabled)}</DemoButton>
            <DemoButton onClick={() => setLoadingAction(!loadingAction)} active={loadingAction}>Action loading: {String(loadingAction)}</DemoButton>
          </div>
        </section>
        <section className="preview-card" aria-label="Composer variants">
          <h2>AgentComposer · {mode}</h2>
          <AgentComposer
            value={draft}
            onChange={setDraft}
            runMode={mode === 'work' ? 'agent' : 'ask'}
            placeholder={mode === 'work' ? 'Work with AgentSam' : 'Ask AgentSam'}
            streaming={streaming}
            disabled={disabled}
            onSend={() => { setStatus('Composer submitted: ' + draft); setDraft(''); }}
            onCancel={() => { setStreaming(false); setStatus('Execution stopped'); }}
            containerClassName="preview-composer"
            inputClassName="preview-composer-input"
            toolbarClassName="preview-composer-toolbar"
            toolbarStart={<Nav.OverflowMenu label="Tools and attachments" actions={menuActions}><Plus size={18}/></Nav.OverflowMenu>}
            toolbarEnd={<label className="preview-effort">Thinking <select value={effort} onChange={event => setEffort(event.target.value)} disabled={disabled}>
              <option>Instant</option><option>Medium</option><option>High</option><option>Extra High</option>
            </select></label>}
            sendControl={<button type="button" className="preview-send" disabled={disabled || !draft.trim()} onClick={() => { setStatus('Composer submitted: ' + draft); setDraft(''); }} aria-label="Send">Send</button>}
          />
        </section>
        <section className="preview-card" aria-label="Menu variants">
          <h2>Menu state variants</h2>
          <p>Hover, Tab, arrows, Escape, focus, disabled, loading, and nested items are provided by the shared dropdown contract.</p>
          <Nav.OverflowMenu label="Inspect menu states" actions={menuActions}><CircleHelp size={17}/> Menu states</Nav.OverflowMenu>
        </section>
        <output className="preview-status" aria-live="polite">{status}</output>
      </main>
    </Nav.Scope>
  </Nav.Provider>;
}

const mount = document.getElementById('component-preview');
if (!mount) throw new Error('Component preview mount missing');
createRoot(mount).render(<ComponentPreview/>);
