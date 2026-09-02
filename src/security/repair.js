import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { scanProjectSecurity, remediationPlan } from './scan.js';
import { readJson, collectNpmDependencies } from './inventory.js';
import { runProcess } from './process.js';

export async function repairProject(options = {}) {
  const scan = options.scan || scanProjectSecurity;
  const run = options.run || runProcess;
  const before = await scan(options);
  if (!options.apply) return remediationPlan(before);
  if (!before.complete) return { ok: false, complete: false, status: 'blocked', reason: 'A complete online scan is required before repair.', before };
  if (before.ok) return { ok: true, complete: true, status: 'already-clean', before };
  if (!before.findings.some(f => ['vulnerability','deprecated','audit'].includes(f.kind))) {
    return { ok: false, complete: true, status: 'manual-action-required', before };
  }
  if (process.platform === 'win32') throw new Error('Automated repair currently requires a POSIX Git worktree; scanning works on Windows.');
  const root = before.project_root;
  const invoke = (cmd, args, cwd = root) => run(cmd, args, { cwd, signal: options.signal, timeoutMs: options.commandTimeoutMs || 300_000 });
  const git = async (...args) => {
    const result = await invoke('git', args);
    if (result.code) throw new Error('Git prerequisite failed');
    return result.stdout.trim();
  };
  if (fs.realpathSync(await git('rev-parse','--show-toplevel')) !== root) throw new Error('Repair must target the repository root');
  if (await git('status','--porcelain')) throw new Error('Repair requires a clean committed source checkout');
  const manifest = readJson(path.join(root, 'package.json'));
  const verify = options.verify || (manifest.scripts?.verify ? 'verify' : 'test');
  if (!/^[a-zA-Z0-9:_-]+$/.test(verify) || !manifest.scripts?.[verify]) throw new Error('Provide an existing --verify npm script');
  const base = await git('rev-parse','HEAD');
  const branch = 'agentsam/security-' + Date.now() + '-' + randomBytes(3).toString('hex');
  const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-security-'));
  const worktree = path.join(holder, 'checkout');
  await git('worktree','add','-b',branch,worktree,base);
  const receipt = { schema_version: 1, mode: 'repair', ok: false, complete: false, verified: false, status: 'failed', branch, base, worktree, before, steps: [] };
  try {
    let logs = '';
    const npm = async (args, allowFindings = false) => {
      const result = await invoke('npm', args, worktree);
      logs += result.stdout + '\n' + result.stderr + '\n';
      if (Buffer.byteLength(logs) > 8 * 1024 * 1024) throw new Error('Repair logs exceeded 8 MiB');
      receipt.steps.push({ command: ['npm', ...args], exit_code: result.code });
      if (result.code && !(allowFindings && result.code === 1)) throw new Error('Repair command failed: npm ' + args[0]);
      return result;
    };
    const audit = await npm(['audit','fix','--package-lock-only','--ignore-scripts','--force=false','--legacy-peer-deps=false','--json'], true);
    let auditResult;
    try { auditResult = JSON.parse(audit.stdout); } catch { throw new Error('npm audit returned no valid JSON report'); }
    if (auditResult.error || !auditResult.audit) throw new Error('npm audit did not complete');
    if (before.findings.some(f => f.kind === 'deprecated')) {
      await npm(['update','--package-lock-only','--ignore-scripts','--save=false','--force=false','--legacy-peer-deps=false']);
    }
    const changed = await invoke('git',['diff','--name-only','HEAD'],worktree);
    if (changed.code) throw new Error('Cannot inspect candidate changes');
    receipt.changed_files = changed.stdout.trim().split('\n').filter(Boolean);
    if (receipt.changed_files.some(p => p !== before.lockfile)) throw new Error('Repair changed files outside the selected lockfile');
    const afterInventory = collectNpmDependencies(worktree);
    if (afterInventory.issues.length) throw new Error('Repaired lockfile coverage is incomplete');
    const versions = Object.fromEntries(afterInventory.dependencies.flatMap(d => d.paths.map(p => [p, d])));
    for (const dependency of before.results) for (const location of dependency.paths) {
      if (versions[location]?.version && versions[location].version.split('.')[0] !== dependency.version.split('.')[0]) {
        throw new Error('A major version change needs explicit review');
      }
    }
    await npm(['ci','--ignore-scripts','--no-audit','--no-fund']);
    await npm(['run',verify]);
    receipt.after = await scan({ ...options, projectRoot: worktree, log: (options.log || '') + '\n' + logs, offline: false });
    const finalDiff = await invoke('git',['diff','--name-only','HEAD'],worktree);
    if (finalDiff.code || finalDiff.stdout.trim().split('\n').filter(Boolean).some(p => p !== before.lockfile)) throw new Error('Verification changed tracked source files');
    receipt.complete = receipt.after.complete;
    receipt.verified = receipt.after.ok;
    receipt.ok = receipt.after.ok;
    receipt.status = receipt.ok ? 'verified-candidate' : 'unresolved';
  } catch (error) {
    receipt.reason = error.message;
  }
  return receipt;
}
