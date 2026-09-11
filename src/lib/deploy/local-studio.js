import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertProductionDeployAllowed } from './git-guard.js';

export const LOCAL_STUDIO_REL = 'apps/local-studio';
export const WRANGLER_CONFIG_REL = 'backend/wrangler.jsonc';
export const DEPLOY_INPUT_GLOBS = Object.freeze([
  'apps/local-studio',
  'packages/agentsam-contracts',
  'packages/agentsam-workbench',
]);

export function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'apps/local-studio/backend/wrangler.jsonc'))) return dir;
    if (fs.existsSync(path.join(dir, 'backend/wrangler.jsonc')) && path.basename(dir) === 'local-studio') {
      return path.dirname(path.dirname(dir));
    }
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function resolveLocalStudioDeployable(cwd = process.cwd()) {
  const repoRoot = findRepoRoot(cwd);
  const appRoot = path.join(repoRoot, LOCAL_STUDIO_REL);
  const wranglerConfig = path.join(appRoot, WRANGLER_CONFIG_REL);
  if (!fs.existsSync(wranglerConfig)) {
    throw new Error(`wrangler config missing: ${wranglerConfig}`);
  }
  return {
    repoRoot,
    appRoot,
    wranglerConfig,
    wranglerArgs: ['deploy', '-c', WRANGLER_CONFIG_REL],
    provider: 'cloudflare',
    app: 'local-studio',
  };
}

export function loadOptionalCloudflareEnv(appRoot) {
  const file = path.join(appRoot, '.env.cloudflare');
  if (!fs.existsSync(file)) return { loaded: false, vars: {} };
  const vars = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return { loaded: true, vars };
}

function hashFile(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.output' || ent.name === '.wrangler' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function computeDeployFingerprint(repoRoot) {
  const h = crypto.createHash('sha256');
  const files = [];
  for (const rel of DEPLOY_INPUT_GLOBS) {
    walkFiles(path.join(repoRoot, rel), files);
  }
  files.sort();
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    h.update(rel);
    h.update('\0');
    h.update(hashFile(file));
    h.update('\n');
  }
  return h.digest('hex');
}

export function readBaselineFingerprint(appRoot) {
  const receipt = path.join(appRoot, '.agentsam/deploy-merkle/latest.receipt.json');
  if (!fs.existsSync(receipt)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    return json.deployProjectionHash || json.fingerprint || null;
  } catch {
    return null;
  }
}

export function writeDeployReceipt(appRoot, receipt) {
  const dir = path.join(appRoot, '.agentsam/deploy-merkle');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, receipt.promoted ? 'latest.receipt.json' : 'pending.receipt.json');
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n');
  return file;
}

export function wranglerDeployCommand(target, { dryRun = false } = {}) {
  const args = ['wrangler', ...target.wranglerArgs];
  if (dryRun) args.push('--dry-run');
  return { cwd: target.appRoot, args, bin: 'npx' };
}

export function isLocalStudioCheckout(cwd = process.cwd()) {
  try {
    resolveLocalStudioDeployable(cwd);
    return true;
  } catch {
    return false;
  }
}

export async function runLocalStudioDeploy({ cwd = process.cwd(), dryRun = false, planOnly = false, skipBuild = false, execute = true } = {}) {
  const target = resolveLocalStudioDeployable(cwd);
  if (path.resolve(cwd) === target.repoRoot && !target.wranglerConfig.endsWith(path.join('backend', 'wrangler.jsonc')) && !target.wranglerConfig.endsWith('backend/wrangler.jsonc')) {
    throw new Error('refusing generic repo-root wrangler deploy');
  }
  const envFile = loadOptionalCloudflareEnv(target.appRoot);
  const fingerprint = computeDeployFingerprint(target.repoRoot);
  const baseline = readBaselineFingerprint(target.appRoot);
  const plan = {
    provider: 'cloudflare',
    app: 'local-studio',
    wranglerConfig: path.relative(target.repoRoot, target.wranglerConfig).split(path.sep).join('/'),
    wranglerArgs: target.wranglerArgs,
    cwd: path.relative(target.repoRoot, target.appRoot).split(path.sep).join('/') || '.',
    envLoaded: envFile.loaded,
    fingerprint,
    baseline,
    skip: Boolean(baseline && baseline === fingerprint && !dryRun && !planOnly),
    genericRootDeploy: false,
    productionGitRequired: Boolean(execute && !dryRun && !planOnly),
  };
  if (plan.skip) {
    const receipt = {
      ok: true,
      skipped: true,
      reason: 'unchanged_deploy_fingerprint',
      deployProjectionHash: fingerprint,
      promoted: false,
    };
    writeDeployReceipt(target.appRoot, receipt);
    return { target, plan, receipt };
  }
  if (!execute || planOnly) return { target, plan, receipt: null };

  if (!dryRun) {
    plan.git = assertProductionDeployAllowed(target.repoRoot);
  }

  const env = { ...process.env, ...envFile.vars };
  if (!skipBuild) {
    const build = spawnSync('npm', ['run', 'build'], { cwd: target.appRoot, env, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'build failed');
    const verify = spawnSync('npm', ['run', 'cf:verify-output'], { cwd: target.appRoot, env, encoding: 'utf8' });
    if (verify.status !== 0) throw new Error(verify.stderr || verify.stdout || 'cf:verify-output failed');
  }
  const cmd = wranglerDeployCommand(target, { dryRun });
  const deployed = spawnSync(cmd.bin, cmd.args, { cwd: cmd.cwd, env, encoding: 'utf8' });
  if (deployed.status !== 0) {
    const receipt = {
      ok: false,
      skipped: false,
      deployProjectionHash: fingerprint,
      promoted: false,
      error: deployed.stderr || deployed.stdout,
    };
    writeDeployReceipt(target.appRoot, receipt);
    throw new Error(receipt.error || 'wrangler deploy failed');
  }
  const receipt = {
    ok: true,
    skipped: false,
    dryRun,
    deployProjectionHash: fingerprint,
    promoted: !dryRun,
    provider: 'cloudflare',
    app: 'local-studio',
    wranglerConfig: plan.wranglerConfig,
  };
  writeDeployReceipt(target.appRoot, receipt);
  return { target, plan, receipt };
}
