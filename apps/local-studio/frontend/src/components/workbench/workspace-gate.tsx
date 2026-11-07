import { useState } from "react";
import { FolderGit2, FlaskConical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkStore } from "@/lib/work/store";
import {
  isAuthorizedHostProject,
  isSampleProject,
  projectNeedsConnection,
} from "@/lib/work/workspace-restore";
import type { Project } from "@inneranimalmedia/agentsam-local-shared";

type Props = {
  project: Project | null;
  /** When true, sample opt-in is offered even if a sample is already active. */
  force?: boolean;
  /** Explicit user gesture to open a Chromium web/PWA File System Access folder. */
  onOpenBrowserFolder?: () => Promise<void>;
};

/**
 * Real connect / open / sample gate. Never substitutes in-memory demo files for a host workspace.
 */
export function WorkspaceGate({ project, force = false, onOpenBrowserFolder }: Props) {
  const connectHost = useWorkStore((s) => s.createFilesystemProject);
  const createSample = useWorkStore((s) => s.createSampleProject);
  const projects = useWorkStore((s) => s.projects);
  const setActiveProject = useWorkStore((s) => s.setActiveProject);
  const [runtimeUrl, setRuntimeUrl] = useState("http://127.0.0.1:3099");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsGate = force || projectNeedsConnection(project) || !project;
  const hostNeedsReconnect =
    project?.kind === "filesystem" && !isAuthorizedHostProject(project);
  const showSampleNotice = project && isSampleProject(project) && !force;

  if (!needsGate && !hostNeedsReconnect && !showSampleNotice) return null;

  const hosts = projects.filter((item) => isAuthorizedHostProject(item));

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await connectHost({
        root: "",
        name: name.trim() || undefined,
        runtimeBaseUrl: runtimeUrl.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="work-workspace-gate" role="region" aria-label="Connect a real workspace">
      <div className="work-workspace-gate__card">
        <h2>{hostNeedsReconnect ? "Reconnect authorized host" : "Open a real project"}</h2>
        <p>
          {hostNeedsReconnect
            ? "This lane remembers a host root, but the local runtime capability is missing or stale. Reconnect through agentsam start-local — do not use sample files as a stand-in."
            : "AgentSam Work edits authorized project files and runs a real PTY. There is no default Scratch canvas."}
        </p>

        {hosts.length ? (
          <div className="work-workspace-gate__hosts">
            <p className="work-workspace-gate__label">Restore authorized workspace</p>
            {hosts.map((host) => (
              <Button
                key={host.id}
                type="button"
                variant={host.id === project?.id ? "default" : "outline"}
                size="sm"
                className="w-full justify-start"
                onClick={() => setActiveProject(host.id)}
              >
                <FolderGit2 className="size-3.5" />
                <span className="truncate">{host.name}</span>
                <span className="ml-auto truncate text-[10px] opacity-70">{host.workspaceRoot}</span>
              </Button>
            ))}
          </div>
        ) : null}

        <label className="work-workspace-gate__field">
          Display name
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="agentsam-sdk"
            maxLength={80}
          />
        </label>
        <label className="work-workspace-gate__field">
          Loopback runtime
          <Input
            type="url"
            required
            value={runtimeUrl}
            onChange={(event) => setRuntimeUrl(event.target.value)}
            aria-label="Loopback runtime endpoint"
          />
        </label>
        {error ? <p role="alert" className="work-workspace-gate__error">{error}</p> : null}
        <div className="work-workspace-gate__actions">
          <Button type="button" onClick={() => void connect()} disabled={busy}>
            <RefreshCw className={"size-3.5" + (busy ? " animate-spin" : "")} />
            {busy ? "Checking runtime…" : hostNeedsReconnect ? "Reconnect host" : "Connect authorized root"}
          </Button>
          {onOpenBrowserFolder ? <Button type="button" variant="outline" onClick={()=>void onOpenBrowserFolder()}>
            <FolderGit2 className="size-3.5" /> Open browser folder
          </Button> : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => createSample("Sample tutorial")}
            aria-label="Open opt-in sample tutorial workspace"
          >
            <FlaskConical className="size-3.5" />
            Try sample tutorial
          </Button>
        </div>
        <p className="work-workspace-gate__hint">
          Run <code>agentsam start-local</code> from a Git worktree, then connect for native filesystem, LSP and PTY. Browser folder access uses an explicit picker with manual saves and does not mount a runtime. Samples stay labeled.
        </p>
        {showSampleNotice ? (
          <p className="work-workspace-gate__sample" role="status">
            Active lane is a sample/tutorial workspace — connect a host for real files, LSP, and PTY against your repo.
          </p>
        ) : null}
      </div>
    </div>
  );
}
