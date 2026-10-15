import { MoreHorizontal, Star, Image as ImageIcon, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkCapabilities, WorkNavigate, WorkProject, WorkProjectInput, WorkTicket, WorkArtifact } from "../../contracts/index";
import { ProjectPortfolio } from "../ProjectPortfolio";
import type { WorkActions } from "../actions";
import { ProjectDeleteDialog, ProjectEditor, projectStatusLabel } from "../ProjectEditor";
import { Empty, ErrorLine, Pill, timeAgo, useAction } from "../shared";
import { isOpen, recommendOrder, sameProject } from "../ticket-plan";

type Tab = "all" | "active" | "production" | "starred" | "archived";
const ACTIVE = new Set(["discovery", "design", "development", "qa", "staging"]);

export const statusTone = (status: string): "neutral" | "accent" | "success" | "warning" =>
  status === "production" ? "success" : status === "archived" || status === "maintenance" ? "neutral" : status === "qa" || status === "staging" ? "warning" : "accent";

export function ProjectsSurface({
  projects,
  tickets = [],
  artifacts = [],
  onOpenTicket,
  capabilities,
  actions = {},
  onNavigate,
  headerActions,
}: {
  projects: WorkProject[];
  tickets?: WorkTicket[];
  artifacts?: WorkArtifact[];
  onOpenTicket?: (ticket: WorkTicket) => void;
  capabilities?: WorkCapabilities["projects"];
  actions?: WorkActions;
  onNavigate: WorkNavigate;
  /** Host-supplied extras (for example a knowledge/indexing entry point). */
  headerActions?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("all");
  // A project catalog is the entry point on every device. Timeline is an
  // intentional planning mode, never an unexpected desktop default.
  const [view, setView] = useState<"portfolio" | "cards">("cards");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"attention" | "updated" | "name" | "progress">("attention");
  const [focusFilter, setFocusFilter] = useState<"focus" | "blocked" | "review" | "all">("all");
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
    }).sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "progress") return b.progress - a.progress;
      if (sort === "updated") return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      const score = (p: WorkProject) => p.status === "qa" || p.status === "staging" ? 0 : p.openTasks > 0 ? 1 : p.status === "production" ? 3 : 2;
      return score(a) - score(b) || (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
  }, [projects, tab, query, sort]);

  const projectWork = useMemo(() => new Map(projects.map((p) => {
    const linked = tickets.filter((ticket) => sameProject(ticket, p));
    return [p.id, { linked, plan: recommendOrder(linked), shipped: linked.filter((ticket) => ticket.status === "shipped").length }] as const;
  })), [projects, tickets]);
  const visibleCards = useMemo(() => focusFilter === "all" ? visible : visible.filter((p) => {
    const summary = projectWork.get(p.id);
    if (!summary) return false;
    if (focusFilter === "blocked") return summary.plan.blockedCount > 0;
    if (focusFilter === "review") return summary.linked.some((ticket) => ticket.status === "in_review");
    return p.openTasks > 0 || p.starred;
  }), [visible, focusFilter, projectWork]);
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
      <div className="aw-portfolio-views" role="group" aria-label="Project view">
        <button type="button" data-active={view === "cards"} aria-pressed={view === "cards"} onClick={() => setView("cards")}>Project grid</button>
        <button type="button" data-active={view === "portfolio"} aria-pressed={view === "portfolio"} onClick={() => setView("portfolio")}>Portfolio timeline</button>
      </div>

      <div className="aw-tabs" role="tablist">
        {([["all", "All"], ["active", "Active"], ["production", "Production"], ["starred", "Starred"], ["archived", "Archived"]] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" className="aw-tab" data-active={tab === id} aria-selected={tab === id} onClick={() => setTab(id)}>
            {label} {counts[id] ? <span style={{ opacity: 0.6 }}>{counts[id]}</span> : null}
          </button>
        ))}
      </div>
      <div className="aw-toolbar">
        <input className="aw-input grow" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
        <select className="aw-select aw-project-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort projects">
          <option value="attention">Needs attention</option>
          <option value="updated">Recently updated</option>
          <option value="progress">Most progressed</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {view === "portfolio" && visible.length > 0 ? (
        <ProjectPortfolio projects={visible} tickets={tickets} onNavigate={onNavigate} onOpenTicket={onOpenTicket}/>
      ) : visible.length === 0 ? (
        <Empty
          title={projects.length ? "No projects here" : "No projects yet"}
          hint={projects.length ? "Try another tab or clear the search." : "Create a project to organize tickets, events and releases."}
          action={!projects.length && caps.create && actions.createProject ? <button type="button" className="aw-btn aw-btn--primary" onClick={() => setEditing("new")}>+ New project</button> : undefined}
        />
      ) : (
        <>
          <div className="aw-project-focus" role="group" aria-label="Project focus">
            {([
              ["focus", "My focus"],
              ["blocked", "Blocked"],
              ["review", "Needs review"],
              ["all", "All projects"],
            ] as const).map(([key, label]) => <button key={key} type="button" data-active={focusFilter === key} onClick={() => setFocusFilter(key)}>{label}</button>)}
          </div>
          {visibleCards.length === 0 ? <Empty title="Nothing needs attention in this filter" hint="Switch to All projects to view everything."/> : (
          <div className="aw-projects aw-project-cards-v3">
            {visibleCards.map((p) => {
              const summary = projectWork.get(p.id);
              const linked = summary?.linked || [];
              const next = summary?.plan.batch[0]?.ticket;
              const blockerCount = summary?.plan.blockedCount || 0;
              const shippedPct = linked.length ? Math.round((summary?.shipped || 0) / linked.length * 100) : null;
              return <article
                key={p.id}
                className="aw-project-v3"
                role="link"
                tabIndex={0}
                onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onNavigate("/projects/" + encodeURIComponent(p.id)); } }}
                style={{ ["--aw-accent" as string]: p.accent }}
                onClick={() => onNavigate("/projects/" + encodeURIComponent(p.id))}
              >
                <div className="aw-project-v3__cover" data-has-cover={Boolean(p.coverImageUrl)} aria-label={"Cover for " + p.name}>
                  {p.coverImageUrl
                    ? <img src={p.coverImageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                    : <div className="aw-project-v3__cover-empty"><ImageIcon size={24} aria-hidden/><span>{p.name}</span></div>}
                  <span className="aw-project-v3__cover-status">{projectStatusLabel(p.status)}</span>
                </div>
                <div className="aw-project-v3__content">
                <div className="aw-project-v3__head">
                  <span className="aw-project-v3__icon" aria-hidden>{p.initials}</span>
                  <div className="aw-project-v3__identity"><h3>{p.name}</h3><p>{p.description || p.projectType || "Project workspace"}</p>
                    <span className="aw-project-v3__tags">{(p.tags?.length ? p.tags : [p.projectType || "project", p.status]).slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</span>
                  </div>
                  <div className="aw-project-v3__rings">
                    <span className="aw-project-v3__ring" style={{ ["--value" as string]: p.progress + "%", ["--ring" as string]: p.accent }}><b>{p.progress}%</b><small>Estimated</small></span>
                    <span className="aw-project-v3__ring" style={{ ["--value" as string]: (shippedPct ?? 0) + "%", ["--ring" as string]: "var(--agentsam-work-success)" }}><b>{shippedPct == null ? "—" : shippedPct + "%"}</b><small>Shipped</small></span>
                  </div>
                </div>
                <div className="aw-project-v3__next" aria-label={"Current objective: " + (p.objective || "not set")}>
                  <span>Next action</span>
                  {next ? <button type="button" title={next.title} onClick={(event) => { event.stopPropagation(); onOpenTicket?.(next); }}>{next.title}</button> : <strong>{p.objective || "Set the next action"}</strong>}
                </div>
                <div className="aw-project-v3__foot">
                  <span>{p.openTasks} open · {p.totalTasks ?? linked.length} tickets</span>
                  {(p.estimatedMinutes || 0) > 0 ? <span className="aw-project-v3__effort" title="Estimated ticket effort, not recorded time"><Clock3 size={12}/>{Math.round((p.estimatedMinutes || 0) / 60 * 10) / 10}h estimated</span> : null}
                  {blockerCount ? <strong className="aw-project-v3__blockers">{blockerCount} blocker{blockerCount !== 1 ? "s" : ""}</strong> : p.status === "qa" || p.status === "staging" ? <strong className="aw-project-v3__review">Needs review</strong> : <span>{p.updatedAt ? "Updated " + timeAgo(p.updatedAt) : projectStatusLabel(p.status)}</span>}
                  <span className="aw-project-v3__arrow">→</span>
                </div>
                </div>
                {caps.update || caps.delete ? <div className="aw-menu aw-project-v3__menu" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="aw-icon-btn" aria-label={"More actions for " + p.name} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}><MoreHorizontal size={18}/></button>
                  {menu === p.id ? <div className="aw-menu__list" role="menu">
                    <button type="button" onClick={() => onNavigate("/projects/" + encodeURIComponent(p.id))}>Open</button>
                    {caps.update ? <button type="button" onClick={() => { setMenu(null); setEditing(p); }}>Edit</button> : null}
                    {caps.update ? <button type="button" onClick={() => { setMenu(null); void update(p.id, { starred: !p.starred }); }}>{p.starred ? "Unstar" : "Star"}</button> : null}
                    {caps.update && p.status === "archived" ? <button type="button" onClick={() => { setMenu(null); void update(p.id, { status: "development" }); }}>Restore</button> : null}
                    {caps.delete ? <button type="button" data-danger onClick={() => { setMenu(null); setRemoving(p); }}>{p.status === "archived" ? "Delete…" : "Archive or delete…"}</button> : null}
                  </div> : null}
                </div> : null}
              </article>;
            })}
          </div>)}
        </>
      )}

      {editing ? (
        <ProjectEditor
          project={editing === "new" ? null : editing}
          coverImages={artifacts}
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
