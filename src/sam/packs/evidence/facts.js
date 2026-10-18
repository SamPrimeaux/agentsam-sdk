import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { evidenceError } from './contract.js';

const defaultExec = promisify(execFile);

/**
 * Facts about the thing being captured, computed from git and package.json at seal time, so a snapshot
 * a year from now carries what it was: commit, tag, date, dependency and file counts. Anything that
 * cannot be computed is null, never guessed. Test counts and bundle size come from the caller if known.
 */
export function createGitFacts({ cwd, exec = defaultExec } = {}) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw evidenceError('evidence_facts_cwd_required');
  return async () => {
    const git = (...args) => exec('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 }).then((r) => r.stdout.trim()).catch(() => null);
    const [commit, branch, describe, commitDate, status, tracked] = await Promise.all([
      git('rev-parse', 'HEAD'), git('rev-parse', '--abbrev-ref', 'HEAD'), git('describe', '--tags', '--always'),
      git('log', '-1', '--format=%cI'), git('status', '--porcelain'), git('ls-files'),
    ]);
    let pkg = null;
    try {
      const p = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
      pkg = {
        name: p.name ?? null, version: p.version ?? null,
        dependencies: Object.keys(p.dependencies ?? {}).length, devDependencies: Object.keys(p.devDependencies ?? {}).length,
        workspaces: Array.isArray(p.workspaces) ? p.workspaces.length : null,
      };
    } catch { /* no package.json */ }
    return {
      schema: 'agentsam.evidence.facts.v1', computed: true,
      git: commit ? { commit, branch, describe, commitDate, dirty: Boolean(status) } : null,
      package: pkg, trackedFiles: tracked ? tracked.split('\n').length : null,
    };
  };
}
