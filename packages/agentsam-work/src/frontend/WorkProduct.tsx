import { Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { WorkActions } from "./actions";
import { TicketEditor } from "./TicketEditor";
import type { WorkTicket } from "../contracts/index";

const SNAPSHOT_CACHE = new WeakMap<WorkHost, Map<string, WorkSnapshot>>();
const SNAPSHOT_REQUESTS = new WeakMap<WorkHost, Map<string, Promise<WorkSnapshot>>>();

function snapshotBucket<T>(cache: WeakMap<WorkHost, Map<string, T>>, host: WorkHost) {
  let bucket = cache.get(host);
  if (!bucket) {
    bucket = new Map<string, T>();
    cache.set(host, bucket);
  }
  return bucket;
}

const EMPTY_LIVE_SNAPSHOT: WorkSnapshot = {
  fixtureName: "live",
  nav: [
    { id: "calendar", label: "Calendar", href: "/collaborate", group: "work" },
    { id: "tickets", label: "Tickets", href: "/tickets", group: "work" },
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
  navCollapsed = false,
  onNavCollapsedChange,
  headerActions,
  knowledgeAction,
}: {
  host: WorkHost;
  surface: WorkSurfaceId;
  onNavigate: WorkNavigate;
  projectId?: string;
  ticketId?: string;
  presentation?: WorkShellPresentation;
  navCollapsed?: boolean;
  onNavCollapsedChange?: (collapsed: boolean) => void;
  /** Host extras shown beside the Projects header actions. */
  headerActions?: ReactNode;
  /** Host control for knowledge / codebase indexing on the project page. */
  knowledgeAction?: ReactNode;
}) {
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const calendarRange = surface === "calendar" && range.from ? range : {};
  const cacheKey = surface === "calendar" && range.from ? `calendar:${range.from}:${range.to}` : surface;
  const [openTicket, setOpenTicket] = useState<WorkTicket | null>(null);
  const [snapshot, setSnapshot] = useState<WorkSnapshot>(() =>
    snapshotBucket(SNAPSHOT_CACHE, host).get(cacheKey) || { ...EMPTY_LIVE_SNAPSHOT },
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const cache = snapshotBucket(SNAPSHOT_CACHE, host);
    const requests = snapshotBucket(SNAPSHOT_REQUESTS, host);
    const cached = cache.get(cacheKey);
    if (cached) setSnapshot(cached);

    let request = requests.get(cacheKey);
    if (!request) {
      request = host.snapshot({ surface, ...calendarRange });
      requests.set(cacheKey, request);
    }

    request
      .then((next) => {
        cache.set(cacheKey, next);
        requests.delete(cacheKey);
        if (!cancelled) setSnapshot(next);
      })
      .catch((err: unknown) => {
        requests.delete(cacheKey);
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : typeof err === "string" ? err : "unavailable";
        setLoadError(message);
        if (!cache.has(cacheKey)) setSnapshot({ ...EMPTY_LIVE_SNAPSHOT });
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, host, surface]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSnapshot = useCallback(async () => {
    const next = await host.snapshot({ surface, ...calendarRange });
    snapshotBucket(SNAPSHOT_CACHE, host).set(cacheKey, next);
    setSnapshot(next);
    setLoadError(null);
    return next;
  }, [cacheKey, host, surface]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      void refreshSnapshot().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("agentsam:work-refresh", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("agentsam:work-refresh", onFocus);
    };
  }, [refreshSnapshot]);

  const actions: WorkActions = useMemo(() => {
    const after = async <T,>(work: Promise<T>): Promise<T> => {
      const result = await work;
      await refreshSnapshot().catch(() => undefined);
      return result;
    };
    return {
      createTicket: host.createTicket ? (input) => after(host.createTicket!(input)) : undefined,
      updateTicket: host.updateTicket ? (id, patch) => after(host.updateTicket!(id, patch)) : undefined,
      deleteTicket: host.deleteTicket ? (id) => after(host.deleteTicket!(id)) : undefined,
      createProject: host.createProject ? (input) => after(host.createProject!(input)) : undefined,
      updateProject: host.updateProject ? (id, patch) => after(host.updateProject!(id, patch)) : undefined,
      deleteProject: host.deleteProject ? (id, options) => after(host.deleteProject!(id, options)) : undefined,
      createEvent: host.createEvent ? (input) => after(host.createEvent!(input)) : undefined,
      updateEvent: host.updateEvent ? (id, patch) => after(host.updateEvent!(id, patch)) : undefined,
      deleteEvent: host.deleteEvent ? (id) => after(host.deleteEvent!(id)) : undefined,
      scheduleTicket: host.createEvent
        ? (ticket) => {
            const hasDue = Boolean(ticket.dueAt);
            const start = hasDue
              ? new Date(Date.parse(ticket.dueAt as string) - 30 * 60_000)
              : new Date(Math.ceil((Date.now() + 3_600_000) / 3_600_000) * 3_600_000);
            const minutes = hasDue ? 30 : ticket.estimatedMinutes || 60;
            return after(
              host.createEvent!({
                title: ticket.title,
                type: "task",
                start: start.toISOString(),
                end: new Date(start.getTime() + minutes * 60_000).toISOString(),
              }),
            );
          }
        : undefined,
      refresh: async () => {
        await refreshSnapshot();
      },
    };
  }, [host, refreshSnapshot]);

  const lanes = useMemo(() => [...new Set(snapshot.tickets.map((t) => t.surface).filter(Boolean))].sort(), [snapshot.tickets]);

  const project = useMemo(() => {
    if (!snapshot) return null;
    const id = projectId || snapshot.currentProjectId;
    return snapshot.projects.find((candidate) => candidate.id === id) || snapshot.projects[0] || null;
  }, [projectId, snapshot]);

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
      navCollapsed={navCollapsed}
      onNavCollapsedChange={onNavCollapsedChange}
      trailing={
        host.openMailConnections ? (
          <button
            type="button"
            className="agentsam-work-toolbar-button"
            aria-label="Connections"
            title="Connections"
            onClick={() => void host.openMailConnections?.()}
          >
            <Settings size={15} />
          </button>
        ) : undefined
      }
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
      {snapshot.source === "local" ? (
        <div className="aw-pill" style={{ margin: "10px 16px 0" }} data-tone="accent">Local workspace on this device</div>
      ) : null}
      {surface === "calendar" ? (
        <CalendarSurface
          events={snapshot.calendar}
          tickets={snapshot.tickets}
          projects={snapshot.projects}
          capabilities={snapshot.capabilities?.calendar}
          actions={actions}
          onRangeChange={(from, to) => setRange((prev) => (prev.from === from && prev.to === to ? prev : { from, to }))}
          onOpenTicket={setOpenTicket}
          onNavigate={onNavigate}
        />
      ) : null}
      {surface === "tickets" ? (
        <TicketsSurface
          tickets={snapshot.tickets}
          analytics={snapshot.ticketAnalytics}
          projects={snapshot.projects}
          capabilities={snapshot.capabilities?.tickets}
          onCreate={actions.createTicket}
          onUpdate={actions.updateTicket}
          onDelete={actions.deleteTicket}
          onSchedule={actions.scheduleTicket}
          onRefresh={actions.refresh}
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
            projects={snapshot.projects}
            onOpenTicket={(ticket) =>
              onNavigate("/artifacts/tickets/" + encodeURIComponent(ticket.id))
            }
          />
        )
      ) : null}
      {surface === "mail" ? (
        <MailSurface
          messages={snapshot.mail}
          connections={snapshot.mailConnections || []}
          activeConnectionId={snapshot.activeMailConnectionId}
          onSelectConnection={
            host.selectMailConnection
              ? async (connectionId) => {
                  await host.selectMailConnection?.(connectionId);
                  await refreshSnapshot();
                }
              : undefined
          }
          onConnectProvider={host.connectMail}
          onDisconnectConnection={
            host.disconnectMail
              ? async (connectionId) => {
                  await host.disconnectMail?.(connectionId);
                  await refreshSnapshot();
                }
              : undefined
          }
          onOpenConnections={host.openMailConnections}
          onArchive={
            host.archiveMail
              ? async (id) => {
                  await host.archiveMail?.(id, snapshot.activeMailConnectionId || undefined);
                  await refreshSnapshot();
                }
              : undefined
          }
          onStar={
            host.starMail
              ? async (id, starred) => {
                  await host.starMail?.(id, starred, snapshot.activeMailConnectionId || undefined);
                  await refreshSnapshot();
                }
              : undefined
          }
          onSend={
            host.sendMail
              ? async (input) => {
                  await host.sendMail?.(input, snapshot.activeMailConnectionId || undefined);
                  await refreshSnapshot();
                }
              : undefined
          }
        />
      ) : null}
      {surface === "artifacts" ? <ArtifactsSurface artifacts={snapshot.artifacts} /> : null}
      {surface === "projects" ? (
        <ProjectsSurface
          projects={snapshot.projects}
          capabilities={snapshot.capabilities?.projects}
          actions={actions}
          onNavigate={onNavigate}
          headerActions={headerActions}
        />
      ) : null}
      {surface === "project-detail" && project ? (
        <ProjectDetailSurface
          project={project}
          projects={snapshot.projects}
          tickets={snapshot.tickets}
          events={snapshot.calendar}
          capabilities={snapshot.capabilities}
          actions={actions}
          onNavigate={onNavigate}
          knowledgeAction={knowledgeAction}
        />
      ) : null}
      {openTicket ? (
        <TicketEditor
          ticket={openTicket}
          projects={snapshot.projects}
          lanes={lanes}
          canSave={snapshot.capabilities?.tickets.update ?? Boolean(actions.updateTicket)}
          canDelete={snapshot.capabilities?.tickets.delete ?? Boolean(actions.deleteTicket)}
          onClose={() => setOpenTicket(null)}
          onSave={async (input) => {
            await actions.updateTicket?.(openTicket.id, input);
          }}
          onDelete={actions.deleteTicket ? async () => { await actions.deleteTicket?.(openTicket.id); } : undefined}
        />
      ) : null}
    </WorkShell>
  );
}
