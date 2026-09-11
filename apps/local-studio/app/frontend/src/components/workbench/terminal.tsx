import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadBytes, zipProject } from "@/lib/work/bundle";
import { languageFromPath, uid } from "@/lib/utils";
import { promptPath, runCommand } from "@/lib/work/shell";
import { readSecrets, writeSecrets } from "@/lib/work/secrets";
import { navigateApp } from "@/lib/work/navigate";
import { slugify } from "@/lib/work/seed";
import { useActiveProject, useWorkStore } from "@/lib/work/store";
import type { Project, ShellEffect } from "@/lib/work/types";

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

export function TerminalPane({ variant = "dock" }: { variant?: "dock" | "page" }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const project = useActiveProject();
  const projectRef = useRef(project);
  projectRef.current = project;
  const session = useRef<{
    term: { write: (d: string) => void; writeln: (d: string) => void; reset: () => void; focus: () => void };
    run: (line: string) => Promise<void>;
    dispose: () => void;
  } | null>(null);

  const pending = useWorkStore((s) => s.pendingCommands);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let dispose: () => void = () => {};

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      await import("@xterm/xterm/css/xterm.css");
      if (disposed || !hostRef.current) return;

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
      term.open(host);
      fit.fit();

      const history: string[] = [];
      let histIndex = -1;
      let buffer = "";
      let busy = false;

      const prompt = () => {
        const cwd = promptPath(projectRef.current.cwd);
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
      };

      const queued: string[] = [];
      const run = async (line: string) => {
        if (busy) {
          queued.push(line);
          return;
        }
        busy = true;
        try {
          const result = runCommand(projectRef.current, line);
          writeLines(term, result.stdout);
          writeLines(term, result.stderr);
          const next = await applyEffect(result.project, result.effect);
          useWorkStore.getState().patchProject(next.id, next);
          projectRef.current = useWorkStore.getState().projects.find((p) => p.id === next.id) ?? next;
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

      term.writeln("AgentSam CLI  ·  type help");
      prompt();

      const flushEnter = () => {
        term.write("\r\n");
        const line = buffer;
        buffer = "";
        histIndex = -1;
        if (line.trim()) history.unshift(line);
        void run(line);
      };

      const textarea = host.querySelector("textarea");
      textarea?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          flushEnter();
        }
      });

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

      const observer = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      });
      observer.observe(host);

      session.current = {
        term,
        run,
        dispose: () => {
          observer.disconnect();
          term.dispose();
        },
      };

      dispose = session.current.dispose;
      term.focus();
    })();

    return () => {
      disposed = true;
      dispose();
      session.current = null;
    };
  }, []);

  useEffect(() => {
    if (!pending.length) return;
    const cmds = useWorkStore.getState().consumeCommands();
    const run = session.current?.run;
    if (!run) return;
    void (async () => {
      for (const cmd of cmds) {
        session.current?.term.writeln(cmd);
        await run(cmd);
      }
    })();
  }, [pending]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {variant === "dock" ? (
        <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-2">
          <span className="px-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">CLI</span>
          <span className="truncate font-mono text-[11px] text-clay">{project.name}</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="ml-auto size-7"
            aria-label="Close terminal"
            onClick={() => useWorkStore.getState().setTerminalOpen(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div ref={hostRef} className="terminal-host min-h-0 flex-1 px-1 pb-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
