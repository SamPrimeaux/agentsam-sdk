import { Folder } from 'lucide-react';
import { useWorkStore } from '@/lib/work/store';
import { isAuthorizedHostProject, isSampleProject } from '@/lib/work/workspace-restore';

/** Work project selection lives in conversation chrome, never a second dock. */
export function WorkProjectSelect() {
  const projects = useWorkStore((state) => state.projects);
  const activeProjectId = useWorkStore((state) => state.activeProjectId);
  const setActiveProject = useWorkStore((state) => state.setActiveProject);
  const project = projects.find((item) => item.id === activeProjectId) ?? projects[0] ?? null;

  return <label className="agentsam-work-project-select-wrap" title={`Active project: ${project?.name ?? 'None'}`}>
    <Folder size={15} aria-hidden="true" />
    <span className="agentsam-work-project-select-name">{project?.name ?? 'Choose project'}</span>
    <select className="agentsam-work-project-select" aria-label="Active Work project"
      value={project?.id ?? ''} disabled={!projects.length}
      onChange={(event) => { if (event.target.value) setActiveProject(event.target.value); }}>
      {!projects.length ? <option value="">Connect a project…</option> : null}
      {projects.map((item) => <option key={item.id} value={item.id}>
        {item.name}{isAuthorizedHostProject(item) ? ' · host' : isSampleProject(item) ? ' · sample' : ''}
      </option>)}
    </select>
  </label>;
}
