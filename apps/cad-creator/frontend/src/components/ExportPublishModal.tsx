import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Cloud, Download, GitBranch, X } from 'lucide-react';
import type { DesignProject, ExportFormat } from '@inneranimalmedia/agentsam-cad-shared';
import { exportProjectToArtifact, downloadFile } from '../lib/exporters';
import { getCadPublishConnections, publishCadProject, type CadPublishConnection, type CadPublishProvider } from '../lib/publishers/authorized-publish';

interface Props { project: DesignProject; isOpen: boolean; onClose: () => void; canExport: boolean; }
const FORMATS: Array<{ id: ExportFormat; title: string; detail: string }> = [
  { id: 'dxf', title: 'DXF plan', detail: 'Architectural lines and layers' },
  { id: 'svg', title: 'SVG plan', detail: 'Scalable vector drawing' },
  { id: 'obj', title: 'OBJ model', detail: '3D mesh interchange' },
  { id: 'scad', title: 'OpenSCAD', detail: 'Parametric source' },
  { id: 'stl', title: 'STL mesh', detail: 'Manufacturing mesh' },
  { id: 'json', title: 'Project JSON', detail: 'Editable source document' },
];
export function ExportPublishModal({ project, isOpen, onClose, canExport }: Props) {
  const [tab, setTab] = useState<'export' | 'publish'>('export');
  const [format, setFormat] = useState<ExportFormat>('dxf');
  const [provider, setProvider] = useState<CadPublishProvider>('github');
  const [connections, setConnections] = useState<CadPublishConnection[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{id: string; files_written: number; target_url?: string} | null>(null);
  useEffect(() => {
    if (!isOpen || tab !== 'publish') return;
    let cancelled = false;
    setConnections([]);
    setConnectionError(null);
    void getCadPublishConnections().then(result => {
      if (!cancelled) setConnections(result);
    }).catch(cause => {
      if (!cancelled) setConnectionError(cause instanceof Error ? cause.message : 'CAD publishing unavailable');
    });
    return () => { cancelled = true; };
  }, [isOpen, tab]);
  if (!isOpen) return null;
  const connection = connections.find(item => item.provider === provider);
  const publishReady = canExport && !busy && connection?.status === 'connected';
  const run = async () => {
    setBusy(true); setError(null); setReceipt(null);
    try {
      if (tab === 'export') {
        const artifact = await exportProjectToArtifact(project, format);
        const content = typeof artifact.content === 'string' ? artifact.content : new TextDecoder().decode(artifact.content);
        downloadFile(content, artifact.filename, artifact.mimeType);
      } else {
        if (!publishReady) throw new Error('cad_publish_connection_required');
        const types: ExportFormat[] = ['json', 'svg', 'dxf', 'scad', 'obj'];
        const artifacts = await Promise.all(types.map(fmt => exportProjectToArtifact(project, fmt)));
        const out = await publishCadProject({provider, project, artifacts, note: `CAD ${project.name} revision ${project.version || 1}`});
        setReceipt(out);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Operation failed'); }
    finally { setBusy(false); }
  };
  return <div role="dialog" aria-modal="true" aria-label="Export and publish project" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
    <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#10131d] text-slate-100 shadow-2xl">
      <header className="flex items-center justify-between border-b border-white/10 p-4">
        <div><h2 className="text-sm font-semibold">Project files</h2><p className="mt-1 text-xs text-slate-400">{project.name} · Revision {project.version || 1}</p></div>
        <button type="button" aria-label="Close export dialog" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X className="size-4" /></button>
      </header>
      <nav className="flex border-b border-white/10 px-2" aria-label="Export options">
        {(['export', 'publish'] as const).map(item => <button type="button" key={item} onClick={() => {setTab(item); setError(null);}}
          className={`border-b-2 px-4 py-3 text-xs font-medium ${tab === item ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400'}`}>
          {item === 'export' ? 'Download files' : 'Publish via connected account'}
        </button>)}
      </nav>
      <main className="max-h-[64vh] min-h-[245px] overflow-y-auto p-4">
        {error && <p role="alert" className="mb-3 flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200"><AlertCircle className="size-4 shrink-0" />{error}</p>}
        {tab === 'export' ? <>
          <p className="mb-3 text-xs text-slate-400">Choose a format. The project document remains distinct from presentation or fabrication exports.</p>
          <div className="grid grid-cols-2 gap-2">{FORMATS.map(item => <button type="button" key={item.id} onClick={() => setFormat(item.id)} aria-pressed={format === item.id}
            className={`rounded-xl border p-3 text-left ${format === item.id ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/10 hover:bg-white/5'}`}>
            <span className="block text-xs font-semibold">{item.title}</span><span className="mt-1 block text-[11px] text-slate-400">{item.detail}</span>
          </button>)}</div>
        </> : <>
          <p className="mb-3 text-xs text-slate-400">Uses GitHub App or Cloudflare OAuth via the authorized host. No pasted credentials and no simulated publication receipts.</p>
          <div className="grid gap-2 sm:grid-cols-2">{(['github','cloudflare'] as CadPublishProvider[]).map(item => {
            const state = connections.find(x => x.provider === item);
            return <button type="button" key={item} onClick={() => setProvider(item)} aria-pressed={provider === item}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left ${provider === item ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/10 hover:bg-white/5'}`}>
              {item === 'github' ? <GitBranch className="size-5 shrink-0" /> : <Cloud className="size-5 shrink-0" />}
              <span><span className="block text-xs font-semibold">{item === 'github' ? 'GitHub App' : 'Cloudflare OAuth'}</span>
              <span className="mt-1 block text-[11px] text-slate-400">{state?.status === 'connected' ? state.label : state?.status === 'not_connected' ? 'Connection required' : 'Publishing not verified'}</span></span>
            </button>;
          })}</div>
          {connectionError && <p role="status" className="mt-3 rounded-lg border border-amber-500/20 p-3 text-xs text-amber-200">{connectionError}</p>}
          {connection?.status === 'not_connected' && <p className="mt-3 text-xs text-slate-400">Connect the provider in AgentSam account settings to authorize CAD publishing.</p>}
          {receipt && <p role="status" className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200"><CheckCircle2 className="mr-2 inline size-4" />Verified {receipt.files_written} files · {receipt.id}{receipt.target_url && <a href={receipt.target_url} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all underline">Open published project</a>}</p>}
        </>}
      </main>
      <footer className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/10">Close</button>
        <button type="button" disabled={!canExport || busy || (tab === 'publish' && !publishReady)} onClick={() => void run()}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
          {tab === 'export' ? <Download className="size-4" /> : <Cloud className="size-4" />}
          {busy ? 'Working…' : tab === 'export' ? `Export ${format.toUpperCase()}` : 'Publish project'}
        </button>
      </footer>
    </div>
  </div>;
}
