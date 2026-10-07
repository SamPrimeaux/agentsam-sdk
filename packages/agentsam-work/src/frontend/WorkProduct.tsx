import { Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
}: {
  host: WorkHost;
  surface: WorkSurfaceId;
  onNavigate: WorkNavigate;
  projectId?: string;
  ticketId?: string;
  presentation?: WorkShellPresentation;
  navCollapsed?: boolean;
  onNavCollapsedChange?: (collapsed: boolean) => void;
}) {
  const cacheKey = surface;
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
      request = host.snapshot({ surface });
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
  }, [cacheKey, host, surface]);

  const refreshSnapshot = useCallback(async () => {
    const next = await host.snapshot({ surface });
    snapshotBucket(SNAPSHOT_CACHE, host).set(cacheKey, next);
    setSnapshot(next);
    setLoadError(null);
    return next;
  }, [cacheKey, host, surface]);

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
        <ProjectsSurface projects={snapshot.projects} onNavigate={onNavigate} />
      ) : null}
      {surface === "project-detail" && project ? (
        <ProjectDetailSurface project={project} onNavigate={onNavigate} />
      ) : null}
    </WorkShell>
  );
}
