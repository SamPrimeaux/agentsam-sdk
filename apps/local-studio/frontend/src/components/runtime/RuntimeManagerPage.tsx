import { useEffect, useMemo, useState } from "react";
import { Box, Cloud, Container, Cpu, Loader2, Monitor, RefreshCw, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTauriInvoke, isPackagedDesktop } from "@/lib/desktop/tauri";
import { useTerminalSessionStore } from "@/lib/work/terminal-sessions";
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
};

const BASE_RUNTIMES: RuntimeCard[] = [
  { id: "local", name: "My Computer", detail: "local · host · agentsamd", adapter: "agentsamd", transport: "direct_https", state: "unknown", capabilities: ["exec", "pty", "filesystem", "process"], icon: Monitor },
  { id: "docker", name: "Docker", detail: "local · container · project-scoped mount", adapter: "agentsamd", transport: "direct_https", state: "setup_required", capabilities: ["exec", "pty", "filesystem"], missing: ["enrolled container connection"], icon: Container },
  { id: "gcp", name: "Google Cloud", detail: "google_cloud · vm · cloudflare_tunnel", adapter: "agentsamd", transport: "cloudflare_tunnel", state: "setup_required", capabilities: ["exec", "pty", "filesystem"], missing: ["selected or enrolled VM"], icon: Cloud },
  { id: "cf-sandbox", name: "Cloudflare Sandbox", detail: "cloudflare · sandbox · service_binding", adapter: "cloudflare_sandbox", transport: "service_binding", state: "unknown", capabilities: ["exec"], icon: Box },
  { id: "cf-container", name: "Cloudflare Container", detail: "cloudflare · container · scale-to-zero", adapter: "agentsamd", transport: "service_binding", state: "setup_required", capabilities: ["exec", "filesystem"], missing: ["container deployment and enrollment"], icon: Cpu },
];

export function RuntimeManagerPage() {
  const [loading, setLoading] = useState(true);
  const [runtimes, setRuntimes] = useState(BASE_RUNTIMES);
  const [message, setMessage] = useState<string | null>(null);
  const activeProject = useWorkStore((state) => state.projects.find((item) => item.id === state.activeProjectId));
  const createSession = useTerminalSessionStore((state) => state.createSession);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    const invoke = getTauriInvoke();
    let localOnline = false;
    let dockerAvailable = false;
    if (invoke) {
      try {
        const [daemon, native] = await Promise.all([
          invoke("ensure_agentsamd", {}) as Promise<{ ok?: boolean; daemon_version?: string; capabilities?: Record<string, boolean> }>,
          invoke("native_capabilities", {}) as Promise<{ tools?: Record<string, { available?: boolean }> }>,
        ]);
        localOnline = daemon.ok === true;
        dockerAvailable = native.tools?.docker?.available === true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }
    setRuntimes((current) => current.map((item) => {
      if (item.id === "local") return { ...item, state: localOnline ? "online" : isPackagedDesktop() ? "offline" : "unknown" };
      if (item.id === "docker") return { ...item, missing: dockerAvailable ? ["enrolled container connection"] : ["Docker", "enrolled container connection"] };
      return item;
    }));
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);
  const local = useMemo(() => runtimes.find((item) => item.id === "local"), [runtimes]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-card"><Cpu className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Machines &amp; Runtimes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Runtime capability is discovered from agentsam.runtime.v1. Setup-required targets never appear connected.</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
        </Button>
      </header>
      <div className="grid gap-3">
        {runtimes.map((runtime) => {
          const Icon = runtime.icon;
          const usable = runtime.state === "online" || runtime.state === "available";
          return (
            <section key={runtime.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{runtime.name}</h2>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{runtime.state.replace("_", " ")}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{runtime.detail}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{runtime.capabilities.join(" · ")}</p>
                  {runtime.missing?.length ? <p className="mt-2 text-xs text-muted-foreground">Missing: {runtime.missing.join(", ")}</p> : null}
                </div>
                {usable && runtime.capabilities.includes("pty") ? (
                  <Button type="button" size="sm" onClick={() => {
                    createSession({ cwd: activeProject?.workspaceRoot || undefined, runtimeLabel: runtime.name });
                    useWorkStore.getState().setTerminalOpen(true);
                  }}>
                    <TerminalSquare className="size-4" /> Terminal
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" disabled>
                    {runtime.state === "offline" ? "Reconnect required" : "Setup required"}
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {local?.state === "online" ? <p className="text-xs text-muted-foreground">Local runtime is usable now; account synchronization may complete independently.</p> : null}
      {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
    </div>
  );
}
