import { useEffect, useMemo, useState } from "react";
import { Box, Cloud, Container, Cpu, Loader2, Monitor, RefreshCw, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTauriInvoke } from "@/lib/desktop/tauri";
import { isConnectedRuntimeSession } from "./runtime-sessions";
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

export function RuntimeManagerPage() {
  const [loading, setLoading] = useState(true);
  const [nativeStatus, setNativeStatus] = useState<{ online: boolean; dockerAvailable: boolean } | null>(null);
  const sessions = useTerminalSessionStore((state) => state.sessions);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedRuntime, setExpandedRuntime] = useState<string | null>(null);
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
      : item.id === "docker" && nativeStatus ? (nativeStatus.dockerAvailable ? "available" : "setup_required")
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
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Manage execution environments separately from connected provider accounts. A detected CLI or authorized account is not a running container or terminal.</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
        </Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div><h2 className="text-sm font-semibold">Execution environments</h2><p className="mt-1 text-xs text-muted-foreground">Session health is taken from the actual runtime, not from plugin installation status.</p></div>
        <a className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted" href="/settings/customize?view=plugins">Manage connected providers</a>
      </div>
      <div className="grid gap-3">
        {runtimes.map((runtime) => {
          const Icon = runtime.icon;
          const usable = runtime.state === "online" && (Boolean(runtime.activeSession) || runtime.id === "local");
          return (
            <section key={runtime.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-medium">{runtime.name}</h2>
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{runtime.state === "online" ? "Runtime connected" : runtime.state === "available" ? "Tool detected · not attached" : runtime.state === "setup_required" ? "Setup needed" : runtime.state === "offline" ? "Offline" : "Not verified"}</span>
                  </div>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{runtime.detail}</p>
                  {runtime.missing?.length ? <p className="mt-2 text-xs text-muted-foreground">{runtime.missing.join(", ")}</p> : null}
                  {runtime.id === "docker" && runtime.state === "available" ? <p className="mt-2 text-xs text-muted-foreground">Docker is installed. Start or attach a container through the local CLI; no container session has been verified.</p> : null}
                  {runtime.id !== "local" && runtime.state === "unknown" ? <p className="mt-2 text-xs text-muted-foreground">Connect the provider and attach an authorized runtime before a terminal can start.</p> : null}
                </div>
                <button type="button" className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs hover:bg-muted" aria-expanded={expandedRuntime === runtime.id} onClick={() => setExpandedRuntime(value => value === runtime.id ? null : runtime.id)}>
                  {expandedRuntime === runtime.id ? "Hide details" : "Details"}
                </button>
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
                ) : runtime.id === "docker" && runtime.state === "available" && local?.state === "online" ? (
                  <Button type="button" size="sm" onClick={() => {
                    createSession({ lane: "local", cwd: activeProject?.workspaceRoot || undefined, runtimeLabel: "Local CLI" });
                    useWorkStore.getState().setTerminalOpen(true);
                  }}>
                    <TerminalSquare className="size-4" /> Open local CLI
                  </Button>
                ) : runtime.id === "gcp" || runtime.id.startsWith("cf-") ? (
                  <a className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs hover:bg-muted" href="/settings/customize?view=plugins">Provider settings</a>
                ) : null}
              </div>
              {expandedRuntime === runtime.id ? (
                <div className="mt-4 grid gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
                  <div><p className="text-muted-foreground">Adapter</p><p className="mt-1 font-medium">{runtime.adapter}</p></div>
                  <div><p className="text-muted-foreground">Connection transport</p><p className="mt-1 font-medium">{runtime.transport.replaceAll("_", " ")}</p></div>
                  <div><p className="text-muted-foreground">Expected capabilities</p><p className="mt-1 font-medium">{runtime.capabilities.join(", ")}</p></div>
                  {runtime.activeSession ? <div className="sm:col-span-3"><p className="text-muted-foreground">Verified session</p><p className="mt-1 break-all font-medium">{runtime.activeSession.connectionId} · {runtime.activeSession.cwd || "Default directory"}</p></div> : <p className="text-muted-foreground sm:col-span-3">No verified session. Expected capabilities describe the adapter contract, not an active grant.</p>}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      {local?.state === "online" ? <p className="text-xs text-muted-foreground">Your computer is available for terminal sessions.</p> : null}
      {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
    </div>
  );
}
