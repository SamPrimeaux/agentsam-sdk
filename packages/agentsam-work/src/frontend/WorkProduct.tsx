import { useEffect, useMemo, useState } from "react";
import type {
  WorkHost,
  WorkNavigate,
  WorkSnapshot,
  WorkSurfaceId,
} from "../contracts/index";
import { WorkShell, type WorkShellPresentation } from "./WorkShell";
import { CalendarSurface } from "./surfaces/CalendarSurface";
import { TicketsSurface } from "./surfaces/TicketsSurface";
import { MailSurface } from "./surfaces/MailSurface";
import { ArtifactsSurface } from "./surfaces/ArtifactsSurface";
import { ProjectsSurface } from "./surfaces/ProjectsSurface";
import { ProjectDetailSurface } from "./surfaces/ProjectDetailSurface";
import { TicketDetailSurface } from "./surfaces/TicketDetailSurface";

const EMPTY_LIVE_SNAPSHOT: WorkSnapshot = {
  fixtureName: "live",
  nav: [
    { id: "calendar", label: "Calendar", href: "/collaborate", group: "work" },
    { id: "tickets", label: "Tickets", href: "/collaborate?seg=tickets", group: "work" },
    { id: "mail", label: "Mail", href: "/mail", group: "work" },
    { id: "projects", label: "Projects", href: "/projects", group: "work" },
    { id: "artifacts", label: "My artifacts", href: "/artifacts", group: "files" },
    { id: "r2", label: "R2 Storage", href: "/artifacts?source=r2", group: "files" },
    { id: "google-drive", label: "Google Drive", href: "/artifacts?source=google-drive", group: "files" },
    { id: "shared-drives", label: "Shared drives", href: "/artifacts?source=shared-drives", group: "files" },
    { id: "local-folder", label: "Local folder", href: "/artifacts?source=local", group: "files" },
    { id: "shared-with-me", label: "Shared with me", href: "/artifacts?view=shared", group: "files" },
    { id: "recent", label: "Recent", href: "/artifacts?view=recent", group: "files" },
    { id: "starred", label: "Starred", href: "/artifacts?view=starred", group: "files" },
    { id: "trash", label: "Trash", href: "/artifacts?view=trash", group: "files" },
  ],
  tickets: [],
  artifacts: [],
  projects: [],
  mail: [],
  calendar: [],
  currentProjectId: "",
  ticketAnalytics: {
    completionRate: 0,
    avgCycleDays: 0,
    oldestActiveDays: 0,
  },
};

export function WorkProduct({
  host,
  surface,
  onNavigate,
  projectId,
  ticketId,
  presentation = "standalone",
}: {
  host: WorkHost;
  surface: WorkSurfaceId;
  onNavigate: WorkNavigate;
  projectId?: string;
  ticketId?: string;
  presentation?: WorkShellPresentation;
}) {
  const [snapshot, setSnapshot] = useState<WorkSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    host
      .snapshot()
      .then((next) => {
        if (cancelled) return;
        setSnapshot(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : typeof err === "string" ? err : "unavailable";
        setLoadError(message);
        // Honest empty live shell — never fall back to populatedWorkFixture.
        setSnapshot({ ...EMPTY_LIVE_SNAPSHOT });
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

  const rightRail =
    surface === "calendar" ||
    surface === "tickets" ||
    surface === "mail" ||
    surface === "artifacts" ||
    surface === "artifact-tickets";

  const authHint =
    loadError === "unauthorized"
      ? "The Work host rejected this snapshot request. Check the host access or session configuration."
      : loadError
        ? "Work snapshot unavailable (" + loadError + "). Showing an empty live surface — not sample fixture data."
        : null;

  return (
    <WorkShell
      nav={snapshot.nav}
      surface={surface}
      onNavigate={onNavigate}
      rightRail={rightRail}
      presentation={presentation}
    >
      {authHint ? (
        <div
          className="agentsam-work-empty"
          style={{ margin: "12px 16px 0", padding: "12px 14px", textAlign: "left" }}
          data-work-load-error={loadError || undefined}
        >
          <strong style={{ display: "block", fontSize: 13 }}>{authHint}</strong>
        </div>
      ) : null}
      {surface === "calendar" ? <CalendarSurface events={snapshot.calendar} /> : null}
      {surface === "tickets" ? (
        <TicketsSurface
          tickets={snapshot.tickets}
          analytics={snapshot.ticketAnalytics}
          scope="collaborate"
        />
      ) : null}
      {surface === "artifact-tickets" ? (
        ticketId ? (
          snapshot.tickets.find((ticket) => ticket.id === ticketId) ? (
            <TicketDetailSurface
              ticket={snapshot.tickets.find((ticket) => ticket.id === ticketId)!}
              onNavigate={onNavigate}
            />
          ) : (
            <div className="agentsam-work-empty">Ticket not found.</div>
          )
        ) : (
          <TicketsSurface
            tickets={snapshot.tickets}
            analytics={snapshot.ticketAnalytics}
            scope="platform"
            onOpenTicket={(ticket) =>
              onNavigate("/artifacts/tickets/" + encodeURIComponent(ticket.id))
            }
          />
        )
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
