import { useMemo, useState } from "react";
import { ArrowUpRight, FolderKanban } from "lucide-react";
import type { WorkNavigate, WorkProject, WorkTicket } from "../contracts/index";
import { TimelineView } from "./TimelineView";
import { isOpen, recommendOrder, sameProject, timelineItems } from "./ticket-plan";
import { projectStatusLabel } from "./ProjectEditor";

export function ProjectPortfolio({
  projects,
  tickets,
  onNavigate,
  onOpenTicket,
}: {
  projects: WorkProject[];
  tickets: WorkTicket[];
  onNavigate: WorkNavigate;
  onOpenTicket?: (ticket: WorkTicket) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const project = projects.find((item) => item.id === selectedId) || projects[0];
  const linked = useMemo(() => project ? tickets.filter(t => sameProject(t, project)) : [], [project, tickets]);
  const timeline = useMemo(() => timelineItems(linked), [linked]);
  const focus = useMemo(() => recommendOrder(linked), [linked]);
  const ticketLookup = useMemo(() => new Map(linked.map(ticket => [ticket.id, ticket])), [linked]);

  if (!project) return null;
  return (
    <section className="aw-portfolio" aria-label="Projects portfolio">
      <aside className="aw-portfolio__list" aria-label="Projects">
        <div className="aw-portfolio__list-title"><strong>{projects.length} projects</strong><span>Progress estimate</span></div>
        {projects.map(item => (
          <button
            type="button"
            className="aw-portfolio__project"
            data-active={project.id === item.id}
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            style={{ ["--aw-accent" as string]: item.accent, ["--aw-pct" as string]: Math.max(0, Math.min(item.progress, 100)) + "%" }}
          >
            <span className="aw-portfolio__initials">{item.initials}</span>
            <span className="aw-portfolio__project-info">
              <strong title={item.name}>{item.name}</strong>
              <small>{item.openTasks} open · {projectStatusLabel(item.status)}</small>
            </span>
            <span className="aw-portfolio__progress" aria-label={item.progress + "% estimated"}><b>{item.progress}%</b></span>
          </button>
        ))}
      </aside>
      <div className="aw-portfolio__workspace">
        <header className="aw-portfolio__project-head">
          <span className="aw-portfolio__project-icon" style={{ ["--aw-accent" as string]: project.accent }}><FolderKanban size={19}/></span>
          <div><span>PROJECT WORKSPACE</span><h2>{project.name}</h2><p>{project.objective || "Set a current objective from the project inspector."}</p></div>
          <button type="button" className="aw-btn" onClick={() => onNavigate("/projects/" + encodeURIComponent(project.id))}>
            Open project <ArrowUpRight size={15}/>
          </button>
        </header>
        <TimelineView
          key={project.id}
          items={timeline.items}
          activityItems={timeline.activities}
          undatedCount={timeline.undated}
          onSelect={(id) => {
            const ticket = ticketLookup.get(id);
            if (ticket) onOpenTicket?.(ticket);
          }}
        />
      </div>
      <aside className="aw-portfolio__inspector" aria-label="Project overview">
        <h3>Overview</h3>
        <div className="aw-portfolio__metric"><span>Estimated completion</span><strong>{project.progress}%</strong><div className="aw-progress"><span style={{ width: project.progress + "%", background: project.accent }} /></div></div>
        <div className="aw-portfolio__figures">
          <div><strong>{linked.filter(isOpen).length}</strong><small>Open tickets</small></div>
          <div><strong>{linked.filter(t => t.status === "shipped").length}</strong><small>Shipped tickets</small></div>
        </div>
        <h4>Next actions</h4>
        {focus.batch.length ? focus.batch.slice(0, 4).map((item, index) => (
          <button type="button" className="aw-portfolio__next" key={item.ticket.id} onClick={() => onOpenTicket?.(item.ticket)}>
            <span>{index + 1}</span><strong title={item.ticket.title}>{item.ticket.title}</strong>
          </button>
        )) : <p className="aw-portfolio__empty">No ready actions in this project.</p>}
        <button type="button" className="aw-btn aw-portfolio__open" onClick={() => onNavigate("/projects/" + encodeURIComponent(project.id))}>View all project work <ArrowUpRight size={14}/></button>
      </aside>
    </section>
  );
}
