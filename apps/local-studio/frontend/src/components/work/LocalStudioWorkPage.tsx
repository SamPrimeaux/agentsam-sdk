import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createHttpWorkHost } from "@inneranimalmedia/agentsam-work/client";
import { invokeStudioService, isPackagedDesktop, listenDeepLinks, openExternalUrl } from "@/lib/desktop/tauri";
import { WorkProduct } from "@inneranimalmedia/agentsam-work/frontend";
import { AutoRagWorkflowDialog } from "@inneranimalmedia/agentsam-workbench/knowledge";
import "@inneranimalmedia/agentsam-workbench/knowledge/autorag-workflow.css";
import { localStudioAutoRagHost } from "@/lib/knowledge/autorag-host";
import { getDesktopWorkspaceContext } from "@/lib/desktop/tauri";
import type { WorkHost, WorkSurfaceId } from "@inneranimalmedia/agentsam-work/contracts";
import "@inneranimalmedia/agentsam-work/theme.css";

/**
 * Production / hosted default: HTTP WorkHost → GET /api/work/snapshot.
 * Fixture host only when explicitly requested (?fixture=populated|demo) —
 * never the production default, and fixtures are lazy-loaded so they stay
 * out of the cold production authority path when unused.
 */

let sharedHttpWorkHost: WorkHost | null = null;
let sharedDesktopWorkHost: WorkHost | null = null;
let sharedFixtureHostPromise: Promise<WorkHost> | null = null;

const WORK_MAIL_CONNECTION_KEY = "agentsam.work.mail.connection";
const WORK_NAV_COLLAPSED_KEY = "agentsam.work.nav.collapsed";

function readStoredMailConnectionId(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(WORK_MAIL_CONNECTION_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredMailConnectionId(value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(WORK_MAIL_CONNECTION_KEY, value);
    else window.localStorage.removeItem(WORK_MAIL_CONNECTION_KEY);
  } catch {
    // Preference persistence is best-effort; OAuth authority remains server-side.
  }
}

function readStoredNavCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WORK_NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredNavCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORK_NAV_COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Best-effort UI preference.
  }
}

function gmailConnectionReturnUrl(): string {
  return "agentsamstudio://connection/callback?provider=google_gmail";
}

function cloudflareConnectionReturnUrl(): string {
  return "agentsamstudio://connection/callback?provider=cloudflare";
}

function isWorkConnectionDeepLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "agentsamstudio:" &&
      url.hostname === "connection" &&
      url.pathname === "/callback"
    );
  } catch {
    return false;
  }
}

function studioWorkResponse(result: { status: number; content_type?: string; body: string }) {
  return new Response(result.body, {
    status: result.status,
    headers: result.content_type ? { "content-type": result.content_type } : {},
  });
}

function createDesktopWorkHost(): WorkHost {
  const request = async (path: string, method = "GET", body?: unknown) =>
    studioWorkResponse(
      await invokeStudioService({
        operation: "work",
        path,
        method: method as "GET" | "POST" | "PATCH",
        ...(body !== undefined ? { body } : {}),
      }),
    );

  const json = async <T,>(response: Response): Promise<T> => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((payload as { error?: string }).error || "HTTP " + response.status);
    }
    return payload as T;
  };

  const connectionRequest = async (path: string) =>
    studioWorkResponse(
      await invokeStudioService({
        operation: "connections",
        path,
        method: "GET",
      }),
    );

  return {
    async snapshot(snapshotRequest = {}) {
      const params = new URLSearchParams();
      if (snapshotRequest.surface) params.set("surface", snapshotRequest.surface);
      const selected = snapshotRequest.mailConnectionId || readStoredMailConnectionId();
      if (selected) params.set("mail_connection", selected);
      const query = params.size ? "?" + params.toString() : "";
      const payload = await json<{ snapshot: Awaited<ReturnType<WorkHost["snapshot"]>> }>(
        await request("/api/work/snapshot" + query),
      );
      if (payload.snapshot.activeMailConnectionId) {
        writeStoredMailConnectionId(payload.snapshot.activeMailConnectionId);
      }
      return payload.snapshot;
    },
    async createTicket(input) {
      const payload = await json<{ ticket: Awaited<ReturnType<NonNullable<WorkHost["createTicket"]>>> }>(
        await request("/api/tickets", "POST", input),
      );
      return payload.ticket;
    },
    async updateTicket(id, patch) {
      const payload = await json<{ ticket: Awaited<ReturnType<NonNullable<WorkHost["updateTicket"]>>> }>(
        await request("/api/tickets/" + encodeURIComponent(id), "PATCH", patch),
      );
      return payload.ticket;
    },
    async sendMail(input, connectionId) {
      await json(await request("/api/mail/send", "POST", {
        ...input,
        connection_id: connectionId || readStoredMailConnectionId(),
      }));
    },
    async archiveMail(id, connectionId) {
      await json(await request("/api/mail/email/" + encodeURIComponent(id), "PATCH", {
        is_archived: 1,
        connection_id: connectionId || readStoredMailConnectionId(),
      }));
    },
    async starMail(id, starred, connectionId) {
      await json(await request("/api/mail/email/" + encodeURIComponent(id), "PATCH", {
        is_starred: starred ? 1 : 0,
        connection_id: connectionId || readStoredMailConnectionId(),
      }));
    },
    async connectMail(provider = "google_gmail") {
      if (provider === "cloudflare") {
        const returnTo = encodeURIComponent(cloudflareConnectionReturnUrl());
        const path =
          "/api/connections/cloudflare/start" +
          "?capabilities=cloudflare.email.sending,cloudflare.email.routing,cloudflare.email.security" +
          "&return_to=" + returnTo +
          "&format=json";
        const payload = await json<{ authorize_url: string }>(await connectionRequest(path));
        await openExternalUrl(payload.authorize_url);
        return;
      }

      const payload = await json<{ authorize_url: string }>(
        await request("/api/work/gmail/oauth/start", "POST", {
          return_to: gmailConnectionReturnUrl(),
        }),
      );
      await openExternalUrl(payload.authorize_url);
    },
    async disconnectMail(connectionId) {
      await json(await request("/api/work/gmail/disconnect", "POST", {
        connection_id: connectionId || readStoredMailConnectionId(),
      }));
      if (!connectionId || readStoredMailConnectionId() === connectionId) {
        writeStoredMailConnectionId("");
      }
    },
    selectMailConnection(connectionId) {
      writeStoredMailConnectionId(connectionId);
    },
  };
}

function sharedLiveWorkHost(): WorkHost {
  if (isPackagedDesktop()) {
    sharedDesktopWorkHost ||= createDesktopWorkHost();
    return sharedDesktopWorkHost;
  }
  if (!sharedHttpWorkHost) {
    const base = createHttpWorkHost("");
    const host: WorkHost = {
      ...base,
      async snapshot(request = {}) {
        const selected = request.mailConnectionId || readStoredMailConnectionId();
        const snapshot = await base.snapshot({
          ...request,
          ...(selected ? { mailConnectionId: selected } : {}),
        });
        if (snapshot.activeMailConnectionId) {
          writeStoredMailConnectionId(snapshot.activeMailConnectionId);
        }
        return snapshot;
      },
      async connectMail(provider = "google_gmail") {
        if (provider === "cloudflare") {
          const params = new URLSearchParams({
            capabilities: "cloudflare.email.sending,cloudflare.email.routing,cloudflare.email.security",
            return_to: "/mail",
          });
          window.location.assign("/api/connections/cloudflare/start?" + params.toString());
          return;
        }

        const response = await fetch("/api/work/gmail/oauth/start", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ return_to: "/mail" }),
        });
        const payload = await response.json().catch(() => ({})) as { authorize_url?: string; error?: string };
        if (!response.ok || !payload.authorize_url) throw new Error(payload.error || "gmail_oauth_start_failed");
        window.location.assign(payload.authorize_url);
      },
      async disconnectMail(connectionId) {
        const response = await fetch("/api/work/gmail/disconnect", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ connection_id: connectionId || readStoredMailConnectionId() }),
        });
        if (!response.ok) throw new Error("gmail_disconnect_failed");
        if (!connectionId || readStoredMailConnectionId() === connectionId) {
          writeStoredMailConnectionId("");
        }
      },
      selectMailConnection(connectionId) {
        writeStoredMailConnectionId(connectionId);
      },
      async sendMail(input, connectionId) {
        const response = await fetch("/api/mail/send", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...input,
            connection_id: connectionId || readStoredMailConnectionId(),
          }),
        });
        if (!response.ok) throw new Error("mail_send_failed");
      },
      async archiveMail(id, connectionId) {
        const response = await fetch("/api/mail/email/" + encodeURIComponent(id), {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            is_archived: 1,
            connection_id: connectionId || readStoredMailConnectionId(),
          }),
        });
        if (!response.ok) throw new Error("mail_archive_failed");
      },
      async starMail(id, starred, connectionId) {
        const response = await fetch("/api/mail/email/" + encodeURIComponent(id), {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            is_starred: starred ? 1 : 0,
            connection_id: connectionId || readStoredMailConnectionId(),
          }),
        });
        if (!response.ok) throw new Error("mail_star_failed");
      },
    };
    sharedHttpWorkHost = host;
  }
  return sharedHttpWorkHost;
}

function resolveWorkHostMode(): "http" | "fixture" {
  if (typeof window === "undefined") return "http";
  const params = new URLSearchParams(window.location.search);
  const fixture = params.get("fixture");
  if (fixture === "populated" || fixture === "demo") return "fixture";
  if (import.meta.env?.VITE_WORK_FIXTURE === "1") return "fixture";
  return "http";
}

function useLocalStudioWorkHost(): WorkHost | null {
  const mode = useMemo(() => resolveWorkHostMode(), []);
  const [host, setHost] = useState<WorkHost | null>(() =>
    mode === "http" ? sharedLiveWorkHost() : null,
  );

  useEffect(() => {
    if (mode !== "fixture") return;
    let cancelled = false;
    sharedFixtureHostPromise ||= import("@inneranimalmedia/agentsam-work/fixtures").then((mod) =>
      mod.createFixtureWorkHost(mod.populatedWorkFixture),
    );
    void sharedFixtureHostPromise.then((fixtureHost) => {
      if (!cancelled) setHost(fixtureHost);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return host;
}

export function LocalStudioWorkPage({
  surface,
  projectId,
  ticketId,
}: {
  surface: WorkSurfaceId;
  projectId?: string;
  ticketId?: string;
}) {
  const navigate = useNavigate();
  const host = useLocalStudioWorkHost();
  const mode = resolveWorkHostMode();
  const [navCollapsed, setNavCollapsed] = useState(() => readStoredNavCollapsed());

  useEffect(() => {
    if (!host) return;
    host.openMailConnections = () => {
      void navigate({ to: "/settings/integrations" as never });
    };
    return () => {
      if (host.openMailConnections) host.openMailConnections = undefined;
    };
  }, [host, navigate]);

  useEffect(() => {
    if (!isPackagedDesktop()) return;
    let dispose = () => {};
    let cancelled = false;
    void listenDeepLinks((value) => {
      if (!isWorkConnectionDeepLink(value)) return;
      window.dispatchEvent(new Event("agentsam:work-refresh"));
    })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else dispose = unlisten;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  const [ragOpen, setRagOpen] = useState(false);
  const [ragRoot, setRagRoot] = useState('');
  const showAutoRag = surface === 'projects' || surface === 'project-detail';
  const openAutoRag = () => {
    void getDesktopWorkspaceContext().then(context => {
      setRagRoot(context?.default_cwd || '');
      setRagOpen(true);
    });
  };

  if (!host) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
        Loading Work…
      </div>
    );
  }

  return (
    <div className="local-studio-work-surface relative h-full min-h-0" data-work-host={mode}>
      {showAutoRag && (
        <button type="button" onClick={openAutoRag} aria-label="Open AutoRAG setup" className="absolute right-5 top-4 z-20 rounded-full border border-white/15 bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-xl hover:bg-neutral-800">Knowledge / AutoRAG</button>
      )}
      <AutoRagWorkflowDialog open={ragOpen} root={ragRoot} host={localStudioAutoRagHost} onClose={() => setRagOpen(false)} />
      <WorkProduct
        host={host}
        surface={surface}
        projectId={projectId}
        ticketId={ticketId}
        navCollapsed={navCollapsed}
        onNavCollapsedChange={(next) => {
          setNavCollapsed(next);
          writeStoredNavCollapsed(next);
        }}
        onNavigate={(href) => {
          const url = new URL(href, window.location.origin);
          const search = Object.fromEntries(url.searchParams.entries());
          void navigate({
            to: url.pathname as never,
            search: search as never,
          });
        }}
      />
    </div>
  );
}
