import { useEffect, useMemo, useState } from "react";
import { Box, Cloud, Container, Cpu, Loader2, Monitor, RefreshCw, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listLocalStudioConnections, type LocalStudioConnectionsResponse } from "@/lib/connections/client";
import { DockerConnectionPanel } from "./DockerConnectionPanel";
import { getTauriInvoke } from "@/lib/desktop/tauri";
import { isConnectedRuntimeSession, type RuntimeKind } from "./runtime-sessions";
import { useTerminalSessionStore, type StudioTerminalSession } from "@/lib/work/terminal-sessions";
import { useWorkStore } from "@/lib/work/store";

type RuntimeState = "online" | "available" | "offline" | "setup_required" | "unknown";
type RuntimeCard = {
  id: RuntimeKind;
  name: string;
  detail: string;
  adapter: string;
  transport: string;
  state: RuntimeState;
  capabilities: string[];
  missing?: string[];
  icon: typeof Monitor;
  activeSession?: StudioTerminalSession;
  machine?: NonNullable<LocalStudioConnectionsResponse["machines"]>["items"][number];
};

const BASE_RUNTIMES: RuntimeCard[] = [
  { id: "local", name: "My Computer", detail: "Your connected computer", adapter: "agentsamd", transport: "direct_https", state: "unknown", capabilities: ["exec", "pty", "filesystem", "process"], icon: Monitor },
  { id: "docker", name: "Docker", detail: "Your local or remote Docker contexts", adapter: "docker_engine", transport: "local_socket", state: "unknown", capabilities: ["exec", "pty", "filesystem"], icon: Container },
  { id: "gcp", name: "Google Cloud", detail: "Remote machine", adapter: "agentsamd", transport: "cloudflare_tunnel", state: "unknown", capabilities: ["exec", "pty", "filesystem"], icon: Cloud },
  { id: "cf-sandbox", name: "Cloudflare Sandbox", detail: "Isolated temporary workspace", adapter: "cloudflare_sandbox", transport: "service_binding", state: "unknown", capabilities: ["exec"], icon: Box },
  { id: "cf-container", name: "Cloudflare Container", detail: "Hosted container workspace", adapter: "agentsamd", transport: "service_binding", state: "unknown", capabilities: ["exec", "filesystem"], icon: Cpu },
];

export function RuntimeManagerPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [loading, setLoading] = useState(true);
  const [nativeStatus, setNativeStatus] = useState<{ online: boolean; dockerAvailable: boolean } | null>(null);
  const sessions = useTerminalSessionStore((state) => state.sessions);
  const [machines, setMachines] = useState<LocalStudioConnectionsResponse["machines"]>();
  const [message, setMessage] = useState<string | null>(null);
  const [expandedRuntime, setExpandedRuntime] = useState<string | null>(null);
  const [terminalTarget, setTerminalTarget] = useState<RuntimeKind | null>(null);
  const [terminalCwd, setTerminalCwd] = useState("");
  const activeProject = useWorkStore((state) => state.projects.find((item) => item.id === state.activeProjectId));
  const createSession = useTerminalSessionStore((state) => state.createSession);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    const registry = listLocalStudioConnections().then(result => result.machines, () => undefined);
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
    setMachines(await registry);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);
  // Machine-registry evidence is distinct from an attached PTY session. A
  // recently healthy, account-scoped machine may be selected for connection;
  // only the actual terminal handshake can mark it connected.
  const registeredMachine = (kind: RuntimeKind) => machines?.items.find((machine) => {
    const provider = machine.provider.toLowerCase();
    return Boolean(machine.connection_id) && (kind === "local" ? provider === "local" : kind === "gcp" ? /google_cloud|gcp/.test(provider) : false);
  });
  const healthyMachine = (machine: ReturnType<typeof registeredMachine>) => {
    const checkedAt = Number(machine?.health_checked_at || machine?.last_seen_at || 0);
    return Boolean(machine?.connection_id) && /healthy|ready|online|ok/i.test(machine?.health_status || "")
      && checkedAt > 0 && Math.abs(Date.now() / 1000 - checkedAt) < 600;
  };
  const runtimes = useMemo(() => BASE_RUNTIMES.map((item): RuntimeCard => {
    const machine = registeredMachine(item.id);
    const activeSession = sessions.find((session) => isConnectedRuntimeSession(item.id, session));
    const state: RuntimeState = activeSession ? "online"
      : item.id === "local" && nativeStatus ? (nativeStatus.online ? "available" : "offline")
      : healthyMachine(machine) ? "available"
      : item.id === "docker" && nativeStatus ? (nativeStatus.dockerAvailable ? "available" : "setup_required")
      : "unknown";
    return {
      ...item,
      state,
      activeSession,
      machine,
      adapter: machine?.runtime_adapter || item.adapter,
      transport: machine?.transport || item.transport,
      detail: activeSession ? [activeSession.runtimeLabel || item.name, activeSession.cwd].filter(Boolean).join(" · ")
        : machine
          ? `${machine.name} · registered machine, PTY not attached`
          : item.detail,
      missing: state === "setup_required" && item.id === "docker" ? ["Docker is not installed"] : undefined,
    };
  }), [sessions, nativeStatus, machines]);
  const local = runtimes.find((item) => item.id === "local");

  return (
    <div className={embedded ? "space-y-6" : "mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8"}>
      {!embedded ? <header className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-card"><Cpu className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Machines &amp; Runtimes</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Manage execution environments separately from connected provider accounts. A detected CLI or authorized account is not a running container or terminal.</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
        </Button>
      </header> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div><h2 className="text-sm font-semibold">Execution environments</h2><p className="mt-1 text-xs text-muted-foreground">Session health is taken from the actual runtime, not from plugin installation status.</p></div>
        <div className="flex items-center gap-2">
          {embedded ? <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
          </Button> : null}
          <a className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted" href="/admin/settings/customize?view=plugins">Manage connected providers</a>
        </div>
      </div>
      <section aria-label="Registered machines" className="grid gap-2">
        <h2 className="text-sm font-semibold">Registered machines</h2>
        {loading ? <p role="status">Checking machines…</p> : !machines?.available ? <p>Machine registry unavailable.</p>
          : machines.items.length === 0 ? <p>No machines registered for this account.</p>
          : machines.items.map(machine => <div className="rounded-lg border border-border p-3 text-sm" key={JSON.stringify([machine.id,machine.connection_id])}>
            <strong>{machine.name}</strong>
            <p>{machine.connection_name || "No active connection"} · {machine.runtime_adapter || machine.provider}</p>
            {machine.connection_id && <p>{machine.transport} · Last recorded health: {machine.health_status || "unknown"}
              {machine.health_checked_at ? " · " + new Date(machine.health_checked_at * 1000).toLocaleString() : ""}</p>}
            <p className="text-xs text-muted-foreground">Last seen {machine.last_seen_at ? new Date(machine.last_seen_at * 1000).toLocaleString() : "unknown"}</p>
          </div>)}
      </section>
      <div className="grid gap-3">
        {runtimes.map((runtime) => {
          const Icon = runtime.icon;
          const usable = runtime.state === "online" || ((runtime.id === "local" || runtime.id === "gcp") && runtime.state === "available");
          return (
            <section key={runtime.id} className="rounded-xl border border-border bg-card p-4">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 sm:flex sm:items-start">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-medium">{runtime.name}</h2>
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{runtime.state === "online" ? "Runtime connected" : runtime.state === "available" ? (runtime.machine || runtime.id === "local" ? "Machine available · PTY not attached" : "Tool detected · not attached") : runtime.state === "setup_required" ? "Setup needed" : runtime.state === "offline" ? "Offline" : "Not verified"}</span>
                  </div>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{runtime.detail}</p>
                  {runtime.missing?.length ? <p className="mt-2 text-xs text-muted-foreground">{runtime.missing.join(", ")}</p> : null}
                  {runtime.id === "docker" && runtime.state === "available" ? <p className="mt-2 text-xs text-muted-foreground">Docker CLI detected. Open Details to authorize a context, inspect containers and manage your workspace.</p> : null}
                  {runtime.id !== "local" && runtime.state === "unknown" ? <p className="mt-2 text-xs text-muted-foreground">Connect the provider and attach an authorized runtime before a terminal can start.</p> : null}
                </div>
                <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
                <button type="button" className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs hover:bg-muted" aria-expanded={expandedRuntime === runtime.id} onClick={() => setExpandedRuntime(value => value === runtime.id ? null : runtime.id)}>
                  {expandedRuntime === runtime.id ? "Hide details" : "Details"}
                </button>
                {usable && runtime.capabilities.includes("pty") ? (
                  <Button type="button" size="sm" onClick={() => { setTerminalCwd(""); setTerminalTarget(runtime.id); }}>
                    <TerminalSquare className="size-4" /> {runtime.activeSession ? "New terminal" : "Connect terminal"}
                  </Button>
                ) : runtime.id === "docker" && runtime.state === "available" && local?.state === "online" ? (
                  <Button type="button" size="sm" onClick={() => {
                    createSession({ lane: "local", cwd: activeProject?.workspaceRoot || undefined, runtimeLabel: "Local CLI" });
                    useWorkStore.getState().setTerminalOpen(true);
                  }}>
                    <TerminalSquare className="size-4" /> Open local CLI
                  </Button>
                ) : runtime.id === "gcp" || runtime.id.startsWith("cf-") ? (
                  <a className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs hover:bg-muted" href="/admin/settings/customize?view=plugins">Provider settings</a>
                ) : null}
                </div>
              </div>
              {terminalTarget === runtime.id ? (
                <form className="mt-4 grid gap-3 border-t border-border pt-4" onSubmit={event => {
                  event.preventDefault();
                  const cwd = terminalCwd.trim();
                  createSession({
                    cwd: cwd || undefined, cwdMode: "machine",
                    connectionId: runtime.activeSession?.connectionId || runtime.machine?.connection_id || undefined,
                    instanceId: runtime.activeSession?.instanceId || runtime.machine?.id,
                    lane: runtime.activeSession?.lane || (runtime.id === "gcp" ? "remote" : "local"),
                    runtimeLabel: runtime.activeSession?.runtimeLabel || runtime.name,
                  });
                  setTerminalTarget(null);
                  useWorkStore.getState().setTerminalOpen(true);
                }}>
                  <label className="grid gap-1 text-sm font-medium">
                    Starting directory
                    <input className="min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm font-normal" value={terminalCwd} onChange={event=>setTerminalCwd(event.target.value)} placeholder="Machine default directory" autoComplete="off" spellCheck={false}/>
                  </label>
                  <p className="text-xs text-muted-foreground">Enter a path on this machine, or leave blank for its default. Existing device and account restrictions still apply.</p>
                  <div className="flex flex-wrap gap-2">
                    {runtime.id === "local" && activeProject?.workspaceRoot ? <Button type="button" size="sm" variant="outline" onClick={()=>setTerminalCwd(activeProject.workspaceRoot || "")}>Use project folder</Button> : null}
                    {runtime.activeSession?.cwd ? <Button type="button" size="sm" variant="outline" onClick={()=>setTerminalCwd(runtime.activeSession?.cwd || "")}>Use current terminal folder</Button> : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={()=>setTerminalTarget(null)}>Cancel</Button>
                    <Button type="submit" size="sm">Open terminal</Button>
                  </div>
                </form>
              ) : null}
              {expandedRuntime === runtime.id ? (
                <div className="mt-4 grid gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
                  <div><p className="text-muted-foreground">Adapter</p><p className="mt-1 font-medium">{runtime.adapter}</p></div>
                  <div><p className="text-muted-foreground">Connection transport</p><p className="mt-1 font-medium">{runtime.transport.replaceAll("_", " ")}</p></div>
                  <div><p className="text-muted-foreground">Expected capabilities</p><p className="mt-1 font-medium">{runtime.capabilities.join(", ")} (adapter contract)</p></div>
                  {runtime.activeSession ? <div className="sm:col-span-3"><p className="text-muted-foreground">Verified session</p><p className="mt-1 break-all font-medium">{runtime.activeSession.connectionId} · {runtime.activeSession.cwd || "Default directory"}</p></div> : <p className="text-muted-foreground sm:col-span-3">No active PTY session in this Work view. Use Connect terminal to request a live session; registered-machine health alone is not a terminal grant.</p>}
                </div>
              ) : null}
              {runtime.id === "docker" && expandedRuntime === "docker" ?
                <div className="mt-4 border-t border-border pt-4"><DockerConnectionPanel /></div> : null}
            </section>
          );
        })}
      </div>
      {local?.state === "online" ? <p className="text-xs text-muted-foreground">Your computer is available for terminal sessions.</p> : null}
      {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
    </div>
  );
}
