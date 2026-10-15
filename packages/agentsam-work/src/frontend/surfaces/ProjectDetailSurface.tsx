import { ArrowLeft, ExternalLink, MoreHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { WorkCalendarEvent, WorkCapabilities, WorkNavigate, WorkProject, WorkTicket } from "../../contracts/index";
import type { WorkActions } from "../actions";
import { ProjectDeleteDialog, ProjectEditor, projectStatusLabel } from "../ProjectEditor";
import { Pill, formatDate, timeAgo } from "../shared";
import { isOpen, recommendOrder, sameProject } from "../ticket-plan";
import { statusTone } from "./ProjectsSurface";
import { TicketsSurface } from "./TicketsSurface";

type Tab = "overview" | "tickets" | "timeline" | "calendar";

export function ProjectDetailSurface({
  project,
  projects = [],
  tickets = [],
  events = [],
  capabilities,
  actions = {},
  onNavigate,
  onOpenTicket,
  knowledgeAction,
}: {
  project: WorkProject;
  projects?: WorkProject[];
  tickets?: WorkTicket[];
  events?: WorkCalendarEvent[];
  capabilities?: WorkCapabilities;
  actions?: WorkActions;
  onNavigate: WorkNavigate;
  onOpenTicket?: (ticket: WorkTicket) => void;
  /** Host-supplied control for codebase / knowledge indexing. */
  knowledgeAction?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const mine = useMemo(() => tickets.filter((t) => sameProject(t, project)), [tickets, project]);
  const open = mine.filter(isOpen);
  const shipped = mine.filter((ticket) => ticket.status === "shipped");
  const ticketCompletion = mine.length ? Math.round(shipped.length / mine.length * 100) : null;
  const focus = useMemo(() => recommendOrder(mine), [mine]);
  const upcoming = useMemo(
    () => events.filter((e) => e.projectId === project.id && Date.parse(e.end) >= Date.now()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 8),
    [events, project.id],
  );
  const canEdit = capabilities?.projects.update ?? Boolean(actions.updateProject);
  const canDelete = capabilities?.projects.delete ?? Boolean(actions.deleteProject);

  return (
    <div className="aw-page aw-project-detail" style={{ ["--aw-accent" as string]: project.accent }}>
      <button type="button" className="aw-btn aw-project-back" onClick={() => onNavigate("/projects")}>
        <ArrowLeft size={14} /> All projects
      </button>
      <div className="aw-head">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div className="aw-badge" style={{ width: 52, height: 52, fontSize: 18 }} aria-hidden>{project.initials}</div>
          <div>
            <p className="aw-kicker">Project</p>
            <h1 style={{ fontSize: "clamp(22px, 3vw, 30px)" }}>{project.name}</h1>
            <p className="aw-sub" style={{ marginTop: 6 }}>
              <Pill tone={statusTone(project.status)}>{projectStatusLabel(project.status)}</Pill>{" "}
              {project.clientName ? `${project.clientName} · ` : ""}{project.updatedAt ? `Updated ${timeAgo(project.updatedAt)}` : ""}
            </p>
          </div>
        </div>
        <div className="aw-actions aw-project-detail__actions">
          <div className="aw-project-detail__desktop-actions">
            {knowledgeAction}
            {canEdit && actions.updateProject ? <button type="button" className="aw-btn" onClick={() => setEditing(true)}>Edit</button> : null}
            {canDelete && actions.deleteProject ? <button type="button" className="aw-btn aw-btn--danger" onClick={() => setRemoving(true)}>{project.status === "archived" ? "Delete…" : "Archive…"}</button> : null}
          </div>
          <details className="aw-project-detail__mobile-actions">
            <summary aria-label="Project actions"><MoreHorizontal size={20} /></summary>
            <div>
              {knowledgeAction}
              {canEdit && actions.updateProject ? <button type="button" className="aw-btn" onClick={() => setEditing(true)}>Edit project</button> : null}
              {canDelete && actions.deleteProject ? <button type="button" className="aw-btn aw-btn--danger" onClick={() => setRemoving(true)}>{project.status === "archived" ? "Delete…" : "Archive…"}</button> : null}
            </div>
          </details>
        </div>
      </div>

      <div className="aw-tabs" role="tablist">
        {([["overview", "Overview"], ["tickets", `Tickets ${mine.length || ""}`], ["timeline", "Timeline"], ["calendar", `Calendar ${upcoming.length || ""}`]] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" className="aw-tab" data-active={tab === id} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <section className="aw-project-summary" aria-label="Project progress and priorities">
            <div className="aw-project-summary__progress">
              <span>Perceived progress</span>
              <strong>{project.progress}%</strong>
              <div className="aw-progress"><span style={{ width: project.progress + "%", background: "var(--aw-accent)" }} /></div>
              <small>Manually estimated · Edit to adjust</small>
            </div>
            <div className="aw-project-summary__progress">
              <span>Shipped tickets</span>
              <strong>{ticketCompletion == null ? "—" : ticketCompletion + "%"}</strong>
              <div className="aw-progress"><span style={{ width: (ticketCompletion ?? 0) + "%", background: "var(--agentsam-work-success)" }} /></div>
              <small>{shipped.length} of {mine.length} marked shipped · not verification evidence</small>
            </div>
            <div className="aw-project-summary__counts">
              <div><strong>{open.length}</strong><small>Open</small></div>
              <div><strong>{focus.blockedCount}</strong><small>Blocked</small></div>
              <div><strong>{Math.round((project.trackedMinutes || 0) / 60)}h</strong><small>Tracked</small></div>
            </div>
          </section>
          {focus.batch.length ? <section className="aw-project-next" aria-label="Next actions">
            <div className="aw-project-next__head"><h3>Next actions</h3><button type="button" onClick={() => setTab("tickets")}>View all tickets</button></div>
            {focus.batch.slice(0, 3).map((entry, index) => (
              <button key={entry.ticket.id} type="button" className="aw-project-next__item" onClick={() => onOpenTicket?.(entry.ticket)}>
                <span>{index + 1}</span>
                <span><strong>{entry.ticket.title}</strong><small>{entry.reason}</small></span>
              </button>
            ))}
          </section> : null}
          <div className="aw-panels">
            <section className="aw-panel">
              <h3>Current objective</h3>
              <p>{project.objective || "No objective set yet."}</p>
              {project.description ? <p>{project.description}</p> : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {project.projectType && project.projectType !== "project" ? <Pill>{project.projectType}</Pill> : null}
                {project.launchDate ? <Pill>launch {formatDate(project.launchDate)}</Pill> : null}
                {(project.tags ?? []).map((tag) => <Pill key={tag}>{tag}</Pill>)}
              </div>
            </section>
            <section className="aw-panel">
              <h3>Links</h3>
              {project.domain ? <p><ExternalLink size={12} /> {project.domain}</p> : null}
              {project.githubRepo ? <p>{project.githubRepo}{project.branch ? ` · ${project.branch}` : ""}</p> : null}
              {!project.domain && !project.githubRepo ? <p>Add a domain or repository from Edit.</p> : null}
            </section>
            <section className="aw-panel">
              <h3>Up next</h3>
              {upcoming.length ? upcoming.slice(0, 4).map((e) => <p key={e.id} style={{ margin: "0 0 6px" }}><strong>{e.title}</strong> · {formatDate(e.start, true)}</p>) : <p>No upcoming events for this project.</p>}
              <button type="button" className="aw-btn" onClick={() => onNavigate("/collaborate")}>Open calendar</button>
            </section>
          </div>
        </>
      ) : null}

      {tab === "tickets" ? (
        <TicketsSurface
          embedded
          tickets={tickets}
          projects={projects}
          projectId={project.id}
          capabilities={capabilities?.tickets}
          onCreate={actions.createTicket}
          onUpdate={actions.updateTicket}
          onDelete={actions.deleteTicket}
          onSchedule={actions.scheduleTicket}
        />
      ) : null}

      {tab === "timeline" ? (
        <TicketsSurface
          embedded
          tickets={tickets}
          projects={projects}
          projectId={project.id}
          capabilities={capabilities?.tickets}
          onCreate={actions.createTicket}
          onUpdate={actions.updateTicket}
          onDelete={actions.deleteTicket}
          onSchedule={actions.scheduleTicket}
          initialMode="timeline"
          hideModeTabs
        />
      ) : null}

      {tab === "calendar" ? (
        <section className="aw-panel">
          <h3>Upcoming for this project</h3>
          {upcoming.length ? upcoming.map((e) => <p key={e.id} style={{ margin: "0 0 8px" }}><strong>{e.title}</strong> · {formatDate(e.start, true)}</p>) : <p>Nothing scheduled. Create events from the calendar and link them to this project.</p>}
          <button type="button" className="aw-btn aw-btn--primary" onClick={() => onNavigate("/collaborate")}>Open calendar</button>
        </section>
      ) : null}

      {editing ? (
        <ProjectEditor project={project} onClose={() => setEditing(false)} onSave={async (input) => { await actions.updateProject?.(project.id, input); }} />
      ) : null}
      {removing ? (
        <ProjectDeleteDialog
          project={project}
          onClose={() => setRemoving(false)}
          onArchive={actions.deleteProject ? async () => { await actions.deleteProject?.(project.id); } : undefined}
          onDelete={actions.deleteProject ? async () => { await actions.deleteProject?.(project.id, { hard: true }); onNavigate("/projects"); } : undefined}
        />
      ) : null}
    </div>
  );
}
