import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Folder, Plus, Search, X } from 'lucide-react';
import type { WorkProject } from '@inneranimalmedia/agentsam-work/contracts';
import { useWorkStore } from '@/lib/work/store';

/**
 * Project selection uses the very same WorkHost as /admin/projects.
 * The chat's existing workProjectId stores its association; never replace
 * its local projectId, conversation ID, messages, or draft.
 */
export function ProjectPicker({ trailId }: { trailId: string }) {
  const projectId = useWorkStore((state) => state.trails.find((trail) => trail.id === trailId)?.workProjectId);
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const active = projects.find((project) => project.id === projectId);
  const visible = projects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void import('@/components/work/LocalStudioWorkPage')
      .then(({ sharedLiveWorkHost }) => sharedLiveWorkHost().snapshot({ surface: 'projects' }))
      .then((snapshot) => { if (!cancelled) setProjects(snapshot.projects); })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load projects');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  async function assign(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { sharedLiveWorkHost } = await import('@/components/work/LocalStudioWorkPage');
      const host = sharedLiveWorkHost();
      if (!host.assignProjectChat) throw new Error('Project chat linking is unavailable');
      await host.assignProjectChat(trailId, id);
      setOpen(false);
      setQuery('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not select project');
    } finally { setBusy(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    setError('');
    try {
      const { sharedLiveWorkHost } = await import('@/components/work/LocalStudioWorkPage');
      const host = sharedLiveWorkHost();
      if (!host.createProject || !host.assignProjectChat) throw new Error('Project creation is unavailable');
      const project = await host.createProject({ name: title });
      await host.assignProjectChat(trailId, project.id);
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setOpen(false);
      setQuery('');
      setName('');
      setCreating(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create project');
    } finally { setBusy(false); }
  }

  return <div className="agentsam-project-picker" ref={root}>
    <button type="button" className="agentsam-project-trigger" aria-label="Choose project" aria-expanded={open}
      aria-haspopup="dialog" onClick={() => { setOpen((value) => !value); setCreating(false); }}>
      <Folder size={14} /><span>{active?.name || 'Choose project'}</span><ChevronDown size={13} />
    </button>
    {open ? <div className="agentsam-project-menu" role="dialog" aria-label="Choose project">
      <div className="agentsam-project-heading"><strong>Choose project</strong>
        <button type="button" aria-label="Close project picker" onClick={() => setOpen(false)}><X size={15} /></button>
      </div>
      <label className="agentsam-project-search"><Search size={14} />
        <input aria-label="Search projects" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" />
      </label>
      <div className="agentsam-project-options" aria-busy={loading || busy}>
        {loading ? <p>Loading projects…</p> : null}
        {!loading && error ? <p role="alert">{error}</p> : null}
        {!loading && visible.map((project) => <button type="button" key={project.id} onClick={() => void assign(project.id)}
          disabled={busy} className="agentsam-project-option" aria-current={project.id === projectId ? 'true' : undefined}>
          <Folder size={15} /><span>{project.name}</span>{project.id === projectId ? <Check size={15} /> : null}
        </button>)}
        {!loading && !error && !visible.length ? <p>No matching projects</p> : null}
      </div>
      {creating ? <form className="agentsam-project-new" onSubmit={(event) => void create(event)}>
        <input autoFocus aria-label="New project name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Project name" />
        <button type="submit" disabled={!name.trim() || busy}>Create</button>
      </form> : <button type="button" className="agentsam-project-new-trigger" onClick={() => setCreating(true)} disabled={busy}>
        <Plus size={15} /> New project
      </button>}
    </div> : null}
  </div>;
}
