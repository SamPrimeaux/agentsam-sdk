import { uid } from "@/lib/utils";
import type { Artifact, GitState, Project } from "@/lib/work/types";

export function emptyGit(): GitState {
  return {
    initialized: false,
    branch: "main",
    remotes: [],
    commits: [],
    staged: [],
    snapshots: {},
  };
}

export function parseGithubRemote(url: string): { owner: string; repo: string } | null {
  const value = url.trim().replace(/\.git$/, "");
  const https = /github\.com[/:]([^/]+)\/([^/]+)\/?$/i.exec(value);
  if (!https) return null;
  return { owner: https[1]!, repo: https[2]! };
}

export function workingTree(files: Artifact[]) {
  const tree: Record<string, string> = {};
  for (const file of files) tree[file.path] = file.content;
  return tree;
}

export function headSnapshot(git: GitState): Record<string, string> {
  const last = git.commits[0];
  if (!last) return {};
  return git.snapshots[last.id] ?? {};
}

export function dirtyPaths(project: Project) {
  const head = headSnapshot(project.git);
  const now = workingTree(project.files);
  const paths = new Set([...Object.keys(head), ...Object.keys(now)]);
  const changed: string[] = [];
  for (const path of paths) {
    if ((head[path] ?? null) !== (now[path] ?? null)) changed.push(path);
  }
  return changed.sort();
}

export function statusLines(project: Project) {
  if (!project.git.initialized) return ["not a git repository (run git init)"];
  const head = headSnapshot(project.git);
  const now = workingTree(project.files);
  const staged = new Set(project.git.staged);
  const lines: string[] = [
    `On branch ${project.git.branch}`,
    project.git.commits.length === 0 ? "No commits yet" : "",
  ].filter(Boolean);

  const stagedLines: string[] = [];
  const unstagedLines: string[] = [];
  const untracked: string[] = [];
  const paths = new Set([...Object.keys(head), ...Object.keys(now), ...staged]);

  for (const path of [...paths].sort()) {
    const inHead = path in head;
    const inNow = path in now;
    const isStaged = staged.has(path);
    if (isStaged) {
      if (!inNow) stagedLines.push(`  deleted:    ${path}`);
      else if (!inHead) stagedLines.push(`  new file:   ${path}`);
      else stagedLines.push(`  modified:   ${path}`);
    }
    if (!inHead && inNow && !isStaged) untracked.push(path);
    else if (inHead && !inNow && !isStaged) unstagedLines.push(`  deleted:    ${path}`);
    else if (inHead && inNow && head[path] !== now[path] && !isStaged) {
      unstagedLines.push(`  modified:   ${path}`);
    }
  }

  if (stagedLines.length) {
    lines.push("", "Changes to be committed:", ...stagedLines);
  }
  if (unstagedLines.length) {
    lines.push("", "Changes not staged for commit:", ...unstagedLines);
  }
  if (untracked.length) {
    lines.push("", "Untracked files:", ...untracked.map((p) => `  ${p}`));
  }
  if (!stagedLines.length && !unstagedLines.length && !untracked.length) {
    lines.push("nothing to commit, working tree clean");
  }
  return lines;
}

export function commitStaged(project: Project, message: string): { git: GitState; output: string } {
  const staged = project.git.staged;
  if (!staged.length) {
    return { git: project.git, output: "nothing to commit, no staged files" };
  }
  const now = workingTree(project.files);
  const parent = headSnapshot(project.git);
  const nextTree = { ...parent };
  for (const path of staged) {
    if (path in now) nextTree[path] = now[path]!;
    else delete nextTree[path];
  }
  const id = uid().slice(0, 8);
  const commit = {
    id,
    message,
    at: Date.now(),
    paths: [...staged],
  };
  const git: GitState = {
    ...project.git,
    commits: [commit, ...project.git.commits],
    staged: [],
    snapshots: { ...project.git.snapshots, [id]: nextTree },
  };
  const short = `${project.git.branch} ${id}`;
  return {
    git,
    output: `[${short}] ${message}\n ${staged.length} file${staged.length === 1 ? "" : "s"} changed`,
  };
}
