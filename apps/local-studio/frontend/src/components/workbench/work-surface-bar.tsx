import { FileCode, Folder, MessageSquare, MonitorPlay, SquareTerminal } from "lucide-react";
import { useWorkStore, type WorkSurface } from "@/lib/work/store";
import { isAuthorizedHostProject, isSampleProject } from "@/lib/work/workspace-restore";
import { cn } from "@/lib/utils";

const SURFACES: Array<{ id: WorkSurface; label: string; icon: typeof MessageSquare }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "files", label: "Files", icon: Folder },
  { id: "code", label: "Code", icon: FileCode },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "preview", label: "Preview", icon: MonitorPlay },
];

/**
 * Compact mobile/tablet Work chrome: project status + one-surface switcher.
 * Switching surfaces must not dispose Monaco models or PTY runtimes.
 */
export function WorkSurfaceBar() {
  const projects = useWorkStore((s) => s.projects);
  const activeProjectId = useWorkStore((s) => s.activeProjectId);
  const setActiveProject = useWorkStore((s) => s.setActiveProject);
  const workSurface = useWorkStore((s) => s.workSurface);
  const setWorkSurface = useWorkStore((s) => s.setWorkSurface);
  const project = projects.find((item) => item.id === activeProjectId) ?? projects[0] ?? null;
  const status = !project
    ? "No workspace"
    : isAuthorizedHostProject(project)
      ? "Host"
      : isSampleProject(project)
        ? "Sample"
        : "Browser";

  return (
    <div className="work-surface-bar" aria-label="Work surfaces">
      <div className="work-surface-bar__project">
        <label className="work-surface-bar__select-wrap">
          <span className="sr-only">Active project</span>
          <select
            className="work-surface-bar__select"
            aria-label="Active project"
            value={project?.id ?? ""}
            onChange={(event) => {
              if (event.target.value) setActiveProject(event.target.value);
            }}
            disabled={!projects.length}
          >
            {!projects.length ? <option value="">Connect a project…</option> : null}
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {isAuthorizedHostProject(item) ? " · host" : isSampleProject(item) ? " · sample" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="work-surface-bar__status" data-status={status.toLowerCase()}>
          {status}
        </span>
      </div>
      <div className="work-surface-bar__surfaces" role="tablist" aria-label="Active Work surface">
        {SURFACES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={workSurface === id}
            className={cn("work-surface-bar__tab", workSurface === id && "is-active")}
            onClick={() => setWorkSurface(id)}
          >
            <Icon className="size-3.5" aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
