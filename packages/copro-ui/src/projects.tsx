import React, { useMemo, useState } from "react";

export type CoProProjectSummary = {
  id: string;
  title: string;
  subtitle?: string;
  kind: "video" | "image" | "audio" | "template" | "campaign" | "workspace" | "other";
  status: "draft" | "active" | "processing" | "rendering" | "ready" | "failed" | "archived";
  progress?: number;
  durationMs?: number;
  aspectRatio?: string;
  updatedAt: string;
  starred?: boolean;
  shared?: boolean;
  thumbnailTone?: "cyan" | "violet" | "amber" | "slate";
};

type ProjectsProps = {
  projects: CoProProjectSummary[];
  onOpenProject: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
};

const FILTERS = ["All", "Video", "Image", "Audio", "Template"] as const;

export function CoProProjectsScreen({ projects, onOpenProject, onCreate, onImport }: ProjectsProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const visible = useMemo(() => projects.filter((project) => {
    const matchesQuery = !query || (project.title + " " + (project.subtitle ?? "")).toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "All" || project.kind === filter.toLowerCase();
    return matchesQuery && matchesFilter;
  }), [projects, query, filter]);

  return (
    <section className="copro-projects">
      <header className="copro-projects-hero">
        <div className="copro-projects-brand">
          <span className="copro-brand-mark">CP</span>
          <div>
            <strong>CoPro</strong>
            <span>Studio</span>
          </div>
        </div>

        <div className="copro-projects-copy">
          <p className="copro-eyebrow">CREATE · EDIT · PUBLISH</p>
          <h1>Make the cut feel right.</h1>
          <p>Fast, hands-on editing with AgentSam available when you want a co-producer.</p>
        </div>

        <div className="copro-hero-actions">
          <button className="copro-hero-action copro-hero-action-primary" onClick={onCreate}>
            <b>＋</b><span><strong>New project</strong><small>Start with a blank timeline</small></span>
          </button>
          <button className="copro-hero-action" onClick={onImport}>
            <b>⇧</b><span><strong>Import media</strong><small>Video, audio, images</small></span>
          </button>
        </div>
      </header>

      <div className="copro-projects-content">
        <div className="copro-projects-titlebar">
          <div>
            <p className="copro-eyebrow">PROJECTS</p>
            <h2>Your edits</h2>
          </div>
          <label className="copro-project-search">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
            />
          </label>
        </div>

        <div className="copro-filter-row" role="tablist" aria-label="Project filters">
          {FILTERS.map((item) => (
            <button
              key={item}
              className={filter === item ? "is-active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="copro-project-list">
          {visible.map((project) => (
            <button
              className="copro-project-card"
              key={project.id}
              onClick={() => onOpenProject(project.id)}
            >
              <div className={"copro-project-thumb copro-thumb-" + (project.thumbnailTone ?? "slate")}>
                <span>{project.kind === "video" ? "▶" : project.kind === "audio" ? "♪" : "▧"}</span>
              </div>
              <div className="copro-project-card-copy">
                <strong>{project.title}</strong>
                <span>{project.subtitle ?? humanStatus(project.status)}</span>
                <small>{formatProjectMeta(project)}</small>
              </div>
              <div className="copro-project-card-tail">
                {typeof project.progress === "number" ? (
                  <div className="copro-real-progress" aria-label={project.progress + "% complete"}>
                    <i style={{ width: project.progress + "%" }} />
                  </div>
                ) : null}
                <span aria-hidden="true">›</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <nav className="copro-mobile-nav" aria-label="CoPro navigation">
        <button className="is-active" disabled title="Projects is the current home surface"><i>⌂</i><span>Home</span></button>
        <button disabled title="Agent surface is not enabled in this slice"><i>✦</i><span>Agent</span></button>
        <button className="copro-create-dock" onClick={onCreate}><i>＋</i><span>Create</span></button>
        <button className="is-active" disabled><i>▣</i><span>Projects</span></button>
        <button disabled title="Account surface is not enabled in this slice"><i>○</i><span>You</span></button>
      </nav>
    </section>
  );
}

function humanStatus(status: CoProProjectSummary["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatProjectMeta(project: CoProProjectSummary) {
  const pieces: string[] = [];
  if (project.durationMs) {
    const seconds = Math.round(project.durationMs / 1000);
    pieces.push(Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"));
  }
  if (project.aspectRatio) pieces.push(project.aspectRatio);
  pieces.push(new Date(project.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  return pieces.join(" · ");
}
