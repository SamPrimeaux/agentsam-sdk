import { spawnSync } from 'node:child_process';

export function initializeGitRepository(cwd) {
  const probe = spawnSync('git', ['--version'], { cwd, encoding: 'utf8' });
  if (probe.status !== 0) {
    return { ok: false, initialized: false, reason: 'git_not_found' };
  }

  let result = spawnSync('git', ['init', '-b', 'main'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    result = spawnSync('git', ['init'], { cwd, encoding: 'utf8' });
  }

  return {
    ok: result.status === 0,
    initialized: result.status === 0,
    reason: result.status === 0 ? null : String(result.stderr || result.stdout || 'git_init_failed').trim(),
  };
}
