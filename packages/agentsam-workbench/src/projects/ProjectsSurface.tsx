import type { ReactNode } from 'react';

export type ProjectHealth = 'healthy' | 'attention' | 'active' | 'idle';

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  repository?: string;
  branch?: string;
  status?: string;
  health?: ProjectHealth;
  objective?: string;
  progress?: number | null;
  updatedAt?: string;
  tags?: string[];
  stats?: Array<{ label: string; value: string | number }>;
}

export interface ProjectsSurfaceProps {
  title?: string;
  subtitle?: string;
  projects: ProjectSummary[];
  activeFilter?: string;
  filters?: string[];
  onFilterChange?: (filter: string) => void;
  onOpenProject?: (project: ProjectSummary) => void;
  onCreateProject?: () => void;
  headerAction?: ReactNode;
}

function clampProgress(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(1, value));
}

export function ProjectsSurface({
  title = 'Projects',
  subtitle = 'Sites, systems, goals and releases organized as real work.',
  projects,
  activeFilter = 'All',
  filters = ['All', 'Active', 'Shared', 'Archived'],
  onFilterChange,
  onOpenProject,
  onCreateProject,
  headerAction,
}: ProjectsSurfaceProps) {
  return (
    <section className="as-projects" aria-label="Projects">
      <div className="as-projects__header">
        <div>
          <p className="as-kicker">WORK</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="as-projects__header-actions">
          {headerAction}
          <button className="as-button as-button--primary" type="button" onClick={onCreateProject}>+ New project</button>
        </div>
      </div>

      <div className="as-projects__filters" role="tablist" aria-label="Project filters">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={activeFilter === filter}
            className="as-filter"
            data-active={activeFilter === filter || undefined}
            onClick={() => onFilterChange?.(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="as-projects__list">
        {projects.map((project) => {
          const progress = clampProgress(project.progress);
          return (
            <button
              type="button"
              className="as-project-card"
              key={project.id}
              onClick={() => onOpenProject?.(project)}
            >
              <div className="as-project-card__top">
                <div className="as-project-card__identity">
                  <span className="as-project-card__mark" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.description}</p>
                  </div>
                </div>
                <span className="as-health" data-health={project.health ?? 'idle'}>
                  <span />
                  {project.status ?? project.health ?? 'idle'}
                </span>
              </div>

              <div className="as-project-card__repo">
                <span>{project.repository ?? 'Local project'}</span>
                {project.branch ? <span className="as-project-card__branch">{project.branch}</span> : null}
              </div>

              {project.objective ? (
                <div className="as-project-card__objective">
                  <span className="as-meta-label">Current objective</span>
                  <strong>{project.objective}</strong>
                  <div className="as-progress-track" aria-label={progress == null ? 'Progress unknown' : `${Math.round(progress * 100)}% complete`}>
                    {progress == null ? <span className="as-progress-indeterminate" /> : <span style={{ width: `${Math.round(progress * 100)}%` }} />}
                  </div>
                </div>
              ) : null}

              <div className="as-project-card__footer">
                <div className="as-project-card__stats">
                  {(project.stats ?? []).map((stat) => (
                    <span key={stat.label}><strong>{stat.value}</strong> {stat.label}</span>
                  ))}
                </div>
                <span className="as-project-card__updated">{project.updatedAt ?? 'Updated just now'} →</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
