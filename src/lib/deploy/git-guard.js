/**
 * Production Wrangler deploys are allowed only from a clean main that matches origin/main.
 * Dry-run / plan may run from a feature branch. Never from /private/tmp.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BLOCKED_BRANCH_PREFIXES = ['feat/', 'fix/', 'chore/', 'release/'];

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    status: r.status,
    stdout: String(r.stdout || '').trim(),
    stderr: String(r.stderr || '').trim(),
  };
}

export function inspectDeployGit(cwd = process.cwd()) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(cwd, ['rev-parse', 'HEAD']);
  const origin = git(cwd, ['rev-parse', 'origin/main']);
  const porcelain = git(cwd, ['status', '--porcelain']);
  const detached = branch.stdout === 'HEAD';
  const repoRoot = root.stdout || path.resolve(cwd);
  return {
    ok: root.status === 0,
    repoRoot,
    branch: branch.stdout,
    detached,
    head: head.stdout,
    originMain: origin.stdout,
    dirty: Boolean(porcelain.stdout),
    tmpCheckout: repoRoot.includes('/private/tmp/') || repoRoot.includes('/tmp/'),
  };
}

export function productionDeployBlockedReason(info) {
  if (!info?.ok) return 'not a git checkout';
  if (info.tmpCheckout) return 'refusing production deploy from a temporary checkout';
  if (info.detached) return 'refusing production deploy from detached HEAD';
  if (info.branch !== 'main') {
    return `refusing production deploy from ${info.branch}; origin/main only`;
  }
  for (const prefix of BLOCKED_BRANCH_PREFIXES) {
    if (info.branch.startsWith(prefix)) {
      return `refusing production deploy from ${info.branch}`;
    }
  }
  if (!info.originMain) return 'origin/main is missing; fetch before deploying';
  if (info.head !== info.originMain) {
    return `HEAD (${info.head.slice(0, 12)}) != origin/main (${info.originMain.slice(0, 12)})`;
  }
  if (info.dirty) return 'working tree is not clean';
  return null;
}

export function assertProductionDeployAllowed(cwd = process.cwd()) {
  const info = inspectDeployGit(cwd);
  const reason = productionDeployBlockedReason(info);
  if (reason) {
    const err = new Error(reason);
    err.code = 'production_deploy_refused';
    err.git = info;
    throw err;
  }
  return info;
}
