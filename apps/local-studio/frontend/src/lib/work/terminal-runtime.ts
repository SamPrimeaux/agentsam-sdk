/**
 * Shared AgentSam terminal runtime — one xterm session, multiple placements.
 *
 * Scratch workspaces use the browser virtual shell.
 * Filesystem workspaces attach to the local PTY (agentsam start-local) when available.
 */
import { toast } from "sonner";
import { downloadBytes, zipProject } from "@/lib/work/bundle";
import { languageFromPath, uid } from "@/lib/utils";
import { promptPath, runCommand } from "@/lib/work/shell";
import { readSecrets, writeSecrets } from "@/lib/work/secrets";
import { navigateApp } from "@/lib/work/navigate";
import { slugify } from "@/lib/work/seed";
import { useWorkStore } from "@/lib/work/store";
import { LOCAL_TERMINAL_SESSION_ID } from "@/lib/work/terminal-host";
import type { Project, ShellEffect } from "@inneranimalmedia/agentsam-local-shared";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    sha?: string;
    files?: number;
    line?: string;
    status?: string;
    id?: string;
  };
  if (!res.ok) throw new Error(json.error || `Request failed ${res.status}`);
  return json;
}

type CfFeedEvent =
  | { type: "log"; line: string }
  | { type: "done"; ok: true; url: string; id: string; project: string; files: number }
  | { type: "done"; ok: false; error: string };

async function streamCloudflareDeploy(
  body: unknown,
  onLog: (line: string) => void,
): Promise<Extract<CfFeedEvent, { type: "done" }>> {
  const res = await fetch("/api/cloudflare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...((body as object) ?? {}), stream: true, action: "deploy" }),
  });
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || `Deploy failed ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: Extract<CfFeedEvent, { type: "done" }> | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as CfFeedEvent;
        if (event.type === "log") onLog(event.line);
        else final = event;
      } catch {
        onLog(trimmed);
      }
    }
  }
  if (!final) throw new Error("Deploy stream ended without a result");
  return final;
}

function writeLines(term: { writeln: (s: string) => void }, text: string) {
  if (!text) return;
  for (const line of text.split("\n")) term.writeln(line);
}

type ProjectGetter = () => Project;

type TerminalRuntime = {
  sessionId: string;
  term: Terminal;
  fit: FitAddon;
  run: (line: string) => Promise<void>;
  host: HTMLElement | null;
  park: DocumentFragment;
  observer: ResizeObserver | null;
  refCount: number;
  getProject: ProjectGetter;
};

const runtimes = new Map<string, TerminalRuntime>();
const bootstraps = new Map<string, Promise<TerminalRuntime>>();

async function createRuntime(sessionId: string, getProject: ProjectGetter): Promise<TerminalRuntime> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
  ]);
  await import("@xterm/xterm/css/xterm.css");

  const park = document.createDocumentFragment();
  const term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontSize: 12.5,
    fontFamily: "IBM Plex Mono, ui-monospace, SF Mono, Menlo, monospace",
    lineHeight: 1.35,
    theme: {
      background: "#070708",
      foreground: "#F3F1EC",
      cursor: "#C4B8A8",
      cursorAccent: "#070708",
      selectionBackground: "#C4B8A855",
      black: "#070708",
      red: "#c45c4a",
      green: "#C4B8A8",
      yellow: "#C4B8A8",
      blue: "#8A7F72",
      magenta: "#C4B8A8",
      cyan: "#8A7F72",
      white: "#F3F1EC",
      brightBlack: "#8A7F72",
      brightWhite: "#F3F1EC",
    },
    scrollback: 2000,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const mount = document.createElement("div");
  mount.className = "terminal-runtime-root h-full w-full";
  park.appendChild(mount);
  term.open(mount);

  const history: string[] = [];
  let histIndex = -1;
  let buffer = "";
  let busy = false;
  const queued: string[] = [];

  const prompt = () => {
    const cwd = promptPath(getProject().cwd);
    term.write(`\x1b[38;2;196;184;168msam\x1b[0m \x1b[38;2;138;127;114m${cwd}\x1b[0m $ `);
  };

  const applyEffect = async (proj: Project, effect?: ShellEffect): Promise<Project> => {
    if (!effect) return proj;
    const store = useWorkStore.getState();
    switch (effect.type) {
      case "clear":
        term.reset();
        return proj;
      case "open-file": {
        const file = proj.files.find((f) => f.path === effect.path);
        if (file) store.selectFile(file.id);
        navigateApp("/files");
        return proj;
      }
      case "open-browser":
        store.openSideTab("browser", {
          title: effect.title ?? "Preview",
          srcdoc: effect.srcdoc ?? null,
          url: effect.url ?? "",
          ephemeral: false,
        });
        navigateApp("/browse");
        return proj;
      case "vibe":
        void store.send(store.activeTrailId, "trail", effect.prompt);
        navigateApp({ to: "/trails/$trailId", params: { trailId: store.activeTrailId } });
        return proj;
      case "download-zip": {
        const bytes = zipProject(proj.files, proj.name);
        downloadBytes(bytes, `${slugify(proj.name)}.zip`, "application/zip");
        return proj;
      }
      case "set-secret":
        writeSecrets({ [effect.key]: effect.value });
        return proj;
      case "github-push": {
        const token = readSecrets().githubToken;
        if (!token) {
          term.writeln("No GitHub token. Open Ship or: export GITHUB_TOKEN=…");
          store.setSettingsOpen(true);
          return proj;
        }
        const owner = proj.deploy.githubOwner.trim();
        const repo = proj.deploy.githubRepo.trim() || slugify(proj.name);
        if (!owner) {
          term.writeln("Set GitHub owner in Ship, or: git remote add origin https://github.com/owner/repo.git");
          navigateApp("/ship");
          return proj;
        }
        try {
          const result = await postJson("/api/github", {
            token,
            owner,
            repo,
            branch: proj.deploy.githubBranch || "main",
            message: effect.message,
            files: proj.files.map((f) => ({ path: f.path, content: f.content })),
          });
          const url = result.url ?? `https://github.com/${owner}/${repo}`;
          term.writeln(`remote: ${url}`);
          term.writeln(`${result.files ?? proj.files.length} files  ${result.sha ?? ""}`);
          const next: Project = {
            ...proj,
            deploy: { ...proj.deploy, githubOwner: owner, githubRepo: repo, lastGithubUrl: url, lastGithubAt: Date.now() },
            files: [
              ...proj.files,
              {
                id: uid(),
                path: `.agentsam/deploys/github-${Date.now()}.log`,
                language: languageFromPath("log"),
                content: `Pushed ${result.files ?? proj.files.length} files\n${url}\n${result.sha ?? ""}`,
                updatedAt: Date.now(),
                kind: "deploy",
                origin: "deploy",
                title: "GitHub push",
                url,
              },
            ],
          };
          toast("Pushed to GitHub");
          return next;
        } catch (err) {
          term.writeln(err instanceof Error ? err.message : "push failed");
          return proj;
        }
      }
      case "cloudflare-whoami": {
        const token = readSecrets().cloudflareToken;
        if (!token) {
          term.writeln("No Cloudflare token. Open Ship or: export CLOUDFLARE_API_TOKEN=…");
          store.setSettingsOpen(true);
          return proj;
        }
        try {
          const result = await postJson("/api/cloudflare", { action: "whoami", token });
          term.writeln(result.line ?? `token ${result.status ?? "ok"}`);
        } catch (err) {
          term.writeln(err instanceof Error ? err.message : "whoami failed");
        }
        return proj;
      }
      case "cloudflare-deploy": {
        const token = readSecrets().cloudflareToken;
        if (!token) {
          term.writeln("No Cloudflare token. Open Ship or: export CLOUDFLARE_API_TOKEN=…");
          store.setSettingsOpen(true);
          return proj;
        }
        const accountId = proj.deploy.cloudflareAccountId.trim();
        if (!accountId) {
          term.writeln("Set Cloudflare account id in Ship.");
          navigateApp("/ship");
          return proj;
        }
        const name = proj.deploy.cloudflareProject.trim() || slugify(proj.name);
        try {
          const final = await streamCloudflareDeploy(
            {
              token,
              accountId,
              projectName: name,
              files: proj.files.map((f) => ({ path: f.path, content: f.content })),
            },
            (line) => term.writeln(line),
          );
          if (!final.ok) {
            term.writeln(final.error);
            return proj;
          }
          const url = final.url;
          term.writeln(`live · ${final.files} files → ${url}`);
          toast("Deployed to Cloudflare Pages");
          return {
            ...proj,
            deploy: {
              ...proj.deploy,
              cloudflareProject: name,
              lastCloudflareUrl: url,
              lastCloudflareAt: Date.now(),
            },
            files: [
              ...proj.files,
              {
                id: uid(),
                path: `.agentsam/deploys/cloudflare-${Date.now()}.log`,
                language: "plaintext",
                content: `Deployed ${final.files} files\n${url}\n${final.id}`,
                updatedAt: Date.now(),
                kind: "deploy",
                origin: "deploy",
                title: "Cloudflare Pages",
                url,
              },
            ],
          };
        } catch (err) {
          term.writeln(err instanceof Error ? err.message : "deploy failed");
          return proj;
        }
      }
    }
    return proj;
  };

  const run = async (line: string) => {
    if (busy) {
      queued.push(line);
      return;
    }
    busy = true;
    try {
      const result = runCommand(getProject(), line);
      writeLines(term, result.stdout);
      writeLines(term, result.stderr);
      const next = await applyEffect(result.project, result.effect);
      useWorkStore.getState().patchProject(next.id, next);
    } catch (err) {
      term.writeln(err instanceof Error ? err.message : "command failed");
    } finally {
      busy = false;
      const nextLine = queued.shift();
      if (nextLine != null) {
        await run(nextLine);
        return;
      }
      prompt();
    }
  };

  const project0 = getProject();
  const useRealPty =
    project0.kind === "filesystem" &&
    Boolean(project0.runtimeBaseUrl);

  if (useRealPty) {
    const base = String(project0.runtimeBaseUrl).replace(/\/$/, "");
    const wsUrl = base.replace(/^http/, "ws");
    const cwdParam = encodeURIComponent(project0.workspaceRoot || "");
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`${wsUrl}/?cwd=${cwdParam}&cols=80&rows=24`);
    } catch (err) {
      term.writeln(
        `PTY attach failed: ${err instanceof Error ? err.message : String(err)}. Falling back to virtual shell.`,
      );
      term.writeln("Run `agentsam start-local` in the workspace root.");
    }

    if (socket) {
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        term.writeln(`AgentSam PTY  ·  ${project0.workspaceRoot || cwdParam}`);
        term.writeln("Real shell — Monaco and this terminal share the same host root.");
      };
      socket.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          if (ev.data.startsWith("{")) {
            try {
              const msg = JSON.parse(ev.data) as { type?: string };
              if (msg.type === "session_id") return;
            } catch {
              /* raw */
            }
          }
          term.write(ev.data);
          return;
        }
        term.write(new TextDecoder().decode(ev.data as ArrayBuffer));
      };
      socket.onerror = () => {
        term.writeln("PTY socket error — is `agentsam start-local` running?");
      };
      socket.onclose = () => {
        term.writeln("\r\nPTY disconnected.");
      };

      term.onData((data) => {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(data);
      });

      const runtime: TerminalRuntime = {
        sessionId,
        term,
        fit,
        run: async (line) => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(`${line}\r`);
          }
        },
        host: null,
        park,
        observer: null,
        refCount: 0,
        getProject,
      };
      // Store socket cleanup on park via weak map is overkill; close with detach.
      const prevCleanup = () => {
        try {
          socket?.close();
        } catch {
          /* ignore */
        }
      };
      (runtime as TerminalRuntime & { _ptyCleanup?: () => void })._ptyCleanup = prevCleanup;
      return runtime;
    }
  }

  term.writeln(
    project0.kind === "filesystem"
      ? "AgentSam CLI  ·  filesystem mode (virtual fallback)  ·  type help"
      : "AgentSam CLI  ·  Scratch (virtual)  ·  type help",
  );
  prompt();

  const flushEnter = () => {
    term.write("\r\n");
    const line = buffer;
    buffer = "";
    histIndex = -1;
    if (line.trim()) history.unshift(line);
    void run(line);
  };

  term.onData((data) => {
    let i = 0;
    while (i < data.length) {
      if (data.startsWith("\u001b[A", i)) {
        i += 3;
        if (!history.length) continue;
        histIndex = Math.min(history.length - 1, histIndex + 1);
        const next = history[histIndex] ?? "";
        term.write("\u001b[2K\r");
        prompt();
        buffer = next;
        term.write(buffer);
        continue;
      }
      if (data.startsWith("\u001b[B", i)) {
        i += 3;
        if (histIndex <= 0) {
          histIndex = -1;
          term.write("\u001b[2K\r");
          prompt();
          buffer = "";
          continue;
        }
        histIndex -= 1;
        const next = history[histIndex] ?? "";
        term.write("\u001b[2K\r");
        prompt();
        buffer = next;
        term.write(buffer);
        continue;
      }
      const ch = data[i]!;
      i += 1;
      if (ch === "\r" || ch === "\n") {
        if (ch === "\n" && data[i - 2] === "\r") continue;
        if (!buffer && data.length <= 2) continue;
        flushEnter();
        continue;
      }
      if (ch === "\u0003") {
        term.write("^C\r\n");
        buffer = "";
        busy = false;
        prompt();
        continue;
      }
      if (ch === "\u000c") {
        term.reset();
        prompt();
        term.write(buffer);
        continue;
      }
      if (ch === "\u007f" || ch === "\b") {
        if (!buffer.length) continue;
        buffer = buffer.slice(0, -1);
        term.write("\b \b");
        continue;
      }
      if (ch === "\u001b") {
        while (i < data.length && data[i] !== "[" && data[i]! < "@") i += 1;
        if (i < data.length) i += 1;
        continue;
      }
      if (ch < " ") continue;
      buffer += ch;
      term.write(ch);
    }
  });

  return {
    sessionId,
    term,
    fit,
    run,
    host: null,
    park,
    observer: null,
    refCount: 0,
    getProject,
  };
}

async function ensureRuntime(sessionId: string, getProject: ProjectGetter): Promise<TerminalRuntime> {
  const existing = runtimes.get(sessionId);
  if (existing) {
    existing.getProject = getProject;
    return existing;
  }
  let boot = bootstraps.get(sessionId);
  if (!boot) {
    boot = createRuntime(sessionId, getProject).then((runtime) => {
      runtimes.set(sessionId, runtime);
      bootstraps.delete(sessionId);
      return runtime;
    });
    bootstraps.set(sessionId, boot);
  }
  const runtime = await boot;
  runtime.getProject = getProject;
  return runtime;
}

export async function attachSharedTerminal(
  host: HTMLElement,
  getProject: ProjectGetter,
  sessionId = LOCAL_TERMINAL_SESSION_ID,
): Promise<{ run: (line: string) => Promise<void>; term: Terminal }> {
  const runtime = await ensureRuntime(sessionId, getProject);
  runtime.refCount += 1;
  runtime.getProject = getProject;

  if (runtime.host !== host) {
    runtime.observer?.disconnect();
    runtime.observer = null;
    const root = runtime.term.element;
    if (root) host.appendChild(root);
    runtime.host = host;
    runtime.observer = new ResizeObserver(() => {
      try {
        runtime.fit.fit();
      } catch {
        /* ignore */
      }
    });
    runtime.observer.observe(host);
  }

  try {
    runtime.fit.fit();
  } catch {
    /* ignore */
  }
  runtime.term.focus();
  return { run: runtime.run, term: runtime.term };
}

export function detachSharedTerminal(host: HTMLElement, sessionId = LOCAL_TERMINAL_SESSION_ID) {
  const runtime = runtimes.get(sessionId);
  if (!runtime) return;
  runtime.refCount = Math.max(0, runtime.refCount - 1);
  if (runtime.host !== host) return;
  runtime.observer?.disconnect();
  runtime.observer = null;
  const root = runtime.term.element;
  if (root) runtime.park.appendChild(root);
  runtime.host = null;
}

export function getSharedTerminalRun(sessionId = LOCAL_TERMINAL_SESSION_ID) {
  return runtimes.get(sessionId)?.run ?? null;
}
