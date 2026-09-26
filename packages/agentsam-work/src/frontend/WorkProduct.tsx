import { useEffect, useMemo, useState } from "react";
import type {
  WorkHost,
  WorkNavigate,
  WorkSnapshot,
  WorkSurfaceId,
} from "../contracts/index";
import { WorkShell } from "./WorkShell";
import { CalendarSurface } from "./surfaces/CalendarSurface";
import { TicketsSurface } from "./surfaces/TicketsSurface";
import { MailSurface } from "./surfaces/MailSurface";
import { ArtifactsSurface } from "./surfaces/ArtifactsSurface";
import { ProjectsSurface } from "./surfaces/ProjectsSurface";
import { ProjectDetailSurface } from "./surfaces/ProjectDetailSurface";

export function WorkProduct({
  host,
  surface,
  onNavigate,
  projectId,
}: {
  host: WorkHost;
  surface: WorkSurfaceId;
  onNavigate: WorkNavigate;
  projectId?: string;
}) {
  const [snapshot, setSnapshot] = useState<WorkSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    host.snapshot().then((next) => {
      if (!cancelled) setSnapshot(next);
    });
    return () => {
      cancelled = true;
    };
  }, [host]);

  const project = useMemo(() => {
    if (!snapshot) return null;
    const id = projectId || snapshot.currentProjectId;
    return snapshot.projects.find((candidate) => candidate.id === id) || snapshot.projects[0] || null;
  }, [projectId, snapshot]);

  if (!snapshot) {
    return (
      <div
        className="agentsam-work"
        style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--agentsam-work-muted)" }}
      >
        Loading Work…
      </div>
    );
  }

  const rightRail = surface === "calendar" || surface === "tickets" || surface === "mail";

  return (
    <WorkShell
      nav={snapshot.nav}
      surface={surface}
      onNavigate={onNavigate}
      rightRail={rightRail}
    >
      {surface === "calendar" ? <CalendarSurface events={snapshot.calendar} /> : null}
      {surface === "tickets" ? (
        <TicketsSurface
          tickets={snapshot.tickets}
          analytics={snapshot.ticketAnalytics}
          scope="collaborate"
        />
      ) : null}
      {surface === "artifact-tickets" ? (
        <TicketsSurface
          tickets={snapshot.tickets}
          analytics={snapshot.ticketAnalytics}
          scope="platform"
        />
      ) : null}
      {surface === "mail" ? <MailSurface messages={snapshot.mail} /> : null}
      {surface === "artifacts" ? <ArtifactsSurface artifacts={snapshot.artifacts} /> : null}
      {surface === "projects" ? (
        <ProjectsSurface projects={snapshot.projects} onNavigate={onNavigate} />
      ) : null}
      {surface === "project-detail" && project ? (
        <ProjectDetailSurface project={project} onNavigate={onNavigate} />
      ) : null}
    </WorkShell>
  );
}
