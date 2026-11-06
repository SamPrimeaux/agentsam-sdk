import { useEffect, useMemo, useState } from "react";
import { Box, Cloud, Container, Cpu, Loader2, Monitor, RefreshCw, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTauriInvoke } from "@/lib/desktop/tauri";
import { useTerminalSessionStore, type StudioTerminalSession } from "@/lib/work/terminal-sessions";
import { useWorkStore } from "@/lib/work/store";

type RuntimeState = "online" | "available" | "offline" | "setup_required" | "unknown";
type RuntimeCard = {
  id: string;
  name: string;
  detail: string;
  adapter: string;
  transport: string;
  state: RuntimeState;
  capabilities: string[];
  missing?: string[];
  icon: typeof Monitor;
  activeSession?: StudioTerminalSession;
};

const BASE_RUNTIMES: RuntimeCard[] = [
  { id: "local", name: "My Computer", detail: "Your connected computer", adapter: "agentsamd", transport: "direct_https", state: "unknown", capabilities: ["exec", "pty", "filesystem", "process"], icon: Monitor },
  { id: "docker", name: "Docker", detail: "Project container", adapter: "agentsamd", transport: "direct_https", state: "unknown", capabilities: ["exec", "pty", "filesystem"], icon: Container },
  { id: "gcp", name: "Google Cloud", detail: "Remote machine", adapter: "agentsamd", transport: "cloudflare_tunnel", state: "unknown", capabilities: ["exec", "pty", "filesystem"], icon: Cloud },
  { id: "cf-sandbox", name: "Cloudflare Sandbox", detail: "Isolated temporary workspace", adapter: "cloudflare_sandbox", transport: "service_binding", state: "unknown", capabilities: ["exec"], icon: Box },
  { id: "cf-container", name: "Cloudflare Container", detail: "Hosted container workspace", adapter: "agentsamd", transport: "service_binding", state: "unknown", capabilities: ["exec", "filesystem"], icon: Cpu },
];

function isConnectedRuntimeSession(id: string, session: StudioTerminalSession): boolean {
  if (session.state !== "connected") return false;
  if (id === "local") return session.lane === "local";
  const source = [session.runtimeLabel, session.connectionId, session.instanceId].filter(Boolean).join(" ");
  if (id === "gcp") return session.lane === "remote" && /google|gcp|iam-tunnel/i.test(source);
  if (id === "docker") return /docker/i.test(source);
  if (id === "cf-sandbox") return session.lane === "sandbox" && /sandbox/i.test(source);
  if (id === "cf-container") return session.lane === "sandbox" && /container/i.test(source);
  return false;
}

export function RuntimeManagerPage() {
  const [loading, setLoading] = useState(true);
  const [nativeStatus, setNativeStatus] = useState<{ online: boolean; dockerAvailable: boolean } | null>(null);
  const sessions = useTerminalSessionStore((state) => state.sessions);
  const [message, setMessage] = useState<string | null>(null);
  const activeProject = useWorkStore((state) => state.projects.find((item) => item.id === state.activeProjectId));
  const createSession = useTerminalSessionStore((state) => state.createSession);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        const [daemon, native] = await Promise.all([
          invoke("ensure_agentsamd", {}) as Promise<{ ok?: boolean }>,
          invoke("native_capabilities", {}) as Promise<{ tools?: Record<string, { available?: boolean }> }>,
        ]);
        setNativeStatus({ online: daemon.ok === true, dockerAvailable: native.tools?.docker?.available === true });
      } catch (error) {
        setNativeStatus(null);
        setMessage(error instanceof Error ? error.message : String(error));
      }
    } else {
      // The hosted browser discovers connected PTYs from the live terminal store;
      // Tauri-specific probes are not evidence that a hosted lane is unavailable.
      setNativeStatus(null);
    }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);
  const runtimes = useMemo(() => BASE_RUNTIMES.map((item): RuntimeCard => {
    const activeSession = sessions.find((session) => isConnectedRuntimeSession(item.id, session));
    const state: RuntimeState = activeSession ? "online"
      : item.id === "local" && nativeStatus ? (nativeStatus.online ? "online" : "offline")
      : item.id === "docker" && nativeStatus && !nativeStatus.dockerAvailable ? "setup_required"
      : "unknown";
    return {
      ...item,
      state,
      activeSession,
      detail: activeSession ? [activeSession.runtimeLabel || item.name, activeSession.cwd].filter(Boolean).join(" · ") : item.detail,
      missing: state === "setup_required" && item.id === "docker" ? ["Docker is not installed"] : undefined,
    };
  }), [sessions, nativeStatus]);
  const local = runtimes.find((item) => item.id === "local");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-card"><Cpu className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Machines &amp; Runtimes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your connected machines and execution environments. Only verified sessions show as connected.</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
        </Button>
      </header>
      <div className="grid gap-3">
        {runtimes.map((runtime) => {
          const Icon = runtime.icon;
          const usable = runtime.state === "online" && (Boolean(runtime.activeSession) || runtime.id === "local");
          return (
            <section key={runtime.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{runtime.name}</h2>
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{runtime.state === "online" ? "Connected" : runtime.state === "setup_required" ? "Setup needed" : runtime.state === "offline" ? "Offline" : "Not checked"}</span>
                  </div>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{runtime.detail}</p>
                  {runtime.missing?.length ? <p className="mt-2 text-xs text-muted-foreground">{runtime.missing.join(", ")}</p> : null}
                </div>
                {usable && runtime.capabilities.includes("pty") ? (
                  <Button type="button" size="sm" onClick={() => {
                    createSession({
                      cwd: runtime.activeSession?.cwd || activeProject?.workspaceRoot || undefined,
                      connectionId: runtime.activeSession?.connectionId,
                      instanceId: runtime.activeSession?.instanceId,
                      lane: runtime.activeSession?.lane || "local",
                      runtimeLabel: runtime.activeSession?.runtimeLabel || runtime.name,
                    });
                    useWorkStore.getState().setTerminalOpen(true);
                  }}>
                    <TerminalSquare className="size-4" /> Terminal
                  </Button>
                ) : (
                  <a className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" href="/admin/agentsam">
                    Open Work
                  </a>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {local?.state === "online" ? <p className="text-xs text-muted-foreground">Your computer is available for terminal sessions.</p> : null}
      {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
    </div>
  );
}
