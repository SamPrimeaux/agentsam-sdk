import { languageFromPath, uid } from "@/lib/utils";
import { mergeArtifacts, printTree, renderAsciiTree } from "@/lib/work/files";
import { commitStaged, dirtyPaths, emptyGit, headSnapshot, parseGithubRemote, statusLines, workingTree } from "@/lib/work/git";
import { baseName, joinPath, parentDir, toStoragePath } from "@/lib/work/paths";
import { slugify } from "@/lib/work/seed";
import type { Artifact, Project, ShellEffect } from "@/lib/work/types";

export type ShellResult = {
  stdout: string;
  stderr: string;
  project: Project;
  effect?: ShellEffect;
};

function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "\\" && i + 1 < input.length) {
      cur += input[++i];
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function ok(project: Project, stdout: string, effect?: ShellEffect): ShellResult {
  return { stdout, stderr: "", project, effect };
}

function fail(project: Project, stderr: string): ShellResult {
  return { stdout: "", stderr, project };
}

function touchFile(project: Project, path: string, content = "", origin: Artifact["origin"] = "terminal"): Project {
  const storage = toStoragePath(path);
  const file: Artifact = {
    id: uid(),
    path: storage,
    language: languageFromPath(storage),
    content,
    updatedAt: Date.now(),
    kind: storage.endsWith(".html") ? "preview" : "code",
    origin,
  };
  return {
    ...project,
    updatedAt: Date.now(),
    files: mergeArtifacts(project.files, [file]),
  };
}

function ensureDir(project: Project, abs: string): Project {
  const storage = toStoragePath(abs);
  if (!storage) return project;
  if (project.dirs.includes(storage)) return project;
  return { ...project, dirs: [...project.dirs, storage] };
}

function findFile(project: Project, abs: string) {
  const storage = toStoragePath(abs);
  return project.files.find((f) => f.path === storage);
}

function globStage(project: Project, args: string[]) {
  const cwd = project.cwd || "/";
  if (args.length === 0 || args.includes(".") || args.includes("-A") || args.includes("--all")) {
    return project.files.map((f) => f.path);
  }
  const out: string[] = [];
  for (const arg of args) {
    const abs = joinPath(cwd, arg);
    const storage = toStoragePath(abs);
    if (arg.endsWith("/") || project.dirs.includes(storage)) {
      const prefix = storage ? `${storage}/` : "";
      out.push(...project.files.filter((f) => f.path.startsWith(prefix)).map((f) => f.path));
    } else {
      out.push(storage);
    }
  }
  return [...new Set(out)];
}

const HELP = `AgentSam CLI — virtual workspace over this project

files     ls  cd  pwd  cat  tree  mkdir  touch  rm  mv  cp  open
git       git init | status | add | commit | log | diff | remote | push
github    gh repo create  ·  git push
cloud     wrangler pages deploy  ·  wrangler whoami
ship      zip  ·  vibe <prompt>
tokens    export GITHUB_TOKEN=…  ·  export CLOUDFLARE_API_TOKEN=…

Git and wrangler here operate on the in-browser workspace.
Push/deploy use tokens from Ship, never stored on the server.`;

export function runCommand(project: Project, raw: string): ShellResult {
  const line = raw.trim();
  if (!line) return ok(project, "");
  if (line.startsWith("#")) return ok(project, "");

  const tokens = tokenize(line);
  const cmd = tokens[0] ?? "";
  const args = tokens.slice(1);
  const cwd = project.cwd || "/";

  switch (cmd) {
    case "help":
    case "?":
      return ok(project, HELP);
    case "clear":
    case "cls":
      return ok(project, "", { type: "clear" });
    case "pwd":
      return ok(project, cwd === "/" ? "/workspace" : `/workspace${cwd}`);
    case "whoami":
      return ok(project, "sam");
    case "date":
      return ok(project, new Date().toISOString());
    case "cd": {
      const dest = joinPath(cwd, args[0] ?? "/");
      if (dest === "/") return ok({ ...project, cwd: "/" }, "");
      const storage = toStoragePath(dest);
      const exists =
        project.dirs.includes(storage) ||
        project.files.some((f) => f.path === storage || f.path.startsWith(`${storage}/`));
      if (!exists) return fail(project, `cd: no such directory: ${args[0] ?? dest}`);
      if (project.files.some((f) => f.path === storage)) return fail(project, `cd: not a directory: ${args[0]}`);
      return ok({ ...project, cwd: dest }, "");
    }
    case "ls": {
      const target = joinPath(cwd, args.find((a) => !a.startsWith("-")) ?? ".");
      const names = printTree(project.files, project.dirs, target);
      return ok(project, names.join("  ") || "");
    }
    case "tree":
      return ok(project, renderAsciiTree(project.files));
    case "cat":
    case "head":
    case "tail": {
      if (!args[0]) return fail(project, `${cmd}: missing file`);
      const file = findFile(project, joinPath(cwd, args[0]));
      if (!file) return fail(project, `${cmd}: ${args[0]}: no such file`);
      const lines = file.content.split("\n");
      if (cmd === "head") return ok(project, lines.slice(0, 20).join("\n"));
      if (cmd === "tail") return ok(project, lines.slice(-20).join("\n"));
      return ok(project, file.content);
    }
    case "wc": {
      const file = findFile(project, joinPath(cwd, args[0] ?? ""));
      if (!file) return fail(project, `wc: ${args[0] ?? ""}: no such file`);
      const lines = file.content.split("\n").length;
      const words = file.content.trim() ? file.content.trim().split(/\s+/).length : 0;
      return ok(project, `${lines} ${words} ${file.content.length} ${file.path}`);
    }
    case "echo":
      return ok(project, args.join(" "));
    case "mkdir": {
      if (!args.length) return fail(project, "mkdir: missing operand");
      let next = project;
      for (const arg of args.filter((a) => a !== "-p")) {
        const abs = joinPath(cwd, arg);
        next = ensureDir(next, abs);
        let cursor = parentDir(abs);
        while (cursor !== "/") {
          next = ensureDir(next, cursor);
          cursor = parentDir(cursor);
        }
      }
      return ok(next, "");
    }
    case "touch": {
      if (!args[0]) return fail(project, "touch: missing file");
      const abs = joinPath(cwd, args[0]);
      const existing = findFile(project, abs);
      if (existing) {
        return ok(
          {
            ...project,
            files: project.files.map((f) => (f.id === existing.id ? { ...f, updatedAt: Date.now() } : f)),
          },
          "",
        );
      }
      return ok(ensureDir(touchFile(project, abs), parentDir(abs)), "");
    }
    case "rm": {
      const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
      const targets = args.filter((a) => !a.startsWith("-"));
      if (!targets.length) return fail(project, "rm: missing operand");
      let files = [...project.files];
      let dirs = [...project.dirs];
      for (const t of targets) {
        const storage = toStoragePath(joinPath(cwd, t));
        const isDir = dirs.includes(storage) || files.some((f) => f.path.startsWith(`${storage}/`));
        if (isDir && !recursive) return fail(project, `rm: ${t}: is a directory`);
        files = files.filter((f) => f.path !== storage && !f.path.startsWith(`${storage}/`));
        dirs = dirs.filter((d) => d !== storage && !d.startsWith(`${storage}/`));
      }
      return ok({ ...project, files, dirs, updatedAt: Date.now() }, "");
    }
    case "mv":
    case "cp": {
      if (args.length < 2) return fail(project, `${cmd}: missing operand`);
      const src = findFile(project, joinPath(cwd, args[0]!));
      if (!src) return fail(project, `${cmd}: ${args[0]}: no such file`);
      const destAbs = joinPath(cwd, args[1]!);
      const destStorage = toStoragePath(destAbs);
      const copy: Artifact = {
        ...src,
        id: cmd === "cp" ? uid() : src.id,
        path: destStorage,
        language: languageFromPath(destStorage),
        updatedAt: Date.now(),
        origin: "terminal",
      };
      let files = mergeArtifacts(project.files, [copy]);
      if (cmd === "mv") files = files.filter((f) => !(f.path === src.path && f.id === src.id));
      return ok({ ...project, files, updatedAt: Date.now() }, "");
    }
    case "open": {
      if (!args[0]) return fail(project, "open: missing file");
      const file = findFile(project, joinPath(cwd, args[0]));
      if (!file) return fail(project, `open: ${args[0]}: no such file`);
      if (file.path.endsWith(".html")) {
        return ok(project, `preview ${file.path}`, {
          type: "open-browser",
          srcdoc: file.content,
          title: file.path,
        });
      }
      return ok(project, `opening ${file.path}`, { type: "open-file", path: file.path });
    }
    case "zip":
      return ok(project, `packing ${project.files.length} files`, { type: "download-zip" });
    case "export": {
      const joined = args.join(" ");
      const eq = joined.indexOf("=");
      if (eq < 0) return fail(project, "export: use export NAME=value");
      const key = joined.slice(0, eq).trim();
      const value = joined.slice(eq + 1).trim();
      if (key === "GITHUB_TOKEN") {
        return ok(project, "GITHUB_TOKEN set (saved locally)", { type: "set-secret", key: "githubToken", value });
      }
      if (key === "CLOUDFLARE_API_TOKEN" || key === "CF_API_TOKEN") {
        return ok(project, "CLOUDFLARE_API_TOKEN set (saved locally)", {
          type: "set-secret",
          key: "cloudflareToken",
          value,
        });
      }
      return fail(project, `export: unknown token ${key}`);
    }
    case "vibe":
    case "agentsam": {
      const prompt = (cmd === "agentsam" ? args.slice(args[0] === "vibe" ? 1 : 0).join(" ") : args.join(" ")).trim();
      if (!prompt) return fail(project, "vibe: describe what to build");
      return ok(project, "sending to AgentSam…", { type: "vibe", prompt });
    }
    case "git":
      return gitCommand(project, args);
    case "gh":
      return ghCommand(project, args);
    case "wrangler":
    case "npx":
      return wranglerCommand(project, cmd === "npx" ? args.slice(args[0] === "wrangler" ? 1 : 0) : args);
    case "npm":
      return npmCommand(project, args);
    default:
      return fail(project, `command not found: ${cmd}\ntry help`);
  }
}

function gitCommand(project: Project, args: string[]): ShellResult {
  const sub = args[0] ?? "status";
  switch (sub) {
    case "init": {
      if (project.git.initialized) return ok(project, `Reinitialized git in /workspace`);
      return ok(
        { ...project, git: { ...emptyGit(), initialized: true }, updatedAt: Date.now() },
        "Initialized empty Git repository in /workspace/.git/",
      );
    }
    case "status":
      return ok(project, statusLines(project).join("\n"));
    case "add": {
      if (!project.git.initialized) return fail(project, "fatal: not a git repository");
      const paths = globStage(project, args.slice(1));
      const staged = [...new Set([...project.git.staged, ...paths])];
      return ok({ ...project, git: { ...project.git, staged } }, "");
    }
    case "commit": {
      if (!project.git.initialized) return fail(project, "fatal: not a git repository");
      const dashM = args.findIndex((a) => a === "-m");
      const message = dashM >= 0 ? args.slice(dashM + 1).join(" ").replace(/^["']|["']$/g, "") : "";
      if (!message) return fail(project, "git commit: need -m \"message\"");
      const result = commitStaged(project, message);
      return ok({ ...project, git: result.git, updatedAt: Date.now() }, result.output);
    }
    case "log": {
      if (!project.git.commits.length) return ok(project, "no commits");
      return ok(
        project,
        project.git.commits
          .slice(0, 12)
          .map((c) => `commit ${c.id}\nDate: ${new Date(c.at).toISOString()}\n\n    ${c.message}`)
          .join("\n\n"),
      );
    }
    case "diff": {
      const head = headSnapshot(project.git);
      const now = workingTree(project.files);
      const paths = dirtyPaths(project).slice(0, 20);
      if (!paths.length) return ok(project, "");
      const chunks = paths.map((path) => {
        const a = (head[path] ?? "").split("\n");
        const b = (now[path] ?? "").split("\n");
        return `--- a/${path}\n+++ b/${path}\n${summarizeDiff(a, b)}`;
      });
      return ok(project, chunks.join("\n\n"));
    }
    case "branch":
      return ok(project, `* ${project.git.branch}`);
    case "remote": {
      if (args[1] === "add" && args[2] && args[3]) {
        const remotes = project.git.remotes.filter((r) => r.name !== args[2]);
        remotes.push({ name: args[2]!, url: args[3]! });
        const parsed = parseGithubRemote(args[3]!);
        const deploy = parsed
          ? { ...project.deploy, githubOwner: parsed.owner, githubRepo: parsed.repo }
          : project.deploy;
        return ok({ ...project, git: { ...project.git, remotes }, deploy }, "");
      }
      if (args[1] === "-v" || args[1] === "v") {
        return ok(
          project,
          project.git.remotes.map((r) => `${r.name}\t${r.url} (push)`).join("\n") || "",
        );
      }
      return ok(project, project.git.remotes.map((r) => r.name).join("\n"));
    }
    case "push": {
      if (!project.git.initialized) return fail(project, "fatal: not a git repository");
      if (!project.git.commits.length) return fail(project, "error: src refspec main does not match any");
      const remote = project.git.remotes.find((r) => r.name === (args[1] ?? "origin"));
      if (remote) {
        const parsed = parseGithubRemote(remote.url);
        if (parsed && (!project.deploy.githubOwner || !project.deploy.githubRepo)) {
          project = {
            ...project,
            deploy: { ...project.deploy, githubOwner: parsed.owner, githubRepo: parsed.repo },
          };
        }
      }
      const message = project.git.commits[0]?.message ?? "update";
      return ok(project, "pushing to GitHub…", { type: "github-push", message });
    }
    case "pull":
      return ok(project, "Already up to date.");
    default:
      return fail(project, `git: '${sub}' is not a supported command`);
  }
}

function ghCommand(project: Project, args: string[]): ShellResult {
  const sub = `${args[0] ?? ""} ${args[1] ?? ""}`.trim();
  if (sub === "auth status") {
    return ok(project, "github.com: token is read from Ship / GITHUB_TOKEN");
  }
  if (args[0] === "repo" && args[1] === "create") {
    const name = args[2] && !args[2].startsWith("-") ? args[2] : slugify(project.name);
    const vis = args.includes("--public") ? "public" : "private";
    const owner = project.deploy.githubOwner;
    const remote = `https://github.com/${owner || "you"}/${name}.git`;
    const next: Project = {
      ...project,
      deploy: { ...project.deploy, githubRepo: name, githubBranch: project.deploy.githubBranch || "main" },
      git: {
        ...project.git,
        initialized: true,
        remotes: [{ name: "origin", url: remote }, ...project.git.remotes.filter((r) => r.name !== "origin")],
      },
    };
    return ok(
      next,
      `creating ${vis} repo ${name} and pushing…`,
      { type: "github-push", message: "init from AgentSam" },
    );
  }
  return fail(project, "gh: try  gh repo create [name]  or  gh auth status");
}

function wranglerCommand(project: Project, args: string[]): ShellResult {
  const joined = args.join(" ");
  if (args[0] === "whoami") {
    return ok(project, "verifying Cloudflare token…", { type: "cloudflare-whoami" });
  }
  if (args[0] === "pages" && args[1] === "deploy") {
    return ok(project, "wrangler pages deploy · live feed", { type: "cloudflare-deploy" });
  }
  if (args[0] === "pages" && args[1] === "project" && args[2] === "create") {
    const name = args[3] || slugify(project.name);
    return ok({ ...project, deploy: { ...project.deploy, cloudflareProject: name } }, `project name set to ${name}`);
  }
  if (args[0] === "deploy" || joined.includes("pages deploy")) {
    return ok(project, "wrangler pages deploy · live feed", { type: "cloudflare-deploy" });
  }
  return fail(project, "wrangler: try  wrangler pages deploy  ·  wrangler whoami");
}

function npmCommand(project: Project, args: string[]): ShellResult {
  if (args[0] === "init") {
    const pkg = {
      name: slugify(project.name),
      private: true,
      type: "module",
      scripts: { deploy: "wrangler pages deploy ." },
    };
    return ok(touchFile(project, "/package.json", JSON.stringify(pkg, null, 2) + "\n"), "wrote package.json");
  }
  if (args[0] === "run" && args[1] === "deploy") {
    return ok(project, "npm run deploy → wrangler pages deploy", { type: "cloudflare-deploy" });
  }
  return fail(project, "npm: try  npm init  or  npm run deploy");
}

function summarizeDiff(a: string[], b: string[]) {
  const max = Math.max(a.length, b.length);
  const lines: string[] = [];
  let shown = 0;
  for (let i = 0; i < max && shown < 40; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] != null) lines.push(`-${a[i]}`);
    if (b[i] != null) lines.push(`+${b[i]}`);
    shown += 1;
  }
  return lines.join("\n") || "(no textual diff)";
}

export function promptPath(cwd: string) {
  if (!cwd || cwd === "/") return "~";
  const name = baseName(cwd);
  return `~/${name}`;
}
