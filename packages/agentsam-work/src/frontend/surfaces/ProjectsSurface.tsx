import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkNavigate, WorkProject } from "../../contracts/index";

export function ProjectsSurface({
  projects,
  onNavigate,
}: {
  projects: WorkProject[];
  onNavigate: WorkNavigate;
}) {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (q && !(project.name + " " + (project.projectType || "")).toLowerCase().includes(q)) return false;
      if (tab === "archived") return project.status === "complete";
      return project.status !== "complete";
    });
  }, [projects, query, tab]);

  return (
    <div className="agentsam-work-page agentsam-work-projects">
      <div className="agentsam-work-page__header">
        <div>
          <p className="agentsam-work-page__eyebrow">Work</p>
          <h1 className="agentsam-work-page__title">Projects</h1>
          <p className="agentsam-work-page__description">
            Active work, progress and project context from the connected Work host.
          </p>
        </div>

        <label className="agentsam-work-project-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
          />
        </label>
      </div>

      <div className="agentsam-work-tabs" role="tablist" aria-label="Project views">
        <button type="button" role="tab" aria-selected={tab === "active"} data-active={tab === "active"} onClick={() => setTab("active")}>Active</button>
        <button type="button" role="tab" aria-selected={tab === "archived"} data-active={tab === "archived"} onClick={() => setTab("archived")}>Archived</button>
      </div>

      {!visible.length ? (
        <div className="agentsam-work-empty agentsam-work-projects__empty">
          <strong>{tab === "active" ? "No active projects yet" : "No archived projects"}</strong>
          <p>
            {tab === "active"
              ? "Projects will appear here when the connected Work host returns project records."
              : "Completed projects will appear here when they are available from the Work host."}
          </p>
        </div>
      ) : (
        <div className="agentsam-work-project-grid">
          {visible.map((project) => (
            <button key={project.id} type="button" className="agentsam-work-project-card" onClick={() => onNavigate("/projects/" + encodeURIComponent(project.id))}>
              <div className="agentsam-work-project-card__top">
                <span className="agentsam-work-project-card__initials" style={{ background: project.accent }}>{project.initials}</span>
                <span className="agentsam-work-project-card__status">{project.status}</span>
              </div>
              <h2>{project.name}</h2>
              <p>{project.description || project.projectType || "Project"}</p>
              <div className="agentsam-work-project-card__progress">
                <span style={{ width: Math.max(2, project.progress) + "%", background: project.accent }} />
              </div>
              <div className="agentsam-work-project-card__meta">
                <span>{project.progress}% complete</span>
                <span>{project.openTasks} open tasks</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
