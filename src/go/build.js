import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEvidence } from '../knowledge/config.js';
import { writeGoBuildReceipt } from './receipts.js';

const NATIVE_PROBE_RUNNER = fileURLToPath(new URL('./native-probe-runner.mjs', import.meta.url));

function ldflags(commit, source, builtAt) {
  return [
    '-s',
    '-w',
    '-X github.com/inneranimalmedia/agentsam-go-worker/internal/health.BuildCommit=' + (commit || ''),
    '-X github.com/inneranimalmedia/agentsam-go-worker/internal/health.BuildSource=' + (source || ''),
    '-X github.com/inneranimalmedia/agentsam-go-worker/internal/health.BuildTime=' + (builtAt || ''),
  ].join(' ');
}

function readPackage(productRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function sourceTreeDigest(runtimeRoot) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.agentsam-build') || entry.name === '.agentsam-built-at') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'go.mod' || entry.name.endsWith('.go')) files.push(full);
    }
  };
  walk(runtimeRoot);
  files.sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(runtimeRoot, file));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return 'sha256:' + hash.digest('hex');
}

export function resolveBuildSource({ productRoot, runtimeRoot, repositoryRoot } = {}) {
  const git = gitEvidence(repositoryRoot || productRoot);
  const pkg = readPackage(productRoot);
  const treeDigest = sourceTreeDigest(runtimeRoot);
  let identity = null;
  if (git.commit) identity = 'git:' + git.commit;
  else if (pkg?.name && pkg?.version) identity = 'npm:' + pkg.name + '@' + pkg.version;
  else identity = 'tree:' + treeDigest;

  return {
    identity,
    commit: git.commit || null,
    branch: git.branch || null,
    dirty: Boolean(git.dirty),
    package_name: pkg?.name || null,
    package_version: pkg?.version || null,
    tree_digest: treeDigest,
    repository_id: git.commit ? path.basename(repositoryRoot || productRoot) : null,
  };
}

export function runGoTests(runtimeRoot, { spawn = spawnSync } = {}) {
  const res = spawn('go', ['test', './...'], { cwd: runtimeRoot, encoding: 'utf8' });
  return { ok: res.status === 0, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

export function runGoVet(runtimeRoot, { spawn = spawnSync } = {}) {
  const res = spawn('go', ['vet', './...'], { cwd: runtimeRoot, encoding: 'utf8' });
  return { ok: res.status === 0, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

export function runGoBuild(runtimeRoot, {
  outDir = null,
  commit = '',
  source = '',
  builtAt = '',
  spawn = spawnSync,
} = {}) {
  const binDir = outDir || path.join(runtimeRoot, '..', '.agentsam', 'go-build');
  fs.mkdirSync(binDir, { recursive: true });
  const identityHash = createHash('sha256').update(source || commit || 'dev').digest('hex').slice(0, 12);
  const suffix = identityHash + '-' + process.pid + '-' + randomBytes(3).toString('hex');
  const out = path.join(binDir, 'agentsam-go-worker-' + suffix);
  const res = spawn('go', [
    'build',
    '-trimpath',
    '-ldflags',
    ldflags(commit, source, builtAt),
    '-o',
    out,
    './cmd/server',
  ], { cwd: runtimeRoot, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    status: res.status,
    binary: res.status === 0 ? out : null,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

export function sha256File(file) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(file));
  return 'sha256:' + hash.digest('hex');
}

export function runNativeRuntimeProbe(binary, {
  expectedSource = '',
  expectedCommit = '',
  spawn = spawnSync,
} = {}) {
  if (!binary || !fs.existsSync(binary)) return { ok: false, error: 'binary_missing', results: {} };
  const res = spawn(process.execPath, [NATIVE_PROBE_RUNNER, binary, expectedSource, expectedCommit], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  let parsed = null;
  try { parsed = JSON.parse(res.stdout || '{}'); } catch {}
  return {
    ok: res.status === 0 && parsed?.ok === true,
    status: res.status,
    ...(parsed || {}),
    stdout: parsed ? '' : (res.stdout || ''),
    stderr: ((parsed?.stderr || '') + (res.stderr || '')).trim(),
  };
}

/**
 * Build + test + boot the discovered Go runtime and emit deployment-grade
 * source/artifact evidence. Git is authoritative in a maintainer checkout;
 * an immutable npm package name/version is authoritative in distribution mode.
 */
export function buildGoProduct({
  productRoot,
  runtimeRoot,
  repositoryRoot,
  stateRoot = productRoot,
  dryRun = false,
} = {}) {
  if (!runtimeRoot || !fs.existsSync(path.join(runtimeRoot, 'go.mod'))) {
    throw new Error('go_runtime_missing');
  }

  const source = resolveBuildSource({ productRoot, runtimeRoot, repositoryRoot });
  const builtAt = new Date().toISOString();

  const tests = dryRun ? { ok: true, skipped: true } : runGoTests(runtimeRoot);
  if (!tests.ok) {
    const err = new Error('go_test_failed');
    err.detail = tests;
    throw err;
  }

  const vet = dryRun ? { ok: true, skipped: true } : runGoVet(runtimeRoot);
  if (!vet.ok) {
    const err = new Error('go_vet_failed');
    err.detail = vet;
    throw err;
  }

  const build = dryRun
    ? { ok: true, skipped: true, binary: null }
    : runGoBuild(runtimeRoot, {
        outDir: path.join(stateRoot, '.agentsam', 'go-build'),
        commit: source.commit,
        source: source.identity,
        builtAt,
      });
  if (!build.ok) {
    const err = new Error('go_build_failed');
    err.detail = build;
    throw err;
  }

  const probe = dryRun
    ? { ok: true, skipped: true, results: {} }
    : runNativeRuntimeProbe(build.binary, {
        expectedSource: source.identity,
        expectedCommit: source.commit,
      });
  if (!probe.ok) {
    const err = new Error('go_runtime_probe_failed');
    err.detail = probe;
    throw err;
  }

  let goVersion = null;
  try {
    goVersion = spawnSync('go', ['env', 'GOVERSION'], { encoding: 'utf8' }).stdout?.trim() || null;
  } catch {}

  const receipt = {
    schema: 'agentsam.go-build-receipt.v1',
    product: path.basename(productRoot),
    runtime: { language: 'go', version: goVersion, module_root: runtimeRoot },
    source,
    artifact: {
      type: build.binary ? 'binary' : 'none',
      path: build.binary,
      digest: build.binary ? sha256File(build.binary) : null,
    },
    tests: {
      go_test: Boolean(tests.ok),
      go_vet: Boolean(vet.ok),
      runtime_probe: Boolean(probe.ok),
    },
    probe,
    target: { provider: 'local', kind: 'build' },
    built_at: builtAt,
  };

  const receiptPath = writeGoBuildReceipt(stateRoot, receipt);
  return { receipt, receiptPath, tests, vet, build, probe, source };
}
