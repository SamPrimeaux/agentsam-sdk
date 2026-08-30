import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

function runGit(cwd, args, { required = true } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (!required) return '';
    const detail = error?.stderr ? String(error.stderr).trim() : error?.message || String(error);
    throw new Error(`git_context_failed:${args.join(' ')}${detail ? `:${detail}` : ''}`);
  }
}

/** Normalize HTTPS/SSH/scp-style Git remotes into repository identity. */
export function normalizeGitRemote(remoteUrl) {
  const raw = String(remoteUrl || '').trim();
  if (!raw) {
    return { remoteUrl: '', remoteHost: null, repoFullName: null, owner: null, repo: null };
  }

  let host = null;
  let pathname = '';
  const scpLike = raw.match(/^(?:[^@\s]+@)?([^:\s]+):(.+)$/);

  if (scpLike && !raw.includes('://')) {
    host = scpLike[1];
    pathname = scpLike[2];
  } else {
    try {
      const parsed = new URL(raw);
      host = parsed.hostname || null;
      pathname = parsed.pathname || '';
    } catch {
      pathname = raw;
    }
  }

  const cleanedPath = pathname.replace(/^\/+/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const parts = cleanedPath.split('/').filter(Boolean);
  const repo = parts.at(-1) || null;
  const owner = parts.length >= 2 ? parts.at(-2) : null;

  return {
    remoteUrl: raw,
    remoteHost: host,
    repoFullName: owner && repo ? `${owner}/${repo}` : null,
    owner,
    repo,
  };
}

/**
 * Resolve repository identity from Git itself. No user/workspace/tenant identity
 * is inferred here; Git identifies the resource, not the actor.
 */
export function resolveGitContext(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const root = runGit(cwd, ['rev-parse', '--show-toplevel']);
  const availableRemotes = runGit(root, ['remote'], { required: false }).split('\n').filter(Boolean);
  const preferredRemote = String(options.remote || 'origin').trim() || 'origin';
  const remote = availableRemotes.includes(preferredRemote)
    ? preferredRemote
    : availableRemotes[0] || preferredRemote;
  const remoteUrl = runGit(root, ['remote', 'get-url', remote], { required: false });
  const revisionSha = runGit(root, ['rev-parse', 'HEAD']);
  const branch = runGit(root, ['branch', '--show-current'], { required: false }) || null;
  const status = runGit(root, ['status', '--porcelain=v1'], { required: false });

  return {
    root,
    remote,
    ...normalizeGitRemote(remoteUrl),
    revisionSha,
    branch,
    detached: !branch,
    dirty: Boolean(status),
  };
}

/** Resolve Git context without throwing when cwd is not inside a repository. */
export function tryResolveGitContext(options = {}) {
  try {
    return resolveGitContext(options);
  } catch {
    return null;
  }
}
