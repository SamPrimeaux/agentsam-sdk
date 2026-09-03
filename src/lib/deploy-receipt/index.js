import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { buildMerkleTree, diffTrees, readSnapshot, validateSnapshot } from '../merkle/index.js';
import { normalizePolicy } from '../merkle/policy.js';

export const DEFAULT_DEPLOY_EXCLUDES = Object.freeze([
  '.agentsam/deploy-merkle',
  '.wrangler',
  'coverage',
  '.cache',
  '.turbo',
  '.env',
  '.env.local',
  '.env.cloudflare',
  '.env.cloudflare.local',
  '.env.production',
  '.env.production.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
  '.env.staging',
  '.env.preview',
  '.env.docker',
  '.dev.vars',
  '.npmrc',
  '.deploy-dashboard-source-fingerprint.json',
  '.deploy-pipeline-stats.json',
  '.deploy-r2-delta-stats.json',
  '.deploy-r2-static-hashes.json',
  '.deploy-route-stats.json',
  '.deploy-sw-tiered-manifest.json',
  '.deploy-worker-fingerprint.json',
  '.deploy-worker-stats.json',
]);

function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function portableRelative(root, target) {
  const relative = path.relative(root, target).split(path.sep).join('/');
  return relative && !relative.startsWith('../') && relative !== '..' ? relative : '';
}

function paths(root, stateDir) {
  const state = path.resolve(stateDir || path.join(root, '.agentsam/deploy-merkle'));
  return {
    stateDir: state,
    pendingSnapshot: path.join(state, 'pending.snapshot.json'),
    pendingReceipt: path.join(state, 'pending.receipt.json'),
    latestSnapshot: path.join(state, 'latest.snapshot.json'),
    latestReceipt: path.join(state, 'latest.receipt.json'),
    historyDir: path.join(state, 'history'),
  };
}

async function atomicJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temp = `${filename}.tmp-${randomBytes(8).toString('hex')}`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, filename);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

async function loadSnapshot(input) {
  if (!input) return null;
  if (typeof input === 'string') return readSnapshot(input);
  return validateSnapshot(input);
}

function sourceDirty(root, stateDir) {
  const raw = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!raw) return false;
  const stateRelative = portableRelative(root, stateDir);
  return raw.split('\n').some((line) => {
    const candidate = line.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/');
    return !(stateRelative && (candidate === stateRelative || candidate.startsWith(`${stateRelative}/`)));
  });
}

function gitMetadata(root) {
  return {
    git_sha: git(root, ['rev-parse', 'HEAD']),
    git_branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    repository: git(root, ['remote', 'get-url', 'origin']),
  };
}

function truncateChanges(changes, maxChangedFiles) {
  const files = changes.map((change) => change.path);
  if (files.length <= maxChangedFiles) return files;
  return [...files.slice(0, maxChangedFiles), `__truncated__:+${files.length - maxChangedFiles}_more`];
}

export async function captureDeployReceipt({
  root = '.',
  project,
  stateDir,
  baselineSnapshot,
  baselineSource,
  include = [],
  exclude = [],
  maxChangedFiles = 100,
  metadata = {},
} = {}) {
  const rootPath = await fs.realpath(root);
  const state = paths(rootPath, stateDir);
  const dirty = sourceDirty(rootPath, state.stateDir);
  const stateRelative = portableRelative(rootPath, state.stateDir);
  const policy = normalizePolicy({
    include,
    exclude: [...new Set([
      ...DEFAULT_DEPLOY_EXCLUDES,
      ...(stateRelative ? [stateRelative] : []),
      ...exclude,
    ])],
  });

  await fs.mkdir(state.historyDir, { recursive: true });

  let baseline = null;
  let resolvedBaselineSource = baselineSource || 'none';
  if (baselineSnapshot) {
    try {
      baseline = await loadSnapshot(baselineSnapshot);
      resolvedBaselineSource = baselineSource || 'provided';
    } catch {
      resolvedBaselineSource = 'invalid';
    }
  } else {
    try {
      baseline = await readSnapshot(state.latestSnapshot);
      resolvedBaselineSource = 'local';
    } catch (error) {
      if (error?.code !== 'ENOENT') resolvedBaselineSource = 'invalid';
    }
  }

  const tree = await buildMerkleTree(rootPath, { policy });
  await atomicJson(state.pendingSnapshot, tree);

  let diff = null;
  if (baseline) {
    try {
      diff = diffTrees(baseline, tree);
    } catch {
      baseline = null;
      resolvedBaselineSource = 'invalid';
    }
  }

  const gitInfo = gitMetadata(rootPath);
  const receipt = {
    format: 'agentsam-deploy-merkle',
    version: 1,
    engine: 'agentsam-merkle-v1',
    status: 'captured',
    project: project || path.basename(rootPath),
    repository: gitInfo.repository || null,
    git_sha: gitInfo.git_sha || null,
    git_branch: gitInfo.git_branch || null,
    captured_at: new Date().toISOString(),
    root_hash: tree.rootHash,
    previous_root_hash: baseline?.rootHash || null,
    has_baseline: Boolean(baseline),
    baseline_source: resolvedBaselineSource,
    working_tree_dirty: dirty,
    stats: tree.stats,
    diff_stats: diff?.stats || null,
    changed_files: diff ? truncateChanges(diff.changes, maxChangedFiles) : [],
    ...metadata,
  };
  await atomicJson(state.pendingReceipt, receipt);
  return { receipt, snapshot: tree, paths: state };
}

export async function finalizeDeployReceipt({
  root = '.',
  stateDir,
  status,
  deploymentId,
  workerVersionId,
  metadata = {},
} = {}) {
  if (!['success', 'failed'].includes(status)) throw new Error('Deploy receipt status must be success or failed.');
  const rootPath = await fs.realpath(root);
  const state = paths(rootPath, stateDir);
  const [pendingReceipt, pendingSnapshot] = await Promise.all([
    JSON.parse(await fs.readFile(state.pendingReceipt, 'utf8')),
    readSnapshot(state.pendingSnapshot),
  ]).catch((error) => {
    if (error?.code === 'ENOENT') throw new Error('No pending deploy receipt capture exists.');
    throw error;
  });
  if (pendingReceipt?.format !== 'agentsam-deploy-merkle' || pendingReceipt?.status !== 'captured') {
    throw new Error('Pending deploy receipt is invalid or already finalized.');
  }
  if (pendingReceipt.root_hash !== pendingSnapshot.rootHash) throw new Error('Pending receipt/snapshot root mismatch.');

  const completed = new Date().toISOString();
  const receipt = {
    ...pendingReceipt,
    ...metadata,
    status,
    completed_at: completed,
    deployment_id: deploymentId || null,
    worker_version_id: workerVersionId || null,
  };
  const stamp = completed.replace(/[-:.]/g, '').replace('Z', 'Z');
  const sha = (receipt.git_sha || 'unknown').replace(/[^A-Za-z0-9._-]/g, '-');
  const rootSlug = receipt.root_hash.replace(/^sha256:/, '');
  const historyReceipt = path.join(state.historyDir, `${stamp}-${sha}-${rootSlug.slice(0, 12)}-${status}.receipt.json`);
  await atomicJson(historyReceipt, receipt);

  if (status === 'success') {
    await fs.copyFile(state.pendingSnapshot, state.latestSnapshot);
    await atomicJson(state.latestReceipt, receipt);
  }
  return { receipt, snapshot: pendingSnapshot, paths: { ...state, historyReceipt } };
}

export async function showLatestDeployReceipt({ root = '.', stateDir } = {}) {
  const rootPath = await fs.realpath(root);
  const state = paths(rootPath, stateDir);
  try {
    return JSON.parse(await fs.readFile(state.latestReceipt, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export const captureCheckpoint = captureDeployReceipt;
export async function promoteCheckpoint(options = {}) {
  return finalizeDeployReceipt({ ...options, status: 'success' });
}
