import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, Flag, GitBranch, MessageSquarePlus, Link2, MoreHorizontal, ListTodo, Box } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkCalendarEvent, WorkCapabilities, WorkNavigate, WorkProject, WorkTicket, WorkHost, WorkProjectInsights, WorkArtifact } from "../../contracts/index";
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
  artifacts = [],
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
  artifacts?: WorkArtifact[];
  capabilities?: WorkCapabilities;
  actions?: WorkActions;
  onNavigate: WorkNavigate;
  onOpenTicket?: (ticket: WorkTicket) => void;
  onCreateTicket?: () => void;
  chatHost?: Pick<WorkHost, "listProjectChats" | "listAssignableChats" | "assignProjectChat" | "createProjectChat" | "projectInsights" | "projectApps">;
  /** Host-supplied control for codebase / knowledge indexing. */
  knowledgeAction?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const projectApps = chatHost?.projectApps?.(project) ?? [];
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [chatError, setChatError] = useState("");
  const [showAllFocus, setShowAllFocus] = useState(false);
  const [insights, setInsights] = useState<WorkProjectInsights | null>(null);
  const [insightsError, setInsightsError] = useState("");
  useEffect(() => {
    if (!chatHost?.projectInsights) return;
    let cancelled = false;
    async function refresh() {
      try {
        const next = await chatHost!.projectInsights!(project.id);
        if (!cancelled) { setInsights(next); setInsightsError(""); }
      } catch (cause) {
        if (!cancelled) setInsightsError(cause instanceof Error ? cause.message : "Insights unavailable");
      }
    }
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [chatHost?.projectInsights, project.id]);

  async function newProjectChat() {
    if (!chatHost?.createProjectChat || creatingChat) return;
    setCreatingChat(true);
    setChatError("");
    try {
      const chatId = await chatHost.createProjectChat(project.id);
      onNavigate("/chats/" + encodeURIComponent(chatId));
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : "Could not create project chat");
    } finally {
      setCreatingChat(false);
    }
  }
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
          {project.coverImageUrl
            ? <img className="aw-project-detail__avatar" src={project.coverImageUrl} alt="" />
            : <div className="aw-badge aw-project-detail__initials" aria-hidden>{project.initials}</div>}
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
          {chatHost?.createProjectChat ? <button type="button" className="aw-btn aw-btn--primary" onClick={() => void newProjectChat()} disabled={creatingChat}><MessageSquarePlus size={15}/> {creatingChat ? "Creating…" : "New chat"}</button> : null}
          {chatHost?.listAssignableChats && chatHost?.assignProjectChat ? <button type="button" className="aw-btn" onClick={() => setTab("chats")}><Link2 size={15}/> Attach chat</button> : null}
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

      <section className="aw-project-mobile-summary" aria-label="Project quick summary">
        <div><span>Estimated</span><strong>{project.progress}%</strong></div>
        <div><span>Shipped</span><strong>{ticketCompletion == null ? "—" : ticketCompletion + "%"}</strong></div>
        <div><span>Open</span><strong>{open.length}</strong></div>
        <div><span>Blocked</span><strong>{focus.blockedCount}</strong></div>
      </section>

      <div className="aw-tabs" role="tablist">
        {([["overview", "Overview"], ["tickets", `Tickets ${mine.length || ""}`], ["timeline", "Timeline"], ["chats", "Chats"], ["calendar", "Calendar"]] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" className="aw-tab" data-active={tab === id} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="aw-project-detail__layout">
        <main className="aw-project-detail__main" aria-label="Project work">
      {tab === "overview" ? (
        <div className="aw-project-home" aria-label="Project overview">
          {chatError ? <p role="alert" className="aw-error">{chatError}</p> : null}
          <section className="aw-project-home__objective">
            <span className="aw-project-eyebrow">CURRENT OBJECTIVE</span>
            <h2>{project.objective || "Define your next objective"}</h2>
            <p>{project.description || "Keep tasks, conversations and project context together."}</p>
            {canEdit && actions.updateProject ? <button type="button" className="aw-btn" onClick={() => setEditing(true)}>Edit objective</button> : null}
          </section>
          <section className="aw-project-home__focus">
            <header>
              <div><span className="aw-project-eyebrow">FOCUS</span><h3>Up next</h3>
                <p>{focus.blockedCount} blocked · {open.length} open tickets</p></div>
              <button type="button" className="aw-btn" onClick={() => setTab("tickets")}><ListTodo size={15}/> All tickets</button>
            </header>
            {focus.batch.length ? <ol className="aw-project-home__tasks">
              {focus.batch.slice(0, showAllFocus ? 12 : 5).map((entry) => <li key={entry.ticket.id}>
                <button type="button" onClick={() => onOpenTicket?.(entry.ticket)}
                  title={entry.ticket.title} aria-label={"Open ticket: " + entry.ticket.title}>
                  <span className="aw-project-home__sr-only">Open ticket</span>
                  <span className="aw-project-home__task-dot" data-status={entry.ticket.status} aria-hidden/>
                  <span className="aw-project-home__task-body"><strong>{entry.ticket.title}</strong><small>{entry.reason}</small></span>
                  <ArrowUpRight size={15}/>
                </button>
              </li>)}
            </ol> : <p className="aw-project-home__empty">No outstanding tickets in the current project.</p>}
            {focus.batch.length > 5 ? <button type="button" className="aw-project-home__show" onClick={() => setShowAllFocus((v) => !v)}>
              {showAllFocus ? "Show fewer" : "Expand focus list"}
            </button> : null}
            {onCreateTicket ? <button type="button" className="aw-project-home__show" onClick={onCreateTicket}>+ Create project ticket</button> : null}
          </section>
          <section className="aw-project-home__tools">
            <header><span className="aw-project-eyebrow">WORKSPACE</span><h3>Work with AgentSam</h3></header>
            <div className="aw-project-home__tool-grid">
              <button type="button" className="aw-project-home__tool" onClick={() => setTab("chats")} disabled={!chatHost?.listProjectChats}>
                <MessageSquarePlus size={20}/><strong>Conversations</strong>
                <small>Open, create and assign chats to this project</small>
              </button>
              <div className="aw-project-home__tool">
                <GitBranch size={20}/><strong>Codebase knowledge</strong>
                <small>{project.githubRepo ? project.githubRepo : "No repository assigned"}</small>
                {knowledgeAction || <span className="aw-project-home__tool-note">Index capability not available from this host</span>}
              </div>
              <button type="button" className="aw-project-home__tool" onClick={() => setTab("timeline")}>
                <CalendarDays size={20}/><strong>Timeline</strong><small>{timeline.undated} tickets without planned dates</small>
              </button>
              {projectApps.map((app) => <button key={app.id} type="button" className="aw-project-home__tool" onClick={() => onNavigate(app.href)}>
                <Box size={20}/><strong>{app.label}</strong><small>{app.description}</small>
              </button>)}
            </div>
          </section>
        </div>
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
          <header className="aw-project-inspector__head"><strong>Quick stats</strong><span>{project.status === "archived" ? "Archived" : "Live workspace"}</span></header>
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
            <div><span>Estimated effort</span><strong>{project.estimatedMinutes ? (Math.round(project.estimatedMinutes / 60 * 10) / 10) + "h" : "—"}</strong></div>
            <div><span>Tracked time</span><strong>{project.trackedMinutes ? (Math.round(project.trackedMinutes / 60 * 10) / 10) + "h" : "Not connected"}</strong></div>
            <div><span>Recorded cost</span><strong>{insights?.costs ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(insights.costs.recordedTotal) : "No measured entries"}</strong></div>
            {project.launchDate ? <div><span>Target launch</span><strong>{formatDate(project.launchDate)}</strong></div> : null}
          </div>
          {insightsError ? <p role="status" className="aw-project-inspector__notice">Stats currently unavailable: {insightsError}</p> : null}
          {insights?.costs ? <p className="aw-project-inspector__notice">{insights.costs.lineItems} recorded cost entries · excludes unallocated provider costs</p> : null}
          <section className="aw-project-inspector__group">
            <h3><Flag size={15}/> Milestones</h3>
            <p>No milestone provider connected. Use the Timeline tab for existing ticket dates.</p>
          </section>
          <section className="aw-project-inspector__group">
            <h3><GitBranch size={15}/> Project knowledge</h3>
            <p>{insights?.rules ? "Active rules: " + insights.rules.title + " · version " + insights.rules.version : "No account-owned active rules found for this project."} Automatic injection into Local Studio chat is not connected yet.</p>
            {knowledgeAction}
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
        <ProjectEditor project={project} coverImages={artifacts} onClose={() => setEditing(false)} onSave={async (input) => { await actions.updateProject?.(project.id, input); }} />
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
