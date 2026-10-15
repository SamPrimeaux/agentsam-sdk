import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, ExternalLink, Flag, GitBranch, MoreHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { WorkCalendarEvent, WorkCapabilities, WorkNavigate, WorkProject, WorkTicket, WorkHost } from "../../contracts/index";
import type { WorkActions } from "../actions";
import { ProjectDeleteDialog, ProjectEditor, projectStatusLabel } from "../ProjectEditor";
import { Pill, formatDate, timeAgo } from "../shared";
import { isOpen, recommendOrder, sameProject } from "../ticket-plan";
import { statusTone } from "./ProjectsSurface";
import { TicketsSurface } from "./TicketsSurface";
import { TicketTable } from "../TicketTable";
import { ProjectChatsPanel } from "../ProjectChatsPanel";
import { TimelineView } from "../TimelineView";
import { timelineItems } from "../ticket-plan";

type Tab = "overview" | "tickets" | "timeline" | "calendar" | "chats";

export function ProjectDetailSurface({
  project,
  projects = [],
  tickets = [],
  events = [],
  capabilities,
  actions = {},
  onNavigate,
  onOpenTicket,
  onCreateTicket,
  chatHost,
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
  onCreateTicket?: () => void;
  chatHost?: Pick<WorkHost, "listProjectChats" | "listAssignableChats" | "assignProjectChat" | "createProjectChat">;
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
  const timeline = useMemo(() => timelineItems(mine), [mine]);
  const upcoming = useMemo(
    () => events.filter((e) => e.projectId === project.id && Date.parse(e.end) >= Date.now()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 8),
    [events, project.id],
  );
  const canEdit = capabilities?.projects.update ?? Boolean(actions.updateProject);
  const canDelete = capabilities?.projects.delete ?? Boolean(actions.deleteProject);

  return (
    <div className="aw-page aw-project-detail" data-active-tab={tab} style={{ ["--aw-accent" as string]: project.accent }}>
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
        {([["overview", "Overview"], ["tickets", `Tickets ${mine.length || ""}`], ["timeline", "Timeline"], ["chats", "Chats"], ["calendar", "Calendar"]] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" className="aw-tab" data-active={tab === id} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="aw-project-detail__layout">
        <main className="aw-project-detail__main" aria-label="Project work">
      {tab === "overview" ? (
        <>
          <div className="aw-project-overview-heading">
            <div><span className="aw-project-eyebrow">YOUR PROJECT</span><h2>Overview</h2><p>{project.objective || project.description || "Add a next objective so this project has a clear destination."}</p></div>
            {canEdit && actions.updateProject ? <button type="button" className="aw-btn" onClick={() => setEditing(true)}>Edit project</button> : null}
          </div>
          {focus.batch.length ? <section className="aw-project-plan" aria-label="Recommended execution order">
            <header className="aw-project-plan__header">
              <div><span className="aw-project-eyebrow">RECOMMENDED EXECUTION ORDER</span><h3>What to work on next</h3><p>Derived from ticket priority, blockers, and review state — not a generated schedule.</p></div>
              <button type="button" className="aw-btn" onClick={() => setTab("tickets")}>All tickets <ArrowUpRight size={13}/></button>
            </header>
            <div className="aw-project-plan__steps">
              {focus.batch.slice(0, 4).map((entry, index) => <button key={entry.ticket.id} type="button" className="aw-project-plan__step" onClick={() => onOpenTicket?.(entry.ticket)}>
                <span className="aw-project-plan__number">{index + 1}</span>
                <strong title={entry.ticket.title}>{entry.ticket.title}</strong>
                <small>{entry.reason}</small>
              </button>)}
            </div>
          </section> : null}
          <section className="aw-project-work-list">
            <header><div><h3>Suggested next batch</h3><p>Direct access to the work ready for attention.</p></div><span>{focus.batch.length} tickets</span></header>
            <TicketTable tickets={focus.batch.map((entry) => entry.ticket)} compact onOpenTicket={(ticket) => onOpenTicket?.(ticket)}/>
          </section>
          <div className="aw-project-bottom-grid">
            <section className="aw-project-preview">
              <header><h3>Timeline preview</h3><button type="button" onClick={() => setTab("timeline")}>View full <ArrowUpRight size={13}/></button></header>
              <TimelineView items={timeline.items} activityItems={timeline.activities} undatedCount={timeline.undated} onSelect={(id) => {
                const found = mine.find((item) => item.id === id);
                if (found) onOpenTicket?.(found);
              }}/>
            </section>
            <section className="aw-project-blockers">
              <header><h3>Dependencies</h3><span>{focus.dependencies.length} links</span></header>
              {focus.dependencies.length ? focus.dependencies.slice(0, 5).map((edge) => <p key={edge} title={edge}>{edge}</p>) : <p>No blocking relationships found in the current tickets.</p>}
              <div className="aw-project-links">
                {project.githubRepo ? <span>Repository: {project.githubRepo}</span> : null}
                {project.domain ? <span>Site: {project.domain}</span> : null}
              </div>
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
          onOpenTicket={onOpenTicket}
          onCreateTicket={onCreateTicket}
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

      {tab === "chats" ? <ProjectChatsPanel projectId={project.id} host={chatHost || {}} onNavigate={onNavigate} /> : null}
        </main>
        <aside className="aw-project-detail__inspector" aria-label="Project details">
          <header className="aw-project-inspector__head"><strong>Project details</strong><span>{project.status === "archived" ? "Archived" : "Live workspace"}</span></header>
          <div className="aw-project-inspector__progress">
            <div className="aw-project-inspector__ring" style={{ ["--value" as string]: project.progress + "%", ["--ring" as string]: project.accent }}><strong>{project.progress}%</strong></div>
            <div><strong>Perceived progress</strong><small>Your estimate, editable from project settings</small></div>
          </div>
          <div className="aw-project-inspector__progress">
            <div className="aw-project-inspector__ring" style={{ ["--value" as string]: (ticketCompletion ?? 0) + "%", ["--ring" as string]: "var(--agentsam-work-success)" }}><strong>{ticketCompletion ?? "—"}{ticketCompletion == null ? "" : "%"}</strong></div>
            <div><strong>Shipped tickets</strong><small>{shipped.length} of {mine.length} marked shipped · not verification evidence</small></div>
          </div>
          {focus.batch.length ? <button type="button" className="aw-project-inspector__next" onClick={() => onOpenTicket?.(focus.batch[0].ticket)}>
            <CheckCircle2 size={22}/><span><small>Next action</small><strong>{focus.batch[0].ticket.title}</strong><small>Open ticket <ArrowUpRight size={12}/></small></span>
          </button> : null}
          <div className="aw-project-inspector__facts">
            <div><span>Status</span><strong>{projectStatusLabel(project.status)}</strong></div>
            <div><span>Open tickets</span><strong>{open.length}</strong></div>
            <div><span>Blocked tickets</span><strong>{focus.blockedCount}</strong></div>
            <div><span>Tracked time</span><strong>{Math.round((project.trackedMinutes || 0) / 60)}h</strong></div>
            {project.launchDate ? <div><span>Target launch</span><strong>{formatDate(project.launchDate)}</strong></div> : null}
          </div>
          <section className="aw-project-inspector__group">
            <h3><Flag size={15}/> Milestones</h3>
            <p>Milestone tracking requires the persisted milestone contract. No dates or completion evidence are fabricated.</p>
          </section>
          <section className="aw-project-inspector__group">
            <h3><GitBranch size={15}/> Project links</h3>
            {project.githubRepo ? <p className="aw-project-inspector__repo">{project.githubRepo}{project.branch ? " · " + project.branch : ""}</p> : null}
            {project.domain ? <p>{project.domain}</p> : null}
            {!project.githubRepo && !project.domain ? <p>Add a repository or domain in project settings.</p> : null}
          </section>
          {upcoming.length ? <section className="aw-project-inspector__group">
            <h3><CalendarDays size={15}/> Upcoming</h3>
            {upcoming.slice(0, 3).map((e) => <p key={e.id}>{e.title} · {formatDate(e.start)}</p>)}
          </section> : null}
        </aside>
      </div>

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
