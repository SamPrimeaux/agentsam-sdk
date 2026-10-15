import { useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, FolderKanban } from "lucide-react";
import type { WorkNavigate, WorkProject, WorkTicket } from "../contracts/index";
import { isOpen, recommendOrder, sameProject, timelineItems } from "./ticket-plan";
import { projectStatusLabel } from "./ProjectEditor";
import type { TimelineItem } from "./TimelineView";

const DAY = 86_400_000;
const dateFloor = (ms: number) => Math.floor(ms / DAY) * DAY;
const compactDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
type Mode = "activity" | "planned";
type Zoom = "fit" | "month" | "week";
type ProjectRow = {
  project: WorkProject;
  tickets: WorkTicket[];
  planned: TimelineItem[];
  activity: TimelineItem[];
};

export function ProjectPortfolio({
  projects, tickets, onNavigate, onOpenTicket,
}: {
  projects: WorkProject[];
  tickets: WorkTicket[];
  onNavigate: WorkNavigate;
  onOpenTicket?: (ticket: WorkTicket) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("activity");
  const [zoom, setZoom] = useState<Zoom>("month");
  const [offset, setOffset] = useState(0);
  const rows = useMemo<ProjectRow[]>(() => projects.map((project) => {
    const linked = tickets.filter((t) => sameProject(t, project));
    const timeline = timelineItems(linked);
    return { project, tickets: linked, planned: timeline.items, activity: timeline.activities };
  }), [projects, tickets]);
  const selected = rows.find((row) => row.project.id === selectedId) || rows[0];
  const selectedPlan = useMemo(() => recommendOrder(selected?.tickets || []), [selected]);
  const range = useMemo(() => {
    const all = rows.flatMap((row) => mode === "activity" ? row.activity : row.planned);
    const observed = all.flatMap((item) => [Date.parse(item.start), Date.parse(item.end)]).filter(Number.isFinite);
    const now = Date.now();
    const span = zoom === "week" ? 14 : zoom === "month" ? 42 : 84;
    const mostRecent = observed.length ? Math.max(...observed) : now;
    // Fit makes recent activity legible. Very old records remain reachable with Previous.
    const anchor = mode === "activity" && observed.length
      ? dateFloor(mostRecent) - Math.round(span * 0.7) * DAY
      : dateFloor(now) - Math.round(span * 0.25) * DAY;
    const start = anchor + offset * span * DAY;
    return { start, end: start + span * DAY, days: span, now };
  }, [rows, zoom, mode, offset]);
  const marks = useMemo(() => Array.from({ length: 7 }, (_, i) => range.start + Math.floor(i * range.days / 6) * DAY), [range]);
  const position = (date: number) => (date - range.start) / (range.days * DAY) * 100;
  const inWindow = (item: TimelineItem) => Date.parse(item.end) >= range.start && Date.parse(item.start) <= range.end;
  const project = selected?.project;
  if (!project) return null;
  const shipped = selected.tickets.filter((item) => item.status === "shipped").length;
  const ticketPct = selected.tickets.length ? Math.round(shipped / selected.tickets.length * 100) : null;

  return (
    <section className="aw-portfolio aw-portfolio-v3" aria-label="Project portfolio timeline">
      <aside className="aw-portfolio__list" aria-label="Project index">
        <div className="aw-portfolio__list-title"><strong>Projects ({rows.length})</strong><small>Completion</small></div>
        {rows.map(({ project: item }) => (
          <button type="button" key={item.id} className="aw-portfolio__project"
            data-active={project.id === item.id}
            onClick={() => setSelectedId(item.id)}
            style={{ ["--aw-accent" as string]: item.accent, ["--aw-pct" as string]: clamp(item.progress, 0, 100) + "%" }}
            aria-pressed={project.id === item.id}>
            <span className="aw-portfolio__initials">{item.initials}</span>
            <span className="aw-portfolio__project-info"><strong>{item.name}</strong>
              <small>{item.openTasks} open · {projectStatusLabel(item.status)}</small></span>
            <span className="aw-portfolio__progress"><b>{item.progress}%</b></span>
          </button>
        ))}
      </aside>
      <div className="aw-portfolio__workspace">
        <header className="aw-portfolio-v3__top">
          <div className="aw-portfolio-v3__heading">
            <span className="aw-project-eyebrow">PORTFOLIO TIMELINE</span>
            <h2>Across your projects</h2>
            <p>Each row maps to one real project. Select a project for its details.</p>
          </div>
          <div className="aw-portfolio-v3__controls">
            <div className="aw-portfolio-v3__switch" role="group" aria-label="Timeline data">
              <button type="button" data-active={mode === "activity"} onClick={() => { setMode("activity"); setOffset(0); }} aria-pressed={mode === "activity"}>Activity</button>
              <button type="button" data-active={mode === "planned"} onClick={() => { setMode("planned"); setOffset(0); }} aria-pressed={mode === "planned"}>Planned</button>
            </div>
            <select className="aw-select" aria-label="Timeline scale" value={zoom} onChange={(event) => { setZoom(event.target.value as Zoom); setOffset(0); }}>
              <option value="week">2 weeks</option><option value="month">6 weeks</option><option value="fit">12 weeks</option>
            </select>
            <div className="aw-portfolio-v3__paging">
              <button type="button" aria-label="Previous dates" onClick={() => setOffset((n) => n - 1)}><ChevronLeft size={15}/></button>
              <button type="button" onClick={() => setOffset(0)}>Today</button>
              <button type="button" aria-label="Next dates" onClick={() => setOffset((n) => n + 1)}><ChevronRight size={15}/></button>
            </div>
          </div>
        </header>
        <div className="aw-portfolio-v3__legend">
          <span>{mode === "activity" ? "Observed ticket activity — not a deadline or schedule" : "Only user-scheduled work — no invented dates"}</span>
          <span>{compactDate(range.start)} – {compactDate(range.end)}</span>
        </div>
        <div className="aw-portfolio-v3__axis" aria-hidden="true">
          {marks.map((mark, i) => <span key={i} style={{ left: position(mark) + "%" }}>{compactDate(mark)}</span>)}
        </div>
        <div className="aw-portfolio-v3__rows">
          {rows.map(({ project: item, activity, planned }) => {
            const source = mode === "activity" ? activity : planned;
            const onScreen = source.filter(inWindow).slice(0, 3);
            return <div className="aw-portfolio-v3__row" key={item.id}
              data-selected={project.id === item.id}
              style={{ ["--aw-project-color" as string]: item.accent }}>
              <button type="button" className="aw-portfolio-v3__row-label" onClick={() => setSelectedId(item.id)}
                aria-label={"Select " + item.name}><span className="aw-portfolio-v3__dot"/><strong>{item.name}</strong></button>
              <div className="aw-portfolio-v3__lane">
                {marks.slice(1).map((mark, i) => <i key={i} className="aw-portfolio-v3__gridline" style={{ left: position(mark) + "%" }} />)}
                {range.now >= range.start && range.now <= range.end ? <i className="aw-portfolio-v3__today" style={{ left: position(range.now) + "%" }} /> : null}
                {onScreen.length ? onScreen.map((itemBar, i) => {
                  const left = clamp(position(Date.parse(itemBar.start)), 0, 100);
                  const end = clamp(position(Date.parse(itemBar.end)), 0, 100);
                  const actual = selected.tickets.find(t => t.id === itemBar.id) || tickets.find(t => t.id === itemBar.id);
                  return <button type="button" key={itemBar.id} className={"aw-portfolio-v3__bar" + (mode === "activity" ? " aw-portfolio-v3__event" : "")}
                    data-mode={mode} title={itemBar.title + " · " + compactDate(Date.parse(itemBar.start)) + "–" + compactDate(Date.parse(itemBar.end))}
                    style={{ left: left + "%", width: Math.max(1.3, end - left) + "%", top: (9 + i * 20) + "px", ["--aw-bar-fill" as string]: item.accent }}
                    onClick={() => { setSelectedId(item.id); if (actual) onOpenTicket?.(actual); }}>
                    <span>{itemBar.title}</span>
                  </button>;
                }) : <span className="aw-portfolio-v3__empty">No {mode === "activity" ? "recent activity" : "scheduled dates"} in this window</span>}
              </div>
            </div>;
          })}
        </div>
        <footer className="aw-portfolio-v3__footer">
          <span>{mode === "activity" ? "History reflects original ticket timestamps; changes are not deadlines." : "Schedule tickets to populate this plan."}</span>
          <span>View all projects with dates by changing range</span>
        </footer>
      </div>
      <aside className="aw-portfolio__inspector" aria-label="Selected project inspector">
        <header className="aw-portfolio-v3__inspector-title">
          <span className="aw-portfolio__project-icon" style={{ ["--aw-accent" as string]: project.accent }}><FolderKanban size={18}/></span>
          <div><h3>{project.name}</h3><p>{project.description || "Project workspace"}</p></div>
        </header>
        <div className="aw-portfolio-v3__rings">
          <div><span className="aw-project-inspector__ring" style={{ ["--value" as string]: project.progress + "%", ["--ring" as string]: project.accent }}><strong>{project.progress}%</strong></span><small>Perceived</small></div>
          <div><span className="aw-project-inspector__ring" style={{ ["--value" as string]: (ticketPct ?? 0) + "%", ["--ring" as string]: "var(--agentsam-work-success)" }}><strong>{ticketPct == null ? "—" : ticketPct + "%"}</strong></span><small>Shipped</small></div>
        </div>
        <button type="button" className="aw-btn aw-portfolio-v3__open" onClick={() => onNavigate("/projects/" + encodeURIComponent(project.id))}>Open project <ArrowUpRight size={15}/></button>
        {selectedPlan.batch.length ? <button type="button" className="aw-portfolio-v3__next" onClick={() => onOpenTicket?.(selectedPlan.batch[0].ticket)}>
          <CheckCircle2 size={20}/><span><small>Next action</small><strong>{selectedPlan.batch[0].ticket.title}</strong></span><ArrowUpRight size={14}/>
        </button> : null}
        <div className="aw-portfolio-v3__facts">
          <div><span>Status</span><b>{projectStatusLabel(project.status)}</b></div>
          <div><span>Open tickets</span><b>{selected.tickets.filter(isOpen).length}</b></div>
          <div><span>Blocked</span><b>{selectedPlan.blockedCount}</b></div>
          {project.githubRepo ? <div className="aw-portfolio-v3__repo"><span>Repository</span><b>{project.githubRepo}</b></div> : null}
        </div>
        <h4>Focus list</h4>
        {selectedPlan.batch.slice(0, 4).map((entry, i) => <button type="button" className="aw-portfolio__next"
          onClick={() => onOpenTicket?.(entry.ticket)} key={entry.ticket.id}>
          <span>{i + 1}</span><strong>{entry.ticket.title}</strong>
        </button>)}
      </aside>
    </section>
  );
}
