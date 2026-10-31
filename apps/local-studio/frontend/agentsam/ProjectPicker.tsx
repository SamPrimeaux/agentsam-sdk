import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Folder, Plus, Search, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNav } from '@inneranimalmedia/agentsam-nav';
import type { WorkProject } from '@inneranimalmedia/agentsam-work/contracts';
import { useWorkStore } from '@/lib/work/store';
import { IconAction } from '@/components/ui/icon-action';

/**
 * Project selection uses the very same WorkHost as /admin/projects.
 * The chat's existing workProjectId stores its association; never replace
 * its local projectId, conversation ID, messages, or draft.
 */
export function ProjectPicker({ trailId }: { trailId: string }) {
  const {theme,accentColor} = useNav();
  const chats = useWorkStore(state => state.trails);
  const [revision,setRevision] = useState(0);
  const [position,setPosition] = useState({left:16,bottom:60});
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
  const activity = (id:string) => Math.max(0,...chats.filter(chat => chat.workProjectId === id).map(chat => chat.updatedAt));
  const visible = projects.filter((project) => [project.name,project.description,project.clientName].some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))).sort((a,b) => activity(b.id)-activity(a.id) || a.name.localeCompare(b.name));

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = root.current?.getBoundingClientRect();
      if (rect) setPosition({left:Math.max(16,Math.min(rect.left,window.innerWidth-326)),bottom:Math.max(16,window.innerHeight-rect.top+6)});
    };
    reposition(); window.addEventListener('resize',reposition);
    return () => window.removeEventListener('resize',reposition);
  },[open]);

  useEffect(() => {
    if (!open && !projectId) return;
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
  }, [open, projectId, revision]);

  async function assign(id: string | null) {
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
      window.dispatchEvent(new Event('agentsam:projects-changed'));
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
      window.dispatchEvent(new Event('agentsam:projects-changed'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create project');
    } finally { setBusy(false); }
  }

  return <Dialog.Root modal={false} open={open} onOpenChange={setOpen}><div className="agentsam-project-picker" ref={root}><Dialog.Trigger asChild>
    <button type="button" className="agentsam-project-trigger" aria-label="Choose project" aria-expanded={open}
      aria-haspopup="dialog" onClick={() => { setOpen((value) => !value); setCreating(false); }}>
      <Folder size={14} /><span>{active?.name || (projectId ? (loading ? 'Loading project…' : 'Project unavailable') : 'Choose project')}</span><ChevronDown size={13} />
    </button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Content data-nav-theme={theme} className="as-nav-scope agentsam-project-menu" aria-describedby={undefined}
      style={{'--project-menu-left':position.left+'px','--project-menu-bottom':position.bottom+'px','--nav-accent':accentColor} as React.CSSProperties}>
      <Dialog.Title className="as-nav-sr-only">Choose project</Dialog.Title>
      <div className="agentsam-project-heading"><strong>Choose project</strong>
        <IconAction label="Close project picker" onClick={() => setOpen(false)}><X size={15} aria-hidden="true" /></IconAction>
      </div>
      <label className="agentsam-project-search"><Search size={14} />
        <input aria-label="Search projects" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" />
      </label>
      <div className="agentsam-project-options" aria-busy={loading || busy}>
        {loading ? <p>Loading projects…</p> : null}
        {!loading && error ? <div role="alert"><p>Projects are unavailable. {error}</p><button type="button" className="agentsam-project-option" onClick={() => setRevision(value => value+1)}>Retry loading projects</button></div> : null}
        {projectId ? <button type="button" className="agentsam-project-option" disabled={busy} onClick={() => void assign(null)}><X size={15}/> Clear project association</button> : null}
        {!loading && !error && !query && visible.some(project => activity(project.id)>0) ? <p>Recently used first</p> : null}
        {!loading && visible.map((project) => <button type="button" key={project.id} onClick={() => void assign(project.id)}
          disabled={busy} className="agentsam-project-option" aria-current={project.id === projectId ? 'true' : undefined}>
          <Folder size={15} /><span>{project.name}<small>{[project.status,project.clientName || project.description].filter(Boolean).join(" · ")}</small></span>{project.id === projectId ? <Check size={15} /> : null}
        </button>)}
        {!loading && !error && !visible.length ? <p>No matching projects</p> : null}
      </div>
      {creating ? <form className="agentsam-project-new" onSubmit={(event) => void create(event)}>
        <input autoFocus aria-label="New project name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Project name" />
        <button type="submit" disabled={!name.trim() || busy}>Create</button>
      </form> : <button type="button" className="agentsam-project-new-trigger" onClick={() => setCreating(true)} disabled={busy || loading || Boolean(error)}>
        <Plus size={15} /> New project
      </button>}
    </Dialog.Content></Dialog.Portal>
  </div></Dialog.Root>;
}
