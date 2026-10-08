import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, FileCode2, Layers3, LoaderCircle, ShieldCheck, TerminalSquare, X } from 'lucide-react';
import './autorag-workflow.css';

export type AutoRagWorkflowView = {
  schema: string;
  project: { name: string; repository_id: string; root: string; branch?: string | null };
  status: string;
  selected: null | { scope: { name: string; include: string[]; exclude?: string[] }; embedding: { provider: string; model?: string; dimensions?: number }; lane: { backend: string; binding?: string | null; index?: string | null }; storage: { driver: string } };
  suggested: { scope: string[]; backend: string; semantic: boolean; explanation: string };
  resources: Array<{ backend: string; binding?: string | null; index?: string | null; selected: boolean; locally_executable: boolean; remotely_executable: boolean }>;
  providers: Array<{ id: string; operational: boolean; models: string[]; credentials?: string | null }>;
  historical: Array<{ generation_id: string; created_at: string; files: number; chunks: number; embedded: boolean; provider: string; model?: string | null; active: boolean; selected_scope: boolean }>;
  generation: null | { id: string; files: number; chunks: number; embedded: boolean; current: boolean; created_at: string };
};
export type AutoRagExecutionReceipt = { ok: boolean; verified: boolean; generation_id: string; files: number; chunks: number; kind: string; hits: Array<{ path: string; score?: number }> };
export interface AutoRagWorkflowHost {
  inspect(root: string): Promise<AutoRagWorkflowView>;
  configure(root: string, input: { scope: string[]; provider: string; backend: string; model?: string; dimensions?: number }): Promise<unknown>;
  execute(root: string, options?: { semantic: boolean; allowPaid: boolean }): Promise<AutoRagExecutionReceipt>;
  pickRoot?(): Promise<string | null>;
}
export interface AutoRagWorkflowDialogProps {
  open: boolean;
  root: string;
  host: AutoRagWorkflowHost;
  onClose(): void;
  title?: string;
}
type Path = 'recommended' | 'custom' | 'history';
const readable = (state: string) => state.split('_').join(' ');

/** Host-owned I/O, portable presentation and selection: no filesystem, credentials or embedding logic here. */
export function AutoRagWorkflowDialog({ open, root, host, onClose, title = 'AgentSam AutoRAG' }: AutoRagWorkflowDialogProps) {
  const [projectRoot, setProjectRoot] = useState(root);
  const [view, setView] = useState<AutoRagWorkflowView | null>(null);
  const [choice, setChoice] = useState<Path>('recommended');
  const [scopes, setScopes] = useState('');
  const [backend, setBackend] = useState('local_exact');
  const [provider, setProvider] = useState('none');
  const [model, setModel] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [semanticConsent, setSemanticConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<AutoRagExecutionReceipt | null>(null);
  const [configured, setConfigured] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const inspect = async (path: string) => {
    if (!path.trim()) throw new Error('Select a repository directory to inspect.');
    const next = await host.inspect(path);
    setView(next);
    setScopes((next.selected?.scope.include || next.suggested.scope).join(', '));
    setBackend(next.selected?.lane.backend || next.suggested.backend);
    setProvider(next.selected?.embedding.provider || 'none');
    setModel(next.selected?.embedding.model || '');
    setDimensions(String(next.selected?.embedding.dimensions || ''));
    setConfigured(Boolean(next.selected));
    return next;
  };
  useEffect(() => {
    if (!open) return;
    setProjectRoot(root); setView(null); setError(''); setReceipt(null); setConfigured(false); setChoice('recommended');
    let cancelled = false;
    setBusy(true);
    void host.inspect(root).then(next => {
      if (cancelled) return;
      setView(next);
      setScopes((next.selected?.scope.include || next.suggested.scope).join(', '));
      setBackend(next.selected?.lane.backend || next.suggested.backend);
      setProvider(next.selected?.embedding.provider || 'none');
      setModel(next.selected?.embedding.model || '');
      setDimensions(String(next.selected?.embedding.dimensions || ''));
      setConfigured(Boolean(next.selected));
    }).catch(e => { if (!cancelled) setError(String(e?.message || e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    closeRef.current?.focus();
    return () => { cancelled = true; };
  }, [open, root, host]);
  if (!open) return null;

  const act = async () => {
    if (choice === 'history') { setChoice('custom'); return; }
    setError(''); setBusy(true); setReceipt(null);
    try {
      const nextScope = scopes.split(',').map(x => x.trim()).filter(Boolean);
      if (!nextScope.length) throw new Error('Choose at least one source directory or file.');
      const changed = !configured || nextScope.join(',') !== (view?.selected?.scope.include || []).join(',') ||
        backend !== view?.selected?.lane.backend || provider !== view?.selected?.embedding.provider ||
        (provider !== 'none' && (model !== view?.selected?.embedding.model || Number(dimensions) !== view?.selected?.embedding.dimensions));
      if (backend !== 'local_exact') {
        if (changed) {
          await host.configure(projectRoot, { scope: nextScope, backend, provider, model, dimensions: Number(dimensions) });
          await inspect(projectRoot);
        }
        throw new Error('Remote indexing requires this project’s authorized execution host. The selected remote lane was saved, not silently redirected to local storage.');
      }
      if (provider !== 'none' && changed && (!model || !Number.isInteger(Number(dimensions)) || Number(dimensions) < 1)) throw new Error('Choose an advertised embedding model and its verified output dimension before continuing.');
      if (provider !== 'none' && semanticConsent && !model) throw new Error('Select an embedding model first.');
      if (changed) {
        await host.configure(projectRoot, { scope: nextScope, backend, provider, model, dimensions: Number(dimensions) });
        await inspect(projectRoot);
      }
      const result = await host.execute(projectRoot, { semantic: provider !== 'none' && semanticConsent, allowPaid: semanticConsent });
      if (!result.ok || !result.verified || !result.hits.length) throw new Error('Index execution did not return a verified source-grounded retrieval receipt.');
      setReceipt(result);
      await inspect(projectRoot);
    } catch (e) { setError(String((e as Error)?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="as-rag-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <section className="as-rag-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="as-rag-head">
          <div className="as-rag-brand"><TerminalSquare size={18} aria-hidden="true" /><strong>{title}</strong></div>
          <button ref={closeRef} className="as-rag-icon-button" type="button" aria-label="Close AutoRAG" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="as-rag-body">
          <label className="as-rag-root-label" htmlFor="as-rag-root">Repository directory</label>
          <div className="as-rag-root-row">
            <input id="as-rag-root" value={projectRoot} onChange={e => setProjectRoot(e.target.value)} placeholder="Select a local project path" spellCheck={false} />
            {host.pickRoot && <button type="button" disabled={busy} onClick={() => { void host.pickRoot?.().then(path => { if (path) { setProjectRoot(path); setBusy(true); setError(''); void inspect(path).catch(e => setError(String(e.message || e))).finally(() => setBusy(false)); } }); }}>Browse</button>}
            <button type="button" disabled={busy} onClick={() => { setBusy(true); setError(''); setReceipt(null); void inspect(projectRoot).catch(e => setError(String(e.message || e))).finally(() => setBusy(false)); }}>Inspect</button>
          </div>
          <div className="as-rag-checks">
            <div className="as-rag-check"><CheckCircle2 size={17} aria-hidden="true" /><div><strong>Project identified</strong><span>{view ? `${view.project.name} · ${view.project.repository_id}` : 'Inspecting local repository…'}</span></div></div>
            <div className="as-rag-check"><CheckCircle2 size={17} aria-hidden="true" /><div><strong>Sources inspected</strong><span>{view ? `${(view.selected?.scope.include || view.suggested.scope).join(', ')} · ${view.status === 'not_indexed' ? 'Not indexed' : readable(view.status)}` : 'Source selection pending'}</span></div></div>
            <div className="as-rag-check"><CheckCircle2 size={17} aria-hidden="true" /><div><strong>Existing resources discovered</strong><span>{view ? view.resources.map(r => `${r.backend}${r.binding ? ` · ${r.binding}` : ''}`).join(' / ') || 'Local SQLite available' : 'Checking project resources…'}</span></div></div>
          </div>
          {view && <div className="as-rag-recommendation">
            <h3>Recommended Knowledge setup</h3>
            <dl>
              <div><dt>Sources</dt><dd>{(view.selected?.scope.include || view.suggested.scope).join(', ')}</dd></div>
              <div><dt>Index</dt><dd>Incremental structural + text retrieval</dd></div>
              <div><dt>Storage</dt><dd>{view.selected?.storage.driver || 'Local SQLite'}</dd></div>
              <div><dt>Selected lane</dt><dd>{view.selected?.lane.backend || view.suggested.backend}</dd></div>
              <div><dt>Embeddings</dt><dd>{view.selected?.embedding.provider === 'none' || !view.selected ? 'Optional · no paid calls by default' : `${view.selected.embedding.provider} (configured, not yet verified)`}</dd></div>
            </dl>
          </div>}
          {view && <fieldset className="as-rag-choices"><legend>Choose how to proceed</legend>
            <label><input type="radio" name="as-rag-choice" checked={choice === 'recommended'} onChange={() => setChoice('recommended')} /><span>Build or refresh the selected local index</span></label>
            <label><input type="radio" name="as-rag-choice" checked={choice === 'custom'} onChange={() => setChoice('custom')} /><span>Choose sources, provider and storage</span></label>
            <label><input type="radio" name="as-rag-choice" checked={choice === 'history'} onChange={() => setChoice('history')} /><span>Inspect existing indexes first {view.historical.length ? `(${view.historical.length})` : ''}</span></label>
          </fieldset>}
          {view && choice === 'custom' && <div className="as-rag-edit">
            <label>Sources (comma-separated)<input value={scopes} onChange={e => setScopes(e.target.value)} /></label>
            <label>Backend<select value={backend} onChange={e => setBackend(e.target.value)}><option value="local_exact">Local SQLite / exact retrieval</option>{view.resources.filter(r => r.backend !== 'local_exact').map(r => <option key={r.backend + ':' + r.binding} value={r.backend}>{r.backend}{r.binding ? ` (${r.binding})` : ''}</option>)}</select></label>
            <label>Embedding provider<select value={provider} onChange={e => { setProvider(e.target.value); const entry = view.providers.find(p => p.id === e.target.value); setModel(entry?.models?.length === 1 ? entry.models[0] : ''); setDimensions(''); setSemanticConsent(false); }}><option value="none">None · structural/text only</option>{view.providers.filter(p => p.id !== 'fixture').map(p => <option key={p.id} value={p.id} disabled={!p.operational}>{p.id}{!p.operational ? ' · needs connection' : ''}</option>)}</select></label>
            {provider !== 'none' && <>
              <label>Provider-advertised model<select value={model} onChange={e => setModel(e.target.value)}><option value="">Select model</option>{(view.providers.find(p => p.id === provider)?.models || []).map(m => <option key={m} value={m}>{m}</option>)}</select></label>
              <label>Verified output dimensions<input type="number" min="1" value={dimensions} onChange={e => setDimensions(e.target.value)} placeholder="From provider/index configuration" /></label>
            </>}
          </div>}
          {view && provider !== 'none' && choice !== 'history' && <label className="as-rag-consent"><input type="checkbox" checked={semanticConsent} onChange={e => setSemanticConsent(e.target.checked)} /> Generate semantic embeddings during this run (may incur provider charges)</label>}
          {view && choice === 'history' && <div className="as-rag-history">{view.historical.length ? view.historical.map(g => <div key={g.generation_id} className="as-rag-history-row"><Layers3 size={15}/><div><strong>{g.files} files · {g.chunks} chunks</strong><span>{g.created_at.slice(0, 10)} · {g.embedded ? `Semantic (${g.provider})` : 'Structural only'} · {g.selected_scope ? 'selected scope' : 'other scope'}</span></div>{g.active && <small>Active</small>}</div>) : <p>No historical generations found in local storage.</p>}</div>}
          {receipt && <div className="as-rag-result" role="status"><ShieldCheck size={18}/><div><strong>Index and retrieval verified</strong><span>{receipt.files} files · {receipt.chunks} chunks · {receipt.kind}</span>{receipt.hits.map((h, i) => <code key={i}>{h.path}</code>)}</div></div>}
          {error && <p className="as-rag-error" role="alert">{error}</p>}
          <button type="button" className="as-rag-primary" disabled={busy || !view} onClick={() => void act()}>{busy ? <LoaderCircle className="as-rag-spin" size={17}/> : choice === 'history' ? <Layers3 size={17}/> : <FileCode2 size={17}/>} {choice === 'history' ? 'Edit selected setup' : busy ? 'Working…' : 'Proceed with workflow'} <ChevronRight size={17}/></button>
          <p className="as-rag-footnote">No embedding fees or remote writes without explicit authorization. This interface displays actual host receipts, not fixture readiness.</p>
        </div>
      </section>
    </div>
  );
}
