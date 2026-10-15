import { MoreHorizontal, Star } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkCapabilities, WorkNavigate, WorkProject, WorkProjectInput } from "../../contracts/index";
import type { WorkActions } from "../actions";
import { ProjectDeleteDialog, ProjectEditor, projectStatusLabel } from "../ProjectEditor";
import { Empty, ErrorLine, Pill, timeAgo, useAction } from "../shared";

type Tab = "all" | "active" | "production" | "starred" | "archived";
const ACTIVE = new Set(["discovery", "design", "development", "qa", "staging"]);

export const statusTone = (status: string): "neutral" | "accent" | "success" | "warning" =>
  status === "production" ? "success" : status === "archived" || status === "maintenance" ? "neutral" : status === "qa" || status === "staging" ? "warning" : "accent";

export function ProjectsSurface({
  projects,
  capabilities,
  actions = {},
  onNavigate,
  headerActions,
}: {
  projects: WorkProject[];
  capabilities?: WorkCapabilities["projects"];
  actions?: WorkActions;
  onNavigate: WorkNavigate;
  /** Host-supplied extras (for example a knowledge/indexing entry point). */
  headerActions?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<WorkProject | "new" | null>(null);
  const [removing, setRemoving] = useState<WorkProject | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const { error, run } = useAction();
  const caps = capabilities ?? { create: Boolean(actions.createProject), update: Boolean(actions.updateProject), delete: Boolean(actions.deleteProject) };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const counts = useMemo(
    () => ({
      all: projects.filter((p) => p.status !== "archived").length,
      active: projects.filter((p) => ACTIVE.has(p.status)).length,
      production: projects.filter((p) => p.status === "production").length,
      starred: projects.filter((p) => p.starred).length,
      archived: projects.filter((p) => p.status === "archived").length,
    }),
    [projects],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (tab === "all" && p.status === "archived") return false;
      if (tab === "active" && !ACTIVE.has(p.status)) return false;
      if (tab === "production" && p.status !== "production") return false;
      if (tab === "starred" && !p.starred) return false;
      if (tab === "archived" && p.status !== "archived") return false;
      return !q || `${p.name} ${p.description ?? ""} ${p.clientName ?? ""} ${p.domain ?? ""}`.toLowerCase().includes(q);
    });
  }, [projects, tab, query]);

  const update = (id: string, patch: WorkProjectInput) => run(async () => { await actions.updateProject?.(id, patch); });

  return (
    <div className="aw-page">
      <div className="aw-head">
        <div>
          <p className="aw-kicker">Work</p>
          <h1>Projects</h1>
          <p className="aw-sub">Sites, systems, goals and releases organized as real work.</p>
        </div>
        <div className="aw-actions">
          {headerActions}
          {caps.create && actions.createProject ? (
            <button type="button" className="aw-btn aw-btn--primary" onClick={() => setEditing("new")}>+ New project</button>
          ) : null}
        </div>
      </div>

      <ErrorLine message={error} />

      <div className="aw-tabs" role="tablist">
        {([["all", "All"], ["active", "Active"], ["production", "Production"], ["starred", "Starred"], ["archived", "Archived"]] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" className="aw-tab" data-active={tab === id} aria-selected={tab === id} onClick={() => setTab(id)}>
            {label} {counts[id] ? <span style={{ opacity: 0.6 }}>{counts[id]}</span> : null}
          </button>
        ))}
      </div>
      <div className="aw-toolbar">
        <input className="aw-input grow" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
      </div>

      {visible.length === 0 ? (
        <Empty
          title={projects.length ? "No projects here" : "No projects yet"}
          hint={projects.length ? "Try another tab or clear the search." : "Create a project to organize tickets, events and releases."}
          action={!projects.length && caps.create && actions.createProject ? <button type="button" className="aw-btn aw-btn--primary" onClick={() => setEditing("new")}>+ New project</button> : undefined}
        />
      ) : (
        <div className="aw-projects">
          {visible.map((p) => (
            <article
              key={p.id}
              className="aw-project"
              style={{ ["--aw-accent" as string]: p.accent }}
              onClick={() => onNavigate("/projects/" + encodeURIComponent(p.id))}
            >
              <div className="aw-project__top">
                <div className="aw-badge" aria-hidden>{p.initials}</div>
                <div style={{ minWidth: 0, flex: 1, paddingRight: 36 }}>
                  <h3>{p.name}</h3>
                  {p.description ? <p>{p.description}</p> : null}
                </div>
                <Pill tone={statusTone(p.status)}>{projectStatusLabel(p.status)}</Pill>
              </div>
              <div className="aw-project__meta">
                {p.clientName ? <span>{p.clientName}</span> : null}
                {p.domain ? <span>{p.domain}</span> : null}
                {p.githubRepo ? <span>{p.githubRepo}</span> : null}
                {p.branch ? <span>{p.branch}</span> : null}
                {p.projectType && p.projectType !== "project" ? <span>{p.projectType}</span> : null}
              </div>
              <div className="aw-project__obj">
                <small>Current objective</small>
                <strong>{p.objective || "Not set"}</strong>
                <div className="aw-progress" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${p.progress}%`, background: "var(--aw-accent)" }} />
                </div>
              </div>
              <div className="aw-project__foot">
                <span><strong>{p.openTasks}</strong> open · {p.totalTasks ?? 0} tickets{p.starred ? " · starred" : ""}</span>
                <span>{p.updatedAt ? `Updated ${timeAgo(p.updatedAt)}` : ""} →</span>
              </div>
              {caps.update || caps.delete ? (
                <div className="aw-menu" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="aw-icon-btn" aria-label={`More actions for ${p.name}`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>
                    {p.starred ? <Star size={14} fill="currentColor" /> : <MoreHorizontal size={16} />}
                  </button>
                  {menu === p.id ? (
                    <div className="aw-menu__list" role="menu">
                      <button type="button" onClick={() => onNavigate("/projects/" + encodeURIComponent(p.id))}>Open</button>
                      {caps.update ? <button type="button" onClick={() => { setMenu(null); setEditing(p); }}>Edit</button> : null}
                      {caps.update ? <button type="button" onClick={() => { setMenu(null); void update(p.id, { starred: !p.starred }); }}>{p.starred ? "Unstar" : "Star"}</button> : null}
                      {caps.update && p.status === "archived" ? <button type="button" onClick={() => { setMenu(null); void update(p.id, { status: "development" }); }}>Restore</button> : null}
                      {caps.delete ? <button type="button" data-danger onClick={() => { setMenu(null); setRemoving(p); }}>{p.status === "archived" ? "Delete…" : "Archive or delete…"}</button> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {editing ? (
        <ProjectEditor
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === "new") await actions.createProject?.(input);
            else await actions.updateProject?.(editing.id, input);
          }}
        />
      ) : null}
      {removing ? (
        <ProjectDeleteDialog
          project={removing}
          onClose={() => setRemoving(null)}
          onArchive={actions.deleteProject ? async () => { await actions.deleteProject?.(removing.id); } : undefined}
          onDelete={actions.deleteProject ? async () => { await actions.deleteProject?.(removing.id, { hard: true }); } : undefined}
        />
      ) : null}
    </div>
  );
}
