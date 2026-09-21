import fs from 'node:fs';
import path from 'node:path';
import { tryResolveGitContext } from '../../packages/agentsam-repository/src/git-context.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Build a structured, high-signal Project Card for agent turns.
 */
export function buildProjectCard(cwd = process.cwd(), options = {}) {
  const root = path.resolve(cwd);
  const git = tryResolveGitContext({ cwd: root });

  let pkgName = path.basename(root);
  let pkgVersion = '0.0.0';
  let stackSummary = 'node';

  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) pkgName = pkg.name;
      if (pkg.version) pkgVersion = pkg.version;
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      const allDeps = [...deps, ...devDeps];
      const detected = [];
      if (allDeps.some((d) => d.includes('react'))) detected.push('react');
      if (allDeps.some((d) => d.includes('vite'))) detected.push('vite');
      if (allDeps.some((d) => d.includes('wrangler') || d.includes('cloudflare'))) detected.push('cloudflare');
      if (allDeps.some((d) => d.includes('typescript'))) detected.push('typescript');
      if (allDeps.some((d) => d.includes('sqlite') || d.includes('better-sqlite3'))) detected.push('sqlite');
      if (detected.length) stackSummary = detected.join(', ');
    } catch {}
  }

  const activeTask = clean(options.activeTaskId || options.taskId || options.beliefs?.current_task_id || options.workspaceState?.current_task_id);
  const lockedBy = clean(options.lockedBy || options.beliefs?.locked_by || options.workspaceState?.locked_by || 'agentsam_cli');
  const checkpoint = clean(options.checkpointSha || options.beliefs?.checkpoint_sha || options.workspaceState?.checkpoint_sha || git?.headSha);
  const branch = clean(git?.branch || 'main');
  const headSha = clean(git?.headSha ? git.headSha.slice(0, 10) : 'unknown');
  const dirty = Boolean(git?.dirty);
  const repoName = clean(git?.repoFullName || pkgName);
  const remoteUrl = clean(git?.remoteUrl || 'local');

  const lines = [
    '<!-- agentsam:project-card -->',
    `# Project Card: ${pkgName} v${pkgVersion}`,
    `- Repository: ${repoName} (${remoteUrl})`,
    `- Branch: ${branch} | HEAD: ${headSha} (${dirty ? 'working tree dirty' : 'clean'})`,
    `- Project Root: ${root}`,
    `- Active Task: ${activeTask || 'none'}`,
    `- Locked By: ${lockedBy}`,
    `- Checkpoint SHA: ${checkpoint ? checkpoint.slice(0, 10) : headSha}`,
    `- Stack: ${stackSummary}`,
    '- Constraints: Scoped to repository root. Use terminal.exec for concrete commands without a shell. Never search or output secrets or private keys.',
  ];

  return Object.freeze({
    name: pkgName,
    version: pkgVersion,
    repo: repoName,
    branch,
    headSha,
    dirty,
    root,
    activeTask,
    lockedBy,
    checkpoint,
    stackSummary,
    content: lines.join('\n'),
  });
}
