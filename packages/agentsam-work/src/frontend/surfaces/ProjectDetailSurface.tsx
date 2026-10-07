import { Archive, CalendarDays, CheckSquare, GitBranch, Timer } from "lucide-react";
import type { WorkNavigate, WorkProject } from "../../contracts/index";

export function ProjectDetailSurface({
  project,
  onNavigate,
}: {
  project: WorkProject;
  onNavigate: WorkNavigate;
}) {
  return (
    <div className="agentsam-work-page agentsam-work-project-detail">
      <button type="button" className="agentsam-work-back" onClick={() => onNavigate("/projects")}>
        ← Projects
      </button>

      <div className="agentsam-work-page__header agentsam-work-project-detail__header">
        <div>
          <p className="agentsam-work-page__eyebrow">{project.projectType || "Project"}</p>
          <h1 className="agentsam-work-page__title">{project.name}</h1>
          <p className="agentsam-work-page__description">
            {project.description || "Project context, progress and connected work."}
          </p>
        </div>
        <span className="agentsam-work-project-detail__status">{project.status}</span>
      </div>

      <div className="agentsam-work-project-detail__layout">
        <main className="agentsam-work-project-detail__main">
          <section className="agentsam-work-card agentsam-work-project-overview">
            <div className="agentsam-work-section-heading">
              <div>
                <p className="agentsam-work-page__eyebrow">Progress</p>
                <h2>Project overview</h2>
              </div>
              <strong>{project.progress}%</strong>
            </div>
            <div className="agentsam-work-project-card__progress">
              <span style={{ width: Math.max(2, project.progress) + "%", background: project.accent }} />
            </div>
            <div className="agentsam-work-stat-grid">
              <div><CheckSquare size={16} /><span><strong>{project.openTasks}</strong><small>Open tasks</small></span></div>
              <div><Timer size={16} /><span><strong>{project.trackedMinutes}</strong><small>Tracked minutes</small></span></div>
              <div><GitBranch size={16} /><span><strong>{project.githubRepo ? "Linked" : "Not linked"}</strong><small>Repository</small></span></div>
            </div>
          </section>

          {project.githubRepo ? (
            <section className="agentsam-work-card agentsam-work-project-repo">
              <GitBranch size={18} />
              <div><strong>Repository</strong><p>{project.githubRepo}</p></div>
            </section>
          ) : null}
        </main>

        <aside className="agentsam-work-card agentsam-work-project-detail__rail">
          <p className="agentsam-work-page__eyebrow">Workspace</p>
          <h2>Open related work</h2>
          <button type="button" onClick={() => onNavigate("/collaborate?seg=tickets")}><CheckSquare size={16} /><span>Tickets</span></button>
          <button type="button" onClick={() => onNavigate("/collaborate")}><CalendarDays size={16} /><span>Calendar</span></button>
          <button type="button" onClick={() => onNavigate("/artifacts")}><Archive size={16} /><span>Artifacts</span></button>
        </aside>
      </div>
    </div>
  );
}
